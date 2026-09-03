# F001(0903): 이세로 합산용 메인(상위) 거래처 필드 추가 + 기존 면제관 자동 연결

from django.db import migrations, models
import django.db.models.deletion


FUND_EXEMPT_SUFFIX = "(발전기금면제관)"


def link_fund_exempt_theaters(apps, schema_editor):
    """'XXX(발전기금면제관)' 극장을 같은 사업자번호의 'XXX' 본관에 연결한다.

    본관이 없거나 사업자번호가 다르면 건드리지 않는다 (거래처 관리에서 수동 지정).
    """
    Client = apps.get_model("client", "Client")
    for child in Client.objects.filter(client_name__endswith=FUND_EXEMPT_SUFFIX):
        base_name = child.client_name[: -len(FUND_EXEMPT_SUFFIX)].strip()
        parent = (
            Client.objects.filter(
                client_type=child.client_type,
                client_name=base_name,
                business_registration_number=child.business_registration_number,
            )
            .exclude(pk=child.pk)
            .first()
        )
        if parent:
            child.parent_client = parent
            child.save(update_fields=["parent_client"])


def unlink_all(apps, schema_editor):
    Client = apps.get_model("client", "Client")
    Client.objects.filter(parent_client__isnull=False).update(parent_client=None)


class Migration(migrations.Migration):

    dependencies = [
        ("client", "0017_alter_client_settlement_email"),
    ]

    operations = [
        migrations.AddField(
            model_name="client",
            name="parent_client",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="child_clients",
                to="client.client",
            ),
        ),
        migrations.RunPython(link_fund_exempt_theaters, unlink_all),
    ]
