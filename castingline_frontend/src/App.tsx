import { Outlet, useLocation, useOutlet } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { RecoilRoot, useRecoilValue } from "recoil";
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
import { GlobalSkeleton } from "./components/common/GlobalSkeleton";

// AppContainer의 prop 타입 정의
interface AppContainerProps {
    $hasSidebar?: boolean; // 사이드바 유무에 따른 마진 조절
}

const AppContainer = styled.div<AppContainerProps>`
    box-sizing: border-box;
    width: 100%; /* 100vw 대신 100% 사용 */
    display: flex;
    /* 사이드바가 확장되었을 때 220px, 접혔을 때 72px, 없으면 0 */
    padding-left: ${({ $hasSidebar }) => ($hasSidebar ? "72px" : "0")};
    /* GNB(Topbar) 높이만큼 상단 여백 확보 */
    padding-top: 60px;
    transition: padding-left 0.3s ease;

    .outlet-container {
        flex: 1;
        min-width: 0;
        min-height: calc(100vh - 60px);
    }
`;

function App() {
    const location = useLocation();
    const currentOutlet = useOutlet();
    const account = useRecoilValue(AccountState);
    const showStaffUI = account?.is_superuser;

    return (
        <>
            <GlobalAlert />
            <GlobalSkeleton />
            <CustomToastProvider>
                {showStaffUI ? (
                    <>
                        <Sidebar />
                        <StaffTopbar $hasSidebar={showStaffUI} />
                    </>
                ) : (
                    <CustomerTopbar />
                )}
                <AppContainer $hasSidebar={showStaffUI}>
                    <div className="outlet-container">
                        <GlobalModalProvider>
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={location.pathname}
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
