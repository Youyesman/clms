from django.db import models
from django.db.models import F
from django.db.models.functions import Collate
from rest_framework.filters import OrderingFilter
from django.core.exceptions import FieldDoesNotExist


class KoreanOrderingFilter(OrderingFilter):
    def get_valid_fields(self, queryset, view, context=None):
        valid_fields = super().get_valid_fields(queryset, view, context=context or {})
        # ordering_field_map의 키도 유효한 정렬 필드로 추가
        field_map = getattr(view, 'ordering_field_map', {})
        for key in field_map:
            if (key, key) not in valid_fields:
                valid_fields.append((key, key))
        return valid_fields

    def filter_queryset(self, request, queryset, view):
        ordering = self.get_ordering(request, queryset, view)

        # ViewSet에 ordering_field_map이 있으면 프론트 키를 DB 필드로 변환
        field_map = getattr(view, 'ordering_field_map', {})
        if ordering and field_map:
            ordering = [
                ('-' + field_map.get(f.lstrip('-'), f.lstrip('-')) if f.startswith('-')
                 else field_map.get(f, f))
                for f in ordering
            ]

        if ordering:
            new_ordering = []
            target_collation = "ko-KR-x-icu"
            model = queryset.model

            for field in ordering:
                descending = field.startswith("-")
                field_name = field.lstrip("-")

                try:
                    # 필드 경로 탐색 (외래키 참조 포함)
                    parts = field_name.split("__")
                    curr_model = model
                    target_field = None
                    for i, part in enumerate(parts):
                        model_field = curr_model._meta.get_field(part)
                        if i == len(parts) - 1:
                            target_field = model_field
                        else:
                            curr_model = model_field.related_model
                            if curr_model is None:
                                break

                    # 문자열 필드: ICU 한국어 콜레이션으로 정렬 (가중치 없이)
                    if target_field and isinstance(
                        target_field, (models.CharField, models.TextField)
                    ):
                        expression = Collate(F(field_name), target_collation)
                        if descending:
                            new_ordering.append(expression.desc())
                        else:
                            new_ordering.append(expression.asc())
                    else:
                        new_ordering.append(field)

                except (FieldDoesNotExist, AttributeError):
                    new_ordering.append(field)

            return queryset.order_by(*new_ordering)

        return queryset
