"""대시보드 공유 메모장 모델.

여러 관리자가 함께 보고 편집하는 단일(싱글톤) 메모. pk=1 레코드 하나만 사용한다.
프론트엔드는 짧은 주기로 polling 하여 실시간처럼 동기화한다.
"""

from django.conf import settings
from django.db import models


class SharedMemo(models.Model):
    """대시보드에 표시되는 전사 공유 메모(싱글톤)."""

    content = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="마지막 수정자",
    )

    class Meta:
        verbose_name = "공유 메모"

    def __str__(self):
        return f"공유 메모 (#{self.pk})"

    @classmethod
    def load(cls):
        """싱글톤 인스턴스를 가져온다(없으면 생성)."""
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
