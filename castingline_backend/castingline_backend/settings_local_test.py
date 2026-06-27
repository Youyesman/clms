# 로컬 테스트용 설정 - 운영 settings.py 를 그대로 상속하고 DB만 로컬로 교체
# 사용:  python manage.py <cmd> --settings=castingline_backend.settings_local_test
from .settings import *  # noqa

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "clms_test_local",
        "USER": "postgres",
        "PASSWORD": "wkahd88**",
        "HOST": "localhost",
        "PORT": "5432",
    }
}
