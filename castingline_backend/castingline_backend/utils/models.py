# models.py
from django.db import models
from django.conf import settings
from .thread_local import get_current_user


class TimeStampedModel(models.Model):
    create_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_created",
    )
    update_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_updated",
    )

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        user = get_current_user()
        if user:
            # 처음 생성될 때만 create_user 설정
            if not self.pk:
                self.create_user = user
            # 매번 수정될 때마다 update_user 설정
            self.update_user = user
        super().save(*args, **kwargs)
