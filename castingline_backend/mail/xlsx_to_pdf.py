"""엑셀(xlsx/xls) → PDF 변환 (LibreOffice headless 사용).

일괄 다운로드 zip 에서 엑셀 정산서를 PDF 로 변환할 때 사용한다.
LibreOffice(soffice) 가 설치돼 있어야 하며, 없으면 None 을 반환(호출측에서 원본 유지).
환경변수 SOFFICE_PATH 로 경로를 지정할 수 있다.
"""

import io
import os
import shutil
import subprocess
import tempfile

_CANDIDATES = [
    os.environ.get("SOFFICE_PATH"),
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    "/usr/bin/soffice",
    "/usr/bin/libreoffice",
    "/opt/libreoffice/program/soffice",
]


def find_soffice():
    for c in _CANDIDATES:
        if c and os.path.exists(c):
            return c
    return shutil.which("soffice") or shutil.which("libreoffice")


def available():
    return find_soffice() is not None


def _fit_one_page_wide(data):
    """엑셀 인쇄 설정을 '가로방향 + 모든 열을 한 페이지 너비에 맞춤'으로 바꾼 bytes 반환.

    이렇게 해야 LibreOffice 변환 시 열이 잘려 여러 장으로 쪼개지지 않는다.
    (세로로 긴 표는 여전히 여러 장이 될 수 있으나, 가로 잘림은 사라진다.)
    실패하면 None 반환(호출측에서 원본 사용).
    """
    try:
        from openpyxl import load_workbook
        from openpyxl.worksheet.page import PageMargins
        from openpyxl.worksheet.properties import PageSetupProperties

        wb = load_workbook(io.BytesIO(data))
        for ws in wb.worksheets:
            ws.page_setup.orientation = "landscape"
            ws.page_setup.fitToWidth = 1   # 모든 열을 1페이지 너비에
            ws.page_setup.fitToHeight = 0  # 행은 필요한 만큼(세로 압축 안 함)
            ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
            ws.page_margins = PageMargins(
                left=0.2, right=0.2, top=0.3, bottom=0.3, header=0.1, footer=0.1
            )
        out = io.BytesIO()
        wb.save(out)
        return out.getvalue()
    except Exception:
        return None


def convert(data, filename):
    """엑셀 bytes → PDF bytes. 실패/미설치 시 None."""
    soffice = find_soffice()
    if not soffice:
        return None
    # xlsx/xlsm 은 가로 한 페이지에 맞도록 인쇄설정을 조정(열 잘림 방지)
    if filename.lower().endswith((".xlsx", ".xlsm")):
        fitted = _fit_one_page_wide(data)
        if fitted is not None:
            data = fitted
    with tempfile.TemporaryDirectory() as d:
        # 파일명에 경로 구분자/문제문자 제거
        safe = os.path.basename(filename) or "sheet.xlsx"
        src = os.path.join(d, safe)
        with open(src, "wb") as f:
            f.write(data)
        # 동시 실행 시 프로필 잠금을 피하려 임시 UserInstallation 을 분리한다.
        profile = os.path.join(d, "loprofile")
        try:
            subprocess.run(
                [
                    soffice,
                    "--headless",
                    "--norestore",
                    "--nolockcheck",
                    f"-env:UserInstallation=file:///{profile.replace(os.sep, '/')}",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    d,
                    src,
                ],
                check=True,
                timeout=120,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            return None
        pdf = os.path.splitext(src)[0] + ".pdf"
        if os.path.exists(pdf):
            with open(pdf, "rb") as f:
                return f.read()
    return None
