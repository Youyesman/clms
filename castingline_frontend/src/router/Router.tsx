import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy } from "react";
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
import { SeatCountPage } from "../customer/domain/time_table/pages/SeatCountPage";
import { TheaterCountPage } from "../customer/domain/time_table/pages/TheaterCountPage";
import { ScreenCountPage } from "../customer/domain/time_table/pages/ScreenCountPage";
import { ShowCountPage } from "../customer/domain/time_table/pages/ShowCountPage";
import LandingPage from "../domain/landing/pages/LandingPage";

const router = createBrowserRouter([
    {
        path: "/",
        element: <App />,
        children: [
            // ── 공개 페이지 ──
            { path: "", element: <LandingPage /> },
            { path: "login", element: <Login /> },

            // ── 일반 유저용 페이지 ──
            { path: "score", element: <ScorePage /> },
            { path: "score/criteria", element: <CriteriaPage /> },
            { path: "score/daily", element: <DailyStatusPage /> },
            { path: "score/seat-rate", element: <SeatRatePage /> },
            { path: "score/ranking", element: <RankingPage /> },
            { path: "settlement/detail", element: <SettlementDetailPage /> },
            { path: "settlement/aggregate", element: <SettlementAggregatePage /> },
            { path: "settlement/theater-total", element: <TheaterTotalPage /> },
            { path: "settlement/supply-price", element: <SupplyPricePage /> },
            { path: "time_table", element: <TimeTablePage /> },
            { path: "time_table/seat-count", element: <SeatCountPage /> },
            { path: "time_table/theater-count", element: <TheaterCountPage /> },
            { path: "time_table/screen-count", element: <ScreenCountPage /> },
            { path: "time_table/show-count", element: <ShowCountPage /> },

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
