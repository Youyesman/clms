import React from "react";
import styled from "styled-components";
import { ui } from "../../styles/uiTokens";

/** 1. 스타일 정의 **/
const HeaderContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    background-color: ${ui.color.surface};
    border-bottom: 1px solid ${ui.color.border};
    height: 42px;
    flex-shrink: 0;
    position: relative;
`;

const TitleWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const TitleText = styled.h2`
    font-size: ${ui.font.size.lg};
    font-weight: ${ui.font.weight.bold};
    color: ${ui.color.textStrong};
    margin: 0;
    letter-spacing: -0.02em;
    font-family: ${ui.font.family};
`;

const SubtitleText = styled.span`
    font-size: ${ui.font.size.sm};
    font-weight: ${ui.font.weight.medium};
    color: ${ui.color.textMuted};
    padding-left: 10px;
    margin-left: 2px;
    border-left: 1px solid ${ui.color.border};
`;

const ActionGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;

    /* 헤더 내 버튼들의 크기와 스타일을 슬림 화이트에 맞춰 조정 */
    button {
        width: ${ui.control.xs}px !important;
        height: ${ui.control.xs}px !important;
        min-width: ${ui.control.xs}px !important;
        padding: 0 !important;
        background-color: ${ui.color.surface} !important;
        border: 1px solid ${ui.color.border} !important;
        border-radius: ${ui.radius.sm} !important;
        color: ${ui.color.textMuted} !important;
        transition: all 0.15s ease !important;

        svg {
            width: 14px !important;
            height: 14px !important;
        }

        &:hover:not(:disabled) {
            background-color: ${ui.color.primarySoft} !important;
            border-color: ${ui.color.primaryBorder} !important;
            color: ${ui.color.primary} !important;
        }

        &:disabled {
            opacity: 0.4 !important;
            background-color: ${ui.color.surfaceHover} !important;
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
