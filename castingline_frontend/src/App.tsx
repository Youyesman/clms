import { Outlet, useLocation, useOutlet } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { RecoilRoot, useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import Topbar from "./components/navbar/Topbar";
import { SnackbarProvider } from "notistack";
import { CustomToastProvider } from "./components/common/CustomToast";
import { GlobalAlert } from "./components/common/Alert";
import { GlobalModalProvider } from "./hooks/useGlobalModal";
import { AccountState } from "./atom/AccountState";
import StaffTopbar from "./components/navbar/StaffTopbar";
import CustomerTopbar from "./components/navbar/CustomerTopbar";
import { Sidebar } from "./components/navbar/Sidebar";
import { CustomerSidebar } from "./components/navbar/CustomerSidebar";
import { GlobalSkeleton } from "./components/common/GlobalSkeleton";
import { TabBar } from "./components/navbar/TabBar";
import { OpenTabsState, ActiveTabIdState, PATH_TO_TAB_LABEL, Tab } from "./atom/TabState";
import { SIDEBAR_WIDTH } from "./components/navbar/Sidebar";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// AppContainer의 prop 타입 정의
interface AppContainerProps {
    $sidebarWidth: number;
    $hasTabBar?: boolean;
}

const AppContainer = styled.div<AppContainerProps>`
    box-sizing: border-box;
    width: 100%;
    display: flex;
    padding-left: ${({ $sidebarWidth }) => $sidebarWidth}px;
    padding-top: ${({ $hasTabBar }) => ($hasTabBar ? "96px" : "60px")};
    transition: padding-left 0.3s ease;

    .outlet-container {
        flex: 1;
        min-width: 0;
        min-height: calc(100vh - ${({ $hasTabBar }) => ($hasTabBar ? "96px" : "60px")});
    }
`;

// 랜딩/로그인 페이지에서는 레이아웃 없이 전체 화면 표시
const FULLSCREEN_PATHS = ["/", "/login"];

function App() {
    const location = useLocation();
    const currentOutlet = useOutlet();
    const account = useRecoilValue(AccountState);
    const showStaffUI = account?.is_superuser;
    const navigate = useNavigate();

    const [openTabs, setOpenTabs] = useRecoilState(OpenTabsState);
    const [activeTabId, setActiveTabId] = useRecoilState(ActiveTabIdState);
    const sidebarWidth = showStaffUI ? SIDEBAR_WIDTH : 0;

    const isFullscreen = FULLSCREEN_PATHS.includes(location.pathname);
    const isManagePath = location.pathname.startsWith("/manage");
    // 고객용 사이드바를 표시할 경로
    const isCustomerPath = location.pathname.startsWith("/score") || location.pathname.startsWith("/time_table") || location.pathname.startsWith("/settlement");

    // URL 변경 시 → /manage 하위면 자동으로 탭 추가/활성화
    useEffect(() => {
        if (!isManagePath || !showStaffUI) return;

        const path = location.pathname;
        const label = PATH_TO_TAB_LABEL[path];
        if (!label) return; // 매핑 없으면 무시

        const tabId = path;
        const existingTab = openTabs.find((t) => t.id === tabId);

        if (!existingTab) {
            const newTab: Tab = {
                id: tabId,
                label,
                path,
                closable: true,
            };
            setOpenTabs((prev) => [...prev, newTab]);
        }
        setActiveTabId(tabId);
    }, [location.pathname, isManagePath, showStaffUI]);

    // 풀스크린 페이지 (랜딩, 로그인): Topbar/Sidebar 숨김
    if (isFullscreen) {
        return (
            <>
                <GlobalAlert />
                <GlobalSkeleton />
                <CustomToastProvider>
                    <GlobalModalProvider>
                        {currentOutlet}
                    </GlobalModalProvider>
                </CustomToastProvider>
            </>
        );
    }

    return (
        <>
            <GlobalAlert />
            <GlobalSkeleton />
            <CustomToastProvider>
                {showStaffUI ? (
                    <>
                        <Sidebar />
                        <StaffTopbar $sidebarWidth={sidebarWidth} />
                        <TabBar $sidebarWidth={sidebarWidth} />
                    </>
                ) : (
                    <CustomerTopbar />
                )}
                <AppContainer
                    $sidebarWidth={sidebarWidth}
                    $hasTabBar={showStaffUI && isManagePath}
                >
                    {/* 고객용 사이드바: 관리자가 아니고, 고객 경로일 때만 */}
                    {!showStaffUI && isCustomerPath && <CustomerSidebar />}
                    <div className="outlet-container">
                        <GlobalModalProvider>
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={isManagePath ? "manage" : location.pathname}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.3 }}
                                    style={{ width: "100%", height: "100%" }}
                                >
                                    {currentOutlet}
                                </motion.div>
                            </AnimatePresence>
                        </GlobalModalProvider>
                    </div>
                </AppContainer>
            </CustomToastProvider>
        </>
    );
}

export default App;
