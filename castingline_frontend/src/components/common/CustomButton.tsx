import styled, { css } from "styled-components";
import { motion } from "framer-motion";

type Size = "xs" | "sm" | "md" | "lg";
type Color = "blue" | "red" | "gray";

/* 1. 컬러 시스템: Deep Slate 테마에 맞춘 색상 보정 */
const defaultStyle = {
    text: "#1e293b" /* Slate 800 */,
    border: "#94a3b8" /* Slate 400 */,
    hover: "#f1f5f9" /* Slate 100 */,
};

const colorMap = {
    blue: {
        text: "#2b5797",
        border: "#2b5797",
        hover: "#f1f8fc",
    },
    red: {
        text: "#dc2626",
        border: "#ef4444",
        hover: "#fef2f2",
    },
    gray: {
        text: "#475569" /* Slate 600 */,
        border: "#cbd5e1" /* Slate 300 */,
        hover: "#f8fafc",
    },
};

/* 2. 사이즈 시스템: 높이 규격 축소 */
const sizeStyles = {
    xs: css`
        height: 26px; /* 초소형 (유틸리티용) */
        padding: 0 8px;
        font-size: 11px;
        font-weight: 600;
        border-radius: 3px;
        gap: 4px;
    `,
    sm: css`
        height: 32px; /* 👈 관리자 표준 (Input/Select와 동일 규격) */
        padding: 0 12px;
        font-size: 12px;
        font-weight: 700;
        border-radius: 4px;
        gap: 6px;
    `,
    md: css`
        height: 38px; /* 일반 강조형 */
        padding: 0 16px;
        font-size: 14px;
        font-weight: 700;
        border-radius: 4px;
        gap: 8px;
    `,
    lg: css`
        height: 46px; /* 대형 (로그인 등 메인 액션) */
        padding: 0 20px;
        font-size: 16px;
        font-weight: 700;
        border-radius: 6px;
        gap: 8px;
    `,
};

export const CustomButton = styled(motion.button).withConfig({
    shouldForwardProp: (prop) => !["size", "color", "width"].includes(prop),
}).attrs({
    whileHover: { scale: 1.05 },
    whileTap: { scale: 0.95 },
})<{
    size?: Size;
    color?: Color;
    width?: string | number;
}>`
    display: inline-flex;
    justify-content: center;
    align-items: center;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    font-family: "SUIT", sans-serif;
    outline: none;

    /* 사이즈 적용 (기본 sm으로 설정하여 입력창과 맞춤) */
    ${({ size = "sm" }) => sizeStyles[size]}

    /* 너비 설정 */
    ${({ width }) =>
        width
            ? css`
                  width: ${typeof width === "number" ? `${width}px` : width};
              `
            : css`
                  width: auto; /* 기본값 auto로 변경하여 텍스트 길이에 맞춤 */
              `}

    /* 컬러 적용 */
    ${({ color }) => {
        const c = color ? colorMap[color] : defaultStyle;
        return css`
            color: ${c.text};
            border: 1px solid ${c.border};
            background: white;

            &:hover {
                background: ${c.hover};
                border-color: ${color === "gray" ? "#94a3b8" : c.border};
            }

            &:active {
                background: #e2e8f0;
            }
        `;
    }}

    /* Disabled 상태 */
    &:disabled {
        background: #f1f5f9 !important;
        border: 1px solid #e2e8f0 !important;
        color: #94a3b8 !important;
        cursor: not-allowed;
        transform: none !important;
    }
`;
