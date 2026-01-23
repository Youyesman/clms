import pandas as pd
from django.core.management.base import BaseCommand
from django.db import transaction
from client.models import Client, DistributorTheaterMap


class Command(BaseCommand):
    help = (
        "숫자 형식을 무시하고 극장코드를 매칭하여 DistributorTheaterMap에 저장합니다."
    )

    def add_arguments(self, parser):
        parser.add_argument("file_path", type=str, help="엑셀/CSV 파일 경로")
        parser.add_argument("distributor_id", type=int, help="배급사의 Client ID")

    def handle(self, *args, **options):
        file_path = options["file_path"]
        dist_id = options["distributor_id"]

        try:
            distributor = Client.objects.get(id=dist_id)
            self.stdout.write(
                self.style.SUCCESS(f"대상 배급사: {distributor.client_name}")
            )

            # 1. 효율적인 매칭을 위해 DB의 모든 극장 코드를 숫자 키로 매핑 (캐싱)
            # client_code가 '00100103'이든 '100103'이든 정수 100103으로 변환하여 저장
            theater_map = {}
            for c in Client.objects.all():
                if c.client_code and str(c.client_code).strip().isdigit():
                    code_int = int(str(c.client_code).strip())
                    theater_map[code_int] = c

            # 2. 파일 읽기 (Excel/CSV 대응)
            if file_path.endswith(".xls") or file_path.endswith(".xlsx"):
                df = pd.read_excel(file_path)
            else:
                try:
                    df = pd.read_csv(file_path, encoding="utf-8-sig")
                except:
                    df = pd.read_csv(file_path, encoding="cp949")

            success_count = 0
            fail_count = 0

            # 3. 데이터 처리
            with transaction.atomic():
                for _, row in df.iterrows():
                    # 엑셀의 극장코드를 숫자로 변환 (20090018.0 -> 20090018)
                    try:
                        raw_val = row["극장코드"]
                        if pd.isna(raw_val):
                            continue

                        # 어떤 형식이든 숫자로 강제 변환
                        excel_code_int = int(float(str(raw_val).strip()))
                        dist_theater_name = str(row["배급사 극장명"]).strip()
                    except (ValueError, TypeError):
                        continue

                    # 4. 캐시된 맵에서 숫자 키로 극장 찾기
                    theater = theater_map.get(excel_code_int)

                    if theater:
                        DistributorTheaterMap.objects.update_or_create(
                            distributor=distributor,
                            theater=theater,
                            defaults={"distributor_theater_name": dist_theater_name},
                        )
                        success_count += 1
                    else:
                        self.stdout.write(
                            self.style.WARNING(
                                f"매칭 실패: 코드 {excel_code_int} / {row.get('거래처 극장명', '')}"
                            )
                        )
                        fail_count += 1

            self.stdout.write(
                self.style.SUCCESS(
                    f"\n완료! [성공: {success_count}건 / 실패: {fail_count}건]"
                )
            )

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"오류 발생: {str(e)}"))
