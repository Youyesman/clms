import React from "react";
import styled, { keyframes, css } from "styled-components";
import { FileXls, CircleNotch, MicrosoftExcelLogoIcon } from "@phosphor-icons/react";

/* ---------------- Constants ---------------- */
// 엑셀 브랜드 컬러 (짙은 초록색)
const EXCEL_GREEN = "#1D6F42";
// 호버 시 사용할 연한 초록색 배경
const EXCEL_HOVER_BG = "#E6F2EA";

/* ---------------- Animation ---------------- */
const rotate = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

/* ---------------- Styled Components ---------------- */
const IconButton = styled.button<{ $isLoading?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 32px; /* 기존 버튼들과 높이 통일 */
    width: 32px; /* 정사각형 아이콘 버튼 */
    padding: 0;
    background-color: white;
    border: 1px solid #cbd5e1; /* Slate 300 */
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: ${EXCEL_GREEN}; /* 아이콘 기본 색상을 엑셀 초록색으로 설정 */

    &:hover:not(:disabled) {
        background-color: ${EXCEL_HOVER_BG}; /* 호버 시 은은한 초록 배경 */
        border-color: ${EXCEL_GREEN};
    }

    &:disabled {
        background-color: #f1f5f9;
        color: #94a3b8;
        cursor: not-allowed;
        border-color: #cbd5e1;
    }

    /* 로딩 아이콘 스타일 */
    .loading-icon {
        animation: ${rotate} 1s linear infinite;
        color: #64748b; /* 로딩 중에는 회색으로 표시 (선택사항) */
    }

    /* 엑셀 아이콘에 약간의 입체감 부여 (선택사항) */
    /* filter: drop-shadow(0px 1px 0px rgba(29, 111, 66, 0.2)); */
`;

/* ---------------- Types ---------------- */
interface ExcelIconButtonProps {
    onClick: () => void;
    isLoading?: boolean;
    disabled?: boolean;
    title?: string; // 마우스 오버 시 툴팁 메시지
}

/* ---------------- Component ---------------- */
export function ExcelIconButton({
    onClick,
    isLoading = false,
    disabled = false,
    title = "엑셀 다운로드",
}: ExcelIconButtonProps) {
    return (
        <IconButton
            onClick={onClick}
            disabled={isLoading || disabled}
            $isLoading={isLoading}
            title={title} // HTML 기본 툴팁 제공
            type="button">
            {isLoading ? (
                <CircleNotch size={20} weight="bold" className="loading-icon" />
            ) : (
                // weight="fill"을 사용하여 엑셀 아이콘을 꽉 찬 느낌으로 강조
                <MicrosoftExcelLogoIcon size={22} weight="fill" />
            )}
        </IconButton>
    );
}
