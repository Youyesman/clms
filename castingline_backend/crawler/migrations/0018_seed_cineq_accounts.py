# 씨네큐 배급사 계정(cineq_accounts.CINEQ_ACCOUNTS)을 DB로 시드한다.
from django.db import migrations


def seed_accounts(apps, schema_editor):
    from crawler.cineq_accounts import CINEQ_ACCOUNTS

    CineQDistributorAccount = apps.get_model("crawler", "CineQDistributorAccount")
    # 이미 등록된 계정이 있으면 시드하지 않는다(중복 방지).
    if CineQDistributorAccount.objects.exists():
        return
    for i, a in enumerate(CINEQ_ACCOUNTS):
        CineQDistributorAccount.objects.create(
            name=a["name"], user=a["user"], password=a["password"],
            is_active=True, sort_order=i,
        )


def unseed_accounts(apps, schema_editor):
    CineQDistributorAccount = apps.get_model("crawler", "CineQDistributorAccount")
    CineQDistributorAccount.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("crawler", "0017_cineqdistributoraccount"),
    ]

    operations = [
        migrations.RunPython(seed_accounts, unseed_accounts),
    ]
