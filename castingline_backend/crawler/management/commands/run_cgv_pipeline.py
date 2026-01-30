import os
import time
import json
import requests
from datetime import datetime
from django.conf import settings
from django.db import close_old_connections
from django.core.management.base import BaseCommand
from playwright.sync_api import sync_playwright

# Models Import
from crawler.models import CGVScheduleLog, MovieSchedule

from concurrent.futures import ThreadPoolExecutor

# =============================================================================
# [PART 1] RPA Logic (Formerly cgv_rpa.py)
# =============================================================================

def scan_cgv_master_list_rpa():
    """
    [Step 0] Global Pre-scan
    수집 시작 전, 전체 극장 리스트를 순회하며 총 개수를 파악합니다.
    (Master List 확보 목적)
    """
    print("[Global_PreScan] 🔍 Starting Master List Scan...")
    total_count = 0
    os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        page = context.new_page()
        
        try:
            page.goto("https://cgv.co.kr/cnm/movieBook/cinema", timeout=30000)
            
            # Helper: 모달 열기
            def ensure_modal_open():
                try:
                    if page.locator(".cgv-bot-modal.active").count() > 0: return
                    page.locator("button[class*='editBtn']").first.click()
                    page.wait_for_selector(".cgv-bot-modal.active", state="visible", timeout=3000)
                except: pass

            ensure_modal_open()
            
            # Selectors (User Verified)
            modal_selector = ".cgv-bot-modal.active"
            region_items_selector = f"{modal_selector} .bottom_region__2bZCS > ul > li"
            
            page.wait_for_selector(region_items_selector, state="visible", timeout=5000)
            region_count = page.locator(region_items_selector).count()
            
            for i in range(region_count):
                ensure_modal_open()
                # Click Region
                page.locator(f"{region_items_selector}:nth-child({i+1}) > button").click(force=True)
                
                # Wait for Theater List
                theater_container = f"{modal_selector} .bottom_tabRight__xVGPl .bottom_listCon__8g46z > ul"
                page.wait_for_selector(theater_container, state="visible", timeout=3000)
                
                # Count
                cnt = page.locator(f"{theater_container} > li").count()
                total_count += cnt
                # print(f"   - Region {i+1}: {cnt} theaters")
                
            print(f"[Global_PreScan] ✅ Success. Total Detected: {total_count}")
            
        except Exception as e:
            print(f"[Global_PreScan] ❌ Failed: {e}")
            # 실패 시 0 반환 (메인 로직은 계속 진행)
        finally:
            browser.close()
            
    return total_count

def fetch_cgv_schedule_rpa(co_cd="A420", site_no=None, scn_ymd=None, date_list=None, target_regions=None, stop_signal=None, retry_targets=None, crawler_run=None):
    """
    Playwright를 사용하여 CGV 페이지에 접속하고, 
    모든 지역 및 극장을 순회하며 데이터 수집 즉시 DB에 저장합니다.
    (Optimized: 극장 선택 후 날짜 목록을 순회합니다)
    
    :param target_regions: List of region names to process. If None, process all.
    :param retry_targets: Dict of {Region: {Theater: [Dates]}} for targeted retry. If set, ignores date_list/target_regions priority.
    """
    # Date List Normalization
    default_dates = date_list if date_list else ([scn_ymd] if scn_ymd else [datetime.now().strftime("%Y%m%d")])
    
    print(f"[디버그] fetch_cgv_schedule_rpa 호출됨. retry_targets={bool(retry_targets)}")
    collected_results = []
    failures = [] # 실패 내역 저장
    total_theater_count = 0  # 전체 극장 수 누적 변수
    
    # Thread Safe 설정
    os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        target_url = "https://cgv.co.kr/cnm/movieBook/cinema"
        worker_id = "Global" if not target_regions else f"Worker({target_regions[0]}...)"
        print(f"[{worker_id}] 🚀 이동 중: {target_url}")
        
        try:
            page.goto(target_url, timeout=30000)
            print("⏳ 페이지 로딩 대기 중...")
            
            # Helper: 모달 열기
            def ensure_modal_open():
                try:
                    # 모달 활성 상태 확인
                    if page.locator(".cgv-bot-modal.active").count() > 0:
                        return
                    
                    # 닫혀있다면 열기 버튼 찾기 클릭
                    open_btn = page.locator("button[class*='editBtn']").first
                    open_btn.click()
                    page.wait_for_selector(".cgv-bot-modal.active", state="visible", timeout=3000)
                except Exception as e:
                    print(f"⚠️ 모달 열기 실패: {e}")
 
            # 초기 모달 대기
            ensure_modal_open()
            
            # 지역 개수 파악
            modal_selector = ".cgv-bot-modal.active"
            region_items_selector = f"{modal_selector} .bottom_region__2bZCS > ul > li"
            region_count = page.locator(region_items_selector).count()
            print(f"📍 {region_count}개의 지역을 찾았습니다.")
            
            for i in range(region_count):
                try:
                    if stop_signal: stop_signal()
                    ensure_modal_open()
                    
                    # 지역 버튼 클릭
                    region_btn = page.locator(f"{region_items_selector}:nth-child({i+1}) > button")
                    raw_region_name = region_btn.inner_text().strip()
                    region_name = raw_region_name.split('(')[0].strip()
                    
                    # [Retry Logic] Region Filtering
                    if retry_targets and region_name not in retry_targets:
                        # Retry 모드인데 해당 지역이 대상이 아니면 스킵
                        continue

                    # --- Region Filtering Logic (Normal Mode) ---
                    if not retry_targets and target_regions:
                         # 안전한 매칭을 위해 포함 여부 또는 시작 문자열 확인
                         is_target = False
                         for tr in target_regions:
                             if tr in region_name or region_name.startswith(tr):
                                 is_target = True
                                 break
                         
                         if not is_target:
                             # print(f"[{worker_id}] Skipping '{region_name}' (Not in target)")
                             continue
                    
                    print(f"\n[{worker_id}] 지역: {region_name}")
                    
                    region_btn.scroll_into_view_if_needed()
                    region_btn.click(force=True)
                    
                    # 극장 리스트 갱신 대기
                    theater_container_selector = f"{modal_selector} .bottom_tabRight__xVGPl .bottom_listCon__8g46z > ul"
                    page.wait_for_selector(theater_container_selector, state="visible", timeout=3000)
                    
                    # 극장 개수 파악
                    theater_items_selector = f"{theater_container_selector} > li"
                    current_region_cnt = page.locator(theater_items_selector).count()
                    total_theater_count += current_region_cnt # 누적
                    print(f"   ↳ {current_region_cnt}개의 극장 발견 (누적: {total_theater_count})")
                    
                    for j in range(current_region_cnt):
                        try:
                            if stop_signal: stop_signal()
                            ensure_modal_open()
                            
                            # 지역 다시 선택 (초기화 방지)
                            page.locator(f"{region_items_selector}:nth-child({i+1}) > button").click(force=True)
                            
                            # j번째 극장 클릭
                            theater_btn = page.locator(f"{theater_items_selector}:nth-child({j+1}) > button")
                            theater_name = theater_btn.inner_text().strip()
                            
                            # [Retry Logic] Theater Filtering
                            if retry_targets:
                                if theater_name not in retry_targets.get(region_name, {}):
                                    continue
                            
                            # siteNo 추출
                            onclick_val = theater_btn.get_attribute("onclick") or ""
                            current_site_no = "Unknown"
                            import re
                            match = re.search(r"getTheaterSchedule\('([^']+)'", onclick_val)
                            if match:
                                current_site_no = match.group(1)
                            
                            print(f"      [{j+1}/{current_region_cnt}] 처리 중: {theater_name}")
                            
                            theater_btn.scroll_into_view_if_needed()
                            
                            # 📥 API 응답 스니핑 (Response Sniffing) 설정
                            # 한 번의 클릭으로 여러 날짜 데이터가 올 수 있으므로, Listener로 모두 수집합니다.
                            response_cache = {} 
                            
                            def on_schedule_response(response):
                                try:
                                    if "searchMovScnInfo" in response.url and response.status == 200:
                                        from urllib.parse import urlparse, parse_qs
                                        parsed = urlparse(response.url)
                                        qs = parse_qs(parsed.query)
                                        if 'scnYmd' in qs:
                                            ymd = qs['scnYmd'][0]
                                            # response.json()은 Playwright에서 본문 로딩을 처리해줍니다.
                                            data = response.json()
                                            response_cache[ymd] = data
                                            print(f"      📥 [캐시] 데이터 수신됨: {ymd}")
                                except Exception as e:
                                    pass # 리스너 내부 오류는 무시 (메인 로직 방해 방지)

                            page.on("response", on_schedule_response)
                            
                            try:
                                # 1. 극장 선택 (클릭 시 여러 API 호출 발생 가능)
                                try:
                                    # 적어도 하나의 응답은 기다림
                                    with page.expect_response(lambda r: "searchMovScnInfo" in r.url, timeout=3000):
                                        theater_btn.click(force=True)
                                except:
                                    print("      ⚠️ 초기 응답 대기 타임아웃 (백그라운드 수집은 계속됨)")
                                    pass
                                
                                time.sleep(1.0) # 추가 비동기 응답 대기

                                # ===================== [DATE LOOP START] =====================
                                # Determine dates to scan for this theater
                                current_target_dates = default_dates
                                if retry_targets:
                                    # Retry 모드면 해당 극장의 실패했던 날짜들만 로드
                                    current_target_dates = list(retry_targets[region_name].get(theater_name, []))

                                for target_ymd in current_target_dates:
                                    if stop_signal: stop_signal()
                                    
                                    target_date_obj = datetime.strptime(target_ymd, "%Y%m%d")
                                    target_day = f"{target_date_obj.day:02d}" 
                                    target_day_variant = f"{target_date_obj.month}.{target_date_obj.day}" if target_date_obj.day == 1 else None

                                    # 1단계: 캐시 확인
                                    json_data = response_cache.get(target_ymd)
                                    skip_reason = None
                                    
                                    if json_data:
                                        print(f"      ⚡ 캐시된 데이터 즉시 사용 ({target_ymd})")
                                    else:
                                        # 2단계: 캐시에 없으면 해당 날짜 버튼 클릭
                                        # 재시도 로직
                                        for attempt in range(3):
                                            try:
                                                ensure_modal_open()
                                                
                                                # 버튼 찾기
                                                date_btns = page.locator("button:has(span[class*='dayScroll_number'])")
                                                target_btn = None
                                                cnt = date_btns.count()
                                                for k in range(cnt):
                                                    btn = date_btns.nth(k)
                                                    span_text = btn.locator("span[class*='dayScroll_number']").inner_text().strip()
                                                    if span_text == target_day or (target_day_variant and span_text == target_day_variant):
                                                        target_btn = btn
                                                        break
                                                
                                                if not target_btn:
                                                    print(f"      ⚠️ 날짜 버튼 없음: {target_day}")
                                                    skip_reason = "Date Button Not Found"
                                                    break
                                                
                                                # 상태 확인 (유저 제보 DOM 기반 강화)
                                                # DOM: <button ... class="... dayScroll_disabled__t8HIQ" disabled="" title="선택됨">
                                                is_disabled_attr = target_btn.get_attribute("disabled") is not None
                                                class_attr = target_btn.get_attribute("class") or ""
                                                title_attr = target_btn.get_attribute("title") or ""
                                                
                                                is_disabled_class = "disabled" in class_attr or "dimmed" in class_attr or "dayScroll_disabled" in class_attr
                                                is_active = "dayScroll_itemActive" in class_attr or "선택됨" in title_attr
                                                
                                                if is_disabled_attr or is_disabled_class:
                                                    print(f"      🚫 날짜 비활성화됨: {target_ymd}")
                                                    skip_reason = "Date Button Disabled"
                                                    break
                                                
                                                # 클릭
                                                if is_active:
                                                    print(f"      🗓 날짜 {target_ymd} ({target_day}) 이미 활성화됨 (Title: {title_attr}). 클릭 갱신 시도.")
                                                else:
                                                    print(f"      🗓 날짜 클릭 시도: {target_ymd} (시도 {attempt+1})")
                                                
                                                # 클릭 후 응답을 기다리지만, 데이터는 response_cache에 쌓임
                                                try:
                                                    target_btn.scroll_into_view_if_needed() # 가시성 확보
                                                    with page.expect_response(lambda r: "searchMovScnInfo" in r.url, timeout=5000):
                                                        # JS Click 사용 (이벤트 핸들러 호환성 향상)
                                                        target_btn.evaluate("el => el.click()")
                                                except:
                                                    pass # 타임아웃 나더라도 캐시 확인이 중요
                                                
                                                # 클릭 후 캐시 재확인
                                                if target_ymd in response_cache:
                                                    json_data = response_cache[target_ymd]
                                                    break # 성공
                                                
                                                time.sleep(1) # 대기 후 재시도
                                                
                                            except Exception as e:
                                                print(f"      ⚠️ 날짜 클릭 오류: {e}")
                                                time.sleep(1)
                                    
                                    # 3단계: 최종 데이터 저장 처리
                                    if json_data:
                                        try:
                                            close_old_connections()
                                            
                                            site_code_res = current_site_no
                                            if json_data.get("data") and len(json_data["data"]) > 0:
                                                site_code_res = json_data["data"][0].get("siteNo", current_site_no)
                                            
                                            log, created = CGVScheduleLog.objects.update_or_create(
                                                query_date=target_ymd,
                                                site_code=site_code_res,
                                                defaults={
                                                    'theater_name': theater_name,
                                                    'response_json': json_data,
                                                    'status': 'success',
                                                    'crawler_run': crawler_run
                                                }
                                            )
                                            action = "생성됨" if created else "업데이트됨"
                                            print(f"      ✅ [SUCCESS] {site_code_res} (날짜: {target_ymd}) - {action} (from Cache/Net)")
                                            collected_results.append({"log_id": log.id, "date": target_ymd})
                                        except Exception as e:
                                            print(f"      ❌ [FAIL] 저장 오류: {e}")
                                            failures.append({
                                                'region': region_name,
                                                'theater': theater_name,
                                                'date': target_ymd,
                                                'reason': f"Save Error: {str(e)[:50]}",
                                                'worker': worker_id
                                            })
                                    else:
                                        # 최종 실패 (disabled였거나, 클릭해도 응답 없거나)
                                        real_reason = skip_reason if skip_reason else "API Response Timeout / No Data"
                                        print(f"      ❌ [FAIL] 데이터 수집 실패: {target_ymd} ({real_reason})")
                                        failures.append({
                                            'region': region_name,
                                            'theater': theater_name,
                                            'date': target_ymd,
                                            'reason': real_reason,
                                            'worker': worker_id
                                        })
                                        pass 

                                    time.sleep(0.1) # 날짜 간 딜레이

                            finally:
                                page.remove_listener("response", on_schedule_response)

                            time.sleep(0.1) # 극장 간 딜레이
                            
                        except InterruptedError:
                            raise
                        except Exception as e:
                            print(f"      ❌ 극장 오류: {e}")
                            continue

                except InterruptedError:
                    raise
                except Exception as e:
                    print(f"❌ 지역 오류: {e}")
                    continue

        except InterruptedError:
            print("🛑 사용자에 의해 작업 중단됨")
            return collected_results, total_theater_count
        except Exception as e:
            print(f"❌ Playwright 오류: {e}")
            
        finally:
            if 'browser' in locals():
                browser.close()

    print(f"   [완료] 총 수집된 로그: {len(collected_results)} / {total_theater_count}")
    return collected_results, failures, total_theater_count


# =============================================================================
# [PART 2] Pipeline Service Logic (Formerly cgv_pipeline_service.py)
# =============================================================================

class CGVPipelineService:
    """
    CGV 스케줄 데이터 파이프라인 통합 서비스
    1. 수집 (RPA)
    2. 검증 (Missing Check) -> Dynamic Count from RPA
    3. 변환 (Bulk Processing)
    4. 알림 (Slack)
    """

    @classmethod
    def collect_schedule_logs(cls, dates=None, stop_signal=None, crawler_run=None):
        """
        [1단계] RPA를 통해 전국 극장 순회 및 로그 저장 (Parallel)
        Returns: (collected_logs, total_detected_cnt)
        """
        # Thread Safe
        os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
        
        if not dates:
            dates = [datetime.now().strftime("%Y%m%d")]

        # Define Region Groups for Parallel Workers
        # 4개의 Worker로 분산 (Balanced Mode)
        # Group 1: 서울/인천 (약 40개)
        # Group 2: 경기 (약 52개)
        # Group 3: 경상권 (부산/울산/대구/경상) (약 40개)
        # Group 4: 기타 (대전/충청/광주/전라/제주/강원) (약 45개)
        REGION_GROUPS = [
            ["서울", "인천"], 
            ["경기"],
            ["부산/울산", "경상", "대구"],
            ["대전/충청", "광주/전라/제주", "강원"]
        ]

        collected_logs = []
        all_failures = []
        
        # [Step 0] Global Pre-scan (Sync)
        # 병렬 수집 시작 전, 마스터 리스트 개수를 먼저 파악합니다.
        print(f"[Main] 📡 Running Global Pre-scan (Master List Check)...")
        total_detected_cnt = scan_cgv_master_list_rpa()
        
        msg = f"📊 [Pre-scan] 전체 극장 마스터 리스트 확인 완료: {total_detected_cnt}개"
        print(msg)
        cls.send_slack_message("INFO", {"message": msg})
        
        print(f"--- 파이프라인: {dates} 데이터 수집 중 (Parallel Execution with {len(REGION_GROUPS)} Workers) ---")
        
        with ThreadPoolExecutor(max_workers=len(REGION_GROUPS)) as executor:
            futures = []
            for group_idx, region_group in enumerate(REGION_GROUPS):
                print(f"[Main] Scheduling Worker-{group_idx+1} for regions: {region_group}")
                futures.append(
                    executor.submit(
                        fetch_cgv_schedule_rpa, 
                        date_list=dates, 
                        target_regions=region_group,
                        stop_signal=stop_signal,
                        crawler_run=crawler_run
                    )
                )
            
            # Wait for all futures
            for future in futures:
                try:
                    res_logs, res_failures, res_cnt = future.result()
                    collected_logs.extend(res_logs)
                    all_failures.extend(res_failures)
                    # total_detected_cnt is already set by Pre-scan
                except Exception as e:
                    print(f"[Main] ❌ One of the workers failed: {e}")

        # [Step 1.5] Retry Logic for API Failures
        retry_map = {} # {Region: {Theater: {Set of Dates}}}
        final_failures = []
        
        for f in all_failures:
            # "Date Button Disabled"인 경우는 재시도 해도 소용없으므로 제외
            # "API Response Timeout"이나 "No Data" 등 일시적/네트워크성 오류만 재시도
            if f['reason'] != "Date Button Disabled" and f['reason'] != "Date Button Not Found":
                r = f['region']
                t = f['theater']
                d = f['date']
                
                if r not in retry_map: retry_map[r] = {}
                if t not in retry_map[r]: retry_map[r][t] = set()
                retry_map[r][t].add(d)
            else:
                final_failures.append(f) # 재시도 대상 아니면 바로 최종 실패 목록으로
        
        if retry_map:
            retry_count = sum(len(dates) for r in retry_map.values() for dates in r.values())
            print(f"\n[Retry] 🔄 Found {retry_count} items to retry (API Timeouts/Errors). Starting Retry Phase...")
            
            try:
                # 재시도는 안정성을 위해 단일 워커로 실행 (또는 별도 설정)
                # target_regions=None으로 주고 retry_targets만 전달
                logs_retry, failures_retry, _ = fetch_cgv_schedule_rpa(
                    date_list=None, # retry_targets 내부 날짜 사용
                    target_regions=None,
                    retry_targets=retry_map,
                    stop_signal=stop_signal,
                    crawler_run=crawler_run
                )
                
                print(f"[Retry] ✅ Retry Finished. Recovered: {len(logs_retry)} items.")
                collected_logs.extend(logs_retry)
                final_failures.extend(failures_retry) # 재시도에서도 실패한 건 최종 실패로
                
            except Exception as e:
                print(f"[Retry] ❌ Retry Failed: {e}")
                # 재시도 로직 자체가 터지면, 원래의 실패 내역들을 다시 복구해야 함 (이미 all_failures에서 분리됨)
                # 여기서는 간단히 재시도 맵에 있던 것들을 'Retry Failed' 이유로 추가
                for r, theaters in retry_map.items():
                    for t, dates in theaters.items():
                         for d in dates:
                             final_failures.append({
                                 'region': r, 'theater': t, 'date': d, 
                                 'reason': f"Retry Execution Failed: {str(e)}", 
                                 'worker': "RetryWorker"
                             })
        else:
            print("\n[Retry] No retryable failures found.")

        return collected_logs, total_detected_cnt, final_failures

    @classmethod
    def check_missing_theaters(cls, logs, total_expected):
        """
        [2단계] 수집된 로그 분석하여 누락 여부 확인
        """
        collected_cnt = len(logs)
        missing_count = total_expected - collected_cnt
        is_missing = missing_count > 0 
        
        return {
            'is_missing': is_missing,
            'total_cnt': total_expected,
            'collected_cnt': collected_cnt,
            'missing_cnt': max(0, missing_count)
        }

    @staticmethod
    def transform_logs_to_schedule(log_ids=None, target_titles=None):
        """
        [3단계] 로그 -> 스케줄 변환 (Bulk)
        """
        if log_ids:
            logs = CGVScheduleLog.objects.filter(id__in=log_ids)
        else:
            today_str = datetime.now().strftime("%Y%m%d")
            logs = CGVScheduleLog.objects.filter(created_at__date=datetime.now().date())
            
        print(f"   [Transform] Processing {logs.count()} logs...")

        total_created = 0
        all_errors = []
        
        for log in logs:
            try:
                cnt, errors = MovieSchedule.create_from_cgv_log(log, target_titles=target_titles)
                total_created += cnt
                all_errors.extend(errors)
            except Exception as e:
                print(f"Error transforming log {log.id}: {e}")
                all_errors.append({
                    'theater': log.theater_name,
                    'site_code': log.site_code,
                    'movie': 'N/A',
                    'error': str(e),
                    'log_id': log.id
                })
        
        return total_created, all_errors

    @classmethod
    def send_slack_message(cls, message_type, data):
        token = getattr(settings, 'SLACK_BOT_TOKEN', '')
        channel = getattr(settings, 'SLACK_CHANNEL_ID', '')
        
        if not token or not channel:
            print(f"[Slack LOG] {message_type}: {data}")
            return

        text = ""
        blocks = []

        if message_type == "WARNING_MISSING":
            text = f"⚠️ CGV 스케줄 수집 누락 경고! ({data['collected_cnt']}/{data['total_cnt']})"
            blocks = [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*⚠️ CGV 스케줄 수집 누락 경고!*"}
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*총 극장 수:*\n{data['total_cnt']}개"},
                        {"type": "mrkdwn", "text": f"*수집된 극장 수:*\n{data['collected_cnt']}개"},
                        {"type": "mrkdwn", "text": f"*누락된 극장 수:*\n{data['missing_cnt']}개"}
                    ]
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {"type": "plain_text", "text": "일부 변환 진행"},
                            "style": "primary",
                            "value": "action_transform_partial"
                        },
                        {
                            "type": "button",
                            "text": {"type": "plain_text", "text": "작업 중단"},
                            "style": "danger",
                            "value": "action_abort"
                        }
                    ]
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
            collected_list = data.get('collected_list', [])
            
            # Aggregate by date
            date_counts = {}
            for item in collected_list:
                # item is dict {..., 'date': 'YYYYMMDD'}
                d_str = item.get('date', 'Unknown')
                date_counts[d_str] = date_counts.get(d_str, 0) + 1

            sorted_dates = sorted(date_counts.keys())
            date_breakdown_str = ""
            
            # [USER REQUEST] Multi-line format: "1월 31일: N개"
            if sorted_dates:
               parts = []
               for d in sorted_dates:
                   # d is usually YYYYMMDD
                   try:
                       dt = datetime.strptime(d, "%Y%m%d")
                       d_fmt = f"{dt.month}월 {dt.day}일"
                   except:
                       d_fmt = d
                       
                   parts.append(f"• {d_fmt}: {date_counts[d]}개")
               
               # Join with newlines
               date_breakdown_str = "\n" + "\n".join(parts)
            
            created_cnt = data.get('created', 0)
            # [USER REQUEST] Strict: No default 0
            total_master = data['total_master']
            
            # Text Summary
            text = f"📊 [CGV] 결과: 총 {total_master}개 Master.{date_breakdown_str}\n{fail_msg}"
            
            blocks = [
                {
                    "type": "section", 
                    "text": {"type": "mrkdwn", "text": f"*📊 [CGV] 스케줄링 결과*"}
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*총 극장 수 (Master):*\n{total_master}개"},
                        {"type": "mrkdwn", "text": f"*수집된 극장 (날짜별):*{date_breakdown_str}"}
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
        elif message_type == "INFO":
            text = f"ℹ️ Pipeline: {data['message']}"
            blocks = [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*ℹ️ [CGV] Status*\n{data['message']}"}
                }
            ]
            
        elif message_type == "ERROR":
            error_count = len(data.get('errors', []))
            text = f"❌ CGV 파싱 에러 발생! ({error_count}건)"
            
            error_summary = "\n".join([
                f"• {err['theater']} - {err['movie']}: {err['error'][:50]}"
                for err in data.get('errors', [])[:5]
            ])
            
            blocks = [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*❌ CGV 데이터 파싱 에러 발생!*"}
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*총 에러 수:*\n{error_count}건"},
                        {"type": "mrkdwn", "text": f"*영향받은 극장:*\n{len(set(e['theater'] for e in data.get('errors', [])))}개"}
                    ]
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*에러 샘플 (최대 5건):*\n{error_summary}"}
                }
            ]

        try:
            url = "https://slack.com/api/chat.postMessage"
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            payload = {"channel": channel, "text": text, "blocks": blocks}
            requests.post(url, headers=headers, json=payload)
        except Exception as e:
            print(f"Slack Send Error: {e}")

    @classmethod
    def run_pipeline_stage_1(cls, target_dates=None):
        """
        메인 파이프라인 실행
        Returns: (collected_count, created_count, errors)
        """
        print(f">>> Starting Pipeline Stage 1 (Target: {target_dates})")
        cls.send_slack_message("INFO", {"message": "🚀 CGV 스케줄 데이터 수집을 시작합니다... (Logic Updated)"})
        
        # 1. Collect
        logs, total_cnt, collection_failures = cls.collect_schedule_logs(dates=target_dates)
        log_ids = [l['log_id'] for l in logs if isinstance(l, dict) and 'log_id' in l]
        
        fail_msg = f"\n⚠️ 수집 실패: {len(collection_failures)}건" if collection_failures else ""
        cls.send_slack_message("INFO", {"message": f"📊 데이터 수집 완료.\n- 수집된 로그: {len(logs)}개\n- 발견된 극장: {total_cnt}개{fail_msg}\n검증을 수행합니다."})
        
        # 2. Validate
        check_result = cls.check_missing_theaters(logs, total_cnt)
        
        created_cnt = 0
        errors = []

        if check_result['is_missing']:
            print(">>> Missing theaters found.")
        else:
            print(">>> Validation OK. Proceeding to transform...")

        # [USER REQUEST] 데이터 생성 잠시 중단
        # created_cnt, errors = cls.transform_logs_to_schedule(log_ids, target_titles=None)
        
        # Send error report if any
        # if errors:
        #     cls.send_slack_message("ERROR", {"errors": errors})
        
        # [DEBUG] Trace total_cnt value
        print(f">>> [DEBUG] Pre-slack Check: collected={len(logs)}, total_cnt={total_cnt}")

        cls.send_slack_message("SUCCESS", {
            "collected": len(logs),
            "collected_list": logs, # Pass logs for breakdown
            "created": 0, # created_cnt,
            "failures": collection_failures,
            "missing_info": check_result,
            "total_master": total_cnt
        })
            
        return len(logs), created_cnt, errors, total_cnt

    @classmethod
    def run_pipeline_stage_2(cls, action):
        """
        Slack Callback 처리
        """
        print(f">>> User triggered Stage 2: {action}")
        
        if action == "action_transform_partial":
            created_cnt, _ = cls.transform_logs_to_schedule()
            
            cls.send_slack_message("SUCCESS", {
                "collected": "Partial (User Triggered)", 
                "created": created_cnt
            })
            return "변환 작업을 시작했습니다."
            
        elif action == "action_abort":
            return "작업을 중단했습니다."
            
        return "알 수 없는 명령입니다."


# =============================================================================
# [PART 3] Django Management Command
# =============================================================================

class Command(BaseCommand):
    help = 'Executes the Full CGV Pipeline Stage 1 (Collect -> Validate -> Notify)'

    def add_arguments(self, parser):
        parser.add_argument('--date', type=str, help='Target Date (YYYYMMDD)')
        parser.add_argument('--manual', action='store_true', help='Set trigger type to MANUAL')

    def handle(self, *args, **options):
        self.stdout.write("Initializing CGV Pipeline...")
        
        target_date = options.get('date')
        target_dates = [target_date] if target_date else None
        is_manual = options.get('manual', False)
        
        # History Setup
        from crawler.models import CrawlerRunHistory
        from django.utils import timezone
        import traceback
        
        trigger_type = 'MANUAL' if is_manual else 'SCHEDULED'
        
        history = CrawlerRunHistory.objects.create(
            status='RUNNING',
            trigger_type=trigger_type,
            configuration={
                'target_dates': target_dates,
                'manual_flag': is_manual
            }
        )
        print(f"🚀 [History #{history.id}] Created (Trigger: {trigger_type})")

        try:
            collected, created, errors, total_theaters = CGVPipelineService.run_pipeline_stage_1(target_dates=target_dates)
            
            history.status = 'SUCCESS'
            history.finished_at = timezone.now()
            history.result_summary = {
                'collected_logs': collected,
                'total_theaters': total_theaters,
                'created_schedules': created,
                'error_count': len(errors)
            }
            history.save()
            self.stdout.write(self.style.SUCCESS(f"Pipeline finished. Logged to History #{history.id}"))
            
        except Exception as e:
            error_msg = str(e)
            self.stdout.write(self.style.ERROR(f"Pipeline failed: {e}"))
            traceback.print_exc()
            
            history.status = 'FAILED'
            history.finished_at = timezone.now()
            history.error_message = error_msg
            history.save()
