import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { CaretUp, CaretDown, Minus, User, CurrencyKrw, FilmStrip } from "@phosphor-icons/react";
import { AxiosGet } from "../../../../axios/Axios";
import { handleBackendErrors } from "../../../../axios/handleBackendErrors";
import { useToast } from "../../../../components/common/CustomToast";
import { CustomSelect } from "../../../../components/common/CustomSelect";
import { CustomInput } from "../../../../components/common/CustomInput";
import { DailyScorePanel, DailyScoreCards } from "../components/DailyScorePanel";

/* ─────────────────────────  유틸  ───────────────────────── */

const toNum = (v: any) => (isNaN(Number(v)) ? 0 : Number(v));
const fmt = (n: number) => Math.round(n).toLocaleString();
const yesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
};

interface MovieItem {
    id: number;
    title_ko: string;
    release_date?: string;
}

/* ─────────────────────────  스타일  ───────────────────────── */

const Wrap = styled.div`
    flex: 1;
    min-height: calc(100vh - 60px);
    background: #f1f5f9;
    padding: 20px 24px 48px;
    font-family: "Pretendard", "Apple SD Gothic Neo", sans-serif;
`;

const HeaderRow = styled.div`
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 18px;
    flex-wrap: wrap;
`;

const Title = styled.h1`
    font-size: 26px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.6px;
    margin: 0;
`;

const TodayText = styled.div`
    font-size: 13px;
    color: #64748b;
    margin-top: 10px;
`;

const TitleBlock = styled.div``;

const CardRow = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 18px;
    @media (max-width: 1100px) { grid-template-columns: 1fr; }
`;

const StatCard = styled.div`
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 20px 22px;
    display: flex;
    align-items: center;
    gap: 18px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
`;

const StatIcon = styled.div<{ $bg: string; $fg: string }>`
    width: 52px; height: 52px; border-radius: 12px;
    background: ${({ $bg }) => $bg};
    color: ${({ $fg }) => $fg};
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
`;

const StatLabel = styled.div`
    font-size: 13px; color: #64748b; font-weight: 600; margin-bottom: 6px;
`;
const StatValue = styled.div`
    font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;
    display: flex; align-items: baseline; gap: 8px;
`;

const PanelRow = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    @media (max-width: 1100px) { grid-template-columns: 1fr; }
`;

const Panel = styled.div`
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    display: flex;
    flex-direction: column;
    overflow: hidden;
`;

const PanelHead = styled.div`
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; padding: 14px 18px; border-bottom: 1px solid #f1f5f9;
    flex-wrap: wrap;
`;
const PanelTitle = styled.div`
    font-size: 16px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px;
`;
const PanelControls = styled.div`display: flex; align-items: center; gap: 10px; flex-wrap: wrap;`;
const PanelBody = styled.div`padding: 16px 18px;`;


const StatTable = styled.table`
    width: 100%; border-collapse: collapse;
    th, td { padding: 6px 8px; font-size: 13px; }
    th { text-align: left; color: #94a3b8; font-weight: 700; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
    td { color: #475569; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    tr.total td { border-top: 1px solid #e2e8f0; font-weight: 800; color: #0f172a; }
`;

const DeltaSpan = styled.span<{ $dir: number }>`
    display: inline-flex; align-items: center; gap: 2px;
    font-size: 12.5px; font-weight: 700;
    color: ${({ $dir }) => ($dir > 0 ? "#dc2626" : $dir < 0 ? "#2563eb" : "#94a3b8")};
`;

const RankList = styled.ol`
    list-style: none; margin: 0; padding: 0;
`;
const RankItem = styled.li`
    display: grid;
    grid-template-columns: 28px 1fr auto auto;
    align-items: center;
    gap: 10px;
    padding: 9px 8px;
    border-radius: 6px;
    font-size: 13px;
    &:nth-child(odd) { background: #f8fafc; }
`;
const RankNo = styled.span<{ $top: boolean }>`
    font-weight: 800; text-align: center;
    color: ${({ $top }) => ($top ? "#dc2626" : "#94a3b8")};
`;
const RankName = styled.span`color: #0f172a; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`;
const RankVisitor = styled.span`color: #475569; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; min-width: 60px;`;
const RankRevenue = styled.span`color: #64748b; text-align: right; font-variant-numeric: tabular-nums; min-width: 90px;`;

const Empty = styled.div`padding: 28px 8px; text-align: center; color: #94a3b8; font-size: 13px;`;

/* ── 전일대비 표시 ── */
function Delta({ value, unit }: { value: number | null; unit: string }) {
    if (value === null || isNaN(value)) return <DeltaSpan $dir={0}>-</DeltaSpan>;
    const dir = value > 0 ? 1 : value < 0 ? -1 : 0;
    const Icon = dir > 0 ? CaretUp : dir < 0 ? CaretDown : Minus;
    const sign = value > 0 ? "+" : "";
    return (
        <DeltaSpan $dir={dir}>
            <Icon size={11} weight="fill" />
            {sign}{unit === "%p" ? value.toFixed(1) : value.toFixed(1)}{unit}
        </DeltaSpan>
    );
}

/* ─────────────────────────  컴포넌트  ───────────────────────── */

export function CustomerDashboard() {
    const toast = useToast();

    const [movies, setMovies] = useState<MovieItem[]>([]);
    const [movieId, setMovieId] = useState<string>("");
    const [scoreDate, setScoreDate] = useState<string>(yesterday());
    const [rankDate, setRankDate] = useState<string>(yesterday());

    const [rankRows, setRankRows] = useState<any[]>([]);

    const selectedMovie = useMemo(
        () => movies.find((m) => m.id.toString() === movieId),
        [movies, movieId]
    );

    /* 1) 배급사 영화 목록 로드 + 가장 최신 영화 자동 선택 */
    useEffect(() => {
        const loadMovies = async () => {
            const baseYear = new Date(scoreDate).getFullYear();
            for (const y of [baseYear, baseYear - 1, baseYear - 2]) {
                try {
                    const res = await AxiosGet(`score/movies-by-year/`, { params: { year: y } });
                    const list: MovieItem[] = res.data || [];
                    if (list.length > 0) {
                        // 가장 최신(개봉일 desc) 영화 자동 선택
                        const sorted = [...list].sort((a, b) =>
                            (b.release_date || "").localeCompare(a.release_date || "")
                        );
                        setMovies(sorted);
                        setMovieId(sorted[0].id.toString());
                        return;
                    }
                } catch (err) {
                    toast.error(handleBackendErrors(err));
                    return;
                }
            }
            setMovies([]);
            setMovieId("");
        };
        loadMovies();
        // 최초 1회만
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* 2) 통계카드 값 — 전일 스코어 패널이 계산해 올려준다 */
    const [cards, setCards] = useState<DailyScoreCards>({
        visitor: { cur: 0, diff: 0 },
        fare: { cur: 0, diff: 0 },
        screen: { cur: 0, diff: 0 },
    });

    /* 3) 알짜배기 상영관 Top10 로드 */
    const loadRanking = useCallback(async () => {
        if (!movieId) return;
        try {
            const res = await AxiosGet(`score/ranking/`, {
                params: { movie_id: movieId, date_from: rankDate, date_to: rankDate, sort_by: "visitor" },
            });
            setRankRows((res.data?.rows || []).slice(0, 10));
        } catch (err) {
            toast.error(handleBackendErrors(err));
        }
    }, [movieId, rankDate, toast]);

    useEffect(() => { loadRanking(); }, [loadRanking]);

    const movieOptions = useMemo(
        () => movies.map((m) => ({ label: m.title_ko, value: m.id.toString() })),
        [movies]
    );

    const today = new Date();
    const todayStr = `${today.getFullYear()}년 ${String(today.getMonth() + 1).padStart(2, "0")}월 ${String(today.getDate()).padStart(2, "0")}일`;
    const dateLabel = (d: string) => {
        const dt = new Date(d);
        return `${dt.getMonth() + 1}월 ${dt.getDate()}일`;
    };

    return (
        <Wrap>
            <HeaderRow>
                <TitleBlock>
                    <Title>Casting Line Dashboard</Title>
                    <TodayText>오늘은 {todayStr} 입니다.</TodayText>
                </TitleBlock>
                <CustomSelect
                    style={{ width: "320px" }}
                    label="영화명"
                    allowClear={false}
                    options={movieOptions}
                    value={movieId}
                    onChange={(v) => setMovieId(v)}
                />
            </HeaderRow>

            {/* ── 통계카드 ── */}
            <CardRow>
                <StatCard>
                    <StatIcon $bg="#eff6ff" $fg="#2563eb"><User size={28} weight="duotone" /></StatIcon>
                    <div>
                        <StatLabel>{dateLabel(scoreDate)} 총 관객수 (전일 대비)</StatLabel>
                        <StatValue>
                            {fmt(cards.visitor.cur)}명
                            <DeltaSpan $dir={cards.visitor.diff > 0 ? 1 : cards.visitor.diff < 0 ? -1 : 0}>
                                ({cards.visitor.diff >= 0 ? "+" : ""}{fmt(cards.visitor.diff)}명)
                            </DeltaSpan>
                        </StatValue>
                    </div>
                </StatCard>
                <StatCard>
                    <StatIcon $bg="#f0fdf4" $fg="#16a34a"><CurrencyKrw size={28} weight="duotone" /></StatIcon>
                    <div>
                        <StatLabel>{dateLabel(scoreDate)} 총 매출액 (전일 대비)</StatLabel>
                        <StatValue>
                            {fmt(cards.fare.cur)}원
                            <DeltaSpan $dir={cards.fare.diff > 0 ? 1 : cards.fare.diff < 0 ? -1 : 0}>
                                ({cards.fare.diff >= 0 ? "+" : ""}{fmt(cards.fare.diff)}원)
                            </DeltaSpan>
                        </StatValue>
                    </div>
                </StatCard>
                <StatCard>
                    <StatIcon $bg="#fef2f2" $fg="#dc2626"><FilmStrip size={28} weight="duotone" /></StatIcon>
                    <div>
                        <StatLabel>{dateLabel(scoreDate)} 총 스크린수 (전일 대비)</StatLabel>
                        <StatValue>
                            {fmt(cards.screen.cur)}개
                            <DeltaSpan $dir={cards.screen.diff > 0 ? 1 : cards.screen.diff < 0 ? -1 : 0}>
                                ({cards.screen.diff >= 0 ? "+" : ""}{fmt(cards.screen.diff)}개)
                            </DeltaSpan>
                        </StatValue>
                    </div>
                </StatCard>
            </CardRow>

            <PanelRow>
                {/* ── 전일 스코어 (관리자 대시보드 팝업과 공용 컴포넌트) ── */}
                <DailyScorePanel
                    movieId={movieId}
                    releaseDate={selectedMovie?.release_date}
                    date={scoreDate}
                    onDateChange={setScoreDate}
                    onCardsChange={setCards}
                />

                {/* ── 알짜배기 상영관 Top10 ── */}
                <Panel>
                    <PanelHead>
                        <PanelTitle>🎯 알짜배기 상영관 찾기 (Top 10)</PanelTitle>
                        <PanelControls>
                            <CustomInput inputType="date" value={rankDate} setValue={(v: string) => setRankDate(v)} />
                        </PanelControls>
                    </PanelHead>
                    <PanelBody>
                        {rankRows.length === 0 ? (
                            <Empty>해당 일자의 상영관 데이터가 없습니다.</Empty>
                        ) : (
                            <RankList>
                                {rankRows.map((r, i) => (
                                    <RankItem key={`${r.theater}-${i}`}>
                                        <RankNo $top={i < 3}>{i + 1}</RankNo>
                                        <RankName title={r.theater}>{r.theater}</RankName>
                                        <RankVisitor>{fmt(toNum(r.visitor))}명</RankVisitor>
                                        <RankRevenue>{fmt(toNum(r.revenue))}원</RankRevenue>
                                    </RankItem>
                                ))}
                            </RankList>
                        )}
                    </PanelBody>
                </Panel>
            </PanelRow>
        </Wrap>
    );
}

export default CustomerDashboard;
