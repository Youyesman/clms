import React from "react";
import styled, { css } from "styled-components";

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

/** 1. 컬러 맵 정의 (Slate 기반 테마) **/
const colorMap = {
    blue: {
        border: "#cbd5e1",
        hoverBorder: "#2b5797",
        hoverColor: "#2b5797",
        hoverBg: "#f1f8fc",
    },
    red: {
        border: "#cbd5e1",
        hoverBorder: "#ef4444",
        hoverColor: "#ef4444",
        hoverBg: "#fef2f2",
    },
    gray: {
        border: "#cbd5e1",
        hoverBorder: "#94a3b8",
        hoverColor: "#0f172a",
        hoverBg: "#f8fafc",
    },
    green: {
        border: "#cbd5e1",
        hoverBorder: "#22c55e",
        hoverColor: "#22c55e",
        hoverBg: "#f0fdf4",
    },
};

/** 2. 스타일 정의 **/
const StyledButton = styled.button<{ $color: IconButtonColor; $btnSize: number }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: ${({ $btnSize }) => $btnSize + 14}px; 
    height: ${({ $btnSize }) => $btnSize + 14}px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    color: #64748b;
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
        background-color: #f1f5f9;
    }

    &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
        background-color: #f1f5f9;
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