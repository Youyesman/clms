"""정산서(부금계산서) 메일 수집 기능 모델.

- SettlementTargetMovie: 정산서를 받을 '대상 영화' 목록(영화DB 선택 + 별칭 키워드).
- CollectedSettlement: 메일에서 매칭되어 저장된 첨부파일(월별/영화별 조회용).

메일함 조회(services.py)는 여전히 stateless 이지만, 수집된 첨부는 DB+파일로 영속화한다.
"""

from django.db import models


class SettlementTargetMovie(models.Model):
    """정산서 수집 대상 영화.

    메일 제목/본문/첨부파일명에 이 영화의 제목(또는 별칭)이 포함되면 첨부를 수집한다.
    """

    movie = models.OneToOneField(
        "movie.Movie",
        on_delete=models.CASCADE,
        related_name="settlement_target",
        verbose_name="대상 영화",
    )
    # 메일에서 제목과 다르게 표기될 수 있는 경우를 대비한 별칭(한 줄에 하나)
    aliases = models.TextField(
        blank=True,
        default="",
        help_text="메일에서 다르게 표기되는 경우를 위한 별칭. 한 줄에 하나씩 입력.",
    )
    is_active = models.BooleanField(default=True, verbose_name="활성화")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "정산서 대상 영화"

    def alias_list(self):
        """별칭 문자열을 리스트로. 빈 줄 제거."""
        return [a.strip() for a in (self.aliases or "").splitlines() if a.strip()]

    def keywords(self):
        """매칭에 사용할 키워드(영화 제목 + 별칭). 중복 제거."""
        kws = []
        for k in [self.movie.title_ko, self.movie.title_en, *self.alias_list()]:
            if k and k not in kws:
                kws.append(k)
        return kws

    def __str__(self):
        return f"{'✅' if self.is_active else '⏸'} {self.movie.title_ko}"


def settlement_upload_path(instance, filename):
    """media/settlements/YYYY-MM/<movie_id>/<filename> 경로에 저장."""
    month = instance.month or "unknown"
    mid = instance.movie_id or "etc"
    return f"settlements/{month}/{mid}/{filename}"


class CollectedSettlement(models.Model):
    """메일에서 수집되어 저장된 정산서 첨부파일 1개.

    (mail_folder, mail_uid, attachment_index) 가 유니크 → 재스캔 시 중복 저장 방지.
    """

    movie = models.ForeignKey(
        "movie.Movie",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="collected_settlements",
    )
    movie_title = models.CharField(max_length=255)  # 수집 시점 영화명 스냅샷
    month = models.CharField(max_length=7, db_index=True)  # "YYYY-MM"
    matched_keyword = models.CharField(max_length=255, blank=True, default="")
    matched_in = models.CharField(
        max_length=20, blank=True, default=""
    )  # subject / body / filename

    # ── 메일 출처 ──
    mail_folder = models.CharField(max_length=255)
    mail_uid = models.IntegerField()
    mail_subject = models.CharField(max_length=500, blank=True, default="")
    mail_from = models.CharField(max_length=255, blank=True, default="")
    mail_date = models.DateTimeField(null=True, blank=True)

    # ── 첨부 ──
    attachment_index = models.IntegerField()
    filename = models.CharField(max_length=500)
    content_type = models.CharField(max_length=120, blank=True, default="")
    size = models.IntegerField(default=0)
    file = models.FileField(upload_to=settlement_upload_path)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-mail_date", "-id"]
        constraints = [
            # 한 첨부(같은 메일·index)가 여러 영화로 수집될 수 있으므로 movie 까지 포함해 유니크.
            # (여러 영화 정산서를 한 파일로 합쳐 보내는 경우 영화별로 레코드를 따로 만든다.)
            models.UniqueConstraint(
                fields=["mail_folder", "mail_uid", "attachment_index", "movie"],
                name="uniq_collected_attachment_movie",
            )
        ]
        indexes = [
            models.Index(fields=["month", "movie"]),
        ]

    def __str__(self):
        return f"[{self.month}] {self.movie_title} - {self.filename}"
