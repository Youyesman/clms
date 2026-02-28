import React, { useState, useCallback, useEffect } from "react";
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

const ContextMenuOverlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 10000;
`;

const ContextMenuContainer = styled.div<{ $x: number; $y: number }>`
    position: fixed;
    top: ${({ $y }) => $y}px;
    left: ${({ $x }) => $x}px;
    z-index: 10001;
    min-width: 180px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    padding: 4px 0;
    animation: fadeIn 0.1s ease;

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;

const ContextMenuItem = styled.button<{ $disabled?: boolean }>`
    display: flex;
    align-items: center;
    width: 100%;
    padding: 8px 14px;
    border: none;
    background: none;
    font-size: 12.5px;
    color: ${({ $disabled }) => ($disabled ? "#cbd5e1" : "#334155")};
    cursor: ${({ $disabled }) => ($disabled ? "default" : "pointer")};
    text-align: left;
    transition: background-color 0.1s ease;

    &:hover {
        background-color: ${({ $disabled }) => ($disabled ? "transparent" : "#f1f5f9")};
    }
`;

const ContextMenuDivider = styled.div`
    height: 1px;
    background-color: #e2e8f0;
    margin: 4px 0;
`;

interface TabBarProps {
    $hasSidebar?: boolean;
}

export function TabBar({ $hasSidebar }: TabBarProps) {
    const [openTabs, setOpenTabs] = useRecoilState(OpenTabsState);
    const [activeTabId, setActiveTabId] = useRecoilState(ActiveTabIdState);
    const navigate = useNavigate();
    const location = useLocation();
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        tab: Tab;
    } | null>(null);

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

    // 탭 목록 변경 후 활성 탭 보정
    const adjustActiveTab = useCallback(
        (newTabs: Tab[]) => {
            if (newTabs.length === 0) {
                setActiveTabId(null);
                navigate("/manage");
            } else if (!newTabs.find((t) => t.id === activeTabId)) {
                const last = newTabs[newTabs.length - 1];
                setActiveTabId(last.id);
                navigate(last.path);
            }
        },
        [activeTabId, navigate, setActiveTabId]
    );

    const handleContextMenu = (e: React.MouseEvent, tab: Tab) => {
        e.preventDefault();
        e.stopPropagation();
        // 화면 경계 처리
        const x = Math.min(e.clientX, window.innerWidth - 200);
        const y = Math.min(e.clientY, window.innerHeight - 200);
        setContextMenu({ x, y, tab });
    };

    const closeContextMenu = () => setContextMenu(null);

    // 현재 탭 닫기
    const handleCloseThis = () => {
        if (!contextMenu || !contextMenu.tab.closable) return;
        const tabIndex = openTabs.findIndex((t) => t.id === contextMenu.tab.id);
        const newTabs = openTabs.filter((t) => t.id !== contextMenu.tab.id);
        setOpenTabs(newTabs);
        if (activeTabId === contextMenu.tab.id) {
            adjustActiveTab(newTabs);
        }
        closeContextMenu();
    };

    // 다른 탭 모두 닫기
    const handleCloseOthers = () => {
        if (!contextMenu) return;
        const newTabs = openTabs.filter(
            (t) => t.id === contextMenu.tab.id || !t.closable
        );
        setOpenTabs(newTabs);
        adjustActiveTab(newTabs);
        closeContextMenu();
    };

    // 오른쪽 탭 닫기
    const handleCloseRight = () => {
        if (!contextMenu) return;
        const idx = openTabs.findIndex((t) => t.id === contextMenu.tab.id);
        const newTabs = openTabs.filter(
            (t, i) => i <= idx || !t.closable
        );
        setOpenTabs(newTabs);
        adjustActiveTab(newTabs);
        closeContextMenu();
    };

    // 모든 탭 닫기
    const handleCloseAll = () => {
        const newTabs = openTabs.filter((t) => !t.closable);
        setOpenTabs(newTabs);
        adjustActiveTab(newTabs);
        closeContextMenu();
    };

    // ESC 키로 메뉴 닫기
    useEffect(() => {
        if (!contextMenu) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeContextMenu();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [contextMenu]);

    if (openTabs.length === 0) {
        return (
            <TabBarContainer $hasSidebar={$hasSidebar}>
                <EmptyTabMessage>사이드바에서 메뉴를 선택하세요</EmptyTabMessage>
            </TabBarContainer>
        );
    }

    // 비활성 조건 계산
    const ctxTab = contextMenu?.tab;
    const ctxIdx = ctxTab ? openTabs.findIndex((t) => t.id === ctxTab.id) : -1;
    const disableClose = ctxTab ? !ctxTab.closable : true;
    const disableCloseOthers = ctxTab
        ? openTabs.filter((t) => t.id !== ctxTab.id && t.closable).length === 0
        : true;
    const disableCloseRight = ctxTab
        ? openTabs.filter((t, i) => i > ctxIdx && t.closable).length === 0
        : true;
    const disableCloseAll = openTabs.filter((t) => t.closable).length === 0;

    return (
        <>
            <TabBarContainer $hasSidebar={$hasSidebar}>
                {openTabs.map((tab) => (
                    <TabItem
                        key={tab.id}
                        $isActive={activeTabId === tab.id}
                        onClick={() => handleTabClick(tab)}
                        onContextMenu={(e) => handleContextMenu(e, tab)}
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
            {contextMenu && (
                <>
                    <ContextMenuOverlay
                        onClick={closeContextMenu}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            closeContextMenu();
                        }}
                    />
                    <ContextMenuContainer $x={contextMenu.x} $y={contextMenu.y}>
                        <ContextMenuItem
                            $disabled={disableClose}
                            onClick={disableClose ? undefined : handleCloseThis}
                        >
                            닫기
                        </ContextMenuItem>
                        <ContextMenuDivider />
                        <ContextMenuItem
                            $disabled={disableCloseOthers}
                            onClick={disableCloseOthers ? undefined : handleCloseOthers}
                        >
                            다른 탭 모두 닫기
                        </ContextMenuItem>
                        <ContextMenuItem
                            $disabled={disableCloseRight}
                            onClick={disableCloseRight ? undefined : handleCloseRight}
                        >
                            오른쪽 탭 닫기
                        </ContextMenuItem>
                        <ContextMenuDivider />
                        <ContextMenuItem
                            $disabled={disableCloseAll}
                            onClick={disableCloseAll ? undefined : handleCloseAll}
                        >
                            모든 탭 닫기
                        </ContextMenuItem>
                    </ContextMenuContainer>
                </>
            )}
        </>
    );
}
