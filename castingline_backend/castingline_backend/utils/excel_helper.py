import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from django.http import HttpResponse
from decimal import Decimal  # Decimal 타입 체크를 위해 추가


class ExcelGenerator:
    def __init__(self, sheet_name="Data"):
        self.wb = openpyxl.Workbook()
        self.ws = self.wb.active
        self.ws.title = sheet_name

        # 공통 스타일 정의
        self.header_fill = PatternFill(
            start_color="DDEBF7", end_color="DDEBF7", fill_type="solid")  # 연한 파란색
        self.header_fill_green = PatternFill(
            start_color="E2EFDA", end_color="E2EFDA", fill_type="solid")  # 연한 초록색 (총 좌석수, 총 상영관수용)
        self.header_font = Font(color="000000", bold=True, size=10)  # 검은색, 굵게, 10pt
        self.data_font = Font(color="000000", bold=False, size=10)  # 데이터 행용: 검은색, 일반, 10pt
        self.data_font_bold = Font(color="000000", bold=True, size=10)  # 극장명 컬럼용: 검은색, 굵게, 10pt
        self.center_align = Alignment(horizontal="center", vertical="center")
        self.left_align = Alignment(horizontal="left", vertical="center")  # 데이터 행용 왼쪽 정렬
        self.right_align = Alignment(
            horizontal="right", vertical="center")  # 숫자용 우측 정렬
        self.border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )

    def add_header(self, headers, special_header_indices=None):
        """
        headers: 헤더 리스트
        special_header_indices: 특별한 배경색을 적용할 헤더 인덱스 리스트 (0-based)
        """
        self.ws.append(headers)
        for idx, cell in enumerate(self.ws[1]):
            # 특별한 헤더 인덱스가 지정되어 있고 현재 인덱스가 포함되어 있으면 초록색 배경
            if special_header_indices and idx in special_header_indices:
                cell.fill = self.header_fill_green
            else:
                cell.fill = self.header_fill
            cell.font = self.header_font
            cell.alignment = self.center_align
            cell.border = self.border

    def add_rows(self, data_list, bold_column_indices=None):
        """
        data_list: 데이터 행 리스트
        bold_column_indices: 굵게 표시할 컬럼 인덱스 리스트 (0-based, 예: [0]은 첫 번째 컬럼)
        """
        for row in data_list:
            self.ws.append(row)
            # 현재 추가된 마지막 행의 셀들을 순회
            for idx, cell in enumerate(self.ws[self.ws.max_row]):
                cell.border = self.border
                
                # 폰트 설정: 굵게 표시할 컬럼인지 확인
                if bold_column_indices and idx in bold_column_indices:
                    cell.font = self.data_font_bold
                else:
                    cell.font = self.data_font

                # ✅ 데이터가 숫자 타입(int, float, Decimal)인지 확인
                if isinstance(cell.value, (int, float, Decimal)):
                    # 천 단위 콤마 서식 적용 (#,##0)
                    cell.number_format = '#,##0'
                    # 숫자는 오른쪽 정렬이 가독성이 좋음
                    cell.alignment = self.right_align
                else:
                    # 일반 텍스트는 왼쪽 정렬, 수직 중앙 정렬 (예시 파일과 동일)
                    cell.alignment = self.left_align

    def auto_fit_columns(self):
        """콘텐츠 길이에 맞춰 열 너비 자동 조절"""
        for col in self.ws.columns:
            max_length = 0
            column = col[0].column_letter
            for cell in col:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            # 한글/숫자 폰트 크기를 고려해 여유공간(+3) 추가
            self.ws.column_dimensions[column].width = max_length + 3

    def to_response(self, filename):
        self.auto_fit_columns()
        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}.xlsx"'
        self.wb.save(response)
        return response
