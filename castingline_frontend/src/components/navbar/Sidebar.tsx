import React, { useState } from "react";
import styled from "styled-components";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { 
    ChartBar, Calendar, Users, Buildings, FilmSlate, 
    ClipboardText, TrendUp, Coins, MapPin, Receipt,
    SealCheck, Bank, Percent, SignOut, UserCircle
} from "@phosphor-icons/react";
import { useRecoilValue, useResetRecoilState } from "recoil";
import { AccountState } from "../../atom/AccountState";
import { AxiosGet } from "../../axios/Axios";

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
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    font-size: 22px;
    font-weight: 900;
    color: #ffffff;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
`;

const FullLogo = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    animation: fadeIn 0.3s ease;

    @keyframes fadeIn {
        from { opacity: 0; transform: translateX(-10px); }
        to { opacity: 1; transform: translateX(0); }
    }

    .logo-icon-sm {
        background: #3b82f6;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        font-size: 18px;
        font-weight: 900;
        color: #ffffff;
    }

    .logo-text {
        display: flex;
        align-items: baseline;
        font-family: "SUIT", sans-serif;
        font-weight: 900;
        font-size: 18px;
        letter-spacing: -0.5px;
        
        .white { color: #f8fafc; }
        .blue { color: #3b82f6; margin-left: 1px; }
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

const NavItem = styled(NavLink)<{ $isExpanded: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 24px;
    color: #94a3b8;
    text-decoration: none;
    font-size: 13.5px;
    font-weight: 600;
    transition: all 0.2s ease;
    white-space: nowrap;

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

    &.active {
        background-color: #1e293b;
        color: #3b82f6;
        border-left: 4px solid #3b82f6;
        padding-left: 20px;
    }
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
    const nowAccount = useRecoilValue(AccountState);
    const resetAccount = useResetRecoilState(AccountState);
    const [isHovered, setIsHovered] = useState(false);

    const handleLogout = async () => {
        try {
            await AxiosGet("logout");
        } catch (e) {}
        resetAccount();
        localStorage.clear();
        navigate("/login");
    };

    return (
        <SidebarContainer 
            $isExpanded={isHovered}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <LogoWrapper $isExpanded={isHovered} onClick={() => navigate("/")}>
                {isHovered ? (
                    <FullLogo>
                        <div className="logo-icon-sm">C</div>
                        <div className="logo-text">
                            <span className="white">CASTING</span>
                            <span className="blue">LINE</span>
                        </div>
                    </FullLogo>
                ) : (
                    <CollapsedLogo>C</CollapsedLogo>
                )}
            </LogoWrapper>

            <NavSection>
                <NavGroup>
                    <GroupTitle $isExpanded={isHovered}>{t("DASHBOARD")}</GroupTitle>
                    <NavItem to="/score" $isExpanded={isHovered} title={t("스코어 현황")}>
                        <ChartBar size={24} /> 
                        <span className="label">{t("스코어 현황")}</span>
                    </NavItem>
                    <NavItem to="/time_table" $isExpanded={isHovered} title={t("시간표 조회")}>
                        <Calendar size={24} /> 
                        <span className="label">{t("시간표 조회")}</span>
                    </NavItem>
                </NavGroup>

                <NavGroup>
                    <GroupTitle $isExpanded={isHovered}>{t("CORE INFO")}</GroupTitle>
                    <NavItem to="/manage/manage_user" $isExpanded={isHovered} title={t("사용자 관리")}>
                        <Users size={24} /> 
                        <span className="label">{t("사용자 관리")}</span>
                    </NavItem>
                    <NavItem to="/manage/manage_client" $isExpanded={isHovered} title={t("거래처 관리")}>
                        <Buildings size={24} /> 
                        <span className="label">{t("거래처 관리")}</span>
                    </NavItem>
                    <NavItem to="/manage/manage_movie" $isExpanded={isHovered} title={t("영화 관리")}>
                        <FilmSlate size={24} /> 
                        <span className="label">{t("영화 관리")}</span>
                    </NavItem>
                    <NavItem to="/manage/manage_theater_map" $isExpanded={isHovered} title={t("극장명 매핑")}>
                        <MapPin size={24} /> 
                        <span className="label">{t("극장명 매핑")}</span>
                    </NavItem>
                </NavGroup>

                <NavGroup>
                    <GroupTitle $isExpanded={isHovered}>{t("OPERATIONS")}</GroupTitle>
                    <NavItem to="/manage/manage_order" $isExpanded={isHovered} title={t("오더 관리")}>
                        <ClipboardText size={24} /> 
                        <span className="label">{t("오더 관리")}</span>
                    </NavItem>
                    <NavItem to="/manage/manage_score" $isExpanded={isHovered} title={t("스코어 관리")}>
                        <TrendUp size={24} /> 
                        <span className="label">{t("스코어 관리")}</span>
                    </NavItem>
                    <NavItem to="/manage/manage_fund" $isExpanded={isHovered} title={t("기금 관리")}>
                        <Bank size={24} /> 
                        <span className="label">{t("기금 관리")}</span>
                    </NavItem>
                </NavGroup>

                <NavGroup>
                    <GroupTitle $isExpanded={isHovered}>{t("SETTLEMENT")}</GroupTitle>
                    <NavItem to="/manage/manage_rate" $isExpanded={isHovered} title={t("부율 관리")}>
                        <Percent size={24} /> 
                        <span className="label">{t("부율 관리")}</span>
                    </NavItem>
                    <NavItem to="/manage/manage_settlement" $isExpanded={isHovered} title={t("부금 정산")}>
                        <Receipt size={24} /> 
                        <span className="label">{t("부금 정산")}</span>
                    </NavItem>
                    <NavItem to="/manage/manage_special_settlement" $isExpanded={isHovered} title={t("지정 부금")}>
                        <SealCheck size={24} /> 
                        <span className="label">{t("지정 부금")}</span>
                    </NavItem>
                </NavGroup>
            </NavSection>

            <UserSection $isExpanded={isHovered}>
                <UserCircle size={32} weight="duotone" color="#3b82f6" style={{ minWidth: "32px" }} />
                <UserInfo $isExpanded={isHovered} onClick={() => navigate("/manage/my_profile")}>
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
