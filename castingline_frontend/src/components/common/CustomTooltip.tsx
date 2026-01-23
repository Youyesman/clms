import styled from "styled-components";
import { InfoIcon } from "@phosphor-icons/react";

const TooltipWrapper = styled.div`
    position: relative;
    display: inline-flex;
`;

const TooltipBox = styled.div`
    position: absolute;
    top: 28px;
    right: 0;
    z-index: 10;

    padding: 12px 16px;
    background: var(--White-white, #fff);
    box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.15);
    border-radius: 8px;
    outline: 1px solid var(--Gray-300, #d5d7da);
    outline-offset: -1px;

    display: none;
    flex-direction: column;
    gap: 4px;
    width: max-content;
`;

const TooltipItem = styled.div<{ $width?: number | string }>`
    width: ${({ $width }) => (typeof $width === "number" ? `${$width}px` : $width || "160px")};
    color: var(--Gray-800, #252b37);
    font-size: 12px;
    font-weight: 500;
    line-height: 18.96px;
`;

const IconBox = styled.div`
    display: inline-flex;
    cursor: pointer;

    &:hover ${TooltipBox} {
        display: flex;
    }
`;

type Props = {
    items: string[];
    iconSize?: number;
    width?: number | string;
};

export function CustomTooltip({ items, iconSize = 20, width }: Props) {
    return (
        <TooltipWrapper>
            <IconBox>
                <InfoIcon weight="fill" color="rgba(0,0,0,0.15)" size={iconSize} />
                <TooltipBox>
                    {items.map((text, idx) => (
                        <TooltipItem key={idx} $width={width}>
                            {text}
                        </TooltipItem>
                    ))}
                </TooltipBox>
            </IconBox>
        </TooltipWrapper>
    );
}
