from django.db.models import Func, F, Value
import django_filters
from .models import Client


# 공백 제거 함수
class RemoveSpaces(Func):
    function = "REPLACE"
    template = "%(function)s(%(expressions)s, ' ', '')"


class ClientFilter(django_filters.FilterSet):
    client_name = django_filters.CharFilter(method="filter_name")
    # 명시적으로 client_type 필터 추가 (콤마로 구분된 여러 값 지원)
    client_type = django_filters.CharFilter(method="filter_client_type")

    class Meta:
        model = Client
        fields = {
            "operational_status": ["exact"],
            "classification": ["exact"],
            "theater_kind": ["exact"],
        }

    def filter_name(self, queryset, name, value):
        normalized = value.replace(" ", "")
        return queryset.annotate(normalized_name=RemoveSpaces(F("client_name"))).filter(
            normalized_name__icontains=normalized
        )
    
    def filter_client_type(self, queryset, name, value):
        # 콤마로 구분된 여러 값 처리
        if "," in value:
            types = [t.strip() for t in value.split(",") if t.strip()]
            return queryset.filter(client_type__in=types)
        else:
            return queryset.filter(client_type=value)