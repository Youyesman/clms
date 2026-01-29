from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.views import View
import json
from crawler.management.commands.run_cgv_pipeline import CGVPipelineService

@method_decorator(csrf_exempt, name='dispatch')
class SlackInteractiveView(View):
    """
    Slack Interactivity (버튼 클릭 등) 처리를 위한 View
    """
    def post(self, request, *args, **kwargs):
        payload = request.POST.get('payload')
        if not payload:
            return HttpResponse("Invalid Request", status=400)
            
        try:
            data = json.loads(payload)
            # actions 배열의 첫 번째 값 확인
            actions = data.get('actions', [])
            if not actions:
                return HttpResponse("No Actions", status=200)

            action_value = actions[0].get('value')
            
            # 서비스 호출 (Stage 2)
            result_msg = CGVPipelineService.run_pipeline_stage_2(action_value)
            
            # Slack에게 보낼 응답 (메시지 업데이트 등)
            # 여기서는 단순 텍스트 응답 (Ephemeral message로 뜰 수 있음)
            return HttpResponse(status=200)
            
        except Exception as e:
            print(f"Slack Handler Error: {e}")
            return HttpResponse(status=500)
