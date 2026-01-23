import React from "react";
import styled from "styled-components";

/** 1. 스타일 정의 **/
const HeaderContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    background-color: #ffffff; /* 깔끔한 화이트 배경 */
    border-bottom: 2px solid #f1f5f9; /* 연한 구분선 */
    height: 38px; /* 초슬림 높이 유지 */
    flex-shrink: 0;
    position: relative;

    /* 왼쪽에 더 날렵하고 세련된 포인트 라인 */
    &::before {
        content: "";
        position: absolute;
        left: 0;
        top: 20%;
        bottom: 20%;
        width: 3px;
        background: linear-gradient(to bottom, #3b82f6, #2563eb);
        border-radius: 0 2px 2px 0;
        box-shadow: 0 0 6px rgba(59, 130, 246, 0.2);
    }
`;

const TitleWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: 4px;
`;

const TitleText = styled.h2`
    font-size: 13.5px;
    font-weight: 800;
    color: #0f172a; /* Slate 900 */
    margin: 0;
    letter-spacing: -0.03em;
    font-family: "SUIT", sans-serif;
`;

const SubtitleText = styled.span`
    font-size: 11.5px;
    font-weight: 500;
    color: #64748b; /* Slate 500 */
    padding-left: 10px;
    margin-left: 2px;
    border-left: 1px solid #e2e8f0;
`;

const ActionGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;

    /* 헤더 내 버튼들의 크기와 스타일을 슬림 화이트에 맞춰 조정 */
    button {
        width: 26px !important;
        height: 26px !important;
        min-width: 26px !important;
        padding: 0 !important;
        background-color: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 4px !important;
        color: #64748b !important;
        transition: all 0.2s ease !important;

        svg {
            width: 14px !important;
            height: 14px !important;
        }

        &:hover:not(:disabled) {
            background-color: #f8fafc !important;
            border-color: #3b82f6 !important;
            color: #2563eb !important;
        }

        &:disabled {
            opacity: 0.3 !important;
            background-color: #f1f5f9 !important;
        }
    }
`;

/** 2. 컴포넌트 인터페이스 **/
interface CommonListHeaderProps {
    title: string;
    subtitle?: string | React.ReactNode;
    actions?: React.ReactNode;
}

/** 3. 메인 컴포넌트 **/
export const CommonListHeader: React.FC<CommonListHeaderProps> = ({ title, subtitle, actions }) => {
    return (
        <HeaderContainer>
            <TitleWrapper>
                <TitleText>{title}</TitleText>
                {subtitle && <SubtitleText>{subtitle}</SubtitleText>}
            </TitleWrapper>
            {actions && <ActionGroup>{actions}</ActionGroup>}
        </HeaderContainer>
    );
};
