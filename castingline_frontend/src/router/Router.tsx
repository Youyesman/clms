import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy, ReactElement } from "react";
import App from "../App";
import { Login } from "../domain/auth/pages/Login";
import PrivateRouter from "./PrivateRouter";
import { ScorePage } from "../customer/domain/score/pages/ScorePage";
import { CriteriaPage } from "../customer/domain/score/pages/CriteriaPage";
import { DailyStatusPage } from "../customer/domain/score/pages/DailyStatusPage";
import { SeatRatePage } from "../customer/domain/score/pages/SeatRatePage";
import { RankingPage } from "../customer/domain/score/pages/RankingPage";
import { SettlementDetailPage } from "../customer/domain/settlement/pages/SettlementDetailPage";
import { SettlementAggregatePage } from "../customer/domain/settlement/pages/SettlementAggregatePage";
import { TheaterTotalPage } from "../customer/domain/settlement/pages/TheaterTotalPage";
import { SupplyPricePage } from "../customer/domain/settlement/pages/SupplyPricePage";
import { TimeTablePage } from "../customer/domain/time_table/pages/TimeTablePage";
import { CompetitorPage } from "../customer/domain/time_table/pages/CompetitorPage";
import LandingPage from "../domain/landing/pages/LandingPage";
import { CustomerDashboard } from "../customer/domain/dashboard/pages/CustomerDashboard";
import { MyProfile } from "../domain/auth/pages/MyProfile";
import { useRecoilValue } from "recoil";
import { AccountState } from "../atom/AccountState";

// U001: 시간표 조회 접근 권한이 꺼진 계정은 직접 URL 진입도 빈 화면 처리
function TimetableGuard({ children }: { children: ReactElement }) {
    const account = useRecoilValue(AccountState);
    if (!account.is_superuser && account.timetable_access === false) {
        return <Navigate to="/dashboard" replace />;
    }
    return children;
}

const router = createBrowserRouter([
    {
        path: "/",
        element: <App />,
        children: [
            // ── 공개 페이지 ──
            { path: "", element: <LandingPage /> },
            { path: "login", element: <Login /> },

            // ── 일반 유저용 페이지 ──
            { path: "dashboard", element: <CustomerDashboard /> },
            // 고객 계정용 내 정보 수정 (관리자는 /manage/my_profile 사용)
            { path: "my_profile", element: <MyProfile /> },
            { path: "score", element: <ScorePage /> },
            { path: "score/criteria", element: <CriteriaPage /> },
            { path: "score/daily", element: <DailyStatusPage /> },
            { path: "score/seat-rate", element: <SeatRatePage /> },
            { path: "score/ranking", element: <RankingPage /> },
            { path: "settlement/detail", element: <SettlementDetailPage /> },
            { path: "settlement/aggregate", element: <SettlementAggregatePage /> },
            { path: "settlement/theater-total", element: <TheaterTotalPage /> },
            { path: "settlement/supply-price", element: <SupplyPricePage /> },
            { path: "time_table", element: <TimetableGuard><TimeTablePage /></TimetableGuard> },
            // T002(0827): 주요작 좌석수·상영관수·스크린수·상영회차수 메뉴 삭제, '경쟁작' 신설
            { path: "time_table/competitor", element: <TimetableGuard><CompetitorPage /></TimetableGuard> },

            // ── 관리자(superuser) 전용 ──
            // catch-all: /manage 이하 모든 경로를 PrivateRouter가 받음
            // 실제 콘텐츠 렌더링은 TabContentArea가 담당
            {
                path: "manage/*",
                element: <PrivateRouter />,
            },
        ],
    },
]);

export default router;
