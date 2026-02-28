/**
 * 페이지 내부 탭 네비게이션 컴포넌트
 * - 고객(배급사) 페이지: 일반 navigate 사용
 * - 관리자 페이지(/manage/*): Recoil 탭 시스템 연동
 */
import React from "react";
import styled from "styled-components";
import { useLocation, useNavigate } from "react-router-dom";
import { useRecoilState } from "recoil";
import { OpenTabsState, ActiveTabIdState, PATH_TO_TAB_LABEL } from "../../atom/TabState";

interface TabItem {
    to: string;       // 고객 기준 경로 (예: "/time_table/seat-count")
    label: string;
}

interface Props {
    tabs: TabItem[];
}

const TabBar = styled.div`
    display: flex;
    gap: 4px;
    padding: 0 16px;
    background-color: #f8fafc;
    border-bottom: 2px solid #e2e8f0;
`;

const Tab = styled.button<{ $active: boolean }>`
    padding: 10px 16px;
    font-size: 13px;
    font-weight: ${({ $active }) => ($active ? 800 : 500)};
    color: ${({ $active }) => ($active ? "#2563eb" : "#64748b")};
    background: none;
    border: none;
    border-bottom: 2px solid ${({ $active }) => ($active ? "#2563eb" : "transparent")};
    margin-bottom: -2px;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;

    &:hover {
        color: #2563eb;
        background-color: #eff6ff;
    }
`;

/* ── 탭 목록 상수 ── */

export const TIME_TABLE_TABS: TabItem[] = [
    { to: "/time_table", label: "집계작 시간표" },
    { to: "/time_table/seat-count", label: "주요작 좌석수" },
    { to: "/time_table/theater-count", label: "주요작 상영관수" },
    { to: "/time_table/screen-count", label: "주요작 스크린수" },
    { to: "/time_table/show-count", label: "주요작 상영회차수" },
];

export const SCORE_TABS: TabItem[] = [
    { to: "/score", label: "스코어 현황" },
    { to: "/score/criteria", label: "기준별 조회" },
    { to: "/score/daily", label: "일별 현황" },
    { to: "/score/seat-rate", label: "좌석 점유율" },
    { to: "/score/ranking", label: "순위 조회" },
];

export const SETTLEMENT_TABS: TabItem[] = [
    { to: "/settlement/detail", label: "정산 상세" },
    { to: "/settlement/aggregate", label: "정산 집계" },
    { to: "/settlement/theater-total", label: "극장별 합계" },
    { to: "/settlement/supply-price", label: "공급가 조회" },
];

/* ── 컴포넌트 ── */

export function PageNavTabs({ tabs }: Props) {
    const location = useLocation();
    const navigate = useNavigate();
    const [openTabs, setOpenTabs] = useRecoilState(OpenTabsState);
    const [, setActiveTabId] = useRecoilState(ActiveTabIdState);

    const isAdmin = location.pathname.startsWith("/manage");

    const handleClick = (customerPath: string) => {
        if (isAdmin) {
            const adminPath = `/manage${customerPath}`;
            const label = PATH_TO_TAB_LABEL[adminPath] || customerPath;
            if (!openTabs.find((t) => t.id === adminPath)) {
                setOpenTabs((prev) => [...prev, { id: adminPath, label, path: adminPath, closable: true }]);
            }
            setActiveTabId(adminPath);
            navigate(adminPath);
        } else {
            navigate(customerPath);
        }
    };

    // 현재 활성 경로 판별
    const currentPath = isAdmin
        ? location.pathname.replace("/manage", "")
        : location.pathname;

    return (
        <TabBar>
            {tabs.map((tab) => (
                <Tab
                    key={tab.to}
                    $active={currentPath === tab.to}
                    onClick={() => handleClick(tab.to)}
                >
                    {tab.label}
                </Tab>
            ))}
        </TabBar>
    );
}
