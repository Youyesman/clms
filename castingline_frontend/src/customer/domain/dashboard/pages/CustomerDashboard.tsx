import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { CaretUp, CaretDown, Minus, User, CurrencyKrw, FilmStrip, Ticket } from "@phosphor-icons/react";
import { AxiosGet } from "../../../../axios/Axios";
import { handleBackendErrors } from "../../../../axios/handleBackendErrors";
import { useToast } from "../../../../components/common/CustomToast";
import { CustomSelect } from "../../../../components/common/CustomSelect";
import { CustomInput } from "../../../../components/common/CustomInput";

/* ─────────────────────────  유틸  ───────────────────────── */

const toNum = (v: any) => (isNaN(Number(v)) ? 0 : Number(v));
const fmt = (n: number) => Math.round(n).toLocaleString();
const yesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
};
const addDays = (dateStr: string, days: number) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
};
const pct = (cur: number, prev: number): number | null => {
    if (!prev) return null;
    return ((cur - prev) / prev) * 100;
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
    margin-top: 2px;
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
    border-radius: 10px;
    padding: 20px 22px;
    display: flex;
    align-items: center;
    gap: 18px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
`;

const StatIcon = styled.div<{ $bg: string; $fg: string }>`
    width: 52px; height: 52px; border-radius: 12px;
    background: ${({ $bg }) => $bg};
    color: ${({ $fg }) => $fg};
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
`;

const StatLabel = styled.div`
    font-size: 13.5px; color: #64748b; font-weight: 600; margin-bottom: 6px;
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
    border-radius: 10px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    display: flex;
    flex-direction: column;
    overflow: hidden;
`;

const PanelHead = styled.div`
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; padding: 14px 18px; border-bottom: 1px solid #eef2f7;
    flex-wrap: wrap;
`;
const PanelTitle = styled.div`
    font-size: 16px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px;
`;
const PanelControls = styled.div`display: flex; align-items: center; gap: 10px; flex-wrap: wrap;`;
const PanelBody = styled.div`padding: 16px 18px;`;

const SubHead = styled.div`
    font-size: 13px; font-weight: 800; color: #dc2626; margin: 16px 0 8px;
    &:first-child { margin-top: 0; }
`;

const StatTable = styled.table`
    width: 100%; border-collapse: collapse;
    th, td { padding: 6px 8px; font-size: 13.5px; }
    th { text-align: left; color: #94a3b8; font-weight: 700; font-size: 12px; border-bottom: 1px solid #eef2f7; }
    td { color: #334155; }
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
    font-size: 13.5px;
    &:nth-child(odd) { background: #f8fafc; }
`;
const RankNo = styled.span<{ $top: boolean }>`
    font-weight: 800; text-align: center;
    color: ${({ $top }) => ($top ? "#dc2626" : "#94a3b8")};
`;
const RankName = styled.span`color: #0f172a; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`;
const RankVisitor = styled.span`color: #334155; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; min-width: 60px;`;
const RankRevenue = styled.span`color: #64748b; text-align: right; font-variant-numeric: tabular-nums; min-width: 90px;`;

const Empty = styled.div`padding: 28px 8px; text-align: center; color: #94a3b8; font-size: 13.5px;`;

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

    const [regionRows, setRegionRows] = useState<any[]>([]);
    const [prevRegionRows, setPrevRegionRows] = useState<any[]>([]);
    const [multiRows, setMultiRows] = useState<any[]>([]);
    const [seatRows, setSeatRows] = useState<any[]>([]);
    const [prevSeatRows, setPrevSeatRows] = useState<any[]>([]);
    const [supplyRows, setSupplyRows] = useState<any[]>([]);
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

    /* 2) 전일 스코어 + 통계카드 데이터 로드 */
    const loadScore = useCallback(async () => {
        if (!movieId) return;
        const prevDate = addDays(scoreDate, -1);
        const releaseDate = selectedMovie?.release_date || "2006-01-01";
        try {
            const [region, prevRegion, multi, seat, prevSeat, supply] = await Promise.all([
                AxiosGet(`score/summary/`, { params: { movie_id: movieId, sort_by: "region", date_from: scoreDate, date_to: scoreDate, compare_mode: "daily" } }),
                AxiosGet(`score/summary/`, { params: { movie_id: movieId, sort_by: "region", date_from: prevDate, date_to: prevDate, compare_mode: "daily" } }),
                AxiosGet(`score/summary/`, { params: { movie_id: movieId, sort_by: "multi", date_from: scoreDate, date_to: scoreDate, compare_mode: "daily" } }),
                AxiosGet(`score/seat-rate/`, { params: { movie_id: movieId, date: scoreDate } }),
                AxiosGet(`score/seat-rate/`, { params: { movie_id: movieId, date: prevDate } }),
                AxiosGet(`score/supply-price/`, { params: { movie_id: movieId, date_from: releaseDate, date_to: scoreDate } }),
            ]);
            setRegionRows(region.data || []);
            setPrevRegionRows(prevRegion.data || []);
            setMultiRows(multi.data || []);
            setSeatRows(seat.data?.summary || []);
            setPrevSeatRows(prevSeat.data?.summary || []);
            setSupplyRows(supply.data?.rows || []);
        } catch (err) {
            toast.error(handleBackendErrors(err));
        }
    }, [movieId, scoreDate, selectedMovie, toast]);

    useEffect(() => { loadScore(); }, [loadScore]);

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

    /* ── 집계 계산 ── */
    const sumField = (rows: any[], f: string) => rows.reduce((a, r) => a + toNum(r[f]), 0);

    // 통계카드 (당일 vs 전일)
    const cards = useMemo(() => {
        const curVisitor = sumField(regionRows, "base_day_visitors");
        const prevVisitor = sumField(prevRegionRows, "base_day_visitors");
        const curFare = sumField(regionRows, "base_day_fare");
        const prevFare = sumField(prevRegionRows, "base_day_fare");
        const curScreen = sumField(regionRows, "screen_count");
        const prevScreen = sumField(prevRegionRows, "screen_count");
        return {
            visitor: { cur: curVisitor, diff: curVisitor - prevVisitor },
            fare: { cur: curFare, diff: curFare - prevFare },
            screen: { cur: curScreen, diff: curScreen - prevScreen },
        };
    }, [regionRows, prevRegionRows]);

    // 지역별 (서울 / 지방 / 전국 / 총누계)
    const regionStat = useMemo(() => {
        const seoul = regionRows.find((r) => r.section === "서울");
        const seoulCur = toNum(seoul?.base_day_visitors);
        const seoulPrev = toNum(seoul?.prev_day_visitors);
        const allCur = sumField(regionRows, "base_day_visitors");
        const allPrev = sumField(regionRows, "prev_day_visitors");
        const localCur = allCur - seoulCur;
        const localPrev = allPrev - seoulPrev;
        const cumTotal = sumField(regionRows, "total_visitors");
        const cumPrev = cumTotal - allCur; // 전일까지 누계
        return [
            { label: "서울", value: seoulCur, delta: pct(seoulCur, seoulPrev) },
            { label: "지방", value: localCur, delta: pct(localCur, localPrev) },
            { label: "전국", value: allCur, delta: pct(allCur, allPrev) },
            { label: "총 누계", value: cumTotal, delta: pct(cumTotal, cumPrev) },
        ];
    }, [regionRows]);

    // 멀티별 관객수 (롯데 / CGV / 메가 / 기타)
    const multiStat = useMemo(() => {
        const pick = (names: string[]) => multiRows.filter((r) => names.includes(r.section));
        const grp = (names: string[]) => {
            const rs = pick(names);
            const cur = sumField(rs, "base_day_visitors");
            const prev = sumField(rs, "prev_day_visitors");
            return { cur, delta: pct(cur, prev) };
        };
        const lotte = grp(["롯데"]);
        const cgv = grp(["CGV"]);
        const mega = grp(["메가박스"]);
        const known = ["롯데", "CGV", "메가박스"];
        const etcRows = multiRows.filter((r) => !known.includes(r.section));
        const etcCur = sumField(etcRows, "base_day_visitors");
        const etcPrev = sumField(etcRows, "prev_day_visitors");
        return [
            { label: "롯데", value: lotte.cur, delta: lotte.delta },
            { label: "CGV", value: cgv.cur, delta: cgv.delta },
            { label: "메가", value: mega.cur, delta: mega.delta },
            { label: "기타", value: etcCur, delta: pct(etcCur, etcPrev) },
        ];
    }, [multiRows]);

    // 좌석판매율 (멀티별, %p 전일대비)
    const seatStat = useMemo(() => {
        const rateOf = (rows: any[], multi: string) =>
            toNum(rows.find((r) => r.multi === multi)?.seat_rate);
        const row = (label: string, multi: string) => {
            const cur = rateOf(seatRows, multi);
            const prev = rateOf(prevSeatRows, multi);
            return { label, value: cur, deltaP: prev || cur ? cur - prev : null };
        };
        return [
            row("롯데", "롯데"),
            row("CGV", "CGV"),
            row("메가", "메가박스"),
            row("기타", "기타"),
        ];
    }, [seatRows, prevSeatRows]);

    // 공급가액 (당일 / 총누계, 전일대비%)
    const supplyStat = useMemo(() => {
        const byDate = (d: string) => supplyRows.find((r) => r.entry_date === d);
        const cur = toNum(byDate(scoreDate)?.supply_value);
        const prev = toNum(byDate(addDays(scoreDate, -1))?.supply_value);
        const cumTotal = sumField(supplyRows, "supply_value");
        const cumPrev = cumTotal - cur;
        return {
            day: { value: cur, delta: pct(cur, prev) },
            cum: { value: cumTotal, delta: pct(cumTotal, cumPrev) },
        };
    }, [supplyRows, scoreDate]);

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
                {/* ── 전일 스코어 ── */}
                <Panel>
                    <PanelHead>
                        <PanelTitle><Ticket size={20} weight="duotone" /> 전일 스코어</PanelTitle>
                        <PanelControls>
                            <CustomInput inputType="date" value={scoreDate} setValue={(v: string) => setScoreDate(v)} />
                        </PanelControls>
                    </PanelHead>
                    <PanelBody>
                        <SubHead>관객수 (지역별)</SubHead>
                        <StatTable>
                            <thead><tr><th>구분</th><th style={{ textAlign: "right" }}>관객수</th><th style={{ textAlign: "right" }}>전일대비</th></tr></thead>
                            <tbody>
                                {regionStat.map((r) => (
                                    <tr key={r.label} className={r.label === "총 누계" ? "total" : ""}>
                                        <td>{r.label}</td>
                                        <td className="num">{fmt(r.value)}</td>
                                        <td className="num"><Delta value={r.delta} unit="%" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </StatTable>

                        <SubHead>관객수 (멀티별)</SubHead>
                        <StatTable>
                            <tbody>
                                {multiStat.map((r) => (
                                    <tr key={r.label}>
                                        <td>{r.label}</td>
                                        <td className="num">{fmt(r.value)}</td>
                                        <td className="num"><Delta value={r.delta} unit="%" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </StatTable>

                        <SubHead>좌석판매율 (멀티별)</SubHead>
                        <StatTable>
                            <tbody>
                                {seatStat.map((r) => (
                                    <tr key={r.label}>
                                        <td>{r.label}</td>
                                        <td className="num">{r.value.toFixed(1)}%</td>
                                        <td className="num"><Delta value={r.deltaP} unit="%p" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </StatTable>

                        <SubHead>공급가액</SubHead>
                        <StatTable>
                            <tbody>
                                <tr>
                                    <td>{dateLabel(scoreDate)}</td>
                                    <td className="num">{fmt(supplyStat.day.value)}</td>
                                    <td className="num"><Delta value={supplyStat.day.delta} unit="%" /></td>
                                </tr>
                                <tr className="total">
                                    <td>총 누계</td>
                                    <td className="num">{fmt(supplyStat.cum.value)}</td>
                                    <td className="num"><Delta value={supplyStat.cum.delta} unit="%" /></td>
                                </tr>
                            </tbody>
                        </StatTable>
                    </PanelBody>
                </Panel>

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
