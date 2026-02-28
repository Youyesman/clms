import React, { useState } from "react";
import styled from "styled-components";
import { useNavigate, useLocation } from "react-router-dom";
import {
    ChartBar, Calendar, Users, Buildings, FilmSlate,
    ClipboardText, TrendUp, MapPin, Receipt,
    SealCheck, Bank, Percent, SignOut, UserCircle, Bug, Table,
    CurrencyDollar,
} from "@phosphor-icons/react";
import { useRecoilValue, useRecoilState, useResetRecoilState } from "recoil";
import { AccountState } from "../../atom/AccountState";
import { AxiosGet } from "../../axios/Axios";
import { OpenTabsState, ActiveTabIdState, PATH_TO_TAB_LABEL, Tab } from "../../atom/TabState";
import LogoIconImg from "../../assets/img/logo/logo-icon-white.png";
import LogoHorizontalImg from "../../assets/img/logo/logo-horizontal-white.png";

/* ================================================================
   상수
   ================================================================ */
const COLLAPSED = 56;
const EXPANDED = 200;

/** 레이아웃(App, Topbar, TabBar)이 참조하는 너비 */
export const SIDEBAR_WIDTH = COLLAPSED;

/* ================================================================
   메뉴 데이터
   ================================================================ */
interface NavMenuItem {
    path: string;
    label: string;
    icon: React.ReactNode;
}
interface NavMenuGroup {
    title: string;
    items: NavMenuItem[];
}

const MENU: NavMenuGroup[] = [
    {
        title: "대시보드",
        items: [
            { path: "/manage", label: "대시보드", icon: <ChartBar /> },
        ],
    },
    {
        title: "기준 정보",
        items: [
            { path: "/manage/manage_user", label: "사용자 관리", icon: <Users /> },
            { path: "/manage/manage_client", label: "거래처 관리", icon: <Buildings /> },
            { path: "/manage/manage_movie", label: "영화 관리", icon: <FilmSlate /> },
            { path: "/manage/manage_theater_map", label: "극장명 매핑", icon: <MapPin /> },
            { path: "/manage/crawler", label: "크롤러 관리", icon: <Bug /> },
            { path: "/manage/crawler/schedules", label: "시간표 수집", icon: <Table /> },
        ],
    },
    {
        title: "운영",
        items: [
            { path: "/manage/manage_order", label: "오더 관리", icon: <ClipboardText /> },
            { path: "/manage/manage_score", label: "스코어 관리", icon: <TrendUp /> },
            { path: "/manage/manage_fund", label: "기금 관리", icon: <Bank /> },
        ],
    },
    {
        title: "정산",
        items: [
            { path: "/manage/manage_rate", label: "부율 관리", icon: <Percent /> },
            { path: "/manage/manage_settlement", label: "부금 정산", icon: <Receipt /> },
            { path: "/manage/manage_special_settlement", label: "지정 부금", icon: <SealCheck /> },
        ],
    },
    {
        title: "배급사 뷰",
        items: [
            { path: "/manage/score", label: "스코어 현황", icon: <ChartBar /> },
            { path: "/manage/settlement/detail", label: "정산 조회", icon: <CurrencyDollar /> },
            { path: "/manage/time_table", label: "시간표 조회", icon: <Calendar /> },
        ],
    },
];

/* ================================================================
   스타일
   ================================================================ */
const Wrapper = styled.aside<{ $open: boolean }>`
    width: ${({ $open }) => ($open ? EXPANDED : COLLAPSED)}px;
    height: 100vh;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1001;
    display: flex;
    flex-direction: column;
    background: #0f172a;
    border-right: 1px solid #1e293b;
    overflow: hidden;
    transition: width 0.2s ease;
`;

/* ── 로고 ── */
const Logo = styled.div<{ $open: boolean }>`
    height: 60px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0;
    justify-content: center;
    border-bottom: 1px solid #1e293b;
    cursor: pointer;
    flex-shrink: 0;

    .logo-icon {
        width: 26px; height: 26px; border-radius: 4px;
        display: ${({ $open }) => ($open ? "none" : "block")};
    }
    .logo-horizontal {
        height: 28px;
        width: auto;
        display: ${({ $open }) => ($open ? "block" : "none")};
    }
`;

/* ── 메뉴 영역 ── */
const Nav = styled.nav`
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    &::-webkit-scrollbar { width: 0; }
`;

const Group = styled.div`
    & + & { margin-top: 4px; }
`;

const GroupLabel = styled.div<{ $open: boolean }>`
    padding: 8px 16px 4px;
    font-size: 10px;
    font-weight: 700;
    color: #475569;
    letter-spacing: 0.5px;
    white-space: nowrap;
    overflow: hidden;
    height: ${({ $open }) => ($open ? "auto" : "0")};
    padding: ${({ $open }) => ($open ? "8px 16px 4px" : "0")};
    opacity: ${({ $open }) => ($open ? 1 : 0)};
    transition: all 0.15s ease;
`;

const Item = styled.div<{ $active: boolean; $open: boolean }>`
    display: flex;
    align-items: center;
    gap: ${({ $open }) => ($open ? "8px" : "0")};
    margin: 1px ${({ $open }) => ($open ? "8px" : "4px")};
    padding: 8px ${({ $open }) => ($open ? "10px" : "0")};
    justify-content: center;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;

    font-size: 12.5px;
    font-weight: ${({ $active }) => ($active ? 700 : 500)};
    color: ${({ $active }) => ($active ? "#e2e8f0" : "#94a3b8")};
    background: ${({ $active }) => ($active ? "#1e293b" : "transparent")};
    white-space: nowrap;

    ${({ $active }) => $active && "box-shadow: inset 3px 0 0 #3b82f6;"}

    svg {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: ${({ $active }) => ($active ? "#3b82f6" : "#64748b")};
        transition: color 0.15s ease;
    }

    .label {
        display: ${({ $open }) => ($open ? "inline" : "none")};
    }

    &:hover {
        background: #1e293b;
        color: #e2e8f0;
        svg { color: #94a3b8; }
    }
`;

/* ── 하단 유저 ── */
const UserArea = styled.div<{ $open: boolean }>`
    padding: ${({ $open }) => ($open ? "12px" : "12px 8px")};
    border-top: 1px solid #1e293b;
    display: flex;
    align-items: center;
    justify-content: ${({ $open }) => ($open ? "flex-start" : "center")};
    gap: 8px;
    flex-shrink: 0;
`;

const UserMeta = styled.div<{ $open: boolean }>`
    flex: 1;
    min-width: 0;
    cursor: pointer;
    display: ${({ $open }) => ($open ? "flex" : "none")};
    flex-direction: column;
    .name {
        font-size: 12px;
        font-weight: 700;
        color: #e2e8f0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .role {
        font-size: 10px;
        color: #64748b;
    }
`;

const LogoutBtn = styled.button<{ $open: boolean }>`
    background: none;
    border: none;
    color: #64748b;
    cursor: pointer;
    display: ${({ $open }) => ($open ? "flex" : "none")};
    align-items: center;
    padding: 4px;
    border-radius: 4px;
    &:hover { background: #334155; color: #ef4444; }
`;

/* ================================================================
   컴포넌트
   ================================================================ */
export function Sidebar() {
    const navigate = useNavigate();
    const location = useLocation();
    const nowAccount = useRecoilValue(AccountState);
    const resetAccount = useResetRecoilState(AccountState);
    const [openTabs, setOpenTabs] = useRecoilState(OpenTabsState);
    const [, setActiveTabId] = useRecoilState(ActiveTabIdState);
    const [hovered, setHovered] = useState(false);

    const handleLogout = async () => {
        try { await AxiosGet("logout"); } catch { }
        resetAccount();
        setOpenTabs([]);
        setActiveTabId(null);
        localStorage.clear();
        navigate("/login");
    };

    const handleNavClick = (path: string) => {
        const label = PATH_TO_TAB_LABEL[path] || path;
        if (!openTabs.find((t) => t.id === path)) {
            setOpenTabs((prev) => [...prev, { id: path, label, path, closable: true }]);
        }
        setActiveTabId(path);
        navigate(path);
    };

    return (
        <Wrapper
            $open={hovered}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <Logo $open={hovered} onClick={() => navigate("/manage")}>
                <img className="logo-icon" src={LogoIconImg} alt="CL" />
                <img className="logo-horizontal" src={LogoHorizontalImg} alt="CASTING LINE" />
            </Logo>

            <Nav>
                {MENU.map((group) => (
                    <Group key={group.title}>
                        <GroupLabel $open={hovered}>{group.title}</GroupLabel>
                        {group.items.map((item) => (
                            <Item
                                key={item.path}
                                $active={location.pathname === item.path}
                                $open={hovered}
                                onClick={() => handleNavClick(item.path)}
                                title={item.label}
                            >
                                {item.icon}
                                <span className="label">{item.label}</span>
                            </Item>
                        ))}
                    </Group>
                ))}
            </Nav>

            <UserArea $open={hovered}>
                <UserCircle size={26} weight="duotone" color="#3b82f6" style={{ flexShrink: 0 }} />
                <UserMeta $open={hovered} onClick={() => handleNavClick("/manage/my_profile")}>
                    <div className="name">{nowAccount?.username || "Guest"}</div>
                    <div className="role">{nowAccount?.is_superuser ? "Admin" : "Staff"}</div>
                </UserMeta>
                <LogoutBtn $open={hovered} onClick={handleLogout} title="로그아웃">
                    <SignOut size={16} weight="bold" />
                </LogoutBtn>
            </UserArea>
        </Wrapper>
    );
}
