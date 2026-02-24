import React from "react";
import styled from "styled-components";
import { useLocation, useNavigate } from "react-router-dom";
import {
    ChartBar, Calendar, ListBullets, ChartLineUp, Armchair, Trophy,
} from "@phosphor-icons/react";

/* ── 사이드바 메뉴 정의 ── */
interface MenuItem {
    path: string;
    label: string;
    icon: React.ReactNode;
}

interface MenuGroup {
    title: string;
    /** 이 그룹이 활성화되는 상위 경로 (TopNav 탭과 매칭) */
    basePath: string;
    items: MenuItem[];
}

const MENU_GROUPS: MenuGroup[] = [
    {
        title: "스코어",
        basePath: "/score",
        items: [
            { path: "/score", label: "스코어", icon: <ChartBar size={20} /> },
            { path: "/score/criteria", label: "기준별 현황", icon: <ListBullets size={20} /> },
            { path: "/score/daily", label: "일현황", icon: <Calendar size={20} /> },
            { path: "/score/seat-rate", label: "좌석판매율현황", icon: <Armchair size={20} /> },
            { path: "/score/ranking", label: "누계순위", icon: <Trophy size={20} /> },
        ],
    },
    {
        title: "시간표",
        basePath: "/time_table",
        items: [
            { path: "/time_table", label: "시간표 조회", icon: <Calendar size={20} /> },
        ],
    },
];

/* ── 스타일 ── */
const SidebarContainer = styled.aside`
    width: 200px;
    min-width: 200px;
    background: #ffffff;
    border-right: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 60px);
    padding: 16px 0;
`;

const GroupTitle = styled.div`
    padding: 8px 24px 6px;
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 8px;

    &:first-child {
        margin-top: 0;
    }
`;

const NavItem = styled.div<{ $active: boolean }>`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 24px;
    font-size: 14px;
    font-weight: ${({ $active }) => ($active ? "700" : "500")};
    color: ${({ $active }) => ($active ? "#2563eb" : "#475569")};
    background: ${({ $active }) => ($active ? "#eff6ff" : "transparent")};
    border-right: 3px solid ${({ $active }) => ($active ? "#2563eb" : "transparent")};
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
        background: ${({ $active }) => ($active ? "#eff6ff" : "#f8fafc")};
        color: ${({ $active }) => ($active ? "#2563eb" : "#0f172a")};
    }

    svg {
        flex-shrink: 0;
        color: ${({ $active }) => ($active ? "#2563eb" : "#94a3b8")};
    }
`;

/* ── 컴포넌트 ── */
export function CustomerSidebar() {
    const location = useLocation();
    const navigate = useNavigate();

    // 현재 경로에 해당하는 그룹만 표시
    const activeGroup = MENU_GROUPS.find((g) =>
        location.pathname.startsWith(g.basePath)
    );

    if (!activeGroup) return null;

    return (
        <SidebarContainer>
            <GroupTitle>{activeGroup.title}</GroupTitle>
            {activeGroup.items.map((item) => (
                <NavItem
                    key={item.path}
                    $active={location.pathname === item.path}
                    onClick={() => navigate(item.path)}
                >
                    {item.icon}
                    {item.label}
                </NavItem>
            ))}
        </SidebarContainer>
    );
}
