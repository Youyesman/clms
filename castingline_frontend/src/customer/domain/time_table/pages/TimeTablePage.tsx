import React, { useState, useEffect, useCallback, useMemo } from "react";
import styled from "styled-components";
import { PageNavTabs, TIME_TABLE_TABS } from "../../../../components/common/PageNavTabs";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer,
} from "recharts";
import { useToast } from "../../../../components/common/CustomToast";
import { AxiosGet } from "../../../../axios/Axios";
import { handleBackendErrors } from "../../../../axios/handleBackendErrors";
import { CommonFilterBar } from "../../../../components/common/CommonFilterBar";
import { CustomInput } from "../../../../components/common/CustomInput";
import { CustomSelect } from "../../../../components/common/CustomSelect";
import { downloadTimetableExcel } from "../exportTimetableExcel"; // A001
import { TimetableReportModal } from "../TimetableReportModal"; // A003

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
        /* V002: '날짜 To' 상영일 데이터의 마지막 수집 일시 */
        last_crawled_at: string | null;
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




const SearchBtn = styled.button`
    height: 30px;
    padding: 0 20px;
    background: #2563eb;
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
    border-radius: 6px;
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
    /* collapse는 테두리가 셀과 분리돼 sticky 헤더 뒤로 글자가 비침 — separate로 셀에 귀속 */
    border-collapse: separate;
    border-spacing: 0;
    border-top: 1px solid #e2e8f0;
    border-left: 1px solid #e2e8f0;
    font-size: 12px;
    white-space: nowrap;
    th, td {
        border-right: 1px solid #e2e8f0;
        border-bottom: 1px solid #e2e8f0;
        padding: 5px 10px;
        text-align: center;
    }
    th {
        background: #f1f5f9;
        font-weight: 700;
        color: #475569;
        position: sticky;
        top: 0;
        z-index: 1;
    }
    td { color: #475569; }
    tbody tr:hover td { background: #f8fafc; }
    .total-row td {
        background: #bfdbfe !important;
        color: #1d4ed8 !important;
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
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
`;

const EmptyMsg = styled.div`
    text-align: center;
    padding: 28px 16px;
    color: #94a3b8;
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1.6;
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

    /* A001: 엑셀 다운로드 / A003: 요약보고서 모달 */
    const [excelBusy, setExcelBusy] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);

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

    /* A001: 현재 조회 조건 그대로 엑셀 다운로드 (그래프 제외) */
    const handleExcel = useCallback(async () => {
        const errs = { movie: !movieId, dateFrom: !dateFrom, dateTo: !dateTo };
        setFieldErrors(errs);
        if (Object.values(errs).some(Boolean)) return;
        setExcelBusy(true);
        try {
            await downloadTimetableExcel(
                "timetable",
                { movie_id: movieId, date_from: dateFrom, date_to: dateTo },
                `집계작 시간표_${selectedMovie?.title_ko ?? ""}`
            );
            toast.success("엑셀 파일이 다운로드 되었습니다.");
        } catch (err: any) {
            toast.error(handleBackendErrors(err));
        } finally {
            setExcelBusy(false);
        }
    }, [movieId, dateFrom, dateTo, selectedMovie, toast]);

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
                            <th>조조<br /><span style={{ fontWeight: 400, fontSize: 11 }}>05:00~10:00</span></th>
                            <th>오전<br /><span style={{ fontWeight: 400, fontSize: 11 }}>10:01~12:00</span></th>
                            <th>오후<br /><span style={{ fontWeight: 400, fontSize: 11 }}>12:01~17:00</span></th>
                            <th>저녁<br /><span style={{ fontWeight: 400, fontSize: 11 }}>17:01~21:00</span></th>
                            <th>심야<br /><span style={{ fontWeight: 400, fontSize: 11 }}>21:01~23:59</span></th>
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
            <PageNavTabs tabs={TIME_TABLE_TABS} />

            {/* ── 필터 ── */}
            <CommonFilterBar
                actions={
                    <>
                        <SearchBtn onClick={handleSearch} disabled={loading}>
                            {loading ? "조회 중…" : "검색"}
                        </SearchBtn>
                        {/* A001: 엑셀 다운로드 */}
                        <SearchBtn
                            onClick={handleExcel}
                            disabled={excelBusy}
                            style={{ background: "#16a34a" }}
                            title="현재 조회 조건의 데이터를 엑셀로 다운로드 (그래프 제외)"
                        >
                            {excelBusy ? "생성 중…" : "엑셀"}
                        </SearchBtn>
                        {/* A003: 요약보고서(PDF) 다운로드 */}
                        <SearchBtn
                            onClick={() => setShowReportModal(true)}
                            style={{ background: "#dc2626" }}
                            title="요약보고서(PDF) 다운로드 — 출력 유형 선택"
                        >
                            PDF 보고서
                        </SearchBtn>
                    </>
                }>
                <CustomSelect
                    label="연도"
                    options={yearOptions}
                    value={year}
                    onChange={setYear}
                    allowClear={false}
                />
                <CustomSelect
                    label="영화 선택"
                    required
                    chipValueMinWidth={200}
                    options={moviesList.map((mv) => ({ label: mv.title_ko, value: mv.id.toString() }))}
                    value={movieId}
                    onChange={handleMovieChange}
                    hasError={fieldErrors.movie}
                    allowClear={false}
                />
                <CustomInput
                    label="개봉일"
                    value={selectedMovie?.release_date ?? "-"}
                    setValue={() => {}}
                    readOnly
                    disabled
                />
                <CustomInput
                    label="배급사명"
                    value={selectedMovie?.distributor_name ?? "-"}
                    setValue={() => {}}
                    readOnly
                    disabled
                />
                <CustomInput
                    label="날짜 From"
                    required
                    inputType="date"
                    value={dateFrom}
                    setValue={(v) => {
                        setDateFrom(v);
                        setFieldErrors((ev) => ({ ...ev, dateFrom: false }));
                    }}
                    min={minDate || undefined}
                    max={maxDate || undefined}
                    disabled={!movieId}
                    hasError={fieldErrors.dateFrom}
                />
                <CustomInput
                    label="날짜 To"
                    required
                    inputType="date"
                    value={dateTo}
                    setValue={(v) => {
                        setDateTo(v);
                        setFieldErrors((ev) => ({ ...ev, dateTo: false }));
                    }}
                    min={dateFrom || minDate || undefined}
                    max={maxDate || undefined}
                    disabled={!movieId}
                    hasError={fieldErrors.dateTo}
                />
            </CommonFilterBar>

            {/* ── 검색 결과 ── */}
            {data && (
                <>
                    {/* 영화 제목 + 개봉일 표시 */}
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
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
                        {/* V002: '날짜 To' 상영일 데이터의 마지막 수집 일시 */}
                        <span style={{ fontWeight: 700, fontSize: 13, color: "#1e293b", marginLeft: 16 }}>
                            수집 완료 시간: {data.meta.last_crawled_at ?? "-"}
                        </span>
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
                                            formatter={(value) => [Number(value ?? 0).toLocaleString("ko-KR"), "총좌석수"]}
                                            labelStyle={{ color: "#1e293b", fontWeight: 600 }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="total_seats"
                                            stroke="#2563eb"
                                            strokeWidth={2}
                                            dot={{ r: 3, fill: "#2563eb" }}
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

            {/* A003: 요약보고서(PDF) 다운로드 모달 */}
            {showReportModal && (
                <TimetableReportModal
                    movieTitle={selectedMovie?.title_ko ?? null}
                    defaultStart={dateFrom}
                    defaultEnd={dateTo}
                    onClose={() => setShowReportModal(false)}
                />
            )}
        </PageWrapper>
    );
}
