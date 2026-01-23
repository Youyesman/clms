from .models import DailyFund, Client
from rest_framework import serializers
from .models import Fund, MonthlyFund
from client.models import Client


class FundSerializer(serializers.ModelSerializer):
    # Client 모델 기반 필드
    client_id = serializers.IntegerField(source='id', read_only=True)
    client_name = serializers.ReadOnlyField()
    client_code = serializers.ReadOnlyField()
    theater_kind = serializers.ReadOnlyField()

    # Annotate 된 데이터 필드
    fund_yn = serializers.BooleanField()
    yyyy = serializers.IntegerField(source='current_yyyy', read_only=True)

    # 기금면제 월수 계산
    value = serializers.SerializerMethodField()

    class Meta:
        model = Client  # 기준 모델을 Client로 변경
        fields = ['client_id', 'client_code', 'client_name',
                  'theater_kind', 'fund_yn', 'yyyy', 'value']

    def get_value(self, obj):
        # 현재 객체의 id와 필터링된 연도(yyyy)를 사용하여 월별 기금면제 개수 카운트
        return MonthlyFund.objects.filter(
            client_id=obj.id,
            yyyy=getattr(obj, 'current_yyyy', 2025),
            fund_yn=True
        ).count()


class MonthlyFundSerializer(serializers.ModelSerializer):
    client_name = serializers.ReadOnlyField(source='client.client_name')
    client_code = serializers.ReadOnlyField(source='client.client_code')

    class Meta:
        model = MonthlyFund
        fields = [
            'id', 'client', 'client_code',
            'client_name', 'yyyy', 'mm', 'fund_yn'
        ]


class DailyFundSerializer(serializers.ModelSerializer):
    # 조회 시 편의를 위해 제공하는 필드들
    client_id = serializers.IntegerField(source='client.id', read_only=True)
    client_name = serializers.ReadOnlyField(source='client.client_name')

    class Meta:
        model = DailyFund
        fields = ['id', 'client_id', 'client_name',
                  'yyyy', 'mm', 'dd', 'fund_yn']
        # yyyy, mm, dd는 입력받아야 하므로 read_only를 설정하지 않습니다.
