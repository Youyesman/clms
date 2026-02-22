import React from "react";
import styled from "styled-components";
import { useRecoilState } from "recoil";
import { useNavigate, useLocation } from "react-router-dom";
import { X } from "@phosphor-icons/react";
import { OpenTabsState, ActiveTabIdState, Tab } from "../../atom/TabState";

const TabBarContainer = styled.div<{ $hasSidebar?: boolean }>`
    position: fixed;
    top: 60px;
    left: ${({ $hasSidebar }) => ($hasSidebar ? "72px" : "0")};
    z-index: 999;
    width: ${({ $hasSidebar }) => ($hasSidebar ? "calc(100% - 72px)" : "100%")};
    height: 36px;
    display: flex;
    align-items: stretch;
    background-color: #f1f5f9;
    border-bottom: 1px solid #e2e8f0;
    overflow-x: auto;
    overflow-y: hidden;
    transition: left 0.3s ease, width 0.3s ease;

    &::-webkit-scrollbar {
        height: 0px;
    }
`;

const TabItem = styled.div<{ $isActive: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    min-width: 120px;
    max-width: 200px;
    height: 100%;
    font-size: 12.5px;
    font-weight: ${({ $isActive }) => ($isActive ? 700 : 500)};
    color: ${({ $isActive }) => ($isActive ? "#0f172a" : "#64748b")};
    background-color: ${({ $isActive }) => ($isActive ? "#ffffff" : "transparent")};
    border-right: 1px solid #e2e8f0;
    border-bottom: ${({ $isActive }) => ($isActive ? "2px solid #3b82f6" : "2px solid transparent")};
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: all 0.15s ease;
    user-select: none;

    &:hover {
        background-color: ${({ $isActive }) => ($isActive ? "#ffffff" : "#e2e8f0")};
        color: #0f172a;
    }
`;

const TabLabel = styled.span`
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const CloseButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: none;
    border-radius: 4px;
    color: #94a3b8;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;

    &:hover {
        background-color: #fee2e2;
        color: #ef4444;
    }
`;

const EmptyTabMessage = styled.div`
    display: flex;
    align-items: center;
    padding: 0 16px;
    font-size: 12px;
    color: #94a3b8;
    font-weight: 500;
`;

interface TabBarProps {
    $hasSidebar?: boolean;
}

export function TabBar({ $hasSidebar }: TabBarProps) {
    const [openTabs, setOpenTabs] = useRecoilState(OpenTabsState);
    const [activeTabId, setActiveTabId] = useRecoilState(ActiveTabIdState);
    const navigate = useNavigate();
    const location = useLocation();

    const handleTabClick = (tab: Tab) => {
        setActiveTabId(tab.id);
        if (location.pathname !== tab.path) {
            navigate(tab.path);
        }
    };

    const handleCloseTab = (e: React.MouseEvent, tabToClose: Tab) => {
        e.stopPropagation();
        if (!tabToClose.closable) return;

        const tabIndex = openTabs.findIndex((t) => t.id === tabToClose.id);
        const newTabs = openTabs.filter((t) => t.id !== tabToClose.id);
        setOpenTabs(newTabs);

        // 닫은 탭이 현재 활성 탭이면 인접 탭으로 전환
        if (activeTabId === tabToClose.id) {
            if (newTabs.length > 0) {
                const nextTab = newTabs[Math.min(tabIndex, newTabs.length - 1)];
                setActiveTabId(nextTab.id);
                navigate(nextTab.path);
            } else {
                setActiveTabId(null);
                navigate("/manage");
            }
        }
    };

    if (openTabs.length === 0) {
        return (
            <TabBarContainer $hasSidebar={$hasSidebar}>
                <EmptyTabMessage>사이드바에서 메뉴를 선택하세요</EmptyTabMessage>
            </TabBarContainer>
        );
    }

    return (
        <TabBarContainer $hasSidebar={$hasSidebar}>
            {openTabs.map((tab) => (
                <TabItem
                    key={tab.id}
                    $isActive={activeTabId === tab.id}
                    onClick={() => handleTabClick(tab)}
                    title={tab.label}
                >
                    <TabLabel>{tab.label}</TabLabel>
                    {tab.closable && (
                        <CloseButton onClick={(e) => handleCloseTab(e, tab)}>
                            <X size={12} weight="bold" />
                        </CloseButton>
                    )}
                </TabItem>
            ))}
        </TabBarContainer>
    );
}
