import { useState } from "react";
import styled, { css } from "styled-components";
import { useRecoilValue } from "recoil";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CaretDown } from "@phosphor-icons/react";
import { AccountState } from "../../atom/AccountState";
import UserInform from "./UserInform";

/** 1. 전체 컨테이너 **/
const TopbarContainer = styled.header`
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1000;
    width: 100%;
    height: 60px; /* 60px에서 약간 축소하여 더 콤팩트하게 */
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    background-color: #ffffff;
    border-bottom: 1px solid #e2e8f0; /* Slate 200 */
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
`;

const LeftSection = styled.div`
    display: flex;
    align-items: center;
    gap: 32px;
`;

const LogoWrap = styled.div`
    cursor: pointer;
    font-weight: 900;
    font-size: 20px;
    color: #0f172a; /* Slate 900 */
    letter-spacing: -0.5px;
    display: flex;
    align-items: center;

    img {
        height: 32px;
    }
`;

/** 2. 내비게이션 스타일 **/
const NavWrapper = styled.nav`
    display: flex;
    align-items: center;
    gap: 4px;
`;

/* 공통 메뉴 아이템 스타일 */
const navItemStyle = css`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    font-family: "Pretendard", sans-serif;
    font-size: 14.5px;
    font-weight: 600;
    color: #475569; /* Slate 600 */
    text-decoration: none;
    border-radius: 6px;
    transition: all 0.2s ease;
    cursor: pointer;

    &:hover {
        background-color: #f1f5f9; /* Slate 100 */
        color: #0f172a;
    }

    &.active {
        color: #2b5797; /* 브랜드 포인트 컬러 */
        background-color: #f0f5ff;
    }
`;

const NavItem = styled(NavLink)`
    ${navItemStyle}
`;

const DropdownTrigger = styled.div`
    ${navItemStyle}
    position: relative;

    &:hover {
        .dropdown-menu {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }
        svg {
            transform: rotate(180deg);
        }
    }
`;

/** 3. 드롭다운 메뉴 스타일 **/
const DropdownMenu = styled.div`
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 180px;
    background-color: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    padding: 6px;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-8px);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 1001;
`;

const DropdownLink = styled(NavLink)`
    display: block;
    padding: 8px 12px;
    font-size: 13.5px;
    font-weight: 500;
    color: #334155;
    text-decoration: none;
    border-radius: 4px;
    transition: background 0.15s;

    &:hover {
        background-color: #f8fafc;
        color: #0f172a;
        font-weight: 600;
    }

    &.active {
        background-color: #f1f5f9;
        color: #2b5797;
        font-weight: 700;
    }
`;

const CaretIcon = styled(CaretDown)`
    transition: transform 0.2s ease;
    color: #94a3b8;
`;

function CustomerTopbar() {
    const { t } = useTranslation();
    const nowAccount = useRecoilValue(AccountState);

    return (
        <TopbarContainer>
            <LeftSection>
                <LogoWrap onClick={() => (window.location.href = "/")}>
                    {/* 로고 이미지가 있다면 여기에 배치 */}
                    CASTINGLINE
                </LogoWrap>

                <NavWrapper>
                    <NavItem to="/score">{t("스코어")}</NavItem>

                    <NavItem to="/time_table">{t("시간표")}</NavItem>

                    <NavItem to="/localservice">{t("부금관리")}</NavItem>
                </NavWrapper>
            </LeftSection>

            <UserInform />
        </TopbarContainer>
    );
}

export default CustomerTopbar;
