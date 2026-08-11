"""배급사 극장명 매핑(DistributorTheaterMap) 전체 덮어쓰기 / 대상 배급사 해제.

M002: NEW·콘텐츠판다처럼 "지금까지의 히스토리를 전부 지우고 최신본 한 벌만" 남길 때 사용.
M001: 더 이상 배급사별 극장명을 쓰지 않는 배급사를 대상에서 빼고 매핑을 지울 때 사용.

사용 예
    # 덮어쓰기 (엑셀: '거래처 극장명' / '배급사 극장명' 두 열)
    python manage.py overwrite_theater_map --file map.xlsx --apply-date 2026-07-31 \
        --distributor 20100014 --distributor 20210002

    # 대상 배급사에서 제외 (매핑 삭제 + 배급사별 극장명 해제)
    python manage.py overwrite_theater_map --remove 20230020

    # 실제 반영 없이 결과만 확인
    python manage.py overwrite_theater_map ... --dry-run
"""
from datetime import date

import pandas as pd
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from client.models import Client, DistributorTheaterMap

# 대상 배급사 목록(극장명 매핑 관리 화면)에 노출되는 값
TARGET_FLAG = "배급사별 극장명"
# 대상에서 뺄 때 되돌릴 값 (일반 배급사 기본값)
NON_TARGET_FLAG = "극장명 공통 사용"

COL_THEATER = "거래처 극장명"
COL_DIST_NAME = "배급사 극장명"


def _norm(name):
    return str(name or "").replace(" ", "").strip().lower()


class Command(BaseCommand):
    help = "배급사 극장명 매핑을 엑셀로 전체 덮어쓰거나, 대상 배급사에서 제외한다."

    def add_arguments(self, parser):
        parser.add_argument("--file", type=str, help="매핑 엑셀 경로")
        parser.add_argument(
            "--distributor",
            action="append",
            default=[],
            help="덮어쓸 배급사의 client_code (여러 번 지정 가능)",
        )
        parser.add_argument(
            "--apply-date", type=str, default=None, help="적용 시작일 (YYYY-MM-DD)"
        )
        parser.add_argument(
            "--remove",
            action="append",
            default=[],
            help="대상 배급사에서 제외할 client_code (매핑 전량 삭제)",
        )
        parser.add_argument("--dry-run", action="store_true", help="반영 없이 결과만 출력")

    # ── 유틸 ────────────────────────────────────────────────────────────
    def _get_client(self, code):
        try:
            return Client.objects.get(client_code=str(code).strip())
        except Client.DoesNotExist:
            raise CommandError(f"client_code={code} 거래처를 찾을 수 없습니다.")
        except Client.MultipleObjectsReturned:
            raise CommandError(f"client_code={code} 가 중복입니다.")

    def _build_theater_index(self):
        """극장명(공백무시, 소문자) → Client. 동명이인은 사용중인 극장을 우선."""
        index = {}
        for c in Client.objects.exclude(client_name__isnull=True).exclude(client_name=""):
            for name in filter(None, [c.client_name, c.excel_theater_name]):
                key = _norm(name)
                current = index.get(key)
                if current is None or (
                    not current.operational_status and c.operational_status
                ):
                    index[key] = c
        return index

    # ── 실행 ────────────────────────────────────────────────────────────
    def handle(self, *args, **opts):
        dry = opts["dry_run"]
        removals = opts["remove"]
        dist_codes = opts["distributor"]
        file_path = opts["file"]

        if not removals and not (file_path and dist_codes):
            raise CommandError("--file/--distributor 또는 --remove 중 하나는 필요합니다.")

        with transaction.atomic():
            if removals:
                self._handle_removals(removals)

            if file_path and dist_codes:
                self._handle_overwrite(file_path, dist_codes, opts.get("apply_date"))

            if dry:
                self.stdout.write(self.style.WARNING("\n[dry-run] 변경사항을 롤백합니다."))
                transaction.set_rollback(True)

    def _handle_removals(self, codes):
        for code in codes:
            client = self._get_client(code)
            deleted, _ = DistributorTheaterMap.objects.filter(distributor=client).delete()
            if client.distributor_theater_name == TARGET_FLAG:
                client.distributor_theater_name = NON_TARGET_FLAG
                client.save(update_fields=["distributor_theater_name"])
            self.stdout.write(
                self.style.SUCCESS(
                    f"[제외] {client.client_name}({code}) — 매핑 {deleted}건 삭제, "
                    f"대상 배급사에서 해제"
                )
            )

    def _handle_overwrite(self, file_path, codes, apply_date_str):
        apply_date = (
            date.fromisoformat(apply_date_str) if apply_date_str else date.today()
        )

        df = pd.read_excel(file_path)
        if COL_THEATER not in df.columns or COL_DIST_NAME not in df.columns:
            raise CommandError(
                f"엑셀에 '{COL_THEATER}' / '{COL_DIST_NAME}' 열이 필요합니다. "
                f"(현재: {list(df.columns)})"
            )

        index = self._build_theater_index()

        rows = []          # (theater, 배급사측 극장명)
        unmatched = []     # 매칭 실패한 거래처 극장명
        seen_theaters = set()
        duplicated = []
        for _, row in df.iterrows():
            theater_name = str(row[COL_THEATER] or "").strip()
            dist_name = str(row[COL_DIST_NAME] or "").strip()
            if not theater_name or theater_name.lower() == "nan":
                continue
            if not dist_name or dist_name.lower() == "nan":
                continue

            theater = index.get(_norm(theater_name))
            if not theater:
                unmatched.append(theater_name)
                continue
            if theater.id in seen_theaters:
                duplicated.append(theater_name)
                continue
            seen_theaters.add(theater.id)
            rows.append((theater, dist_name))

        self.stdout.write(
            f"엑셀 {len(df)}행 → 매칭 {len(rows)}건 / 미매칭 {len(unmatched)}건 "
            f"/ 중복 제외 {len(duplicated)}건 (적용 시작일 {apply_date})"
        )
        for name in unmatched:
            self.stdout.write(self.style.WARNING(f"  미매칭: {name}"))
        for name in duplicated:
            self.stdout.write(self.style.WARNING(f"  중복 제외: {name}"))

        for code in codes:
            distributor = self._get_client(code)
            removed, _ = DistributorTheaterMap.objects.filter(
                distributor=distributor
            ).delete()
            DistributorTheaterMap.objects.bulk_create(
                [
                    DistributorTheaterMap(
                        distributor=distributor,
                        theater=theater,
                        distributor_theater_name=dist_name,
                        apply_date=apply_date,
                    )
                    for theater, dist_name in rows
                ],
                batch_size=500,
            )
            if distributor.distributor_theater_name != TARGET_FLAG:
                distributor.distributor_theater_name = TARGET_FLAG
                distributor.save(update_fields=["distributor_theater_name"])
            self.stdout.write(
                self.style.SUCCESS(
                    f"[덮어쓰기] {distributor.client_name}({code}) — "
                    f"기존 {removed}건 삭제 → {len(rows)}건 등록"
                )
            )
