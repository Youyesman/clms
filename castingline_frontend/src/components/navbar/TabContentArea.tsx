import React, { useMemo } from "react";
import styled from "styled-components";
import { useRecoilValue } from "recoil";
import { OpenTabsState, ActiveTabIdState } from "../../atom/TabState";

// ── 각 탭의 컴포넌트 매핑 (lazy가 아닌 직접 import) ──
import { ManageClient } from "../../domain/client/pages/ManageClient";
import { ManageMovie } from "../../domain/movie/pages/ManageMovie";
import { ManageOrder } from "../../domain/order/pages/ManageOrder";
import { ManageScore } from "../../domain/score/pages/ManageScore";
import { ManageRate } from "../../domain/rate/pages/ManageRate";
import { ManageFund } from "../../domain/fund/pages/ManageFund";
import { ManageTheaterMap } from "../../domain/theater_map/pages/ManageTheaterMap";
import { ManageSettlement } from "../../domain/settlement/pages/ManageSettlement";
import { ManageSpecialSettlement } from "../../domain/settlement/pages/ManageSpecialSettlement";
import { ManageUserProfile } from "../../domain/auth/pages/ManageUserProfile";
import { MyProfile } from "../../domain/auth/pages/MyProfile";
import { CrawlerPage } from "../../domain/crawler/pages/CrawlerPage";
import { ScorePage } from "../../customer/domain/score/pages/ScorePage";
import { TimeTablePage } from "../../customer/domain/time_table/pages/TimeTablePage";
import { ScoreOverview } from "../../domain/dashboard/ScoreOverview";
import { CumulativeRanking } from "../../domain/dashboard/CumulativeRanking";
import Main from "../../domain/main/pages/Main";

/**
 * 경로 → React 컴포넌트 매핑
 * 새 관리 페이지가 추가되면 여기에 등록해야 합니다.
 */
const PATH_TO_COMPONENT: Record<string, React.ComponentType> = {
    "/manage": Main,
    "/manage/crawler": CrawlerPage,
    "/manage/manage_client": ManageClient,
    "/manage/manage_user": ManageUserProfile,
    "/manage/my_profile": MyProfile,
    "/manage/manage_movie": ManageMovie,
    "/manage/manage_order": ManageOrder,
    "/manage/manage_rate": ManageRate,
    "/manage/manage_score": ManageScore,
    "/manage/manage_fund": ManageFund,
    "/manage/manage_theater_map": ManageTheaterMap,
    "/manage/manage_settlement": ManageSettlement,
    "/manage/manage_special_settlement": ManageSpecialSettlement,
    "/manage/score": ScorePage,
    "/manage/time_table": TimeTablePage,
    "/manage/dashboard/score": ScoreOverview,
    "/manage/dashboard/ranking": CumulativeRanking,
};

const TabPane = styled.div<{ $visible: boolean }>`
    display: ${({ $visible }) => ($visible ? "block" : "none")};
    width: 100%;
    height: 100%;
`;

const EmptyMessage = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: calc(100vh - 96px);
    color: #94a3b8;
    font-size: 15px;
    font-weight: 500;
    font-family: "SUIT", sans-serif;
`;

/**
 * 모든 열린 탭의 컴포넌트를 항상 마운트 상태로 유지하고,
 * 활성 탭만 `display: block`으로 보여줍니다.
 * → 탭 전환 시 데이터/입력 상태가 그대로 보존됩니다.
 */
export function TabContentArea() {
    const openTabs = useRecoilValue(OpenTabsState);
    const activeTabId = useRecoilValue(ActiveTabIdState);

    if (openTabs.length === 0) {
        return <EmptyMessage>사이드바에서 메뉴를 선택하세요</EmptyMessage>;
    }

    return (
        <>
            {openTabs.map((tab) => {
                const Component = PATH_TO_COMPONENT[tab.path];
                if (!Component) return null;

                return (
                    <TabPane
                        key={tab.id}
                        $visible={activeTabId === tab.id}
                    >
                        <Component />
                    </TabPane>
                );
            })}
        </>
    );
}
