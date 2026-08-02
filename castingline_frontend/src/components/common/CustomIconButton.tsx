import React from "react";
import styled, { css } from "styled-components";
import { ui } from "../../styles/uiTokens";

type IconButtonColor = "blue" | "red" | "gray" | "green";

interface CustomIconButtonProps {
    children: React.ReactNode; // icon Props 대신 children 사용
    onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    color?: IconButtonColor;
    size?: number; // 아이콘 크기 제어용 (선택 사항)
    disabled?: boolean;
    title?: string;
    className?: string;
    style?: React.CSSProperties;
}

/** 1. 컬러 맵 정의 — 전부 uiTokens 기준.
    blue가 예전엔 별도의 파랑(#2b5797)이라 화면의 다른 파랑과 어긋나 있었습니다 → primary로 통일 **/
const colorMap = {
    blue: {
        hoverBorder: ui.color.primaryBorder,
        hoverColor: ui.color.primary,
        hoverBg: ui.color.primarySoft,
    },
    red: {
        hoverBorder: ui.color.danger,
        hoverColor: ui.color.danger,
        hoverBg: ui.color.dangerSoft,
    },
    gray: {
        hoverBorder: ui.color.textSubtle,
        hoverColor: ui.color.textStrong,
        hoverBg: ui.color.surfaceMuted,
    },
    green: {
        hoverBorder: ui.color.success,
        hoverColor: ui.color.success,
        hoverBg: ui.color.successSoft,
    },
};

/** 2. 스타일 정의 **/
const StyledButton = styled.button<{ $color: IconButtonColor; $btnSize: number }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: ${({ $btnSize }) => $btnSize + 14}px;
    height: ${({ $btnSize }) => $btnSize + 14}px;
    border: 1px solid ${ui.color.border};
    border-radius: ${ui.radius.md};
    background: ${ui.color.surface};
    cursor: pointer;
    color: ${ui.color.textMuted};
    transition: all 0.15s ease;
    padding: 0;
    outline: none;

    &:hover:not(:disabled) {
        ${({ $color }) => {
        const theme = colorMap[$color];
        return css`
                border-color: ${theme.hoverBorder};
                color: ${theme.hoverColor};
                background-color: ${theme.hoverBg};
            `;
    }}
    }

    &:active:not(:disabled) {
        transform: translateY(1px);
        background-color: ${ui.color.surfaceHover};
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        background-color: ${ui.color.surfaceHover};
    }

    /* 내부 아이콘 중앙 정렬 보정 */
    svg {
        display: block;
    }
`;

/** 3. 컴포넌트 본문 **/
export const CustomIconButton: React.FC<CustomIconButtonProps> = ({
    children,
    onClick,
    color = "gray",
    size = 18,
    disabled = false,
    title,
    className,
    style,
}) => {
    const renderedChildren = React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement, { size });
        }
        return child;
    });

    return (
        <StyledButton
            type="button"
            onClick={onClick}
            $color={color}
            $btnSize={size} // ✅ StyledButton에 아이콘 크기를 전달
            disabled={disabled}
            title={title}
            className={className}
            style={style}>
            {renderedChildren}
        </StyledButton>
    );
};