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

def fetch_lotte_schedule_worker(worker_id, assigned_regions, target_dates, stop_signal=None):
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
                                                status='success'
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

class LottePipelineService:
    @staticmethod
    def collect_schedule_logs(dates=None, stop_signal=None):
        """
        병렬 처리로 롯데시네마 스케줄 수집
        """
        if not dates:
            dates = [datetime.now().strftime("%Y%m%d")]
            
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
        total_count = 0
        
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = []
            for idx, group in enumerate(worker_groups):
                worker_id = f"Worker-{idx+1}"
                futures.append(
                    executor.submit(fetch_lotte_schedule_worker, worker_id, group, dates, stop_signal)
                )
                
            for future in as_completed(futures):
                try:
                    res_logs, res_failures, res_cnt = future.result()
                    collected_logs.extend(res_logs)
                    all_failures.extend(res_failures)
                    total_count += res_cnt
                except Exception as e:
                    print(f"[Main] ❌ A worker failed: {e}")
                    all_failures.append({
                        'region': 'Unknown', 
                        'theater': 'Unknown', 
                        'date': 'Unknown', 
                        'reason': f"Worker Exception: {e}", 
                        'worker': 'Main'
                    })
                    
        return collected_logs, total_count, all_failures

    @classmethod
    def send_slack_message(cls, message_type, data):
        token = getattr(settings, 'SLACK_BOT_TOKEN', '')
        channel = getattr(settings, 'SLACK_CHANNEL_ID', '')
        
        if not token or not channel:
            return
        
        text = ""
        blocks = []

        if message_type == "INFO":
            text = f"ℹ️ [Lotte] {data['message']}"
            blocks = [{"type": "section", "text": {"type": "mrkdwn", "text": text}}]
            
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

            collected_cnt = data.get('collected', 0)
            text = f"✅ [Lotte] 수집 완료. (성공: {collected_cnt}건){fail_msg}"
            
            blocks = [
                {
                    "type": "section", 
                    "text": {"type": "mrkdwn", "text": f"*✅ 롯데시네마 크롤링 완료*"}
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*수집 성공 Logs:*\n{collected_cnt}건"},
                        {"type": "mrkdwn", "text": f"*실패:*\n{len(failures)}건"}
                    ]
                }
            ]
            if failures:
                blocks.append({
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*⚠️ 실패 상세 (Top 15)*\n" + "\n".join(fail_summary)}
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
        logs, total_cnt, failures = cls.collect_schedule_logs(dates=target_dates)
        
        cls.send_slack_message("SUCCESS", {
            "collected": len(logs),
            "created": 0,
            "failures": failures
        })


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
