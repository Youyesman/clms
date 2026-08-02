import styled, { css } from "styled-components";
import { motion } from "framer-motion";
import { ui } from "../../styles/uiTokens";

type Size = "xs" | "sm" | "md" | "lg";
type Color = "blue" | "red" | "gray";

/* 1. 컬러 시스템 — 전부 uiTokens 기준.
   blue가 예전엔 별도의 파랑(#2b5797)이라 화면의 다른 파랑과 어긋나 있었습니다 → primary로 통일 */
const defaultStyle = {
    text: ui.color.text,
    border: ui.color.borderStrong,
    hover: ui.color.surfaceHover,
};

const colorMap = {
    blue: {
        text: ui.color.primary,
        border: ui.color.primary,
        hover: ui.color.primarySoft,
    },
    red: {
        text: ui.color.danger,
        border: ui.color.danger,
        hover: ui.color.dangerSoft,
    },
    gray: {
        text: ui.color.textMutedStrong,
        border: ui.color.borderStrong,
        hover: ui.color.surfaceMuted,
    },
};

/* 2. 사이즈 시스템 — 높이는 uiTokens.control, 반경은 uiTokens.radius */
const sizeStyles = {
    xs: css`
        height: ${ui.control.xs}px; /* 초소형 (유틸리티용) */
        padding: 0 8px;
        font-size: ${ui.font.size.xs};
        font-weight: ${ui.font.weight.semibold};
        border-radius: ${ui.radius.sm};
        gap: 4px;
    `,
    sm: css`
        height: ${ui.control.sm}px; /* 👈 관리자 표준 (Input/Select와 동일 규격) */
        padding: 0 12px;
        font-size: ${ui.font.size.sm};
        font-weight: ${ui.font.weight.semibold};
        border-radius: ${ui.radius.md};
        gap: 6px;
    `,
    md: css`
        height: ${ui.control.md}px; /* 일반 강조형 */
        padding: 0 16px;
        font-size: ${ui.font.size.lg};
        font-weight: ${ui.font.weight.semibold};
        border-radius: ${ui.radius.md};
        gap: 8px;
    `,
    lg: css`
        height: 46px; /* 대형 (로그인 등 메인 액션) */
        padding: 0 20px;
        font-size: ${ui.font.size.xl};
        font-weight: ${ui.font.weight.bold};
        border-radius: ${ui.radius.lg};
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
    font-family: ${ui.font.family};
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
            background: ${ui.color.surface};

            &:hover {
                background: ${c.hover};
                border-color: ${color === "gray" ? ui.color.textSubtle : c.border};
            }

            &:active {
                background: ${ui.color.border};
            }
        `;
    }}

    /* Disabled 상태 */
    &:disabled {
        background: ${ui.color.surfaceHover} !important;
        border: 1px solid ${ui.color.border} !important;
        color: ${ui.color.textSubtle} !important;
        cursor: not-allowed;
        transform: none !important;
    }
`;
