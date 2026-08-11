import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import {
    ShoppingCart,
    FilmStrip,
    ArrowRight,
    ChartLineUp,
    Buildings,
} from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { useRecoilState } from "recoil";
import dayjs from "dayjs";
import { AxiosGet } from "../../../axios/Axios";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { GenericTable } from "../../../components/GenericTable";
import { FadeIn } from "../../../components/common/MotionWrapper";
import { OpenTabsState, ActiveTabIdState, PATH_TO_TAB_LABEL, Tab } from "../../../atom/TabState";
import SharedMemo from "../components/SharedMemo";
import SharedCalendar from "../components/SharedCalendar";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { DailyScorePanel } from "../../../customer/domain/dashboard/components/DailyScorePanel";

/* 카드 헤더에 붙는 조회 조건 — 필터 칩과 같은 규격 */
const HeaderSelect = styled.select`
    height: 30px;
    padding: 0 10px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #ffffff;
    color: #0f172a;
    font-size: 12.5px;
    line-height: 20px;
    cursor: pointer;
    max-width: 300px;
    transition: border-color 0.12s ease;

    &:hover { border-color: #cbd5e1; }
    &:focus {
        outline: none;
        border-color: #2563eb;
        box-shadow: 0 0 0 3px #eff6ff;
    }
`;

const DashboardContainer = styled.div`
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    background-color: #f8fafc;
    min-height: calc(100vh - 64px);
    font-family: "SUIT", sans-serif;
`;

const HeaderSection = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const WelcomeText = styled.div`
    h2 {
        margin: 0;
        font-size: 24px;
        font-weight: 800;
        color: #0f172a;
    }
    p {
        margin: 10px 0 0;
        font-size: 14px;
        color: #64748b;
    }
`;

const MainContentGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;

    @media (max-width: 1200px) {
        grid-template-columns: 1fr;
    }
`;

const QuickLinksGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;

    @media (max-width: 768px) {
        grid-template-columns: repeat(2, 1fr);
    }
`;

const LinkButton = styled.button`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    background: white;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.05);

    &:hover {
        background: #f8fafc;
        border-color: #2563eb;
        transform: translateY(-2px);
        box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.1);
        
        svg {
            color: #2563eb;
        }
    }

    svg {
        color: #475569;
        transition: color 0.2s;
    }

    span {
        font-size: 14px;
        font-weight: 700;
        color: #1e293b;
    }
`;

interface DailySummaryRow {
    movie_id: number;
    title: string;
    distributor: string;
    visitors: number;
    revenue: number;
    theaters: number;
    screens: number;
    shows: number;
}

export default function Main() {
    const navigate = useNavigate();
    const [openTabs, setOpenTabs] = useRecoilState(OpenTabsState);
    const [, setActiveTabId] = useRecoilState(ActiveTabIdState);

    const handleNavClick = (path: string) => {
        const label = PATH_TO_TAB_LABEL[path] || path;
        const exists = openTabs.find((t) => t.id === path);
        if (!exists) {
            const newTab: Tab = { id: path, label, path, closable: true };
            setOpenTabs((prev) => [...prev, newTab]);
        }
        setActiveTabId(path);
        navigate(path);
    };
    
    const { openModal } = useGlobalModal();
    const [recentMovies, setRecentMovies] = useState([]);
    const [, setLoading] = useState(true);

    // 전일 스코어 요약 (D003) — 기준일자는 접속일 전일이 기본
    const [summaryDate, setSummaryDate] = useState(dayjs().subtract(1, "day").format("YYYY-MM-DD"));
    const [dailySummary, setDailySummary] = useState<DailySummaryRow[]>([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // 최근 영화 10개
            const movieRes = await AxiosGet("movies/?ordering=-id&page_size=10");
            setRecentMovies(movieRes.data.results || []);
        } catch (error) {
            console.error("Dashboard data fetch error:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchDailySummary = useCallback(async () => {
        try {
            const res = await AxiosGet(`score/daily-movie-summary/?date=${summaryDate}`);
            setDailySummary(res.data?.rows || []);
        } catch (error) {
            console.error("Daily score summary fetch error:", error);
            setDailySummary([]);
        }
    }, [summaryDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        fetchDailySummary();
    }, [fetchDailySummary]);

    // 영화를 클릭하면 거래처 대시보드의 '전일 스코어' 화면을 팝업으로 보여준다 (D001).
    // 모달이라 마우스를 옮겨도 닫히지 않고 표 안의 값도 그대로 복사할 수 있다.
    const openDailyScorePopup = (row: DailySummaryRow) => {
        if (!row?.movie_id) return;
        // 모달 본문이 자체 스크롤을 가지므로 안쪽에 별도 스크롤을 만들지 않는다
        openModal(
            <DailyScorePanel
                movieId={String(row.movie_id)}
                date={summaryDate}
                title={`${row.title} · ${summaryDate}`}
            />,
            { title: "전일 스코어", width: "560px" }
        );
    };

    const dailySummaryHeaders = [
        { key: "title", label: "영화명" },
        { key: "distributor", label: "배급사" },
        { key: "visitors", label: "관객수", renderCell: (v: number) => `${(v || 0).toLocaleString()}명` },
        { key: "revenue", label: "매출액", renderCell: (v: number) => `${(v || 0).toLocaleString()}원` },
        { key: "theaters", label: "극장수", renderCell: (v: number) => `${(v || 0).toLocaleString()}개` },
        { key: "screens", label: "스크린수", renderCell: (v: number) => `${(v || 0).toLocaleString()}개` },
        { key: "shows", label: "상영횟수", renderCell: (v: number) => `${(v || 0).toLocaleString()}회` },
    ];

    const movieHeaders = [
        { key: "title_ko", label: "영화명" },
        { key: "release_date", label: "개봉일" },
        { key: "distributor", label: "배급사", renderCell: (v: any) => v?.client_name || "" },
        { key: "created_date", label: "등록일시", renderCell: (v: any) => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "" },
        { key: "create_user", label: "등록자", renderCell: (v: any) => typeof v === 'object' ? v?.nickname || v?.username : v },
    ];

    const quickLinks = [
        { icon: <ShoppingCart size={32} weight="duotone" />, label: "오더 관리", path: "/manage/manage_order" },
        { icon: <Buildings size={32} weight="duotone" />, label: "거래처 관리", path: "/manage/manage_client" },
        { icon: <ChartLineUp size={32} weight="duotone" />, label: "정산 관리", path: "/manage/manage_settlement" },
        { icon: <FilmStrip size={32} weight="duotone" />, label: "스코어 관리", path: "/manage/manage_score" },
    ];

    return (
        <FadeIn>
            <DashboardContainer>
                <HeaderSection>
                    <WelcomeText>
                        <h2>Casting Line Dashboard</h2>
                        <p>오늘은 {dayjs().format("YYYY년 MM월 DD일")} 입니다.</p>
                    </WelcomeText>
                </HeaderSection>

                <MainContentGrid>
                    <SharedCalendar />
                    <SharedMemo />

                    <CommonSectionCard height="450px" padding="0">
                        <CommonListHeader
                            title="전일 스코어 요약"
                            actions={
                                <HeaderSelect
                                    as="input"
                                    type="date"
                                    value={summaryDate}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSummaryDate(e.target.value)}
                                />
                            }
                        />
                        <div style={{ flex: 1, overflow: 'auto' }}>
                            {dailySummary.length > 0 ? (
                                <GenericTable
                                    headers={dailySummaryHeaders}
                                    data={dailySummary}
                                    getRowKey={(item: any) => `daily-${item.movie_id}`}
                                    onSelectItem={openDailyScorePopup}
                                    hidePagination
                                />
                            ) : (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px' }}>
                                    해당 일자에 등록된 스코어가 없습니다.
                                </div>
                            )}
                        </div>
                    </CommonSectionCard>

                    <CommonSectionCard height="450px" padding="0">
                        <CommonListHeader
                            title="최신 등록 영화"
                            actions={<ArrowRight size={20} cursor="pointer" onClick={() => handleNavClick("/manage/manage_movie")} />}
                        />
                        <div style={{ flex: 1, overflow: 'auto' }}>
                            <GenericTable 
                                headers={movieHeaders} 
                                data={recentMovies} 
                                getRowKey={(item) => `movie-${item.id}`}
                                hidePagination
                            />
                        </div>
                    </CommonSectionCard>

                </MainContentGrid>

                <WelcomeText>
                    <h2>Quick Links</h2>
                </WelcomeText>
                
                <QuickLinksGrid>
                    {quickLinks.map((link, idx) => (
                        <LinkButton key={idx} onClick={() => handleNavClick(link.path)}>
                            {link.icon}
                            <span>{link.label}</span>
                        </LinkButton>
                    ))}
                </QuickLinksGrid>
            </DashboardContainer>
        </FadeIn>
    );
}