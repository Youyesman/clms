import React, { useState } from "react";
import styled from "styled-components";
import { useNavigate, useLocation } from "react-router-dom";
import {
    ChartBar, Calendar, Users, Buildings, FilmSlate,
    ClipboardText, TrendUp, MapPin, Receipt,
    SealCheck, Bank, Percent, SignOut, UserCircle, Bug, Table,
    CurrencyDollar, EnvelopeSimple, Ticket, Popcorn, ChartLineUp,
} from "@phosphor-icons/react";
import { ui } from "../../styles/uiTokens";
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
            /* 아이콘이 겹치면 접힌 상태에서 구분이 안 되므로 항목마다 다른 아이콘 사용 */
            { path: "/manage/crawler/megabox_score", label: "메가박스 스코어", icon: <Popcorn /> },
            { path: "/manage/crawler/cineq_score", label: "씨네큐 스코어", icon: <Ticket /> },
            { path: "/manage/crawler/kobis_score", label: "KOBIS 상세내역", icon: <ChartLineUp /> },
            { path: "/manage/mailbox", label: "메일함", icon: <EnvelopeSimple /> },
            { path: "/manage/settlement_mail", label: "정산서 수집", icon: <Receipt /> },
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
    background: ${ui.color.shellBg};
    border-right: 1px solid ${ui.color.shellBorder};
    overflow: hidden;
    transition: width 0.18s ease, box-shadow 0.18s ease;
    /* 펼쳐질 때만 그림자 — 본문 위에 겹쳐 뜬다는 것이 보이도록 (본문은 밀리지 않음) */
    box-shadow: ${({ $open }) => ($open ? ui.shadow.lg : "none")};
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

const Group = styled.div<{ $open: boolean }>`
    /* 접힌 상태에서는 그룹 제목이 사라져 메뉴가 한 덩어리로 보이므로 구분선으로 대체 */
    & + & {
        margin-top: ${({ $open }) => ($open ? "4px" : "8px")};
        padding-top: ${({ $open }) => ($open ? "0" : "8px")};
        border-top: ${({ $open }) => ($open ? "none" : `1px solid ${ui.color.shellBorder}`)};
    }
`;

const GroupLabel = styled.div<{ $open: boolean }>`
    font-size: 11px;
    font-weight: ${ui.font.weight.bold};
    color: ${ui.color.shellTextMuted};
    letter-spacing: 0.5px;
    white-space: nowrap;
    overflow: hidden;
    height: ${({ $open }) => ($open ? "auto" : "0")};
    padding: ${({ $open }) => ($open ? "10px 16px 4px" : "0")};
    opacity: ${({ $open }) => ($open ? 1 : 0)};
    transition: opacity 0.15s ease;
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

    font-size: ${ui.font.size.md};
    font-weight: ${({ $active }) => ($active ? ui.font.weight.semibold : ui.font.weight.regular)};
    color: ${({ $active }) => ($active ? ui.color.shellTextActive : ui.color.shellText)};
    background: ${({ $active }) => ($active ? ui.color.shellBgHover : "transparent")};
    white-space: nowrap;

    ${({ $active }) => $active && `box-shadow: inset 2px 0 0 ${ui.color.shellAccent};`}

    svg {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: ${({ $active }) => ($active ? ui.color.shellAccent : ui.color.shellText)};
        transition: color 0.15s ease;
    }

    .label {
        display: ${({ $open }) => ($open ? "inline" : "none")};
        overflow: hidden;
        text-overflow: ellipsis;
    }

    &:hover {
        background: ${ui.color.shellBgHover};
        color: ${ui.color.shellTextActive};
        svg { color: ${ui.color.shellTextActive}; }
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
        font-size: 11px;
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
    border-radius: 6px;
    &:hover { background: #475569; color: #dc2626; }
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
                    <Group key={group.title} $open={hovered}>
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
                <UserCircle size={26} weight="duotone" color="#2563eb" style={{ flexShrink: 0 }} />
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
