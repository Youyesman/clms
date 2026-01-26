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
from movie.models import CGVScheduleLog, MovieSchedule

# =============================================================================
# [PART 1] RPA Logic (Formerly cgv_rpa.py)
# =============================================================================

def fetch_cgv_schedule_rpa(co_cd="A420", site_no=None, scn_ymd="20260127"):
    """
    Playwright를 사용하여 CGV 페이지에 접속하고, 
    모든 지역 및 극장을 순회하며 데이터 수집 즉시 DB에 저장합니다.
    """
    collected_results = []
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
        print(f"🚀 Navigating to: {target_url}")
        
        try:
            page.goto(target_url, timeout=30000)
            print("⏳ Waiting for page load...")
            
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
                    print(f"⚠️ Failed to open modal: {e}")

            # 초기 모달 대기
            ensure_modal_open()
            
            # 지역 개수 파악
            modal_selector = ".cgv-bot-modal.active"
            region_items_selector = f"{modal_selector} .bottom_region__2bZCS > ul > li"
            region_count = page.locator(region_items_selector).count()
            print(f"📍 Found {region_count} regions.")
            
            for i in range(region_count):
                try:
                    ensure_modal_open()
                    
                    # 지역 버튼 클릭
                    region_btn = page.locator(f"{region_items_selector}:nth-child({i+1}) > button")
                    region_name = region_btn.inner_text().split('(')[0].strip()
                    print(f"\n[{i+1}/{region_count}] Region: {region_name}")
                    
                    region_btn.scroll_into_view_if_needed()
                    region_btn.click(force=True)
                    
                    # 극장 리스트 갱신 대기
                    theater_container_selector = f"{modal_selector} .bottom_tabRight__xVGPl .bottom_listCon__8g46z > ul"
                    page.wait_for_selector(theater_container_selector, state="visible", timeout=3000)
                    
                    # 극장 개수 파악
                    theater_items_selector = f"{theater_container_selector} > li"
                    current_region_cnt = page.locator(theater_items_selector).count()
                    total_theater_count += current_region_cnt # 누적
                    print(f"   ↳ Found {current_region_cnt} theaters (Total: {total_theater_count})")
                    
                    for j in range(current_region_cnt):
                        try:
                            ensure_modal_open()
                            
                            # 지역 다시 선택 (초기화 방지)
                            page.locator(f"{region_items_selector}:nth-child({i+1}) > button").click(force=True)
                            
                            # j번째 극장 클릭
                            theater_btn = page.locator(f"{theater_items_selector}:nth-child({j+1}) > button")
                            theater_name = theater_btn.inner_text().strip()
                            
                            # siteNo 추출
                            onclick_val = theater_btn.get_attribute("onclick") or ""
                            current_site_no = "Unknown"
                            import re
                            match = re.search(r"getTheaterSchedule\('([^']+)'", onclick_val)
                            if match:
                                current_site_no = match.group(1)
                            
                            print(f"      [{j+1}/{current_region_cnt}] Processing: {theater_name}")
                            
                            theater_btn.scroll_into_view_if_needed()
                            
                            # API 응답 대기 및 클릭
                            try:
                                with page.expect_response(lambda response: "searchMovScnInfo" in response.url, timeout=3000) as response_info:
                                    theater_btn.click(force=True)
                                
                                response = response_info.value
                                if response.status == 200:
                                    body_text = response.text()
                                    try:
                                        json_data = json.loads(body_text)
                                        
                                        # DB 저장
                                        close_old_connections()
                                        
                                        site_code_res = current_site_no
                                        if json_data.get("data") and len(json_data["data"]) > 0:
                                            site_code_res = json_data["data"][0].get("siteNo", current_site_no)
                                            
                                        log = CGVScheduleLog.objects.create(
                                            query_date=scn_ymd,
                                            site_code=site_code_res,
                                            theater_name=theater_name, 
                                            response_json=json_data,
                                            status='success'
                                        )
                                        print(f"      ✅ Saved: {site_code_res} (Log ID: {log.id})")
                                        collected_results.append({"log_id": log.id})
                                    except:
                                        print(f"      ❌ JSON Error")
                                else:
                                    print(f"      ⚠️ Status: {response.status}")
                                    
                            except Exception as e:
                                 print(f"      ⚠️ API Missing: {e}")

                            time.sleep(0.1) # 부하 조절
                            
                        except Exception as e:
                            print(f"      ❌ Theater Error: {e}")
                            continue

                except Exception as e:
                    print(f"❌ Region Error: {e}")
                    continue

        except Exception as e:
            print(f"❌ Playwright Error: {e}")
            
        finally:
            if 'browser' in locals():
                browser.close()

    print(f"   [Completion] Total Collected Logs: {len(collected_results)} / {total_theater_count}")
    return collected_results, total_theater_count


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

    @staticmethod
    def collect_schedule_logs(dates=None):
        """
        [1단계] RPA를 통해 전국 극장 순회 및 로그 저장
        Returns: (collected_logs, total_detected_cnt)
        """
        # Thread Safe
        os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
        
        if not dates:
            dates = [datetime.now().strftime("%Y%m%d")]

        collected_logs = []
        total_detected_cnt = 0
        
        for date_str in dates:
            print(f"--- Pipeline: Collecting for {date_str} ---")
            # Call the internal function
            results, count = fetch_cgv_schedule_rpa(scn_ymd=date_str) 
            collected_logs.extend(results)
            total_detected_cnt = count
            
        return collected_logs, total_detected_cnt

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
    def transform_logs_to_schedule(log_ids=None):
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
                cnt, errors = MovieSchedule.create_from_cgv_log(log)
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
            text = f"✅ CGV 스케줄 파이프라인 성공! (수집: {data['collected']}, 생성: {data['created']})"
            blocks = [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*✅ CGV 스케줄 파이프라인 성공!*"}
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*수집된 로그:*\n{data['collected']}개"},
                        {"type": "mrkdwn", "text": f"*생성된 스케줄:*\n{data['created']}개"}
                    ]
                }
            ]
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
    def run_pipeline_stage_1(cls):
        """
        메인 파이프라인 실행
        """
        print(">>> Starting Pipeline Stage 1")
        cls.send_slack_message("INFO", {"message": "🚀 CGV 스케줄 데이터 수집을 시작합니다..."})
        
        # 1. Collect
        logs, total_cnt = cls.collect_schedule_logs()
        log_ids = [l['log_id'] for l in logs if isinstance(l, dict) and 'log_id' in l]
        
        cls.send_slack_message("INFO", {"message": f"📊 데이터 수집 완료.\n- 수집된 로그: {len(logs)}개\n- 발견된 극장: {total_cnt}개\n검증을 수행합니다."})
        
        # 2. Validate
        check_result = cls.check_missing_theaters(logs, total_cnt)
        
        if check_result['is_missing']:
            print(">>> Missing theaters found. Sending Slack alert...")
            cls.send_slack_message("WARNING_MISSING", check_result)
        else:
            print(">>> Validation OK. Proceeding to transform...")
            created_cnt, errors = cls.transform_logs_to_schedule(log_ids)
            
            # Send error report if any
            if errors:
                cls.send_slack_message("ERROR", {"errors": errors})
            
            cls.send_slack_message("SUCCESS", {
                "collected": len(logs),
                "created": created_cnt
            })

    @classmethod
    def run_pipeline_stage_2(cls, action):
        """
        Slack Callback 처리
        """
        print(f">>> User triggered Stage 2: {action}")
        
        if action == "action_transform_partial":
            created_cnt = cls.transform_logs_to_schedule()
            
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

    def handle(self, *args, **options):
        self.stdout.write("Initializing CGV Pipeline...")
        try:
            CGVPipelineService.run_pipeline_stage_1()
            self.stdout.write(self.style.SUCCESS("Pipeline execution finished."))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Pipeline failed: {e}"))
