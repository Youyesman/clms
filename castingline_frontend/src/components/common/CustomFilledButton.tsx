import styled, { css } from "styled-components";
import { motion } from "framer-motion";

export const CustomFilledButton = styled(motion.button).withConfig({
    shouldForwardProp: (prop) => !["size", "color", "width", "dot"].includes(prop),
}).attrs({
    whileHover: { scale: 1.05 },
    whileTap: { scale: 0.95 },
})<{
    size?: "sm" | "md" | "lg";
    color?: "default" | "blue" | "red" | "gray";
    width?: string | number;
    dot?: boolean;
}>`
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    white-space: nowrap;
    flex-shrink: 0;
    border: none;
    cursor: pointer;
    transition: background 0.2s ease;
    font-family: SUIT;
    font-weight: 700;

    ${({ size = "md" }) => {
        const sizes: any = {
            sm: css`
                height: 36px;
                padding: 4px 16px;
                font-size: 14px;
                line-height: 22.12px;
                letter-spacing: 0.14px;
                border-radius: 4px;
                gap: 8px;
            `,
            md: css`
                height: 44px;
                padding: 10px 16px;
                font-size: 16px;
                line-height: 25.28px;
                letter-spacing: 0.16px;
                border-radius: 4px;
                gap: 8px;
            `,
            lg: css`
                height: 56px;
                padding: 10px 16px;
                font-size: 20px;
                line-height: 31.6px;
                letter-spacing: 0.2px;
                border-radius: 6px;
                gap: 8px;
            `,
        };
        return sizes[size];
    }}

    ${({ width }) =>
        width
            ? css`
                  width: ${typeof width === "number" ? `${width}px` : width};
              `
            : css`
                  width: auto;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
              `}


    ${({ color = "default" }) => {
        const colors: any = {
            default: css`
                background: var(--Gray-800, #252b37);
                color: var(--White-white, #fff);
                &:hover {
                    background: var(--Gray-700, #1f242f);
                }
            `,
            blue: css`
                background: var(--FEG-Dark-50, #379bc8);
                color: var(--White-white, #fff);
                &:hover {
                    background: var(--FEG-Dark-100, #318bb4);
                }
            `,
            red: css`
                background: var(--Red-600, #e11900);
                color: var(--White-white, #fff);
                &:hover {
                    background: var(--Red-700, #c81600);
                }
            `,
            gray: css`
                background: var(--Gray-200);
                color: var(--Gray-800, #fff);
                &:hover {
                    background: #c2c4c8;
                }
            `,
        };
        return colors[color];
    }}

    ${({ dot }) =>
        dot &&
        css`
            &::after {
                content: "";
                position: absolute;
                top: 4px;
                right: 4px;
                width: 8px;
                height: 8px;
                background: red;
                border-radius: 50%;
            }
        `}

    &:disabled {
        background: var(--Gray-200) !important;
        color: var(--Gray-400) !important;
        cursor: not-allowed;
        pointer-events: none;
    }
`;
