import os
import time
import json
import requests
import re
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from django.conf import settings
from django.db import close_old_connections
from django.core.management.base import BaseCommand
from playwright.sync_api import sync_playwright

# Models Import
from crawler.models import LotteScheduleLog, MovieSchedule

# =============================================================================
# [PART 1] RPA Logic (Lotte Cinema)
# =============================================================================

def fetch_lotte_schedule_worker(worker_id, assigned_regions, target_dates, stop_signal=None, crawler_run=None):
    """
    Worker Function: Assigned Regions에 해당하는 극장만 순회하며 데이터 수집
    """
    print(f"[{worker_id}] 🚀 Worker Started. Target Regions: {assigned_regions}")
    
    collected_results = []
    failures = []
    total_theater_count = 0
    
    # Thread Safe
    os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
    
    with sync_playwright() as p:
        # 워커별 브라우저 런칭
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        
        try:
            url = "https://www.lottecinema.co.kr/NLCHS/Ticketing/Schedule"
            
            # Initial Page Load Retry
            current_try = 0
            max_load_retries = 3
            while current_try < max_load_retries:
                try:
                    current_try += 1
                    page.goto(url, timeout=60000)
                    page.wait_for_load_state("domcontentloaded")
                    time.sleep(3) # Initial load wait
                    # Validate if key element exists
                    if page.locator(".cinema_select_wrap").count() > 0:
                        break # Success
                except Exception as load_err:
                    print(f"[{worker_id}] ⚠️ Page Load Failed ({current_try}/{max_load_retries}): {load_err}")
                    if current_try >= max_load_retries:
                         raise load_err
                    time.sleep(5.0)

            # 1. 지역 리스트 찾기
            # Selector derived from user snippet: .cinema_select_wrap .depth1
            region_items = page.locator(".cinema_select_wrap .depth1")
            region_count = region_items.count()
            
            if region_count == 0:
                raise Exception("Region list not found (.cinema_select_wrap .depth1)")

            for i in range(region_count):
                if stop_signal and stop_signal(): break
                
                # [USER REQUEST] XPath for Region
                region_base = "/html/body/div[6]/div/ul/li[1]/div/div/div[1]/div[2]/div/ul/li"
                region_li = page.locator(f"xpath={region_base}[{i+1}]")
                region_anchor = region_li.locator("xpath=./a")
                region_full_text = region_anchor.inner_text().strip() # "서울(23)"
                
                # "MY 영화관" 스킵
                if "MY" in region_full_text:
                    continue
                    
                # 지역명 파싱 (괄호/숫자 제거) - 예: "서울(23)" -> "서울"
                region_name = re.sub(r'\(\d+\)', '', region_full_text).strip()
                
                # 할당된 지역인지 확인
                # assigned_regions에 포함되어 있거나, 매칭되는 키워드가 있는지 확인
                is_assigned = False
                for assigned in assigned_regions:
                    if assigned in region_name: # "경기/인천" in "경기/인천" or "서울" in "서울"
                        is_assigned = True
                        break
                
                if not is_assigned:
                    continue

                print(f"[{worker_id}] 📍 Processing Region: {region_name}")

                try:
                    # 지역 클릭 (활성화)
                    # 이미 활성화되어 있을 수도 있음 (.depth1.active)
                    if "active" not in region_li.get_attribute("class") or "":
                        region_anchor.click(force=True)
                        time.sleep(1.0)
                    
                    # [USER REQUEST] Use explicit XPath for Theater
                    # Pattern: .../li[{region_index}]/div/div/div[1]/div/ul/li[{theater_index}]/a
                    # region_li is already our base.
                    # Inside region_li: ./div/div/div[1]/div/ul/li
                    
                    theater_xpath_relative = "./div/div/div[1]/div/ul/li"
                    theater_items = region_li.locator(f"xpath={theater_xpath_relative}/a")
                    theater_count = theater_items.count()
                    
                    print(f"[{worker_id}]    Found {theater_count} theaters in {region_name}")

                    for j in range(theater_count):
                        if stop_signal and stop_signal(): break
                        
                        theater_link = theater_items.nth(j)
                        theater_name = theater_link.inner_text().strip()
                        
                        # 극장 식별자 (Lotte는 href에 파라미터가 있거나, 클릭 시 동작)
                        # data-cinema-id 같은 속성이 있는지 확인, 없으면 이름으로 대체
                        # snippet에는 href="#none"만 보임. 
                        # 클릭 후 발생하는 요청이나 페이지 변화를 봐야 함.
                        
                        print(f"[{worker_id}]    [{j+1}/{theater_count}] Theater: {theater_name}")
                        
                        try:
                            # 극장 클릭 전 가시성 확보 및 클릭 시도
                            # Theater Click should trigger a schedule update (API Call)
                            
                            theater_click_success = False
                            
                            
                            # 2-Stage Click Strategy to handle "Silent Click Failure"
                            # Stage 1: Standard Click
                            # Stage 2: JS Click (if Stage 1 fails or times out on network)
                            
                            theater_click_success = False
                            
                            def theater_response_validator(response):
                                return "Ticketing" in response.url and response.status == 200

                            # Attempt 1: Standard Click
                            try:
                                with page.expect_response(theater_response_validator, timeout=3000) as response_info:
                                    try:
                                        # Try to scroll and click naturally
                                        theater_link.scroll_into_view_if_needed(timeout=2000)
                                        theater_link.click(timeout=2000) # Remove force=True to detect visibility issues
                                    except Exception as e:
                                        print(f"[{worker_id}]      ⚠️ Standard Click Failed (Element issue): {e}")
                                        raise e # Trigger the outer except to go to Attempt 2
                                
                                theater_click_success = True
                            except Exception:
                                # Fallthrough to Attempt 2 if Click error OR Network Timeout
                                pass

                            # Attempt 2: Robust JS Click (if Attempt 1 failed)
                            if not theater_click_success:
                                print(f"[{worker_id}]      ⚠️ Retrying with Robust JS Click...")
                                try:
                                    with page.expect_response(theater_response_validator, timeout=5000) as response_info:
                                        theater_link.evaluate("""element => {
                                            element.scrollIntoView({block: "center", inline: "center"});
                                            var event = new MouseEvent('click', {
                                                view: window,
                                                bubbles: true,
                                                cancelable: true
                                            });
                                            element.dispatchEvent(event);
                                        }""")
                                    theater_click_success = True
                                    print(f"[{worker_id}]      ✅ JS Click Triggered Response")
                                except Exception as e:
                                    print(f"[{worker_id}]      ❌ JS Click also failed (No Network Response): {e}")
                                    failures.append({
                                        'region': region_name,
                                        'theater': theater_name,
                                        'date': 'All',
                                        'reason': "Theater Selection Failed (Both Std & JS Clicks)",
                                        'worker': worker_id
                                    })
                                    continue # Skip Date Loop

                            # Give a moment for UI to settle (Spinner)
                            time.sleep(1.5)
                            
                            # [Exception Handling] Close Layer Popup if exists (e.g. Renewal Notice)
                            # User reported: <ul id="layerPopupMulti" class="layer_wrap layerMultiType active">
                            try:
                                # [Exception Handling] Loop to close multiple consecutive popups
                                popup_check_retries = 5
                                while popup_check_retries > 0:
                                    popup = page.locator("#layerPopupMulti.active")
                                    if popup.count() > 0:
                                        # Check if any visible close buttons exist
                                        # Only click visible ones
                                        close_btn = popup.locator(".btnCloseLayerMulti:visible").first
                                        if close_btn.count() > 0:
                                            print(f"[{worker_id}]      ⚠️ Layer Popup Detected! Closing... (Remaining attempts: {popup_check_retries})")
                                            close_btn.click()
                                            time.sleep(1.0) # Wait for fade out or next popup
                                            popup_check_retries -= 1
                                        else:
                                            # Popup container active but no close btn visible? might be transitioning
                                            break 
                                    else:
                                        # No active popup
                                        break
                            except Exception as e:
                                print(f"[{worker_id}]      ⚠️ Failed to close popup: {e}")

                            # 날짜별 순회
                            for target_ymd in target_dates:
                                try:
                                    # 날짜 포맷 변환 (YYYYMMDD -> YYYY-MM-DD or DD)
                                    # 롯데시네마 날짜 선택자는 보통 owl-carousel 안에 있음.
                                    # <div class="owl-item"><a href="#" class="date">...</a></div>
                                    # 정확한 구조를 모르지만, 텍스트나 data-date 속성으로 시도
                                    
                                    dt_obj = datetime.strptime(target_ymd, "%Y%m%d")
                                    day_str = str(dt_obj.day) # "29"
                                    full_date_hyphen = dt_obj.strftime("%Y-%m-%d")

                                    # 날짜 버튼 찾기 전략
                                    # 1. strong 태그나 span으로 일자가 표시될 가능성
                                    # 2. title 속성에 날짜가 있을 가능성
                                    # 3. owl-item 내부 text
                                    
                                    # data-date="2024-01-29" is best if exists.
                                    # 사용자 LOG 분석결과: <DIV class='owl-item active'>1월 29 오늘</DIV>
                                    # 날짜는 "29"만 있는게 아니라 "1월 29 오늘" 같은 형식임.
                                    
                                    # Strategy:
                                    # 1. Try exact day match in strong/span if possible
                                    # 2. Iterate all date items and match text intelligently
                                    
                                    
                                    date_btn = None
                                    
                                    # "YYYY-MM-DD" data attribute search
                                    try_data_attr = page.locator(f".owl-item [data-date='{full_date_hyphen}']").first
                                    if try_data_attr.count() > 0:
                                        date_btn = try_data_attr
                                    else:
                                        # Text Match Strategy
                                        # We need to find "29" distinct from "12/29" or "29일"
                                        # But Lotte text seems to be "1월 29 오늘" or just "29"
                                        
                                        # Use regex to match day number surrounded by non-digits
                                        # or exact strong tag
                                        
                                        # Case 1: .owl-item:has-text(" 29 ") (spaces)
                                        # Case 2: .owl-item strong:text-is("29")
                                        
                                        # Attempt detailed find
                                        # .owl-item that contains the month and day?
                                        # Month: dt_obj.month, Day: dt_obj.day
                                        
                                        target_month = str(dt_obj.month)
                                        target_day = str(dt_obj.day)
                                        
                                        # 정교한 매칭: "월"과 "일"이 포함된 텍스트에서 숫자만 추출해서 비교하거나
                                        # "29"가 포함된 요소 중, "Today", "내일" 등이 아니라면...
                                        
                                        # 심플하게: .owl-item 중 inner_text에 "{day} \n" or "{day}일" 등이 포함된 것 찾기
                                        # Playwright text selector with regex
                                        # day_str가 '1'이면 '1', '01' 매칭. '11', '21', '31' 제외.
                                        
                                        # Regex: (^|\D)1($|\D) -> 1 surrounded by non-digits
                                        # e.g. " 1 ", "1월", "1일" matches. "11" does not.
                                        
                                        # locator = page.locator(".owl-item").filter(has_text=re.compile(rf"(^|\D){day_str}($|\D)"))
                                        # This needs regex import in the worker function or top level.
                                        # re is already imported.
                                        
                                        # [USER REQUEST] XPath for Date
                                        date_base_xpath = "/html/body/div[6]/div/ul/li[1]/div/div/div[2]/div[2]/div/div/ul/div[1]/div/div"
                                        # Iterate assuming match with owl items
                                        date_items_xpath = page.locator(f"xpath={date_base_xpath}")
                                        count_items = date_items_xpath.count()
                                        
                                        for k in range(count_items):
                                            # User requested .../div[{k}]/li
                                            # Note: XPath index 1-based.
                                            item_li = page.locator(f"xpath={date_base_xpath}[{k+1}]/li")
                                            
                                            if item_li.count() == 0: continue
                                                
                                            txt = item_li.inner_text()
                                            pattern = re.compile(rf"(^|\D){day_str}(?!월)(\D|$)")
                                            
                                            if pattern.search(txt):
                                                date_btn = item_li
                                                break
                                    
                                    if date_btn and date_btn.count() > 0:
                                        # [Debug] Found Element Info
                                        try:
                                            tag = date_btn.evaluate("el => el.tagName")
                                            classes = date_btn.get_attribute("class")
                                            text = date_btn.inner_text().replace('\n', ' ')
                                            print(f"[{worker_id}]      🔍 Found Date Element: <{tag} class='{classes}'>{text}</{tag}>")
                                        except:
                                            pass

                                        # API Request Interception
                                        # Broaden capture to see what's happening
                                        api_patterns = ["GetPlaySchedule", "Ticketing/Schedule", "Cinema", "ticketing", "TicketingData"]
                                        
                                        def response_predicate(response):
                                            if not any(p in response.url for p in api_patterns):
                                                return False
                                            if response.status != 200:
                                                return False
                                            
                                            # [USER REQUEST] Only accept response with "PlaySeqs" key
                                            # We need to peek into the body.
                                            try:
                                                # Note: checking text() waits for body loading
                                                content = response.text()
                                                if "TicketingData" in response.url and "PlaySeqs" not in content:
                                                     print(f"[{worker_id}]      ⚠️ NO DATA (PlaySeqs missing)")
                                                     return False
                                                return True
                                            except:
                                                return False

                                        # 2-Stage Date Click Strategy
                                        date_click_success = False
                                        collected_data = None
                                        
                                        # Attempt 1: Standard Click
                                        try:
                                            with page.expect_response(response_predicate, timeout=5000) as response_info:
                                                try:
                                                    date_btn.click(timeout=2000)
                                                except Exception as e:
                                                    print(f"[{worker_id}]      ⚠️ Date Standard Click Failed: {e}")
                                                    raise e
                                            
                                            # If we got here, response came
                                            response = response_info.value
                                            collected_data = response.json()
                                            date_click_success = True
                                        except Exception:
                                            pass

                                        # Attempt 2: JS Click (if Attempt 1 failed)
                                        if not date_click_success:
                                            print(f"[{worker_id}]      ⚠️ Retrying Date with Robust JS Click...")
                                            try:
                                                with page.expect_response(response_predicate, timeout=8000) as response_info:
                                                    date_btn.evaluate("el => el.click()")
                                                
                                                response = response_info.value
                                                collected_data = response.json()
                                                date_click_success = True
                                                print(f"[{worker_id}]      ✅ Date JS Click Triggered Response")
                                            except Exception as e:
                                                last_error = e
                                                # Final Failure for this date
                                        
                                        if date_click_success and collected_data:
                                            # DB Save
                                            close_old_connections()
                                            
                                            # Site Code Parsing
                                            site_code = "Unknown"
                                            if isinstance(collected_data, dict):
                                                 if "CinemaID" in str(collected_data):
                                                     pass
                                            
                                            LotteScheduleLog.objects.create(
                                                query_date=target_ymd,
                                                theater_name=theater_name,
                                                site_code=site_code, 
                                                response_json=collected_data,
                                                status='success',
                                                crawler_run=crawler_run
                                            )
                                            print(f"[{worker_id}]      ✅ Saved {theater_name} ({target_ymd})")
                                            collected_results.append({'log_id': 'saved'}) 
                                            total_theater_count += 1
                                        else:
                                            # FAILED
                                            print(f"[{worker_id}]      ❌ Failed to Save {target_ymd}: {str(last_error)[:50]}")
                                            
                                            # Take Screenshot for debugging
                                            screenshot_path = f"error_lotte_{theater_name}_{target_ymd}.png"
                                            try:
                                                page.screenshot(path=screenshot_path)
                                                print(f"[{worker_id}]      📸 Screenshot saved: {screenshot_path}")
                                            except:
                                                pass

                                            failures.append({
                                                'region': region_name,
                                                'theater': theater_name,
                                                'date': target_ymd,
                                                'reason': f"Date Click Failed: {str(last_error)[:50]}",
                                                'worker': worker_id
                                            })
                                        
                                    else:
                                        print(f"[{worker_id}]      ⚠️ Date button not found: {target_ymd}")
                                        failures.append({
                                            'region': region_name,
                                            'theater': theater_name,
                                            'date': target_ymd,
                                            'reason': "Date Button Not Found",
                                            'worker': worker_id
                                        })

                                except Exception as e:
                                    print(f"[{worker_id}]      ⚠️ Date Error {target_ymd}: {e}")
                                    failures.append({
                                        'region': region_name,
                                        'theater': theater_name,
                                        'date': target_ymd,
                                        'reason': f"Error: {str(e)[:50]}",
                                        'worker': worker_id
                                    })
                        
                        except Exception as e:
                            print(f"[{worker_id}]    ⚠️ Theater Click Error: {e}")
                            failures.append({
                                'region': region_name,
                                'theater': theater_name,
                                'date': 'All',
                                'reason': f"Theater Selection Error: {str(e)[:50]}",
                                'worker': worker_id
                            })
                            continue

                except Exception as e:
                    print(f"[{worker_id}] ❌ Region Processing Error: {e}")
                    failures.append({
                        'region': region_name,
                        'theater': 'Region_Fail',
                        'date': 'Error',
                        'reason': f"Region Error: {str(e)[:50]}",
                        'worker': worker_id
                    })

        except Exception as e:
            print(f"[{worker_id}] ❌ Worker Fatal Error: {e}")
            failures.append({
                'region': 'System',
                'theater': 'Worker_Crash',
                'date': 'Error',
                'reason': f"Fatal: {str(e)[:50]}",
                'worker': worker_id
            })
        finally:
            context.close()
            browser.close()
            
    return collected_results, failures, total_theater_count


# =============================================================================
# [PART 2] Pipeline Service
# =============================================================================

# =============================================================================
# [PART 1.5] Lotte Global Pre-scan
# =============================================================================

def scan_lotte_master_list_rpa():
    """
    [Step 0] Global Pre-scan
    수집 시작 전, 전체 극장 리스트를 순회하며 총 개수를 파악합니다.
    """
    print("[Global_PreScan] 🔍 Starting Lotte Master List Scan...")
    total_count = 0
    os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        page = context.new_page()
        
        try:
            page.goto("https://www.lottecinema.co.kr/NLCHS/Ticketing/Schedule", timeout=60000)
            page.wait_for_selector(".cinema_select_wrap", timeout=10000)
            
            # Region List
            region_items = page.locator(".cinema_select_wrap .depth1")
            region_count = region_items.count()
            
            print(f"[Global_PreScan] Found {region_count} regions.")
            
            for i in range(region_count):
                region_li = region_items.nth(i)
                region_anchor = region_li.locator("xpath=./a")
                
                # Check for "My Cinema" or similar
                region_name = region_anchor.inner_text().strip()
                if "MY" in region_name: continue

                # Click Region if not active
                if "active" not in (region_li.get_attribute("class") or ""):
                    region_anchor.click(force=True)
                    time.sleep(0.5)
                
                # Count Theaters
                theater_list = region_li.locator(".depth2 li")
                cnt = theater_list.count()
                total_count += cnt
                # print(f"   - {region_name}: {cnt} theaters")
                
            print(f"[Global_PreScan] ✅ Lotte Scan Success. Total: {total_count}")
            
        except Exception as e:
            print(f"[Global_PreScan] ❌ Lotte Scan Failed: {e}")
        finally:
            browser.close()
            
    return total_count


class LottePipelineService:
    @staticmethod
    def collect_schedule_logs(dates=None, stop_signal=None, crawler_run=None):
        """
        병렬 처리로 롯데시네마 스케줄 수집
        """
        if not dates:
            dates = [datetime.now().strftime("%Y%m%d")]
            
        # [Step 0] Global Pre-scan (Sync)
        # 병렬 수집 시작 전, 마스터 리스트 개수를 먼저 파악합니다.
        print(f"[Main] 📡 Running Lotte Global Pre-scan...")
        total_detected_cnt = scan_lotte_master_list_rpa()
        
        msg = f"📊 [Pre-scan] 롯데시네마 전체 극장 마스터 리스트 확인 완료: {total_detected_cnt}개"
        print(msg)
        LottePipelineService.send_slack_message("INFO", {"message": msg})
        
        print(f"--- [Lotte] Pipeline Start. Dates: {dates} ---")
        
        # Worker Config
        # Grouping based on provided snippet
        # Group 1: Seoul
        # Group 2: Gyeonggi/Incheon
        # Group 3: Busan/Ulsan/Gyeongnam, Daegu/Gyeongbuk
        # Group 4: Jeolla/Gwangju, Chungcheong/Daejeon, Gangwon, Jeju
        
        worker_groups = [
            ["서울"],
            ["경기/인천"],
            ["경남/부산/울산", "경북/대구"],
            ["전라/광주", "충청/대전", "강원", "제주"]
        ]
        
        collected_logs = []
        all_failures = []
        # total_detected_cnt is from Pre-scan
        
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = []
            for idx, group in enumerate(worker_groups):
                worker_id = f"Worker-{idx+1}"
                futures.append(
                    executor.submit(fetch_lotte_schedule_worker, worker_id, group, dates, stop_signal, crawler_run)
                )
                
            for future in as_completed(futures):
                try:
                    res_logs, res_failures, res_cnt = future.result()
                    collected_logs.extend(res_logs)
                    all_failures.extend(res_failures)
                    # total_detected_cnt is fixed from Pre-Scan
                except Exception as e:
                    print(f"[Main] ❌ A worker failed: {e}")
                    all_failures.append({
                        'region': 'Unknown', 
                        'theater': 'Unknown', 
                        'date': 'Unknown', 
                        'reason': f"Worker Exception: {e}", 
                        'worker': 'Main'
                    })
                    
        return collected_logs, total_detected_cnt, all_failures

    @classmethod
    def check_missing_theaters(cls, logs, crawler_run=None, total_expected=0):
        from crawler.theaters import LOTTE_AUDITED_THEATERS
        
        # Collected Set
        if crawler_run:
            collected_qs = LotteScheduleLog.objects.filter(crawler_run=crawler_run).values_list('theater_name', flat=True).distinct()
            collected_set = set(collected_qs)
        else:
            collected_set = set(l['theater_name'] for l in logs if isinstance(l, dict) and 'theater_name' in l)

        # Use total_expected from Pre-scan as the authority for "Total Count"
        # Since we don't have a dynamic list of names from pre-scan (only count), 
        # we can only compare counts or use the static AUDITED list for name checking.
        
        # Hybrid Approach: 
        # 1. Total Count = Pre-scan result
        # 2. Missing List = Based on Audited List (Static) -> This might be inaccurate if pre-scan found more than audited.
        
        # For reporting purposes, user wants "Master Count" (from pre-scan) vs "Collected Count".
        
        missing_count = max(0, total_expected - len(collected_set))
        
        missing_list = []
        # Optional: Check against static list for specific names if useful
        # missing_from_static = set(LOTTE_AUDITED_THEATERS) - collected_set
        
        return {
            'is_missing': missing_count > 0,
            'total_cnt': total_expected,
            'collected_cnt': len(collected_set),
            'missing_cnt': missing_count,
            'missing_list': [] # specific names difficult without full dynamic list
        }

    @classmethod
    def send_slack_message(cls, message_type, data):
        token = getattr(settings, 'SLACK_BOT_TOKEN', '')
        channel = getattr(settings, 'SLACK_CHANNEL_ID', '')
        
        if not token or not channel:
            print(f"[Slack LOG] {message_type}: {data}")
            return
        
        text = ""
        blocks = []

        if message_type == "INFO":
            text = f"ℹ️ Pipeline: {data['message']}"
            blocks = [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*ℹ️ [Lotte] Status*\n{data['message']}"}
                }
            ]
            
        elif message_type == "SUCCESS":
            # 실패 내역 리포팅 추가
            failures = data.get('failures', [])
            fail_msg = ""
            if failures:
                fail_summary = []
                for f in failures[:15]:
                    reason = f.get('reason', 'Unknown')
                    fail_summary.append(f"• [{f['theater']}] {f['date']}: {reason}")
                if len(failures) > 15:
                    fail_summary.append(f"... 외 {len(failures)-15}건")
                fail_msg = "\n\n⚠️ *수집 실패 내역:*\n" + "\n".join(fail_summary)

            # 누락 내역 (Missing)
            missing_info = data.get('missing_info', {})
            missing_msg = ""
            if missing_info.get('is_missing'):
                missing_list_str = ", ".join(missing_info.get('missing_list', []))
                missing_msg = f"\n⚠️ *누락 극장 목록:* {missing_list_str}"

            collected_cnt = data.get('collected', 0)
            created_cnt = data.get('created', 0)
            # [USER REQUEST] Strict: No default 0
            total_master = data['total_master']
            
            # Text Summary
            text = f"📊 [Lotte] 결과: 총 {total_master}개 중 {collected_cnt}개 수집 완료.{missing_msg}{fail_msg}"
            
            blocks = [
                {
                    "type": "section", 
                    "text": {"type": "mrkdwn", "text": f"*📊 [Lotte] 스케줄링 결과*"}
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*총 극장 수 (Master):*\n{total_master}개"},
                        {"type": "mrkdwn", "text": f"*수집된 극장:*\n{collected_cnt}개"}
                    ]
                }
            ]

            if missing_info.get('is_missing'):
                blocks.append({
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*⚠️ 누락 극장 목록 ({missing_info['missing_cnt']}개):*\n{', '.join(missing_info['missing_list'])}"}
                })

            if failures:
                blocks.append({
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*⚠️ 수집 실패 상세 (Top 15)*\n" + "\n".join(fail_summary)}
                })
                
        elif message_type == "ERROR":
            errors = data.get('errors', [])
            text = f"❌ [Lotte] 파이프라인 에러 발생 ({len(errors)}건)"
            blocks = [{"type": "section", "text": {"type": "mrkdwn", "text": text}}]

        try:
            requests.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"channel": channel, "text": text, "blocks": blocks}
            )
        except:
            pass

    @classmethod
    def transform_logs_to_schedule(cls, log_ids=None, target_titles=None):
        # [USER REQUEST] Temporarily Disabled
        print("   [Transform] Skipping schedule creation as per user request.")
        return 0, []

    @classmethod
    def run_pipeline(cls, dates=None):
        print(">>> Starting Lotte Pipeline")
        cls.send_slack_message("INFO", {"message": "🚀 롯데시네마 스케줄 수집 시작"})
        
        target_dates = dates if dates else [datetime.now().strftime("%Y%m%d")]
        
        # History Creation
        from crawler.models import CrawlerRunHistory
        from django.utils import timezone
        
        run_history = CrawlerRunHistory.objects.create(
            status='RUNNING',
            trigger_type='MANUAL', # default for now via CLI
            configuration={'target_dates': target_dates, 'brand': 'LOTTE'}
        )
        print(f"🚀 [Lotte] CrawlerRun #{run_history.id} Created")

        try:
            logs, total_cnt, failures = cls.collect_schedule_logs(dates=target_dates, crawler_run=run_history)
            
            # Missing Check
            missing_res = cls.check_missing_theaters(logs, crawler_run=run_history, total_expected=total_cnt)
            if missing_res['is_missing']:
                print(f"⚠️ Missing Theaters: {missing_res['missing_cnt']} ea")
                # cls.send_slack_message("WARNING_MISSING", missing_res)
            
            cls.send_slack_message("SUCCESS", {
                "collected": len(logs),
                "created": 0,
                "failures": failures,
                "missing_info": missing_res,
                "total_master": total_cnt
            })
            
            run_history.status = 'SUCCESS'
            run_history.finished_at = timezone.now()
            run_history.result_summary = {
                'collected_logs': len(logs),
                'failures': len(failures),
                'missing_cnt': missing_res['missing_cnt']
            }
            run_history.save()
            
        except Exception as e:
            print(f"❌ [Lotte] Pipeline Fatal Error: {e}")
            run_history.status = 'FAILED'
            run_history.error_message = str(e)
            run_history.finished_at = timezone.now()
            run_history.save()
            cls.send_slack_message("ERROR", {"errors": [{'error': str(e)}]})


class Command(BaseCommand):
    help = 'Run Lotte Pipeline'

    def add_arguments(self, parser):
        parser.add_argument('--date', type=str, help='YYYYMMDD')

    def handle(self, *args, **options):
        target_date = options.get('date')
        if target_date:
            print(f"🎯 Target Date from CLI: {target_date}")
            LottePipelineService.run_pipeline(dates=[target_date])
        else:
            LottePipelineService.run_pipeline()
