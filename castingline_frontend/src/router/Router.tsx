import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy } from "react";
import App from "../App";
import { Login } from "../domain/auth/pages/Login";
import PrivateRouter from "./PrivateRouter";
import { ManageClient } from "../domain/client/pages/ManageClient";
import { ManageMovie } from "../domain/movie/pages/ManageMovie";
import { ManageOrder } from "../domain/order/pages/ManageOrder";
import { ScoreOverview } from "../domain/dashboard/ScoreOverview";
import { ScreeningInfo } from "../domain/dashboard/ScreeningInfo";
import { DailyStatus } from "../domain/dashboard/DailyStatus";
import { SeatSalesRate } from "../domain/dashboard/SeatSalesRate";
import { CumulativeRanking } from "../domain/dashboard/CumulativeRanking";
import { ManageScore } from "../domain/score/pages/ManageScore";
import { ManageRate } from "../domain/rate/pages/ManageRate";
import { ManageFund } from "../domain/fund/pages/ManageFund";
import { ScorePage } from "../customer/domain/score/pages/ScorePage";
import { TimeTablePage } from "../customer/domain/time_table/pages/TimeTablePage";
import { ManageTheaterMap } from "../domain/theater_map/pages/ManageTheaterMap";
import { ManageSettlement } from "../domain/settlement/pages/ManageSettlement";
import { ManageSpecialSettlement } from "../domain/settlement/pages/ManageSpecialSettlement";
import { ManageUserProfile } from "../domain/auth/pages/ManageUserProfile";
import { MyProfile } from "../domain/auth/pages/MyProfile";
import Main from "../domain/main/pages/Main";

const router = createBrowserRouter([
    {
        path: "/",
        element: <App />,
        children: [
            { path: "", element: <Main /> }, // 고객용 메인
            { path: "login", element: <Login /> },
            { path: "score", element: <ScorePage /> },
            { path: "time_table", element: <TimeTablePage /> },
            // ---------------------------------------------------------
            // 직원 전용 페이지 그룹 (/manage)
            // ---------------------------------------------------------
            {
                path: "manage",
                // ✅ Outlet 방식을 사용하므로 element에 PrivateRouter를 한 번만 선언
                element: <PrivateRouter />,
                children: [
                    {
                        path: "manage_client", // 실제 경로: /manage/manage_client
                        element: <ManageClient />,
                    },
                    {
                        path: "manage_user",
                        element: <ManageUserProfile />,
                    },
                    {
                        path: "my_profile",
                        element: <MyProfile />,
                    },
                    {
                        path: "manage_movie", // 실제 경로: /manage/movie
                        element: <ManageMovie />,
                    },
                    {
                        path: "manage_order",
                        element: <ManageOrder />,
                    },
                    {
                        path: "manage_rate",
                        element: <ManageRate />,
                    },
                    {
                        path: "manage_score",
                        element: <ManageScore />,
                    },
                    {
                        path: "manage_fund",
                        element: <ManageFund />,
                    },
                    {
                        path: "manage_theater_map",
                        element: <ManageTheaterMap />,
                    },
                    {
                        path: "manage_settlement",
                        element: <ManageSettlement />,
                    },
                    {
                        path: "manage_special_settlement",
                        element: <ManageSpecialSettlement />,
                    },
                    // 대시보드 중첩 구조도 가능
                    {
                        path: "dashboard",
                        element: <Main />, // 대시보드 레이아웃
                        children: [
                            { path: "score", element: <ScoreOverview /> },
                            { path: "ranking", element: <CumulativeRanking /> },
                        ],
                    },
                ],
            },
        ],
    },
]);

export default router;
