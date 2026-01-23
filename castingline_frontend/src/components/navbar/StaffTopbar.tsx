import styled, { css } from "styled-components";
import { useRecoilValue } from "recoil";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CaretDown, ArrowsClockwise, Monitor, Calendar, Timer } from "@phosphor-icons/react";
import { AccountState } from "../../atom/AccountState";
import UserInform from "./UserInform";
import { useTokenTimer } from "../../hooks/useTokenTimer";

/** 1. 전체 컨테이너 **/
const TopbarContainer = styled.header<{ $hasSidebar?: boolean }>`
    position: fixed;
    top: 0;
    left: ${({ $hasSidebar }) => ($hasSidebar ? "72px" : "0")};
    z-index: 1000;
    width: ${({ $hasSidebar }) => ($hasSidebar ? "calc(100% - 72px)" : "100%")};
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    background-color: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid #e2e8f0;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    transition: all 0.3s ease;
`;

const LeftSection = styled.div`
    display: flex;
    align-items: center;
    gap: 20px;
`;

const PageTitle = styled.div`
    display: flex;
    flex-direction: column;
    .breadcrumb {
        font-size: 11px;
        color: #94a3b8;
        font-weight: 600;
        margin-bottom: 2px;
    }
    .title {
        font-size: 16px;
        font-weight: 800;
        color: #0f172a;
    }
`;

const RightSection = styled.div`
    display: flex;
    align-items: center;
    gap: 24px;
`;

const UtilityGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding-right: 24px;
    border-right: 1px solid #e2e8f0;
`;

const IconButton = styled.button`
    background: none;
    border: none;
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    transition: all 0.2s;
    &:hover {
        background-color: #f1f5f9;
        color: #0f172a;
    }
`;

const LiveClock = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: "JetBrains Mono", monospace;
    font-size: 13px;
    font-weight: 600;
    color: #475569;
    background-color: #f8fafc;
    padding: 6px 12px;
    border-radius: 20px;
    border: 1px solid #e2e8f0;
`;

// 경로별 한글 매핑 맵
const PATH_MAP: Record<string, { group: string; name: string }> = {
    "/manage/manage_client": { group: "기준 정보", name: "거래처 관리" },
    "/manage/manage_user": { group: "기준 정보", name: "사용자 관리" },
    "/manage/manage_movie": { group: "기준 정보", name: "영화 관리" },
    "/manage/manage_theater_map": { group: "기준 정보", name: "극장명 매핑 관리" },
    "/manage/manage_order": { group: "운영 관리", name: "오더 관리" },
    "/manage/manage_score": { group: "운영 관리", name: "스코어 관리" },
    "/manage/manage_fund": { group: "운영 관리", name: "기금 관리" },
    "/manage/manage_rate": { group: "정산 관리", name: "부율 관리" },
    "/manage/manage_settlement": { group: "정산 관리", name: "부금 정산 관리" },
    "/manage/manage_special_settlement": { group: "정산 관리", name: "지정 부금 관리" },
    "/manage/my_profile": { group: "시스템", name: "내 정보 수정" },
    "/score": { group: "대시보드", name: "스코어 현황" },
    "/time_table": { group: "대시보드", name: "시간표 조회" },
};

function StaffTopbar({ $hasSidebar }: { $hasSidebar?: boolean }) {
    const { t } = useTranslation();
    const location = useLocation();
    const { timeLeft, isExpired, refreshToken } = useTokenTimer();

    const currentPage = PATH_MAP[location.pathname] || { group: "System", name: "Castingline" };

    const handleRefresh = () => {
        refreshToken(); // 전체 페이지 새로고침 대신 세션 연장
    };

    const handleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    return (
        <TopbarContainer $hasSidebar={$hasSidebar}>
            <LeftSection>
                <PageTitle>
                    <div className="breadcrumb">{currentPage.group}</div>
                    <div className="title">{currentPage.name}</div>
                </PageTitle>
            </LeftSection>

            <RightSection>
                <UtilityGroup>
                    <LiveClock style={{ color: isExpired ? "#e11d48" : undefined, gap: "12px", padding: "6px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Timer size={16} weight="bold" />
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8" }}>로그인 유효 시간</span>
                        </div>
                        <span style={{ minWidth: "45px", textAlign: "right" }}>{timeLeft}</span>
                    </LiveClock>

                    <IconButton onClick={handleRefresh} title="세션 연장">
                        <ArrowsClockwise size={20} weight="bold" />
                    </IconButton>

                    <IconButton onClick={handleFullscreen} title="전체화면">
                        <Monitor size={20} weight="bold" />
                    </IconButton>
                </UtilityGroup>

                <UserInform />
            </RightSection>
        </TopbarContainer>
    );
}

export default StaffTopbar;
