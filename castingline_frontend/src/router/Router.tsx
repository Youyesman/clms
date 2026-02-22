import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy } from "react";
import App from "../App";
import { Login } from "../domain/auth/pages/Login";
import PrivateRouter from "./PrivateRouter";
import { ScorePage } from "../customer/domain/score/pages/ScorePage";
import { TimeTablePage } from "../customer/domain/time_table/pages/TimeTablePage";
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
            { path: "time_table", element: <TimeTablePage /> },

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
