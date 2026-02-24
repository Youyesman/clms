import React, { useState } from "react";
import styled from "styled-components";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    ChartBar, Calendar, Users, Buildings, FilmSlate,
    ClipboardText, TrendUp, Coins, MapPin, Receipt,
    SealCheck, Bank, Percent, SignOut, UserCircle, Bug
} from "@phosphor-icons/react";
import { useRecoilValue, useRecoilState, useResetRecoilState } from "recoil";
import { AccountState } from "../../atom/AccountState";
import { AxiosGet } from "../../axios/Axios";
import { OpenTabsState, ActiveTabIdState, PATH_TO_TAB_LABEL, Tab } from "../../atom/TabState";
import LogoImg from "../../assets/img/logo/logo.png";
import LogoVerticalImg from "../../assets/img/logo/logo_vertical.png";

const SidebarContainer = styled.aside<{ $isExpanded: boolean }>`
    width: ${({ $isExpanded }) => ($isExpanded ? "220px" : "72px")};
    height: 100vh;
    background-color: #0f172a;
    color: #f8fafc;
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1001;
    border-right: 1px solid #1e293b;
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
`;

const LogoWrapper = styled.div<{ $isExpanded: boolean }>`
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: ${({ $isExpanded }) => ($isExpanded ? "flex-start" : "center")};
    padding: 0 ${({ $isExpanded }) => ($isExpanded ? "18px" : "0")};
    border-bottom: 1px solid #1e293b;
    white-space: nowrap;
    overflow: hidden;
    cursor: pointer;
`;

const CollapsedLogo = styled.div`
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;

    img {
        width: 36px;
        height: 36px;
        object-fit: contain;
        border-radius: 6px;
    }
`;

const FullLogo = styled.div`
    display: flex;
    align-items: center;
    animation: fadeIn 0.3s ease;
    overflow: hidden;
    height: 48px;

    @keyframes fadeIn {
        from { opacity: 0; transform: translateX(-10px); }
        to { opacity: 1; transform: translateX(0); }
    }

    img {
        height: 140px;
        object-fit: contain;
        filter: brightness(0) invert(1);
        margin: -46px 0;
    }
`;

const NavSection = styled.nav`
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 20px 0;
    
    &::-webkit-scrollbar { width: 0px; }
`;

const NavGroup = styled.div`
    margin-bottom: 24px;
`;

const GroupTitle = styled.div<{ $isExpanded: boolean }>`
    padding: 0 24px;
    margin-bottom: 10px;
    font-size: 10px;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    opacity: ${({ $isExpanded }) => ($isExpanded ? 1 : 0)};
    transition: opacity 0.2s ease;
    white-space: nowrap;
`;

const NavItem = styled.div<{ $isExpanded: boolean; $isActive: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 24px;
    color: ${({ $isActive }) => ($isActive ? "#3b82f6" : "#94a3b8")};
    text-decoration: none;
    font-size: 13.5px;
    font-weight: 600;
    transition: all 0.2s ease;
    white-space: nowrap;
    cursor: pointer;

    svg {
        min-width: 24px;
        flex-shrink: 0;
    }

    .label {
        opacity: ${({ $isExpanded }) => ($isExpanded ? 1 : 0)};
        transition: opacity 0.2s ease;
    }

    &:hover {
        background-color: #1e293b;
        color: #f8fafc;
    }

    ${({ $isActive }) =>
        $isActive &&
        `
        background-color: #1e293b;
        border-left: 4px solid #3b82f6;
        padding-left: 20px;
    `}
`;

const UserSection = styled.div<{ $isExpanded: boolean }>`
    padding: 16px 20px;
    border-top: 1px solid #1e293b;
    background-color: #1e293b;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 72px;
    overflow: hidden;
`;

const UserInfo = styled.div<{ $isExpanded: boolean }>`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    cursor: pointer;
    opacity: ${({ $isExpanded }) => ($isExpanded ? 1 : 0)};
    transition: opacity 0.2s ease;
    .name {
        font-size: 13.5px;
        font-weight: 700;
        color: #f8fafc;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .role {
        font-size: 10px;
        color: #64748b;
    }
`;

const LogoutButton = styled.button<{ $isExpanded: boolean }>`
    background: none;
    border: none;
    color: #64748b;
    cursor: pointer;
    display: ${({ $isExpanded }) => ($isExpanded ? "flex" : "none")};
    align-items: center;
    padding: 4px;
    border-radius: 4px;
    &:hover {
        background-color: #334155;
        color: #ef4444;
    }
`;

export function Sidebar() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const nowAccount = useRecoilValue(AccountState);
    const resetAccount = useResetRecoilState(AccountState);
    const [isHovered, setIsHovered] = useState(false);

    const [openTabs, setOpenTabs] = useRecoilState(OpenTabsState);
    const [activeTabId, setActiveTabId] = useRecoilState(ActiveTabIdState);

    const handleLogout = async () => {
        try {
            await AxiosGet("logout");
        } catch (e) { }
        resetAccount();
        setOpenTabs([]); // 탭 초기화
        setActiveTabId(null);
        localStorage.clear();
        navigate("/login");
    };

    /** 사이드바 메뉴 클릭 → 탭 추가 + 활성화 + navigate */
    const handleNavClick = (path: string) => {
        const label = PATH_TO_TAB_LABEL[path] || path;
        const tabId = path;

        // 이미 열려있지 않으면 탭 추가
        const exists = openTabs.find((t) => t.id === tabId);
        if (!exists) {
            const newTab: Tab = {
                id: tabId,
                label,
                path,
                closable: true,
            };
            setOpenTabs((prev) => [...prev, newTab]);
        }

        // 활성 탭 설정 + 라우팅
        setActiveTabId(tabId);
        navigate(path);
    };

    const isActive = (path: string) => location.pathname === path;

    return (
        <SidebarContainer
            $isExpanded={isHovered}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <LogoWrapper $isExpanded={isHovered} onClick={() => navigate("/manage")}>
                {isHovered ? (
                    <FullLogo>
                        <img src={LogoVerticalImg} alt="Castingline" />
                    </FullLogo>
                ) : (
                    <CollapsedLogo>
                        <img src={LogoImg} alt="C" />
                    </CollapsedLogo>
                )}
            </LogoWrapper>

            <NavSection>
                <NavGroup>
                    <GroupTitle $isExpanded={isHovered}>{t("DASHBOARD")}</GroupTitle>
                    <NavItem
                        $isExpanded={isHovered}
                        $isActive={isActive("/manage/score")}
                        onClick={() => handleNavClick("/manage/score")}
                        title={t("스코어 현황")}
                    >
                        <ChartBar size={24} />
                        <span className="label">{t("스코어 현황")}</span>
                    </NavItem>
                    <NavItem
                        $isExpanded={isHovered}
                        $isActive={isActive("/manage/time_table")}
                        onClick={() => handleNavClick("/manage/time_table")}
                        title={t("시간표 조회")}
                    >
                        <Calendar size={24} />
                        <span className="label">{t("시간표 조회")}</span>
                    </NavItem>
                </NavGroup>

                <NavGroup>
                    <GroupTitle $isExpanded={isHovered}>{t("CORE INFO")}</GroupTitle>
                    <NavItem
                        $isExpanded={isHovered}
                        $isActive={isActive("/manage/manage_user")}
                        onClick={() => handleNavClick("/manage/manage_user")}
                        title={t("사용자 관리")}
                    >
                        <Users size={24} />
                        <span className="label">{t("사용자 관리")}</span>
                    </NavItem>
                    <NavItem
                        $isExpanded={isHovered}
                        $isActive={isActive("/manage/manage_client")}
                        onClick={() => handleNavClick("/manage/manage_client")}
                        title={t("거래처 관리")}
                    >
                        <Buildings size={24} />
                        <span className="label">{t("거래처 관리")}</span>
                    </NavItem>
                    <NavItem
                        $isExpanded={isHovered}
                        $isActive={isActive("/manage/manage_movie")}
                        onClick={() => handleNavClick("/manage/manage_movie")}
                        title={t("영화 관리")}
                    >
                        <FilmSlate size={24} />
                        <span className="label">{t("영화 관리")}</span>
                    </NavItem>
                    <NavItem
                        $isExpanded={isHovered}
                        $isActive={isActive("/manage/manage_theater_map")}
                        onClick={() => handleNavClick("/manage/manage_theater_map")}
                        title={t("극장명 매핑")}
                    >
                        <MapPin size={24} />
                        <span className="label">{t("극장명 매핑")}</span>
                    </NavItem>
                    <NavItem
                        $isExpanded={isHovered}
                        $isActive={isActive("/manage/crawler")}
                        onClick={() => handleNavClick("/manage/crawler")}
                        title={t("크롤러 관리")}
                    >
                        <Bug size={24} />
                        <span className="label">{t("크롤러 관리")}</span>
                    </NavItem>
                </NavGroup>

                <NavGroup>
                    <GroupTitle $isExpanded={isHovered}>{t("OPERATIONS")}</GroupTitle>
                    <NavItem
                        $isExpanded={isHovered}
                        $isActive={isActive("/manage/manage_order")}
                        onClick={() => handleNavClick("/manage/manage_order")}
                        title={t("오더 관리")}
                    >
                        <ClipboardText size={24} />
                        <span className="label">{t("오더 관리")}</span>
                    </NavItem>
                    <NavItem
                        $isExpanded={isHovered}
                        $isActive={isActive("/manage/manage_score")}
                        onClick={() => handleNavClick("/manage/manage_score")}
                        title={t("스코어 관리")}
                    >
                        <TrendUp size={24} />
                        <span className="label">{t("스코어 관리")}</span>
                    </NavItem>
                    <NavItem
                        $isExpanded={isHovered}
                        $isActive={isActive("/manage/manage_fund")}
                        onClick={() => handleNavClick("/manage/manage_fund")}
                        title={t("기금 관리")}
                    >
                        <Bank size={24} />
                        <span className="label">{t("기금 관리")}</span>
                    </NavItem>
                </NavGroup>

                <NavGroup>
                    <GroupTitle $isExpanded={isHovered}>{t("SETTLEMENT")}</GroupTitle>
                    <NavItem
                        $isExpanded={isHovered}
                        $isActive={isActive("/manage/manage_rate")}
                        onClick={() => handleNavClick("/manage/manage_rate")}
                        title={t("부율 관리")}
                    >
                        <Percent size={24} />
                        <span className="label">{t("부율 관리")}</span>
                    </NavItem>
                    <NavItem
                        $isExpanded={isHovered}
                        $isActive={isActive("/manage/manage_settlement")}
                        onClick={() => handleNavClick("/manage/manage_settlement")}
                        title={t("부금 정산")}
                    >
                        <Receipt size={24} />
                        <span className="label">{t("부금 정산")}</span>
                    </NavItem>
                    <NavItem
                        $isExpanded={isHovered}
                        $isActive={isActive("/manage/manage_special_settlement")}
                        onClick={() => handleNavClick("/manage/manage_special_settlement")}
                        title={t("지정 부금")}
                    >
                        <SealCheck size={24} />
                        <span className="label">{t("지정 부금")}</span>
                    </NavItem>
                </NavGroup>
            </NavSection>

            <UserSection $isExpanded={isHovered}>
                <UserCircle size={32} weight="duotone" color="#3b82f6" style={{ minWidth: "32px" }} />
                <UserInfo $isExpanded={isHovered} onClick={() => handleNavClick("/manage/my_profile")}>
                    <div className="name">{nowAccount?.username || "Guest"}</div>
                    <div className="role">{nowAccount?.is_superuser ? "Administrator" : "Staff"}</div>
                </UserInfo>
                <LogoutButton $isExpanded={isHovered} onClick={handleLogout} title="Logout">
                    <SignOut size={20} weight="bold" />
                </LogoutButton>
            </UserSection>
        </SidebarContainer>
    );
}
