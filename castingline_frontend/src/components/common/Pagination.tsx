import React from "react";
import styled, { css } from "styled-components";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { ui } from "../../styles/uiTokens";

type PaginationColor = "default" | "gray";

const Wrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
`;

/* gray 모드 — 회색 채움 */
const grayPageButtonStyle = css`
    background: ${ui.color.surfaceHover};
    color: ${ui.color.textMutedStrong};

    &:hover {
        background: ${ui.color.border};
    }
`;

const grayPageButtonActiveStyle = css`
    background: ${ui.color.textMutedStrong};
    color: ${ui.color.surface};
`;

/* 기본 모드 — GenericTable 하단 페이지네이션과 같은 규칙.
   예전에는 활성색이 옛 팔레트의 청록(#379BC8)이라 화면의 파랑과 어긋나 있었습니다. */
const PageButton = styled.button<{
    active?: boolean;
    colorMode?: PaginationColor;
}>`
    min-width: 28px;
    height: 30px;
    border-radius: ${ui.radius.sm};
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: ${ui.font.size.sm};
    font-weight: ${({ active }) => (active ? ui.font.weight.bold : ui.font.weight.medium)};
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.12s ease;

    ${({ colorMode, active }) =>
        colorMode === "gray"
            ? active
                ? grayPageButtonActiveStyle
                : grayPageButtonStyle
            : css`
                  background: ${active ? ui.color.primarySoft : "transparent"};
                  border-color: ${active ? ui.color.primary : "transparent"};
                  color: ${active ? ui.color.primary : ui.color.textMuted};

                  &:hover:not(:disabled) {
                      background: ${active ? ui.color.primarySoft : ui.color.surfaceHover};
                      color: ${active ? ui.color.primary : ui.color.textStrong};
                  }
              `}

    &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
    }
`;

const grayArrowButtonStyle = css`
    background: ${ui.color.surfaceHover};

    &:hover:not(:disabled) {
        background: ${ui.color.border};
    }
`;

const ArrowButton = styled.button<{
    disabled?: boolean;
    colorMode?: PaginationColor;
}>`
    width: 28px;
    height: 30px;
    border-radius: ${ui.radius.sm};
    display: flex;
    justify-content: center;
    align-items: center;
    border: 1px solid transparent;
    cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
    transition: all 0.12s ease;

    ${({ colorMode }) =>
        colorMode === "gray"
            ? grayArrowButtonStyle
            : css`
                  /* 회색 채움 대신 고스트 — 페이지 번호 버튼과 같은 결 */
                  background: transparent;
                  &:hover:not(:disabled) {
                      background: ${ui.color.surfaceHover};
                  }
              `}

    &:disabled {
        opacity: 0.35;
    }
`;

const Ellipsis = styled.div`
    width: 28px;
    height: 30px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: ${ui.font.size.sm};
    font-weight: ${ui.font.weight.medium};
    color: ${ui.color.textSubtle};
`;

type PaginationProps = {
    totalPages: number;
    currentPage: number;
    onPageChange: (page: number) => void;
    color?: PaginationColor; // ← 추가됨
};

export const Pagination: React.FC<PaginationProps> = ({ totalPages, currentPage, onPageChange, color = "default" }) => {
    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (currentPage > 4) pages.push("...");
            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);
            for (let i = start; i <= end; i++) pages.push(i);
            if (currentPage < totalPages - 3) pages.push("...");
            pages.push(totalPages);
        }
        return pages;
    };

    const pages = getPageNumbers();

    return (
        <Wrapper>
            <ArrowButton disabled={currentPage === 1} colorMode={color} onClick={() => onPageChange(currentPage - 1)}>
                <CaretLeftIcon size={14} weight="bold" color={currentPage === 1 ? ui.color.textSubtle : ui.color.textMuted} />
            </ArrowButton>

            {pages.map((page, index) =>
                page === "..." ? (
                    <Ellipsis key={`ellipsis-${index}`}>…</Ellipsis>
                ) : (
                    <PageButton
                        key={page}
                        active={currentPage === page}
                        colorMode={color}
                        onClick={() => onPageChange(Number(page))}>
                        {page}
                    </PageButton>
                )
            )}

            <ArrowButton
                disabled={currentPage === totalPages}
                colorMode={color}
                onClick={() => onPageChange(currentPage + 1)}>
                <CaretRightIcon size={14} weight="bold" color={currentPage === totalPages ? ui.color.textSubtle : ui.color.textMuted} />
            </ArrowButton>
        </Wrapper>
    );
};
