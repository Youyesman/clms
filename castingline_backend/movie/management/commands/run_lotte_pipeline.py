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
from movie.models import LotteScheduleLog, MovieSchedule

# =============================================================================
# [PART 1] RPA Logic (Lotte Cinema)
# =============================================================================

def fetch_lotte_schedule_rpa(scn_ymd="20260127"):
    """
    Playwright를 사용하여 롯데시네마 페이지에 접속하고, 
    모든 지역 및 극장을 순회하며 데이터 수집 즉시 DB에 저장합니다.
    """
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

        target_url = "https://www.lottecinema.co.kr/NLCHS/Ticketing/Schedule"
        print(f"🚀 Navigating to: {target_url}")
        
        try:
            print("   Accessing Lotte Cinema URL...")
            page.goto(target_url, timeout=60000)
            page.wait_for_load_state("domcontentloaded")
            time.sleep(3)  # Initial render wait
            
            # TODO: 롯데시네마 사이트 구조 분석 후 실제 선택자 수정 필요
            # 1. 극장 선택 탭/버튼 찾기
            theater_tab_sel = "a[href*='theater']"  # 실제 선택자로 교체 필요
            
            try:
                # 극장 선택 UI가 있다면 클릭
                if page.locator(theater_tab_sel).count() > 0:
                    page.click(theater_tab_sel, force=True)
                    time.sleep(2)
            except Exception as e:
                print(f"   ℹ️ Theater tab not found or not needed: {e}")

            # 2. 지역 목록 찾기
            # 롯데시네마는 보통 시/도 선택 -> 극장 선택 구조
            region_list_sel = ".theater_list .region_item"  # 실제 선택자로 교체 필요
            
            # 재시도 로직
            for _ in range(3):
                if page.locator(region_list_sel).count() > 0:
                    break
                time.sleep(2)
                
            region_count = page.locator(region_list_sel).count()
            
            if region_count == 0:
                print("⚠️ Region list not found. Saving screenshot.")
                page.screenshot(path="lotte_region_error.png")
                # 대안: 전체 극장 리스트가 바로 보이는 경우
                theater_list_sel = ".theater_list button"
                theater_count = page.locator(theater_list_sel).count()
                
                if theater_count > 0:
                    print(f"📍 Found {theater_count} theaters (no region grouping)")
                    total_theater_count = theater_count
                    
                    # 극장 직접 순회
                    for j in range(theater_count):
                        try:
                            theater_btn = page.locator(theater_list_sel).nth(j)
                            theater_name = theater_btn.inner_text().strip()
                            theater_code = theater_btn.get_attribute("data-theater-id") or \
                                         theater_btn.get_attribute("data-cinema-id") or \
                                         theater_btn.get_attribute("value") or "Unknown"
                            
                            print(f"   [{j+1}/{theater_count}] Processing: {theater_name} ({theater_code})")
                            
                            # API Intercept
                            try:
                                # 롯데시네마 API 엔드포인트 예측 (실제 확인 필요)
                                api_pattern = ["Schedule", "GetPlaySchedule", "Cinema", "Ticketing"]
                                
                                with page.expect_response(
                                    lambda response: any(pattern in response.url for pattern in api_pattern),
                                    timeout=5000
                                ) as response_info:
                                    theater_btn.click(force=True)
                                
                                response = response_info.value
                                
                                if response.status == 200:
                                    try:
                                        json_data = response.json()
                                        
                                        # DB 저장
                                        close_old_connections()
                                        
                                        log = LotteScheduleLog.objects.create(
                                            query_date=scn_ymd,
                                            site_code=theater_code,
                                            theater_name=theater_name,
                                            response_json=json_data,
                                            status='success'
                                        )
                                        print(f"      ✅ Saved: {theater_code} (Log ID: {log.id})")
                                        collected_results.append({"log_id": log.id})
                                        
                                    except Exception as e:
                                        print(f"      ❌ Parse Error: {e}")
                                else:
                                    print(f"      ⚠️ Status: {response.status}")
                                    
                            except Exception as e:
                                print(f"      ⚠️ API Timeout/Missing: {e}")

                            time.sleep(0.2)

                        except Exception as e:
                            print(f"      ❌ Theater Error: {e}")
                            continue
                            
            else:
                # 지역별 그룹이 있는 경우
                print(f"📍 Found {region_count} regions.")
                
                for i in range(region_count):
                    try:
                        # 지역 버튼 클릭
                        region_btn = page.locator(region_list_sel).nth(i)
                        region_name = region_btn.inner_text().strip()
                        print(f"\n[{i+1}/{region_count}] Region: {region_name}")
                        
                        region_btn.scroll_into_view_if_needed()
                        region_btn.click(force=True)
                        time.sleep(1.0)
                        
                        # 3. 극장 목록 찾기 (활성화된 지역의 극장만)
                        theater_list_sel = ".theater_list.active button"  # 실제 선택자로 교체 필요
                        
                        try:
                            page.wait_for_selector(theater_list_sel, timeout=5000)
                        except:
                            print(f"   ⚠️ No theaters found in {region_name}")
                            continue
                        
                        theater_count = page.locator(theater_list_sel).count()
                        total_theater_count += theater_count
                        print(f"   ↳ Found {theater_count} theaters (Total: {total_theater_count})")
                        
                        for j in range(theater_count):
                            try:
                                theater_btn = page.locator(theater_list_sel).nth(j)
                                theater_name = theater_btn.inner_text().strip()
                                
                                # 극장 코드 추출 (data-* 속성 확인)
                                theater_code = theater_btn.get_attribute("data-theater-id") or \
                                             theater_btn.get_attribute("data-cinema-id") or \
                                             theater_btn.get_attribute("value") or "Unknown"
                                
                                print(f"      [{j+1}/{theater_count}] Processing: {theater_name} ({theater_code})")
                                
                                # API Intercept
                                try:
                                    # 롯데시네마 API 엔드포인트 예측 (실제 확인 필요)
                                    api_pattern = ["Schedule", "GetPlaySchedule", "Cinema", "Ticketing"]
                                    
                                    with page.expect_response(
                                        lambda response: any(pattern in response.url for pattern in api_pattern),
                                        timeout=5000
                                    ) as response_info:
                                        theater_btn.click(force=True)
                                    
                                    response = response_info.value
                                    
                                    if response.status == 200:
                                        try:
                                            json_data = response.json()
                                            
                                            # DB 저장
                                            close_old_connections()
                                            
                                            log = LotteScheduleLog.objects.create(
                                                query_date=scn_ymd,
                                                site_code=theater_code,
                                                theater_name=theater_name,
                                                response_json=json_data,
                                                status='success'
                                            )
                                            print(f"      ✅ Saved: {theater_code} (Log ID: {log.id})")
                                            collected_results.append({"log_id": log.id})
                                            
                                        except Exception as e:
                                            print(f"      ❌ Parse Error: {e}")
                                    else:
                                        print(f"      ⚠️ Status: {response.status}")
                                        
                                except Exception as e:
                                    print(f"      ⚠️ API Timeout/Missing: {e}")

                                time.sleep(0.2)

                            except Exception as e:
                                print(f"      ❌ Theater Error: {e}")
                                continue

                    except Exception as e:
                        print(f"❌ Region Error: {e}")
                        continue

        except Exception as e:
            print(f"❌ Playwright Error: {e}")
            page.screenshot(path="lotte_fatal_error.png")

    print(f"   [Completion] Total Collected Logs: {len(collected_results)} / {total_theater_count}")
    return collected_results, total_theater_count


# =============================================================================
# [PART 2] Pipeline Service Logic (Lotte Cinema)
# =============================================================================

class LottePipelineService:
    @staticmethod
    def collect_schedule_logs(dates=None):
        os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
        if not dates:
            dates = [datetime.now().strftime("%Y%m%d")]

        collected_logs = []
        total_detected_cnt = 0
        
        for date_str in dates:
            print(f"--- Pipeline: Collecting for {date_str} ---")
            results, count = fetch_lotte_schedule_rpa(scn_ymd=date_str) 
            collected_logs.extend(results)
            total_detected_cnt = count
            
        return collected_logs, total_detected_cnt

    @classmethod
    def check_missing_theaters(cls, logs, total_expected):
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
    def transform_logs_to_schedule(log_ids=None):
        if log_ids:
            logs = LotteScheduleLog.objects.filter(id__in=log_ids)
        else:
            logs = LotteScheduleLog.objects.filter(created_at__date=datetime.now().date())
            
        print(f"   [Transform] Processing {logs.count()} logs...")

        total_created = 0
        all_errors = []
        
        for log in logs:
            try:
                cnt, errors = MovieSchedule.create_from_lotte_log(log)
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
                    "text": {"type": "mrkdwn", "text": f"*ℹ️ [Lotte] Status*\n{data['message']}"}
                }
            ]
            
        elif message_type == "SUCCESS":
            text = f"✅ 롯데시네마 스케줄 파이프라인 성공! (수집: {data['collected']}, 생성: {data['created']})"
            blocks = [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*✅ 롯데시네마 스케줄 파이프라인 성공!*"}
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
            text = f"⚠️ 롯데시네마 스케줄 수집 누락 경고! ({data['collected_cnt']}/{data['total_cnt']})"
            blocks = [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*⚠️ 롯데시네마 스케줄 수집 누락 경고!*"}
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*총 극장 수:*\n{data['total_cnt']}개"},
                        {"type": "mrkdwn", "text": f"*수집된 극장 수:*\n{data['collected_cnt']}개"},
                        {"type": "mrkdwn", "text": f"*누락된 극장 수:*\n{data['missing_cnt']}개"}
                    ]
                }
            ]
            
        elif message_type == "ERROR":
            error_count = len(data.get('errors', []))
            text = f"❌ 롯데시네마 파싱 에러 발생! ({error_count}건)"
            
            error_summary = "\n".join([
                f"• {err['theater']} - {err['movie']}: {err['error'][:50]}"
                for err in data.get('errors', [])[:5]
            ])
            
            blocks = [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*❌ 롯데시네마 데이터 파싱 에러 발생!*"}
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
    def run_pipeline(cls):
        print(">>> Starting Lotte Cinema Pipeline")
        cls.send_slack_message("INFO", {"message": "🚀 롯데시네마 스케줄 수집 시작"})
        
        logs, total_cnt = cls.collect_schedule_logs()
        log_ids = [l['log_id'] for l in logs if isinstance(l, dict) and 'log_id' in l]
        
        cls.send_slack_message("INFO", {"message": f"📊 데이터 수집 완료.\n- 수집된 로그: {len(logs)}개\n- 발견된 극장: {total_cnt}개\n검증을 수행합니다."})
        
        check_result = cls.check_missing_theaters(logs, total_cnt)
        if check_result['is_missing']:
            cls.send_slack_message("WARNING_MISSING", check_result)
        
        created_cnt, errors = cls.transform_logs_to_schedule(log_ids)
        
        # Send error report if any
        if errors:
            cls.send_slack_message("ERROR", {"errors": errors})
        
        cls.send_slack_message("SUCCESS", {"collected": len(logs), "created": created_cnt})


# =============================================================================
# [PART 3] Django Management Command
# =============================================================================

class Command(BaseCommand):
    help = 'Executes the Lotte Cinema Pipeline (Collect -> Validate -> Notify)'

    def handle(self, *args, **options):
        self.stdout.write("Initializing Lotte Cinema Pipeline...")
        try:
            LottePipelineService.run_pipeline()
            self.stdout.write(self.style.SUCCESS("Pipeline execution finished."))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Pipeline failed: {e}"))
