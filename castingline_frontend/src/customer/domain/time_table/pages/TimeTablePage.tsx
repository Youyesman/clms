import React, { useState, useEffect, useCallback, useMemo } from "react";
import styled from "styled-components";
import { Link } from "react-router-dom";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer,
} from "recharts";
import { useToast } from "../../../../components/common/CustomToast";
import { AxiosGet } from "../../../../axios/Axios";
import { handleBackendErrors } from "../../../../axios/handleBackendErrors";

/* ── 유틸 ── */
const fmt = (n: number | null | undefined) =>
    n == null ? "-" : Math.round(n).toLocaleString("ko-KR");
const fmtD = (n: number | null | undefined) =>
    n == null ? "-" : Number(n).toFixed(1);
const fmtPct = (n: number | null | undefined) =>
    n == null ? "-" : Number(n).toFixed(1) + "%";

/* ── 타입 ── */
interface MovieOption {
    id: number;
    title_ko: string;
    movie_code: string;
    release_date: string | null;
    distributor_name: string | null;
}

interface StatRow {
    label: string;
    theater_count: number;
    show_count: number;
    avg_shows: number;
    screen_count: number;
    total_seats: number;
    avg_seats: number;
    sold_seats: number;
    is_total?: boolean;
}

interface FormatRow extends StatRow {
    format: string;
    classification: string;
}

interface SlotRow {
    label: string;
    조조?: number;
    오전?: number;
    오후?: number;
    저녁?: number;
    심야?: number;
    total?: number;
    is_total?: boolean;
}

interface DailyPoint {
    date: string;
    total_seats: number;
}

interface TimetableData {
    meta: {
        movie_title: string;
        release_date: string | null;
        distributor_name: string | null;
    };
    by_chain: StatRow[];
    by_region: StatRow[];
    by_format: FormatRow[];
    time_slots: { count_rows: SlotRow[]; pct_rows: SlotRow[] };
    daily_chart: DailyPoint[];
}

/* ── 스타일 ── */
const PageWrapper = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: #f8fafc;
    min-height: calc(100vh - 60px);
    padding: 20px;
    gap: 16px;
`;

const FilterCard = styled.div`
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const FilterRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: flex-end;
`;

const FieldBox = styled.div<{ $error?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 4px;
    label {
        font-size: 11px;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    select, input {
        height: 34px;
        padding: 0 10px;
        border: 1.5px solid ${p => p.$error ? "#ef4444" : "#e2e8f0"};
        border-radius: 6px;
        font-size: 13px;
        color: #1e293b;
        background: white;
        outline: none;
        &:focus { border-color: ${p => p.$error ? "#ef4444" : "#3b82f6"}; }
        &:disabled { background: #f8fafc; color: #94a3b8; cursor: default; }
    }
    .err-msg {
        font-size: 11px;
        color: #ef4444;
        font-weight: 500;
    }
`;

const SearchBtn = styled.button`
    height: 34px;
    padding: 0 20px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    &:hover { background: #2563eb; }
    &:disabled { background: #94a3b8; cursor: not-allowed; }
`;

const SectionCard = styled.div`
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
`;

const SectionTitle = styled.div`
    font-size: 13px;
    font-weight: 700;
    color: #1e293b;
    padding: 10px 14px;
    background: #f1f5f9;
    border-bottom: 1px solid #e2e8f0;
`;

const TableWrap = styled.div`
    overflow-x: auto;
`;

const Tbl = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    white-space: nowrap;
    th, td {
        border: 1px solid #e2e8f0;
        padding: 5px 10px;
        text-align: center;
    }
    th {
        background: #f1f5f9;
        font-weight: 700;
        color: #334155;
        position: sticky;
        top: 0;
        z-index: 1;
    }
    td { color: #475569; }
    tbody tr:hover td { background: #f8fafc; }
    .total-row td {
        background: #dbeafe !important;
        color: #1e40af !important;
        font-weight: 700;
        font-size: 12.5px;
    }
`;

const TwoColGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    @media (max-width: 1100px) { grid-template-columns: 1fr; }
`;

const ChartSection = styled(SectionCard)``;

const PopoverBox = styled.div<{ $x: number; $y: number }>`
    position: fixed;
    left: ${p => p.$x + 12}px;
    top: ${p => p.$y - 30}px;
    background: #1e293b;
    color: white;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    pointer-events: none;
    z-index: 9999;
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
`;

const EmptyMsg = styled.div`
    text-align: center;
    padding: 40px;
    color: #94a3b8;
    font-size: 13px;
`;

/* ── 탭 네비게이션 ── */
const NavTabBar = styled.div`
    display: flex;
    gap: 0;
    border-bottom: 2px solid #e2e8f0;
`;

const NavTab = styled(Link)<{ $active?: boolean }>`
    padding: 8px 20px;
    font-size: 13px;
    font-weight: ${p => (p.$active ? 700 : 500)};
    color: ${p => (p.$active ? "#3b82f6" : "#64748b")};
    border-bottom: 2px solid ${p => (p.$active ? "#3b82f6" : "transparent")};
    margin-bottom: -2px;
    text-decoration: none;
    cursor: pointer;
    transition: color 0.15s;
    &:hover { color: #3b82f6; }
`;

const SLOT_NAMES: (keyof SlotRow)[] = ["조조", "오전", "오후", "저녁", "심야"];

/* ── 컴포넌트 ── */
export function TimeTablePage() {
    const toast = useToast();
    const currentYear = new Date().getFullYear();

    /* 필터 상태 */
    const [year, setYear] = useState(currentYear.toString());
    const [movieId, setMovieId] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [moviesList, setMoviesList] = useState<MovieOption[]>([]);
    const [availableDates, setAvailableDates] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({ movie: false, dateFrom: false, dateTo: false });

    /* 검색 결과 */
    const [data, setData] = useState<TimetableData | null>(null);

    /* 차트 클릭 popover */
    const [popover, setPopover] = useState<{ x: number; y: number; date: string; value: number } | null>(null);
    /* 선택된 영화 정보 */
    const selectedMovie = useMemo(
        () => moviesList.find(m => m.id.toString() === movieId) ?? null,
        [moviesList, movieId]
    );

    const yearOptions = useMemo(() => {
        return Array.from({ length: currentYear - 2019 + 1 }, (_, i) => (currentYear - i).toString());
    }, [currentYear]);

    /* 연도 변경 → 영화 목록 로드 */
    const fetchMovies = useCallback((y: string) => {
        AxiosGet("score/movies-by-year/", { params: { year: y } })
            .then(res => {
                setMoviesList(res.data || []);
                setMovieId("");
                setAvailableDates([]);
                setDateFrom("");
                setDateTo("");
                setData(null);
            })
            .catch(err => toast.error(handleBackendErrors(err)));
    }, [toast]);

    useEffect(() => { fetchMovies(year); }, [year, fetchMovies]);

    /* 영화 선택 → 가능 날짜 로드 */
    const fetchDates = useCallback((mid: string) => {
        if (!mid) { setAvailableDates([]); setDateFrom(""); setDateTo(""); return; }
        AxiosGet("score/timetable/dates/", { params: { movie_id: mid } })
            .then(res => {
                const dates: string[] = res.data?.dates || [];
                setAvailableDates(dates);
                if (dates.length > 0) {
                    setDateFrom(dates[0]);
                    setDateTo(dates[dates.length - 1]);
                } else {
                    setDateFrom("");
                    setDateTo("");
                }
            })
            .catch(err => toast.error(handleBackendErrors(err)));
    }, [toast]);

    const handleMovieChange = (mid: string) => {
        setMovieId(mid);
        setData(null);
        fetchDates(mid);
        setFieldErrors(e => ({ ...e, movie: false }));
    };

    /* 검색 */
    const handleSearch = useCallback(() => {
        const errs = { movie: !movieId, dateFrom: !dateFrom, dateTo: !dateTo };
        setFieldErrors(errs);
        if (Object.values(errs).some(Boolean)) return;

        setLoading(true);
        setPopover(null);
        AxiosGet("score/timetable/", {
            params: { movie_id: movieId, date_from: dateFrom, date_to: dateTo },
        })
            .then(res => setData(res.data))
            .catch(err => toast.error(handleBackendErrors(err)))
            .finally(() => setLoading(false));
    }, [movieId, dateFrom, dateTo, toast]);

    /* 차트 클릭 처리 */
    const handleChartClick = (chartData: any, event: any) => {
        if (chartData?.activePayload?.length > 0) {
            setPopover({
                x: event?.clientX ?? 0,
                y: event?.clientY ?? 0,
                date: chartData.activeLabel ?? "",
                value: chartData.activePayload[0]?.value ?? 0,
            });
        } else {
            setPopover(null);
        }
    };

    /* 화면 클릭으로 popover 닫기 */
    useEffect(() => {
        if (!popover) return;
        const close = () => setPopover(null);
        window.addEventListener("click", close);
        return () => window.removeEventListener("click", close);
    }, [popover]);

    /* ── 공통 데이터 테이블 렌더 ── */
    const StatTable = ({ rows, firstColLabel }: { rows: StatRow[]; firstColLabel: string }) => (
        <Tbl>
            <thead>
                <tr>
                    <th>{firstColLabel}</th>
                    <th>극장수</th>
                    <th>상영회차</th>
                    <th>평균회차</th>
                    <th>상영관수</th>
                    <th>총좌석수</th>
                    <th>평균좌석수</th>
                    <th>판매좌석수</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={i} className={r.is_total ? "total-row" : ""}>
                        <td style={{ textAlign: "left", fontWeight: r.is_total ? 700 : 400 }}>{r.label}</td>
                        <td>{fmt(r.theater_count)}</td>
                        <td>{fmt(r.show_count)}</td>
                        <td>{fmtD(r.avg_shows)}</td>
                        <td>{fmt(r.screen_count)}</td>
                        <td>{fmt(r.total_seats)}</td>
                        <td>{fmtD(r.avg_seats)}</td>
                        <td>{fmt(r.sold_seats)}</td>
                    </tr>
                ))}
                {rows.length === 0 && (
                    <tr><td colSpan={8}><EmptyMsg>데이터가 없습니다</EmptyMsg></td></tr>
                )}
            </tbody>
        </Tbl>
    );

    /* ── 포맷별 테이블 ── */
    const FormatTable = ({ rows }: { rows: FormatRow[] }) => (
        <Tbl>
            <thead>
                <tr>
                    <th>계열사</th>
                    <th>포맷</th>
                    <th>구분</th>
                    <th>극장수</th>
                    <th>상영회차</th>
                    <th>평균회차</th>
                    <th>상영관수</th>
                    <th>총좌석수</th>
                    <th>평균좌석수</th>
                    <th>판매좌석수</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={i} className={r.is_total ? "total-row" : ""}>
                        <td style={{ textAlign: "left", fontWeight: r.is_total ? 700 : 400 }}>{r.label}</td>
                        <td>{r.format}</td>
                        <td>{r.classification}</td>
                        <td>{fmt(r.theater_count)}</td>
                        <td>{fmt(r.show_count)}</td>
                        <td>{fmtD(r.avg_shows)}</td>
                        <td>{fmt(r.screen_count)}</td>
                        <td>{fmt(r.total_seats)}</td>
                        <td>{fmtD(r.avg_seats)}</td>
                        <td>{fmt(r.sold_seats)}</td>
                    </tr>
                ))}
                {rows.length === 0 && (
                    <tr><td colSpan={10}><EmptyMsg>데이터가 없습니다</EmptyMsg></td></tr>
                )}
            </tbody>
        </Tbl>
    );

    /* ── 시간대 회차 테이블 ── */
    const SlotTable = ({ rows, title }: { rows: SlotRow[]; title: string }) => (
        <SectionCard>
            <SectionTitle>{title}</SectionTitle>
            <TableWrap>
                <Tbl>
                    <thead>
                        <tr>
                            <th>계열사</th>
                            <th>조조<br /><span style={{ fontWeight: 400, fontSize: 10 }}>05:00~10:00</span></th>
                            <th>오전<br /><span style={{ fontWeight: 400, fontSize: 10 }}>10:01~12:00</span></th>
                            <th>오후<br /><span style={{ fontWeight: 400, fontSize: 10 }}>12:01~17:00</span></th>
                            <th>저녁<br /><span style={{ fontWeight: 400, fontSize: 10 }}>17:01~21:00</span></th>
                            <th>심야<br /><span style={{ fontWeight: 400, fontSize: 10 }}>21:01~23:59</span></th>
                            {"total" in (rows[0] ?? {}) ? <th>상영회차</th> : null}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => {
                            const hasTotal = "total" in r;
                            const isCount = hasTotal;
                            return (
                                <tr key={i} className={r.is_total ? "total-row" : ""}>
                                    <td style={{ textAlign: "left", fontWeight: r.is_total ? 700 : 400 }}>{r.label}</td>
                                    {SLOT_NAMES.map(sl => (
                                        <td key={sl}>
                                            {isCount
                                                ? fmt(r[sl] as number)
                                                : fmtPct(r[sl] as number)}
                                        </td>
                                    ))}
                                    {hasTotal ? <td style={{ fontWeight: 600 }}>{fmt(r.total)}</td> : null}
                                </tr>
                            );
                        })}
                        {rows.length === 0 && (
                            <tr><td colSpan={7}><EmptyMsg>데이터가 없습니다</EmptyMsg></td></tr>
                        )}
                    </tbody>
                </Tbl>
            </TableWrap>
        </SectionCard>
    );

    const minDate = availableDates[0] ?? "";
    const maxDate = availableDates[availableDates.length - 1] ?? "";

    return (
        <PageWrapper onClick={() => setPopover(null)}>
            {/* ── 탭 네비게이션 ── */}
            <NavTabBar>
                <NavTab to="/time_table" $active={true}>집계작 시간표</NavTab>
                <NavTab to="/time_table/seat-count">주요작 좌석수</NavTab>
                <NavTab to="/time_table/theater-count">주요작 상영관수</NavTab>
                <NavTab to="/time_table/screen-count">주요작 스크린수</NavTab>
                <NavTab to="/time_table/show-count">주요작 상영회차수</NavTab>
            </NavTabBar>

            {/* ── 필터 ── */}
            <FilterCard>
                <FilterRow>
                    {/* 연도 */}
                    <FieldBox>
                        <label>연도</label>
                        <select value={year} onChange={e => setYear(e.target.value)} style={{ width: 90 }}>
                            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </FieldBox>

                    {/* 영화 선택 */}
                    <FieldBox $error={fieldErrors.movie}>
                        <label>영화 선택 *</label>
                        <select
                            value={movieId}
                            onChange={e => handleMovieChange(e.target.value)}
                            style={{ width: 280 }}
                        >
                            <option value="">-- 영화를 선택하세요 --</option>
                            {moviesList.map(m => (
                                <option key={m.id} value={m.id.toString()}>{m.title_ko}</option>
                            ))}
                        </select>
                        {fieldErrors.movie && <span className="err-msg">필수 입력값입니다</span>}
                    </FieldBox>

                    {/* 개봉일 */}
                    <FieldBox>
                        <label>개봉일</label>
                        <input
                            type="text"
                            readOnly
                            value={selectedMovie?.release_date ?? "-"}
                            style={{ width: 110, background: "#f8fafc", color: "#64748b" }}
                        />
                    </FieldBox>

                    {/* 배급사명 */}
                    <FieldBox>
                        <label>배급사명</label>
                        <input
                            type="text"
                            readOnly
                            value={selectedMovie?.distributor_name ?? "-"}
                            style={{ width: 180, background: "#f8fafc", color: "#64748b" }}
                        />
                    </FieldBox>

                    {/* 날짜 From */}
                    <FieldBox $error={fieldErrors.dateFrom}>
                        <label>날짜 From *</label>
                        <input
                            type="date"
                            value={dateFrom}
                            min={minDate || undefined}
                            max={maxDate || undefined}
                            onChange={e => { setDateFrom(e.target.value); setFieldErrors(ev => ({ ...ev, dateFrom: false })); }}
                            style={{ width: 140 }}
                            disabled={!movieId}
                        />
                        {fieldErrors.dateFrom && <span className="err-msg">필수 입력값입니다</span>}
                    </FieldBox>

                    {/* 날짜 To */}
                    <FieldBox $error={fieldErrors.dateTo}>
                        <label>날짜 To *</label>
                        <input
                            type="date"
                            value={dateTo}
                            min={dateFrom || minDate || undefined}
                            max={maxDate || undefined}
                            onChange={e => { setDateTo(e.target.value); setFieldErrors(ev => ({ ...ev, dateTo: false })); }}
                            style={{ width: 140 }}
                            disabled={!movieId}
                        />
                        {fieldErrors.dateTo && <span className="err-msg">필수 입력값입니다</span>}
                    </FieldBox>

                    {/* 검색 버튼 */}
                    <SearchBtn onClick={handleSearch} disabled={loading}>
                        {loading ? "검색 중..." : "검색"}
                    </SearchBtn>
                </FilterRow>

                {/* 가능 날짜 힌트 */}
                {availableDates.length > 0 && (
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                        데이터 범위: {availableDates[0]} ~ {availableDates[availableDates.length - 1]}
                        &nbsp;({availableDates.length}일)
                    </div>
                )}
                {movieId && availableDates.length === 0 && !loading && (
                    <div style={{ fontSize: 11, color: "#f59e0b" }}>
                        크롤링된 시간표 데이터가 없습니다.
                    </div>
                )}
            </FilterCard>

            {/* ── 검색 결과 ── */}
            {data && (
                <>
                    {/* 영화 제목 + 개봉일 표시 */}
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
                        {data.meta.movie_title}
                        {data.meta.release_date && (
                            <span style={{ fontWeight: 400, fontSize: 13, color: "#64748b", marginLeft: 10 }}>
                                개봉일: {data.meta.release_date}
                            </span>
                        )}
                        {data.meta.distributor_name && (
                            <span style={{ fontWeight: 400, fontSize: 13, color: "#64748b", marginLeft: 16 }}>
                                배급사: {data.meta.distributor_name}
                            </span>
                        )}
                    </div>

                    {/* 계열사별 + 상영시간 회차 비율 (나란히) */}
                    <TwoColGrid>
                        <SectionCard>
                            <SectionTitle>계열사별</SectionTitle>
                            <TableWrap>
                                <StatTable rows={data.by_chain} firstColLabel="계열사" />
                            </TableWrap>
                        </SectionCard>

                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            {data.time_slots.count_rows.length > 0 && (
                                <SlotTable rows={data.time_slots.count_rows} title="상영 시간 회차 비율 (회차)" />
                            )}
                            {data.time_slots.pct_rows.length > 0 && (
                                <SlotTable rows={data.time_slots.pct_rows} title="상영 시간 회차 비율 (%)" />
                            )}
                        </div>
                    </TwoColGrid>

                    {/* 지역별 */}
                    <SectionCard>
                        <SectionTitle>지역별</SectionTitle>
                        <TableWrap>
                            <StatTable rows={data.by_region} firstColLabel="지역" />
                        </TableWrap>
                    </SectionCard>

                    {/* 포맷별 */}
                    <SectionCard>
                        <SectionTitle>포맷별</SectionTitle>
                        <TableWrap>
                            <FormatTable rows={data.by_format} />
                        </TableWrap>
                    </SectionCard>

                    {/* 꺾은선 차트 */}
                    {data.daily_chart.length > 0 && (
                        <ChartSection>
                            <SectionTitle>총좌석수 상영일자 추이</SectionTitle>
                            <div
                                style={{ padding: "16px 8px 8px" }}
                                onClick={e => e.stopPropagation()}
                            >
                                <ResponsiveContainer width="100%" height={280}>
                                    <LineChart
                                        data={data.daily_chart}
                                        onClick={handleChartClick}
                                        style={{ cursor: "pointer" }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 11, fill: "#64748b" }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 11, fill: "#64748b" }}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(v: number) => v.toLocaleString("ko-KR")}
                                            width={70}
                                        />
                                        <Tooltip
                                            formatter={(value: number | string | undefined) => [Number(value ?? 0).toLocaleString("ko-KR"), "총좌석수"]}
                                            labelStyle={{ color: "#1e293b", fontWeight: 600 }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="total_seats"
                                            stroke="#3b82f6"
                                            strokeWidth={2}
                                            dot={{ r: 3, fill: "#3b82f6" }}
                                            activeDot={{ r: 5 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                                <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 4 }}>
                                    그래프를 클릭하면 해당 날짜의 총좌석수가 표시됩니다
                                </div>
                            </div>
                        </ChartSection>
                    )}

                    {/* 데이터 없음 안내 */}
                    {data.by_chain.length === 0 && data.by_region.length === 0 && (
                        <SectionCard>
                            <EmptyMsg>
                                선택한 기간에 해당하는 집계작 시간표 데이터가 없습니다.
                            </EmptyMsg>
                        </SectionCard>
                    )}
                </>
            )}

            {/* 초기 안내 */}
            {!data && !loading && (
                <SectionCard>
                    <EmptyMsg>
                        연도와 영화를 선택한 후 날짜 범위를 지정하고 검색 버튼을 눌러주세요.
                    </EmptyMsg>
                </SectionCard>
            )}

            {/* 차트 클릭 Popover */}
            {popover && (
                <PopoverBox $x={popover.x} $y={popover.y}>
                    {popover.date} &nbsp;|&nbsp; 총좌석수: {popover.value.toLocaleString("ko-KR")}석
                </PopoverBox>
            )}
        </PageWrapper>
    );
}
