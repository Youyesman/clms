import logging
import requests
import traceback
from django.conf import settings

class SlackExceptionHandler(logging.Handler):
    def emit(self, record):
        try:
            # 로그 포맷팅
            log_entry = self.format(record)
            
            # Traceback 정보가 있으면 포맷팅
            trace_info = ""
            if record.exc_info:
                trace_info = ''.join(traceback.format_exception(*record.exc_info))
            elif record.exc_text:
                trace_info = record.exc_text
            
            # 메시지 구성
            if trace_info:
                # 슬랙 메시지 길이 제한 고려하여 뒤에서부터 2500자 정도만 전송
                short_trace = trace_info[-2500:] 
                text = (
                    f"🚨 *[Server Error 500]* 🚨\n"
                    f"*Message:* {record.getMessage()}\n"
                    f"*Path:* `{record.pathname}:{record.lineno}`\n"
                    f"```\n{short_trace}\n```"
                )
            else:
                text = (
                    f"🚨 *[Server Error 500]* 🚨\n"
                    f"*Message:* {record.getMessage()}\n"
                    f"*Path:* `{record.pathname}:{record.lineno}`"
                )

            token = getattr(settings, 'SLACK_BOT_TOKEN', '')
            channel = getattr(settings, 'SLACK_CHANNEL_ID', '')

            if not token or not channel:
                return

            url = "https://slack.com/api/chat.postMessage"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            payload = {
                "channel": channel,
                "text": text
            }
            # 타임아웃 2초로 짧게 설정하여 메인 로직 지연 최소화
            requests.post(url, headers=headers, json=payload, timeout=2)

        except Exception:
            # 로깅 중 에러는 시스템에 영향을 주지 않도록 무시
            pass
