from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from client.models import Client

User = get_user_model()


class Command(BaseCommand):
    help = "Client의 login_id/login_password로 User 계정 생성"

    def handle(self, *args, **options):
        clients = Client.objects.filter(
            login_id__isnull=False,
            login_password__isnull=False,
        ).exclude(login_id="").exclude(login_password="")

        created = 0
        skipped = 0

        for client in clients:
            username = client.login_id.strip()
            password = client.login_password.strip()

            if not username:
                continue

            if User.objects.filter(username=username).exists():
                skipped += 1
                continue

            user = User.objects.create_user(
                username=username,
                password=password,
                nickname=username,
                country="KR",
                client=client,
            )
            created += 1
            self.stdout.write(f"  생성: {username} → {client.client_name}")

        self.stdout.write(
            self.style.SUCCESS(
                f"완료! 생성: {created}건, 건너뜀(이미 존재): {skipped}건"
            )
        )
