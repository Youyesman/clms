import React from "react";
import styled from "styled-components";

export const CustomTab = ({ label, active, onClick }: any) => {
    return (
        <TabContainer onClick={onClick} active={active}>
            <TabLabel active={active}>{label}</TabLabel>
        </TabContainer>
    );
};

const TabContainer = styled.div<any>`
    width: 100%;
    height: 100%;
    padding: 16px;
    padding-bottom: 14px;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    display: flex;
    justify-content: center;
    align-items: center;

    background: ${({ active }) => (active ? "var(--White-white, white)" : "#E2E2E5")};

    border-top: ${({ active }) => (active ? "4px solid var(--Gray-800, #252B37)" : "4px solid transparent")};

    transition: background 0.25s ease, border-top 0.25s ease;
    cursor: pointer;
`;

const TabLabel = styled.span<any>`
    font-size: 16px;
    font-family: SUIT;
    font-weight: 700;
    line-height: 25.28px;
    letter-spacing: 0.16px;

    color: ${({ active }) => (active ? "var(--Gray-800, #252B37)" : "var(--Gray-500, #717680)")};

    transition: color 0.25s ease;
`;
