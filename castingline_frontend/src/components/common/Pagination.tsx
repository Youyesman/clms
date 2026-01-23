import React from "react";
import styled, { css } from "styled-components";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

type PaginationColor = "default" | "gray";

const Wrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
`;

/* 🔥 Gray 스타일 */
const grayPageButtonStyle = css`
    background: var(--Gray-200, #e9eaeb);
    color: var(--Gray-600, #4b4f56);

    &:hover {
        background: var(--Gray-300, #d5d7da);
    }
`;

const grayPageButtonActiveStyle = css`
    background: var(--Gray-600, #4b4f56);
    color: #ffffff;
`;

const PageButton = styled.button<{
    active?: boolean;
    colorMode?: PaginationColor;
}>`
    width: 26px;
    height: 26px;
    border-radius: 4px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 12px;
    font-weight: 700;
    border: none;
    cursor: pointer;
    transition: background 0.2s ease;

    /* 🔥 Gray mode */
    ${({ colorMode, active }) =>
        colorMode === "gray"
            ? active
                ? grayPageButtonActiveStyle
                : grayPageButtonStyle
            : css`
                  /* 기본(default) 스타일 */
                  background: ${active ? "var(--FEG-Dark-50, #379BC8)" : "transparent"};
                  color: ${active ? "white" : "var(--Gray-500, #717680)"};

                  &:hover {
                      background: ${active ? "var(--FEG-Dark-50)" : "#d5d7da"};
                  }
              `}
`;

const grayArrowButtonStyle = css`
    background: var(--Gray-200, #e9eaeb);

    &:hover {
        background: var(--Gray-300, #d5d7da);
    }
`;

const ArrowButton = styled.button<{
    disabled?: boolean;
    colorMode?: PaginationColor;
}>`
    width: 26px;
    height: 26px;
    border-radius: 4px;
    display: flex;
    justify-content: center;
    align-items: center;
    border: none;
    cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};

    ${({ colorMode }) =>
        colorMode === "gray"
            ? grayArrowButtonStyle
            : css`
                  background: var(--Gray-200, #e9eaeb);
                  &:hover {
                      background: #d5d7da;
                  }
              `}
`;

const Ellipsis = styled.div`
    width: 26px;
    height: 26px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 12px;
    font-weight: 700;
    color: var(--Gray-600, #4b4f56);
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
                <CaretLeftIcon size={14} weight="bold" color={currentPage === 1 ? "#B0B0B0" : "#4B4F56"} />
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
                <CaretRightIcon size={14} weight="bold" color={currentPage === totalPages ? "#B0B0B0" : "#4B4F56"} />
            </ArrowButton>
        </Wrapper>
    );
};
