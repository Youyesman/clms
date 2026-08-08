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


class CalendarEvent(models.Model):
    """대시보드 공유 캘린더의 날짜별 메모/할 일.

    공유 메모장과 마찬가지로 전 관리자가 같은 내용을 보고 편집한다.
    (사용자별 캘린더가 아니라 하나의 공용 캘린더)
    """

    date = models.DateField(db_index=True, verbose_name="일자")
    content = models.CharField(max_length=500, verbose_name="내용")
    is_done = models.BooleanField(default=False, verbose_name="완료 여부")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True, related_name="+",
        verbose_name="작성자",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True, related_name="+",
        verbose_name="마지막 수정자",
    )

    class Meta:
        verbose_name = "공유 캘린더 일정"
        ordering = ["date", "is_done", "id"]

    def __str__(self):
        return f"[{self.date}] {self.content[:20]}"
