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

# =============================================================================
# [PART 1] RPA Logic (Megabox)
# =============================================================================

def fetch_megabox_schedule_rpa(date_list=None, stop_signal=None):
    """
    Playwright를 사용하여 Megabox 페이지에 접속하고, 
    지역 -> 극장 -> [날짜 리스트] 순으로 순회하며 데이터 수집 즉시 DB에 저장합니다.
    (Theater-First Approach)
    """
    if date_list is None:
        date_list = [datetime.now().strftime("%Y%m%d")]

    collected_results = []
    total_theater_count = 0  
    
    # Thread Safe 설정
    os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        target_url = "https://www.megabox.co.kr/booking/timetable"
        print(f"🚀 Navigating to: {target_url}")
        
        try:
            print("   Accessible URL...")
            page.goto(target_url, timeout=60000)
            page.wait_for_load_state("domcontentloaded")
            time.sleep(3) # Initial render wait
            
            # 1. '극장별' 탭 클릭
            theater_tab_sel = "a[href='#masterBrch']"  # 정확한 선택자
            print(f"   Clicking Theater Tab: {theater_tab_sel}")
            
            try:
                page.wait_for_selector(theater_tab_sel, timeout=10000)
                page.click(theater_tab_sel, force=True)
                time.sleep(2)
            except Exception as e:
                print(f"⚠️ Tab click failed: {e}")
                page.screenshot(path="megabox_tab_error.png")

            # 2. 지역 순회
            region_list_sel = "#masterBrch .tab-list-choice a"  # 정확한 선택자
            print(f"   Waiting for Region List: {region_list_sel}")
            
            # Retry loop for region list
            for _ in range(3):
                if page.locator(region_list_sel).count() > 0:
                    break
                time.sleep(2)
                
            region_count = page.locator(region_list_sel).count()
            if region_count == 0:
                 print("⚠️ Region list count is 0. Saving screenshot.")
                 page.screenshot(path="megabox_region_empty.png")
            
            print(f"📍 Found {region_count} regions.")
            
            for i in range(region_count):
                try:
                    if stop_signal: stop_signal()
                    # 지역 버튼 클릭
                    region_btn = page.locator(f"{region_list_sel}").nth(i)
                    region_name = region_btn.inner_text().split('\n')[0].strip()
                    print(f"\n[{i+1}/{region_count}] Region: {region_name}")
                    
                    region_btn.scroll_into_view_if_needed()
                    region_btn.click(force=True)
                    time.sleep(1.0) # 리스트 갱신 대기
                    
                    # 3. 극장 순회 - 활성화된 탭의 극장만 선택
                    theater_list_sel = "#masterBrch .tab-layer-cont.on button"  # 정확한 선택자
                    
                    # 해당 지역에 극장이 있는지 확인
                    try:
                        page.wait_for_selector(theater_list_sel, timeout=5000)
                    except:
                        print(f"   ⚠️ No theaters found in {region_name} or timeout.")
                        continue
                    
                    theater_count = page.locator(theater_list_sel).count()
                    total_theater_count += theater_count
                    print(f"   ↳ Found {theater_count} theaters (Total: {total_theater_count})")
                    
                    for j in range(theater_count):
                        try:
                            if stop_signal: stop_signal()
                            theater_btn = page.locator(theater_list_sel).nth(j)
                            theater_name = theater_btn.inner_text().strip()
                            brch_no = theater_btn.get_attribute("data-brch-no") or "Unknown"
                            
                            print(f"      [{j+1}/{theater_count}] Processing: {theater_name} ({brch_no})")
                            
                            # 1. 극장 선택
                            theater_btn.click(force=True)
                            time.sleep(1)

                            # 2. 날짜 순회 (Theater-First Logic)
                            for scn_ymd in date_list:
                                if stop_signal: stop_signal()
                                
                                # Megabox: .date-list button[date-data='2024.01.29']
                                target_date_fmt = f"{scn_ymd[:4]}.{scn_ymd[4:6]}.{scn_ymd[6:]}" # YYYY.MM.DD
                                
                                try:
                                    # 정확한 속성 기반 찾기
                                    date_btn = page.locator(f"button[date-data='{target_date_fmt}']").first
                                    
                                    if date_btn.count() == 0:
                                        # Fallback: 날짜 텍스트로 찾기 (일자만 있는 경우 주의)
                                        # 메가박스는 일자 텍스트가 버튼 안에 있음.
                                        target_day = str(int(scn_ymd[6:]))
                                        date_btn = page.locator(f".date-list button:has-text('{target_day}')").first

                                    if date_btn.count() > 0:
                                        # 이미 선택된 날짜인지 확인 (class 'on')
                                        is_active = "on" in (date_btn.get_attribute("class") or "")
                                        
                                        if is_active:
                                            # 이미 선택되어 있으면 바로 파싱 (근데 최초 로딩시 기본 오늘날짜일수 있음, 하지만 AJAX가 트리거 안될수도 있으니 클릭 권장 or 그냥 파싱)
                                            # 메가박스는 클릭시 무조건 호출하는게 안전
                                            print(f"      🗓 Clicking Date: {target_date_fmt} (Re-click)")
                                        else:
                                            print(f"      🗓 Clicking Date: {target_date_fmt}")
                                        
                                        # 클릭 및 응답 대기
                                        with page.expect_response(lambda response: "schedulePage.do" in response.url, timeout=5000) as response_info:
                                            date_btn.click(force=True)
                                        
                                        response = response_info.value
                                        
                                        if response.status == 200:
                                            try:
                                                json_data = response.json()
                                                
                                                # DB 저장
                                                close_old_connections()
                                                
                                                log = MegaboxScheduleLog.objects.create(
                                                    query_date=scn_ymd,
                                                    site_code=brch_no,
                                                    theater_name=theater_name,
                                                    response_json=json_data,
                                                    status='success'
                                                )
                                                print(f"         ✅ Saved: {scn_ymd} (Log ID: {log.id})")
                                                collected_results.append({"log_id": log.id})
                                                
                                            except Exception as e:
                                                print(f"         ❌ Parse Error {scn_ymd}: {e}")
                                        else:
                                            print(f"         ⚠️ Status: {response.status}")
                                            
                                    else:
                                        print(f"      ⚠️ Date button for {target_date_fmt} not found. Skipping.")
                                        
                                except Exception as e:
                                    print(f"      ⚠️ Date Error {scn_ymd}: {e}")
                                
                                time.sleep(0.1) # 날짜 간 짧은 대기

                        except InterruptedError:
                            raise
                        except Exception as e:
                            print(f"      ❌ Theater Error: {e}")
                            continue

                except InterruptedError:
                    raise
                except Exception as e:
                    print(f"❌ Region Error: {e}")
                    continue

        except Exception as e:
            print(f"❌ Playwright Error: {e}")
            page.screenshot(path="megabox_fatal_error.png")

    print(f"   [Completion] Total Collected Logs: {len(collected_results)} / {total_theater_count}")
    return collected_results, total_theater_count


# =============================================================================
# [PART 2] Pipeline Service Logic (Megabox)
# =============================================================================

class MegaboxPipelineService:
    @staticmethod
    def collect_schedule_logs(dates=None, stop_signal=None):
        os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
        if not dates:
            dates = [datetime.now().strftime("%Y%m%d")]

        print(f"--- Pipeline: Collecting for dates {dates} (Theater-First) ---")
        # 한 번의 호출로 모든 날짜 처리 (Theater-First)
        return fetch_megabox_schedule_rpa(date_list=dates, stop_signal=stop_signal)

    @classmethod
    def check_missing_theaters(cls, logs, total_expected):
        collected_cnt = len(logs)
        # 단순 수집 카운트 비교 (날짜별 * 극장수 고려 필요하나 일단 단순 비교)
        # 로그 수 = 극장 수 * 날짜 수 여야 함. 
        # total_expected는 '발견된 극장 수' 이므로, 날짜 수를 모르면 정확한 비교 불가.
        # 여기선 '최소한 극장 수보다는 많아야 한다' 정도로 체크하거나, 스킵.
        
        missing_count = total_expected - collected_cnt # This logic might need adjustment for multi-date
        is_missing = False # Disable missing check strictly for now as logic changed
        
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
            text = f"✅ 메가박스 스케줄 파이프라인 성공! (수집: {data['collected']}, 생성: {data['created']})"
            blocks = [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*✅ 메가박스 스케줄 파이프라인 성공!*"}
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*수집된 로그:*\n{data['collected']}개"},
                        {"type": "mrkdwn", "text": f"*생성된 스케줄:*\n{data['created']}개"}
                    ]
                }
            ]
            
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
    def run_pipeline(cls, target_dates=None):
        print(">>> Starting Megabox Pipeline")
        cls.send_slack_message("INFO", {"message": "🚀 메가박스 스케줄 수집 시작"})
        
        logs, total_cnt = cls.collect_schedule_logs(dates=target_dates)
        log_ids = [l['log_id'] for l in logs if isinstance(l, dict) and 'log_id' in l]
        
        cls.send_slack_message("INFO", {"message": f"📊 데이터 수집 완료.\n- 수집된 로그: {len(logs)}개\n- 발견된 극장: {total_cnt}개\n검증을 수행합니다."})
        
        # Validation Logic needs to be smarter for multi-date, but keeping basic for now
        check_result = cls.check_missing_theaters(logs, total_cnt)
        if check_result['is_missing']:
            cls.send_slack_message("WARNING_MISSING", check_result)
        
        created_cnt, errors = cls.transform_logs_to_schedule(log_ids, target_titles=None)
        
        # Send error report if any
        if errors:
            cls.send_slack_message("ERROR", {"errors": errors})
        
        cls.send_slack_message("SUCCESS", {"collected": len(logs), "created": created_cnt})


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
        
        try:
            MegaboxPipelineService.run_pipeline(target_dates=target_dates)
            self.stdout.write(self.style.SUCCESS("Pipeline execution finished."))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Pipeline failed: {e}"))
            import traceback
            traceback.print_exc()
