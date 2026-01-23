from django.db import models
from django.db.models import Case, When, Value, Q, F
from django.db.models.functions import Collate
from rest_framework.filters import OrderingFilter
from django.core.exceptions import FieldDoesNotExist


class KoreanOrderingFilter(OrderingFilter):
    def filter_queryset(self, request, queryset, view):
        ordering = self.get_ordering(request, queryset, view)

        if ordering:
            new_ordering = []
            target_collation = "ko-KR-x-icu"  # DB에서 확인된 이름
            model = queryset.model

            for field in ordering:
                descending = field.startswith("-")
                field_name = field.lstrip("-")

                try:
                    # 1. 필드 경로 탐색 (외래키 참조 포함)
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

                    # 2. 문자열 필드인 경우 가중치 기반 정렬 적용
                    if target_field and isinstance(
                        target_field, (models.CharField, models.TextField)
                    ):
                        # 가중치 필드명 생성 (기존 필드명에 _weight 접미사)
                        weight_field = f"{field_name}_weight"

                        # 가중치 부여 로직 (한글=1, 영어=2, 특수문자/숫자=3, 공백=4)
                        queryset = queryset.annotate(
                            **{
                                weight_field: Case(
                                    When(
                                        **{f"{field_name}__regex": r"^[가-힣]"},
                                        then=Value(1),
                                    ),
                                    When(
                                        **{f"{field_name}__regex": r"^[a-zA-Z]"},
                                        then=Value(2),
                                    ),
                                    When(
                                        Q(**{f"{field_name}__isnull": True})
                                        | Q(**{f"{field_name}": ""}),
                                        then=Value(4),
                                    ),
                                    default=Value(3),
                                    output_field=models.IntegerField(),
                                )
                            }
                        )

                        # 정렬 표현식 (가중치 우선 정렬 후, 문자열 정렬)
                        expression = Collate(field_name, target_collation)
                        if descending:
                            new_ordering.append(F(weight_field).desc())
                            new_ordering.append(expression.desc())
                        else:
                            new_ordering.append(F(weight_field).asc())
                            new_ordering.append(expression.asc())
                    else:
                        # 숫자, 날짜 등은 일반 정렬
                        new_ordering.append(field)

                except (FieldDoesNotExist, AttributeError):
                    new_ordering.append(field)

            return queryset.order_by(*new_ordering)

        return queryset
