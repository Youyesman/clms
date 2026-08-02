import React, { useState, useCallback, useEffect } from "react";
import styled from "styled-components";
import { useRecoilState } from "recoil";
import { useNavigate, useLocation } from "react-router-dom";
import { X } from "@phosphor-icons/react";
import { OpenTabsState, ActiveTabIdState, Tab } from "../../atom/TabState";
import { ui } from "../../styles/uiTokens";

const TabBarContainer = styled.div<{ $sidebarWidth: number }>`
    position: fixed;
    top: 60px;
    left: ${({ $sidebarWidth }) => $sidebarWidth}px;
    z-index: 999;
    width: calc(100% - ${({ $sidebarWidth }) => $sidebarWidth}px);
    height: 38px;
    display: flex;
    align-items: stretch;
    background-color: ${ui.color.surfaceMuted};
    border-bottom: 1px solid ${ui.color.border};
    overflow-x: auto;
    overflow-y: hidden;
    transition: left 0.3s ease, width 0.3s ease;

    &::-webkit-scrollbar {
        height: 0px;
    }
`;

const TabItem = styled.div<{ $isActive: boolean; $isDragging?: boolean }>`
    display: flex;
    align-items: center;
    gap: 4px;
    /* 탭이 10개 넘게 열리는 화면이 많아 최소폭을 줄이고 라벨 우선으로 배분 */
    padding: 0 8px 0 12px;
    min-width: 0;
    max-width: 160px;
    height: 100%;
    font-size: ${ui.font.size.md};
    font-weight: ${({ $isActive }) => ($isActive ? ui.font.weight.semibold : ui.font.weight.regular)};
    color: ${({ $isActive }) => ($isActive ? ui.color.textStrong : ui.color.textMuted)};
    background-color: ${({ $isActive }) => ($isActive ? ui.color.surface : "transparent")};
    border-right: 1px solid ${ui.color.border};
    border-bottom: ${({ $isActive }) => ($isActive ? `2px solid ${ui.color.primary}` : "2px solid transparent")};
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background-color 0.12s ease, color 0.12s ease;
    user-select: none;
    opacity: ${({ $isDragging }) => ($isDragging ? 0.4 : 1)};

    &:hover {
        background-color: ${({ $isActive }) => ($isActive ? ui.color.surface : ui.color.surfaceHover)};
        color: ${ui.color.textStrong};
    }

    /* 닫기 버튼은 활성 탭과 마우스를 올린 탭에서만 노출 — 탭마다 X가 떠 있으면 산만함 */
    .tab-close {
        opacity: ${({ $isActive }) => ($isActive ? 1 : 0)};
    }
    &:hover .tab-close {
        opacity: 1;
    }
`;

const TabLabel = styled.span`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const CloseButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: none;
    border-radius: ${ui.radius.sm};
    color: ${ui.color.textSubtle};
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.12s ease, background-color 0.12s ease, color 0.12s ease;

    &:hover {
        background-color: ${ui.color.border};
        color: ${ui.color.textStrong};
    }
`;

const EmptyTabMessage = styled.div`
    display: flex;
    align-items: center;
    padding: 44px 20px;
    font-size: 13px;
    color: #94a3b8;
    font-weight: 500;
    line-height: 1.6;
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
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.12);
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
    font-size: 12px;
    color: ${({ $disabled }) => ($disabled ? "#cbd5e1" : "#475569")};
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
    $sidebarWidth: number;
}

export function TabBar({ $sidebarWidth }: TabBarProps) {
    const [openTabs, setOpenTabs] = useRecoilState(OpenTabsState);
    const [activeTabId, setActiveTabId] = useRecoilState(ActiveTabIdState);
    const navigate = useNavigate();
    const location = useLocation();
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        tab: Tab;
    } | null>(null);
    // 드래그로 탭 순서 변경 중인 탭 id
    const [dragTabId, setDragTabId] = useState<string | null>(null);

    const handleDragStart = (e: React.DragEvent, tab: Tab) => {
        setDragTabId(tab.id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", tab.id); // Firefox 드래그 시작 요건
    };

    // 다른 탭 위를 지날 때 실시간으로 순서 교체 (VSCode 탭 방식)
    const handleDragOver = (e: React.DragEvent, overTab: Tab) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!dragTabId || dragTabId === overTab.id) return;
        const from = openTabs.findIndex((t) => t.id === dragTabId);
        const to = openTabs.findIndex((t) => t.id === overTab.id);
        if (from < 0 || to < 0 || from === to) return;
        const newTabs = [...openTabs];
        const [moved] = newTabs.splice(from, 1);
        newTabs.splice(to, 0, moved);
        setOpenTabs(newTabs);
    };

    const handleDragEnd = () => setDragTabId(null);

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
            <TabBarContainer $sidebarWidth={$sidebarWidth}>
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
            <TabBarContainer $sidebarWidth={$sidebarWidth}>
                {openTabs.map((tab) => (
                    <TabItem
                        key={tab.id}
                        $isActive={activeTabId === tab.id}
                        $isDragging={dragTabId === tab.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, tab)}
                        onDragOver={(e) => handleDragOver(e, tab)}
                        onDrop={(e) => e.preventDefault()}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleTabClick(tab)}
                        onContextMenu={(e) => handleContextMenu(e, tab)}
                        title={tab.label}
                    >
                        <TabLabel>{tab.label}</TabLabel>
                        {tab.closable && (
                            <CloseButton className="tab-close" onClick={(e) => handleCloseTab(e, tab)}>
                                <X size={11} weight="bold" />
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
