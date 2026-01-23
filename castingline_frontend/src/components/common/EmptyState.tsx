import React from "react";
import styled from "styled-components";
import EmptyImg from "../../assets/img/common/empty.svg";

const EmptyStateContainer = styled.div<{ height?: string }>`
    width: 100%;
    min-height: ${({ height }) => height || "100vh"};
    padding-left: 10px;
    padding-right: 10px;
    background: var(--Gray-100, #f5f5f5);
    outline: 1px var(--Gray-200, #e9eaeb) solid;
    outline-offset: -1px;

    display: flex;
    flex-direction: column;
    justify-content: center; // ✅ 세로 중앙
    align-items: center; // ✅ 가로 중앙
    gap: 32px;
`;

const EmptyMessage = styled.div`
    text-align: center;
    color: var(--Gray-400, #a4a7ae);
    font-size: 20px;
    font-family: SUIT;
    font-weight: 500;
    line-height: 31.6px;
    letter-spacing: 0.2px;
`;

export const EmptyState = ({ children, height }: { children?: React.ReactNode; height?: string }) => {
    return (
        <EmptyStateContainer height={height}>
            <img src={EmptyImg} alt="empty" />
            {children && <EmptyMessage>{children}</EmptyMessage>}
        </EmptyStateContainer>
    );
};
