import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { 
    CalendarCheck, 
    ShoppingCart, 
    FilmStrip, 
    ArrowRight, 
    ChartLineUp, 
    Buildings, 
    Wallet, 
    Handshake 
} from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { AxiosGet } from "../../../axios/Axios";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { GenericTable } from "../../../components/GenericTable";
import { FadeIn } from "../../../components/common/MotionWrapper";

const DashboardContainer = styled.div`
    padding: 24px;
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
        margin: 4px 0 0;
        font-size: 14px;
        color: #64748b;
    }
`;

const SummaryGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 20px;
`;

const MetricCard = styled.div`
    background: white;
    padding: 24px;
    border-radius: 12px;
    border: 1px solid #cbd5e1;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    gap: 16px;
    transition: transform 0.2s;
    
    &:hover {
        transform: translateY(-2px);
    }

    .icon-box {
        width: 48px;
        height: 48px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f1f5f9;
        color: #2563eb;
    }

    .info {
        .label {
            font-size: 14px;
            color: #64748b;
            font-weight: 600;
        }
        .value {
            font-size: 24px;
            font-weight: 800;
            color: #0f172a;
        }
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
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);

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
        font-size: 15px;
        font-weight: 700;
        color: #1e293b;
    }
`;

export default function Main() {
    const navigate = useNavigate();
    const today = dayjs().format("YYYY-MM-DD");
    
    const [scoreCount, setScoreCount] = useState(0);
    const [todayOrderCount, setTodayOrderCount] = useState(0);
    const [todayMovieCount, setTodayMovieCount] = useState(0);
    const [recentOrders, setRecentOrders] = useState([]);
    const [recentMovies, setRecentMovies] = useState([]);
    
    // 알짜배기 극장 분석용 상태
    const [selectedYear, setSelectedYear] = useState(dayjs().year());
    const [selectedMonth, setSelectedMonth] = useState(dayjs().month() + 1);
    const [movieOptions, setMovieOptions] = useState<any[]>([]);
    const [selectedMovieId, setSelectedMovieId] = useState<string | number>("");
    const [topTheaters, setTopTheaters] = useState<any[]>([]);

    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. 오늘의 스코어 개수 (백엔드에서 계산된 score_count 사용)
            const scoreRes = await AxiosGet(`scores/?created_date=${today}`);
            setScoreCount(scoreRes.data.score_count || 0);

            // 2. 오늘 생성된 오더 개수
            const todayOrderRes = await AxiosGet(`orderlist/?created_date_at=${today}&page_size=1`);
            setTodayOrderCount(todayOrderRes.data.count || 0);

            // 3. 오늘 등록된 영화 개수
            const todayMovieRes = await AxiosGet(`movies/?created_date__date=${today}&page_size=1`);
            setTodayMovieCount(todayMovieRes.data.count || 0);

            // 4. 최근 오더 10개
            const orderRes = await AxiosGet("orderlist/?ordering=-id&page_size=10");
            setRecentOrders(orderRes.data.results || []);

            // 5. 최근 영화 10개
            const movieRes = await AxiosGet("movies/?ordering=-id&page_size=10");
            setRecentMovies(movieRes.data.results || []);
        } catch (error) {
            console.error("Dashboard data fetch error:", error);
        } finally {
            setLoading(false);
        }
    }, [today]);

    // 해당 연도/월에 데이터가 있는 영화 목록 조회 (Settlement API 활용)
    const fetchMovieOptions = useCallback(async () => {
        const yyyyMm = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
        try {
            const res = await AxiosGet(`settlement-movies/?yyyyMm=${yyyyMm}`);
            const movies = res.data || [];
            setMovieOptions(movies);
            if (movies.length > 0) {
                setSelectedMovieId(movies[0].id);
            } else {
                setSelectedMovieId("");
                setTopTheaters([]);
            }
        } catch (error) {
            console.error("Fetch movie options error:", error);
        }
    }, [selectedYear, selectedMonth]);

    // 알짜배기 극장 분석 API 호출
    const fetchTopTheaters = useCallback(async (movieId: string | number, year: number, month: number) => {
        if (!movieId) return;
        try {
            const res = await AxiosGet(`scores/statistics/?movie_id=${movieId}&year=${year}&month=${month}`);
            const data = (res.data.top_theaters || []).map((item: any, index: number) => ({
                ...item,
                rank: index + 1 // 순위 NaN 에러 방지용으로 데이터에 rank 삽입
            }));
            setTopTheaters(data);
        } catch (error) {
            console.error("Fetch top theaters error:", error);
        }
    }, []);

    // 연도/월 변경 시 영화 목록 갱신
    useEffect(() => {
        fetchMovieOptions();
    }, [fetchMovieOptions]);

    // 영화 선택 시 통계 갱신
    useEffect(() => {
        if (selectedMovieId) {
            fetchTopTheaters(selectedMovieId, selectedYear, selectedMonth);
        }
    }, [selectedMovieId, selectedYear, selectedMonth, fetchTopTheaters]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const orderHeaders = [
        { key: "start_date", label: "기준일자" },
        { key: "movie", label: "영화", renderCell: (v) => v?.title_ko || "" },
        { key: "distributor", label: "배급사", renderCell: (_, item) => item.movie?.distributor?.client_name || "" },
        { key: "created_date", label: "등록일시", renderCell: (v) => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "" },
        { key: "create_user", label: "등록자", renderCell: (v) => typeof v === 'object' ? v?.nickname || v?.username : v },
    ];

    const movieHeaders = [
        { key: "title_ko", label: "영화명" },
        { key: "release_date", label: "개봉일" },
        { key: "distributor", label: "배급사", renderCell: (v: any) => v?.client_name || "" },
        { key: "created_date", label: "등록일시", renderCell: (v: any) => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "" },
        { key: "create_user", label: "등록자", renderCell: (v: any) => typeof v === 'object' ? v?.nickname || v?.username : v },
    ];

    const topTheaterHeaders = [
        { key: "rank", label: "순위" },
        { key: "date", label: "일자" },
        { key: "theater", label: "극장명" },
        { key: "auditorium", label: "상영관" },
        { key: "seat_count", label: "좌석수", renderCell: (v: number) => `${v.toLocaleString()}석` },
        { key: "show_count", label: "상영횟수", renderCell: (v: number) => `${v.toLocaleString()}회` },
        { key: "visitor", label: "관객수(일)", renderCell: (v: number) => `${v.toLocaleString()}명` },
        { key: "efficiency", label: "점유율(효율)", renderCell: (v: number) => <span style={{ color: v >= 50 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>{v}%</span> },
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

                <SummaryGrid>
                    <MetricCard>
                        <div className="icon-box">
                            <CalendarCheck size={28} weight="fill" />
                        </div>
                        <div className="info">
                            <div className="label">오늘의 스코어 등록</div>
                            <div className="value">{scoreCount} 건</div>
                        </div>
                    </MetricCard>
                    <MetricCard>
                        <div className="icon-box" style={{ background: '#fef2f2', color: '#dc2626' }}>
                            <ShoppingCart size={28} weight="fill" />
                        </div>
                        <div className="info">
                            <div className="label">오늘 생성된 오더</div>
                            <div className="value">{todayOrderCount} 건</div>
                        </div>
                    </MetricCard>
                    <MetricCard>
                        <div className="icon-box" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                            <FilmStrip size={28} weight="fill" />
                        </div>
                        <div className="info">
                            <div className="label">오늘 등록된 영화</div>
                            <div className="value">{todayMovieCount} 건</div>
                        </div>
                    </MetricCard>
                </SummaryGrid>

                <MainContentGrid>
                    <CommonSectionCard height="450px" padding="0">
                        <CommonListHeader 
                            title="최근 생성 오더" 
                            actions={<ArrowRight size={20} cursor="pointer" onClick={() => navigate("/order")} />}
                        />
                        <div style={{ flex: 1, overflow: 'auto' }}>
                            <GenericTable 
                                headers={orderHeaders} 
                                data={recentOrders} 
                                getRowKey={(item) => `order-${item.id}`}
                                hidePagination
                            />
                        </div>
                    </CommonSectionCard>

                    <CommonSectionCard height="450px" padding="0">
                        <CommonListHeader 
                            title="최신 등록 영화" 
                            actions={<ArrowRight size={20} cursor="pointer" onClick={() => navigate("/movie")} />}
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

                <MainContentGrid>
                    <CommonSectionCard height="auto" padding="0">
                        <CommonListHeader 
                            title="🎬 알짜배기 상영관 찾기 (Top 10)" 
                            actions={
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <select 
                                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                        value={selectedYear}
                                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                    >
                                        {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y}년</option>)}
                                    </select>
                                    <select 
                                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                                    >
                                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
                                    </select>
                                    <select 
                                        style={{ padding: '4px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', minWidth: '180px', maxWidth: '300px' }}
                                        value={selectedMovieId}
                                        onChange={(e) => setSelectedMovieId(e.target.value)}
                                    >
                                        {movieOptions.length > 0 ? (
                                            movieOptions.map(m => <option key={m.id} value={m.id}>{m.title}</option>)
                                        ) : (
                                            <option value="">데이터 없음</option>
                                        )}
                                    </select>
                                </div>
                            }
                        />
                        <div style={{ padding: '0', minHeight: '300px' }}>
                            {topTheaters.length > 0 ? (
                                <GenericTable 
                                    headers={topTheaterHeaders} 
                                    data={topTheaters} 
                                    getRowKey={(item) => item.id}
                                    hidePagination
                                />
                            ) : (
                                <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px' }}>
                                    {movieOptions.length > 0 ? "데이터가 없습니다." : "해당 월에 상영 데이터가 있는 영화가 없습니다."}
                                </div>
                            )}
                        </div>
                    </CommonSectionCard>
                </MainContentGrid>

                <WelcomeText>
                    <h2>Quick Links</h2>
                </WelcomeText>
                
                <QuickLinksGrid>
                    {quickLinks.map((link, idx) => (
                        <LinkButton key={idx} onClick={() => navigate(link.path)}>
                            {link.icon}
                            <span>{link.label}</span>
                        </LinkButton>
                    ))}
                </QuickLinksGrid>
            </DashboardContainer>
        </FadeIn>
    );
}