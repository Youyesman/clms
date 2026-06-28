# 하드코딩되어 있던 배급사 계정(megabox_accounts.MEGABOX_ACCOUNTS)을 DB로 이전한다.
from django.db import migrations


def seed_accounts(apps, schema_editor):
    from crawler.megabox_accounts import MEGABOX_ACCOUNTS

    MegaboxDistributorAccount = apps.get_model("crawler", "MegaboxDistributorAccount")
    # 이미 등록된 계정이 있으면 시드하지 않는다(중복 방지).
    if MegaboxDistributorAccount.objects.exists():
        return
    for i, a in enumerate(MEGABOX_ACCOUNTS):
        MegaboxDistributorAccount.objects.create(
            name=a["name"], user=a["user"], password=a["password"],
            is_active=True, sort_order=i,
        )


def unseed_accounts(apps, schema_editor):
    MegaboxDistributorAccount = apps.get_model("crawler", "MegaboxDistributorAccount")
    MegaboxDistributorAccount.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("crawler", "0015_megaboxdistributoraccount"),
    ]

    operations = [
        migrations.RunPython(seed_accounts, unseed_accounts),
    ]
