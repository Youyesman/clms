# KOBIS 배급사 계정(kobis_accounts.KOBIS_ACCOUNTS)을 DB로 시드한다.
from django.db import migrations


def seed_accounts(apps, schema_editor):
    from crawler.kobis_accounts import KOBIS_ACCOUNTS

    KobisDistributorAccount = apps.get_model("crawler", "KobisDistributorAccount")
    # 이미 등록된 계정이 있으면 시드하지 않는다(중복 방지).
    if KobisDistributorAccount.objects.exists():
        return
    for i, a in enumerate(KOBIS_ACCOUNTS):
        KobisDistributorAccount.objects.create(
            name=a["name"], user=a["user"], password=a["password"],
            aprv_no=a.get("aprv_no", ""), is_active=True, sort_order=i,
        )


def unseed_accounts(apps, schema_editor):
    KobisDistributorAccount = apps.get_model("crawler", "KobisDistributorAccount")
    KobisDistributorAccount.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("crawler", "0019_kobisdistributoraccount"),
    ]

    operations = [
        migrations.RunPython(seed_accounts, unseed_accounts),
    ]
