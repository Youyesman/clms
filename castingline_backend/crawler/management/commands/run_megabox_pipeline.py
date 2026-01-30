import os
import time
import json
import requests
import re
from datetime import datetime
from django.conf import settings
from django.db import close_old_connections
from django.core.management.base import BaseCommand
from playwright.sync_api import sync_playwright

# Models Import
from crawler.models import MegaboxScheduleLog, MovieSchedule

# =============================================================================
# [PART 1] RPA Logic (Megabox)
# =============================================================================

from concurrent.futures import ThreadPoolExecutor

# =============================================================================
# [PART 1] RPA Logic (Megabox)
# =============================================================================

def fetch_megabox_schedule_rpa(date_list=None, target_regions=None, stop_signal=None, crawler_run=None, retry_targets=None):
    """
    Playwright를 사용하여 Megabox 페이지에 접속하고, 
    지역 -> 극장 -> [날짜 리스트] 순으로 순회하며 데이터 수집 즉시 DB에 저장합니다.
    (Theater-First Approach)
    
    :param target_regions: List of region names to process (e.g., ["서울", "인천"]). If None, process all.
    :param retry_targets: {Region: {Theater: [Dates]}} - If set, only process specific targets.
    """
    if date_list is None:
        date_list = [datetime.now().strftime("%Y%m%d")]

    if retry_targets:
        print(f"[RetryWorker] 🚀 Starting Retry Run for Megabox...")

    collected_results = []
    failures = [] # 실패 내역
    total_theater_count = 0  
    
    # Thread Safe 설정
    os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Browser Context isolated for each worker
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        target_url = "https://www.megabox.co.kr/booking/timetable"
        worker_id = "Global" if not target_regions else f"Worker({target_regions[0]}...)"
        print(f"[{worker_id}] 🚀 Navigating to: {target_url}")
        
        try:
            # print("   Accessible URL...")
            page.goto(target_url, timeout=60000)
            page.wait_for_load_state("domcontentloaded")
            time.sleep(3) # Initial render wait
            
            # 1. '극장별' 탭 클릭
            theater_tab_sel = "a[href='#masterBrch']" 
            
            try:
                page.wait_for_selector(theater_tab_sel, timeout=10000)
                page.click(theater_tab_sel, force=True)
                time.sleep(2)
            except Exception as e:
                print(f"[{worker_id}] ⚠️ Tab click failed: {e}")
                # page.screenshot(path=f"megabox_tab_error_{worker_id}.png")

            # 2. 지역 순회
            region_list_sel = "#masterBrch .tab-list-choice a"
            
            # Retry loop for region list
            for _ in range(3):
                if page.locator(region_list_sel).count() > 0:
                    break
                time.sleep(2)
                
            region_count = page.locator(region_list_sel).count()
            if region_count == 0:
                 print(f"[{worker_id}] ⚠️ Region list count is 0.")
            
            # print(f"[{worker_id}] 📍 Found {region_count} regions available on page.")
            
            for i in range(region_count):
                try:
                    if stop_signal: stop_signal()
                    # 지역 버튼 클릭
                    region_btn = page.locator(f"{region_list_sel}").nth(i)
                    raw_region_name = region_btn.inner_text().split('\n')[0].strip()
                    # Remove count (e.g. "서울(19)" -> "서울")
                    region_name = re.sub(r'\(\d+\)$', '', raw_region_name).strip()
                    
                    # --- Region Filtering Logic ---
                    if target_regions:
                        if region_name not in target_regions:
                             # print(f"[{worker_id}] Skipping '{region_name}' (Not in target)")
                             continue
                    
                    # [Retry Logic] Region Filtering
                    if retry_targets and region_name not in retry_targets:
                        continue
                    
                    print(f"\n[{worker_id}] Processing Region: {region_name} (Raw: {raw_region_name})")
                    
                    region_btn.scroll_into_view_if_needed()
                    region_btn.click(force=True)
                    time.sleep(1.0) # 리스트 갱신 대기
                    
                    # 3. 극장 순회 - 활성화된 탭의 극장만 선택
                    theater_list_sel = "#masterBrch .tab-layer-cont.on button"
                    
                    # 해당 지역에 극장이 있는지 확인
                    try:
                        page.wait_for_selector(theater_list_sel, timeout=5000)
                    except:
                        print(f"[{worker_id}] ⚠️ No theaters found in {region_name} or timeout.")
                        continue
                    
                    theater_count = page.locator(theater_list_sel).count()
                    total_theater_count += theater_count
                    print(f"[{worker_id}]    Found {theater_count} theaters in {region_name}")
                    
                    for j in range(theater_count):
                        try:
                            if stop_signal: stop_signal()
                            theater_btn = page.locator(theater_list_sel).nth(j)
                            theater_name = theater_btn.inner_text().strip()
                            brch_no = theater_btn.get_attribute("data-brch-no") or "Unknown"

                            # [Retry Logic] Theater Filtering
                            if retry_targets:
                                if theater_name not in retry_targets.get(region_name, {}):
                                    continue
                            
                            print(f"[{worker_id}]       Processing: {theater_name} ({brch_no})")
                            
                            # 1. 극장 선택
                            theater_btn.click(force=True)
                            time.sleep(1)

                            # 2. 날짜 순회 (Theater-First Logic)
                            current_dates = date_list
                            if retry_targets:
                                current_dates = list(retry_targets[region_name].get(theater_name, []))

                            for scn_ymd in current_dates:
                                if stop_signal: stop_signal()
                                
                                # Megabox: .date-list button[date-data='2024.01.29']
                                target_date_fmt = f"{scn_ymd[:4]}.{scn_ymd[4:6]}.{scn_ymd[6:]}" # YYYY.MM.DD
                                
                                try:
                                    # 정확한 속성 기반 찾기
                                    date_btn = page.locator(f"button[date-data='{target_date_fmt}']").first
                                    
                                    if date_btn.count() == 0:
                                        target_day = str(int(scn_ymd[6:]))
                                        date_btn = page.locator(f".date-list button:has-text('{target_day}')").first

                                    if date_btn.count() > 0:
                                        # [USER REQUEST] Chekc for disabled class
                                        # e.g. <button class="disabled" ...>
                                        classes = date_btn.get_attribute("class") or ""
                                        if "disabled" in classes:
                                            print(f"[{worker_id}]       🚫 Date Disabled: {scn_ymd}")
                                            failures.append({
                                                'region': region_name,
                                                'theater': theater_name,
                                                'date': scn_ymd,
                                                'reason': "Date Button Disabled",
                                                'worker': worker_id
                                            })
                                            continue # Skip this date

                                        is_active = "on" in classes
                                        
                                        # 클릭 및 응답 대기
                                        with page.expect_response(lambda response: "schedulePage.do" in response.url, timeout=5000) as response_info:
                                            date_btn.click(force=True)
                                        
                                        response = response_info.value
                                        
                                        if response.status == 200:
                                            try:
                                                json_data = response.json()
                                                close_old_connections()
                                                
                                                log = MegaboxScheduleLog.objects.create(
                                                    query_date=scn_ymd,
                                                    site_code=brch_no,
                                                    theater_name=theater_name,
                                                    response_json=json_data,
                                                    status='success',
                                                    crawler_run=crawler_run
                                                )
                                                # print(f"[{worker_id}]          ✅ Saved: {scn_ymd}")
                                                collected_results.append({"log_id": log.id, "date": scn_ymd})
                                                
                                            except Exception as e:
                                                print(f"[{worker_id}]          ❌ Parse Error {scn_ymd}: {e}")
                                        else:
                                            print(f"[{worker_id}]          ⚠️ Status: {response.status}")
                                            
                                    else:
                                        print(f"[{worker_id}]       ⚠️ Date button not found. Skipping.")
                                        failures.append({
                                            'region': region_name,
                                            'theater': theater_name,
                                            'date': scn_ymd,
                                            'reason': "Date Button Not Found",
                                            'worker': worker_id
                                        })
                                        
                                except Exception as e:
                                    print(f"[{worker_id}]       ⚠️ Date Error {scn_ymd}: {e}")
                                    failures.append({
                                        'region': region_name,
                                        'theater': theater_name,
                                        'date': scn_ymd,
                                        'reason': f"Error: {str(e)[:50]}",
                                        'worker': worker_id
                                    })
                                
                                time.sleep(0.1) 

                        except InterruptedError:
                            raise
                        except Exception as e:
                            print(f"[{worker_id}]       ❌ Theater Error: {e}")
                            continue

                except InterruptedError:
                    raise
                except Exception as e:
                    print(f"[{worker_id}] ❌ Region Error: {e}")
                    continue

        except Exception as e:
            print(f"[{worker_id}] ❌ Playwright Error: {e}")

    print(f"[{worker_id}] Finished. Collected: {len(collected_results)}")
    return collected_results, failures, total_theater_count


# =============================================================================
# [PART 1.5] Megabox Global Pre-scan
# =============================================================================

def scan_megabox_master_list_rpa():
    """
    [Step 0] Global Pre-scan
    수집 시작 전, 전체 극장 리스트를 순회하며 총 개수를 파악합니다.
    """
    print("[Global_PreScan] 🔍 Starting Megabox Master List Scan...")
    total_count = 0
    os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        page = context.new_page()
        
        try:
            page.goto("https://www.megabox.co.kr/booking/timetable", timeout=60000)
            
            # Click Theater Tab
            page.click("a[href='#masterBrch']", force=True)
            page.wait_for_selector("#masterBrch .tab-list-choice a", timeout=10000)
            
            # Region List
            region_items = page.locator("#masterBrch .tab-list-choice a")
            region_count = region_items.count()
            
            print(f"[Global_PreScan] Found {region_count} regions.")
            
            for i in range(region_count):
                region_btn = region_items.nth(i)
                region_btn.scroll_into_view_if_needed()
                region_btn.click(force=True)
                
                # Wait for Theater List to appear in the active tab
                page.wait_for_selector("#masterBrch .tab-layer-cont.on button", timeout=3000)
                
                # Count Theaters
                theater_list = page.locator("#masterBrch .tab-layer-cont.on button")
                cnt = theater_list.count()
                total_count += cnt
                
            print(f"[Global_PreScan] ✅ Megabox Scan Success. Total: {total_count}")
            
        except Exception as e:
            print(f"[Global_PreScan] ❌ Megabox Scan Failed: {e}")
        finally:
            browser.close()
            
    return total_count


# =============================================================================
# [PART 2] Pipeline Service Logic (Megabox)
# =============================================================================

class MegaboxPipelineService:
    @staticmethod
    def collect_schedule_logs(dates=None, stop_signal=None, crawler_run=None):
        os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
        if not dates:
            dates = [datetime.now().strftime("%Y%m%d")]

        # [Step 0] Global Pre-scan (Sync)
        print(f"[Main] 📡 Running Megabox Global Pre-scan...")
        total_detected_cnt = scan_megabox_master_list_rpa()
        
        msg = f"📊 [Pre-scan] 메가박스 전체 극장 마스터 리스트 확인 완료: {total_detected_cnt}개"
        print(msg)
        MegaboxPipelineService.send_slack_message("INFO", {"message": msg})

        # Region Grouping for Parallel Execution
        # 4개의 Worker로 분산 (Balanced Mode)
        # Group 1: 서울
        # Group 2: 경기/인천
        # Group 3: 영남권 (부산/대구/경상)
        # Group 4: 그 외 (충청/호남/강원/제주)
        REGION_GROUPS = [
            ["서울"], 
            ["경기", "인천"],
            ["부산/대구/경상"],
            ["대전/충청/세종", "광주/전라", "강원", "제주"]
        ]

        print(f"--- Pipeline: Collecting for dates {dates} (Parallel Execution with {len(REGION_GROUPS)} Workers) ---")
        
        collected_logs = []
        all_failures = []
        # total_detected_cnt is already set by Pre-scan
        
        with ThreadPoolExecutor(max_workers=len(REGION_GROUPS)) as executor:
            futures = []
            for group_idx, region_group in enumerate(REGION_GROUPS):
                print(f"[Main] Scheduling Worker-{group_idx+1} for regions: {region_group}")
                futures.append(
                    executor.submit(
                        fetch_megabox_schedule_rpa, 
                        date_list=dates, 
                        target_regions=region_group, 
                        stop_signal=stop_signal,
                        crawler_run=crawler_run,
                        retry_targets=None
                    )
                )
            
            # Wait for all futures
            for future in futures:
                try:
                    res_logs, res_failures, res_cnt = future.result()
                    collected_logs.extend(res_logs)
                    all_failures.extend(res_failures)
                    # total_detected_cnt is from Pre-Scan
                except Exception as e:
                    print(f"[Main] ❌ One of the workers failed: {e}")
        
        # [Retry Logic]
        retry_map = {}
        final_failures = []
        
        for f in all_failures:
            reason = f['reason']
            # Exclude permanent failures
            if reason != "Date Button Not Found" and reason != "Date Button Disabled":
                r = f['region']
                t = f['theater']
                d = f['date']
                
                # Handling 'Unknown' or non-date failures logic same as Lotte
                if d == 'Unknown' or d == 'All':
                     # If theater failure, retry all requested dates
                     target_list = dates
                else:
                     target_list = [d]

                if r not in retry_map: retry_map[r] = {}
                if t not in retry_map[r]: retry_map[r][t] = set()
                
                for td in target_list:
                    retry_map[r][t].add(td)
            else:
                final_failures.append(f)
        
        if retry_map:
            retry_count = sum(len(dates) for r in retry_map.values() for dates in r.values())
            print(f"\n[Megabox] 🔄 Found {retry_count} items to retry. Starting Retry Phase...")
            
            try:
                # Single Worker for Retry
                logs_retry, failures_retry, _ = fetch_megabox_schedule_rpa(
                    date_list=dates, # Not used effectively due to retry_targets logic
                    target_regions=None, # Not used due to retry_targets logic
                    stop_signal=stop_signal,
                    crawler_run=crawler_run,
                    retry_targets=retry_map
                )
                
                print(f"[Megabox] ✅ Retry Finished. Recovered: {len(logs_retry)} items.")
                collected_logs.extend(logs_retry)
                final_failures.extend(failures_retry)
                
            except Exception as e:
                print(f"[Megabox] ❌ Retry Failed: {e}")
                for r, theaters in retry_map.items():
                    for t, dates_set in theaters.items():
                         for d in dates_set:
                             final_failures.append({
                                 'region': r, 'theater': t, 'date': d, 
                                 'reason': f"Retry Execution Failed: {str(e)}", 
                                 'worker': "RetryWorker"
                             })
        else:
            print("\n[Megabox] No retryable failures found.")

        return collected_logs, total_detected_cnt, final_failures

    @classmethod
    def check_missing_theaters(cls, logs, total_expected):
        collected_cnt = len(logs)
        # 단순 수집 카운트 비교
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
        if log_ids:
            logs = MegaboxScheduleLog.objects.filter(id__in=log_ids)
        else:
            logs = MegaboxScheduleLog.objects.filter(created_at__date=datetime.now().date())
            
        print(f"   [Transform] Processing {logs.count()} logs...")

        total_created = 0
        all_errors = []
        
        for log in logs:
            try:
                cnt, errors = MovieSchedule.create_from_megabox_log(log, target_titles=target_titles)
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

        if message_type == "INFO":
            text = f"ℹ️ Pipeline: {data['message']}"
            blocks = [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*ℹ️ [Megabox] Status*\n{data['message']}"}
                }
            ]
            
        elif message_type == "SUCCESS":
            # 실패 내역이 있으면 함께 표시
            failures = data.get('failures', [])
            fail_text = ""
            if failures:
                fail_summary = []
                for f in failures[:15]: # 최대 15개까지만
                    reason = f.get('reason', 'Unknown')
                    fail_summary.append(f"• [{f['theater']}] {f['date']}: {reason}")
                
                if len(failures) > 15:
                    fail_summary.append(f"... 외 {len(failures)-15}건")
                
                fail_text = "\n\n⚠️ *수집 실패 극장 리스트:*\n" + "\n".join(fail_summary)

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
            
            # [USER REQUEST] Date-wise breakdown
            # "collected" is now list of dicts {log_id, date} OR just list of logs?
            # In collect_schedule_logs, we extend res_logs which has {log_id, date}
            # So data['collected_list'] should normally be passed, but here data['collected'] usually implies count.
            # We need to change how we pass data to send_slack_message.
            
            # Assuming 'collected_logs' list is passed in data as 'collected_list' OR we used 'collected' as count.
            # Let's adjust run_pipeline to pass the list.
            
            collected_list = data.get('collected_list', [])
            collected_cnt = len(collected_list)
            
            # Aggregate by date
            date_counts = {}
            for item in collected_list:
                d_str = item.get('date', 'Unknown')
                date_counts[d_str] = date_counts.get(d_str, 0) + 1
            
            # Sort dates
            sorted_dates = sorted(date_counts.keys())
            date_breakdown_str = ""
            
            # [USER REQUEST] Multi-line format
            if sorted_dates:
               parts = []
               for d in sorted_dates:
                   try:
                       dt = datetime.strptime(d, "%Y%m%d")
                       d_fmt = f"{dt.month}월 {dt.day}일"
                   except:
                       d_fmt = d
                   parts.append(f"• {d_fmt}: {date_counts[d]}개")
               date_breakdown_str = "\n" + "\n".join(parts)

            # Text Summary
            text = f"📊 [Megabox] 결과: 총 {total_master}개 Master.{date_breakdown_str}\n{missing_msg}{fail_text}"

            blocks = [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*📊 [Megabox] 스케줄링 결과*"}
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
                    "text": {"type": "mrkdwn", "text": fail_text}
                })
            
        elif message_type == "WARNING_MISSING":
            text = f"⚠️ 메가박스 스케줄 수집 누락 경고! ({data['collected_cnt']}/{data['total_cnt']})"
            blocks = [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*⚠️ 메가박스 스케줄 수집 누락 경고!*"}
                }
            ]
            
        elif message_type == "ERROR":
            error_count = len(data.get('errors', []))
            text = f"❌ 메가박스 파싱 에러 발생! ({error_count}건)"
            
            error_summary = "\n".join([
                f"• {err['theater']} - {err['movie']}: {err['error'][:50]}"
                for err in data.get('errors', [])[:5]
            ])
            
            blocks = [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*❌ 메가박스 데이터 파싱 에러 발생!*"}
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
    def run_pipeline(cls, target_dates=None, crawler_run=None):
        print(">>> Starting Megabox Pipeline")
        cls.send_slack_message("INFO", {"message": f"🚀 메가박스 스케줄 수집 시작 (RunID: {crawler_run.id if crawler_run else 'None'})"})
        
        logs, total_cnt, collection_failures = cls.collect_schedule_logs(dates=target_dates, crawler_run=crawler_run)
        log_ids = [l['log_id'] for l in logs if isinstance(l, dict) and 'log_id' in l]
        
        fail_msg = f"\n⚠️ 수집 실패: {len(collection_failures)}건" if collection_failures else ""
        cls.send_slack_message("INFO", {"message": f"📊 데이터 수집 완료.\n- 수집된 로그: {len(logs)}개\n- 발견된 극장: {total_cnt}개{fail_msg}\n검증을 수행합니다."})
        
        # Validation Logic needs to be smarter for multi-date, but keeping basic for now
        check_result = cls.check_missing_theaters(logs, total_cnt)
        if check_result['is_missing']:
            # cls.send_slack_message("WARNING_MISSING", check_result)
            pass 
        
        # [USER REQUEST] 데이터 생성 잠시 중단
        created_cnt = 0
        errors = []
        # created_cnt, errors = cls.transform_logs_to_schedule(log_ids, target_titles=None)
        
        # Send error report if any
        if errors:
            cls.send_slack_message("ERROR", {"errors": errors})
        
        cls.send_slack_message("SUCCESS", {
            "collected": len(logs), 
            "collected_list": logs, # Pass full list for date breakdown
            "created": created_cnt,
            "failures": collection_failures,
            "missing_info": check_result,
            "total_master": total_cnt
        })
        
        # [NEW] Status Update for History
        if crawler_run:
            crawler_run.status = 'SUCCESS'
            crawler_run.finished_at = datetime.now()
            crawler_run.result_summary = {
                'collected_logs': len(logs),
                'failures': len(collection_failures)
            }
            crawler_run.save()


# =============================================================================
# [PART 3] Django Management Command
# =============================================================================

class Command(BaseCommand):
    help = 'Executes the Megabox Pipeline (Collect -> Validate -> Notify)'

    def add_arguments(self, parser):
        parser.add_argument('--date', type=str, help='Single Target Date (YYYYMMDD)')
        parser.add_argument('--start-date', type=str, help='Start Date (YYYYMMDD)')
        parser.add_argument('--end-date', type=str, help='End Date (YYYYMMDD)')

    def handle(self, *args, **options):
        self.stdout.write("Initializing Megabox Pipeline...")
        
        target_dates = []
        if options.get('date'):
            target_dates = [options.get('date')]
        elif options.get('start_date') and options.get('end_date'):
            start = datetime.strptime(options['start_date'], "%Y%m%d")
            end = datetime.strptime(options['end_date'], "%Y%m%d")
            delta = end - start
            for i in range(delta.days + 1):
                day = start + timedelta(days=i)
                target_dates.append(day.strftime("%Y%m%d"))
        else:
             target_dates = [datetime.now().strftime("%Y%m%d")]

        from datetime import timedelta # Need import
        
        # History Creation
        from crawler.models import CrawlerRunHistory
        from django.utils import timezone
        
        try:
            history = CrawlerRunHistory.objects.create(
                status='RUNNING',
                trigger_type='MANUAL',
                configuration={'target_dates': target_dates, 'brand': 'MEGABOX'}
            )
            print(f"🚀 [Megabox] CrawlerRun #{history.id} Created")

            try:
                MegaboxPipelineService.run_pipeline(target_dates=target_dates, crawler_run=history)
                self.stdout.write(self.style.SUCCESS("Pipeline execution finished."))
            except Exception as e:
                history.status = 'FAILED'
                history.error_message = str(e)
                history.finished_at = timezone.now()
                history.save()
                self.stdout.write(self.style.ERROR(f"Pipeline failed: {e}"))
                import traceback
                traceback.print_exc()
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Pipeline Initialization failed: {e}"))
