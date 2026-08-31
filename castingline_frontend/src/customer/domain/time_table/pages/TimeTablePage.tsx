import React, { useState, useEffect, useCallback, useMemo } from "react";
import styled from "styled-components";
import { PageNavTabs, TIME_TABLE_TABS } from "../../../../components/common/PageNavTabs";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useToast } from "../../../../components/common/CustomToast";
import { AxiosGet } from "../../../../axios/Axios";
import { handleBackendErrors } from "../../../../axios/handleBackendErrors";
import { CommonFilterBar } from "../../../../components/common/CommonFilterBar";
import { CustomInput } from "../../../../components/common/CustomInput";
import { CustomSelect } from "../../../../components/common/CustomSelect";
import { downloadTimetableExcel } from "../exportTimetableExcel"; // A001
import { SortTh, SortHint, useTableSort } from "../../../../components/common/SortableTable";

/* B002(0829): 주요작 시간표 화면 개편 — 일자별 탭(최대 7일)
   각 탭: KEY SUMMARY(전일比·전주比) / 멀티사별 / 포맷별 / 시간대별 / 지역별
          + 상영일자 추이(기간 전체) + 주요작 vs 경쟁작 TOP 10
   B004: 모든 표의 컬럼 헤더 클릭 시 오름/내림차순 정렬
   상단 엑셀/PDF: 그래프 제외 화면 그대로 + 캐스팅라인 로고 */

/* ── 유틸 ── */
const fmt = (n: number | null | undefined) =>
    n == null ? "-" : Math.round(n).toLocaleString("ko-KR");
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

interface Kpis {
    total_seats: number;
    sold_seats: number;
    occupancy: number;
    shows: number;
    theaters: number;
    screens: number;
}

interface CmpNum { diff: number; rate: number | null }
interface CmpDiff { diff: number }

interface KpiCmp {
    total_seats: CmpNum; sold_seats: CmpNum; occupancy: CmpDiff;
    shows: CmpNum; theaters: CmpNum; screens: CmpNum;
}

interface KeySummary extends Kpis {
    date: string;
    label: string;
    prev_day: string;
    prev_week: string;
    prev_day_cmp: KpiCmp | null;
    prev_week_cmp: KpiCmp | null;
}

interface DetailRow {
    label: string;
    total_seats: number;
    share: number;
    prev_day_cmp: CmpDiff | null;
    prev_week_cmp: CmpDiff | null;
    count: number;
    shows: number;
}

interface TimeRow {
    label: string;
    shows: number;
    total_seats: number;
    sold_seats: number;
    occupancy: number;
    prev_day_cmp: CmpDiff | null;
    prev_week_cmp: CmpDiff | null;
}

interface CompetitorRow {
    rank: number;
    title: string;
    is_main: boolean;
    total_seats: number;
    occupancy: number;
    shows: number;
    prev_day_move: number | null;
    prev_week_move: number | null;
}

interface DayTabData {
    key: string;
    label: string;
    key_summary: KeySummary;
    multi_detail: DetailRow[];
    format_detail: DetailRow[];
    time_detail: TimeRow[];
    region_detail: DetailRow[];
    competitor_top: CompetitorRow[];
}

interface TrendPoint {
    date: string;
    label: string;
    prev_date: string;
    cur: Kpis;
    prev: Kpis | null;
}

interface TimetableData {
    meta: {
        movie_title: string;
        release_date: string | null;
        distributor_name: string | null;
        last_crawled_at: string | null;
        date_from: string;
        date_to: string;
        prev_from: string;
        prev_to: string;
        has_prev: boolean;
    };
    tabs: DayTabData[];
    trend: { dates: string[]; prev_dates: string[]; points: TrendPoint[]; compare_note: string };
}

/* ── 스타일 ── */
/* V002(0831): 와이드 모니터에서 전체 폭으로 퍼지지 않도록 최대 폭 + 중앙 정렬 */
const PageWrapper = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: #f8fafc;
    min-height: calc(100vh - 60px);
    padding: 20px;
    gap: 16px;
    width: 100%;
    max-width: 1700px;
    margin: 0 auto;
`;

/* V002(0831): 넓은 화면에서 상세 데이터·그래프 영역 2열 배치 */
const TwoColGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    align-items: start;
    @media (max-width: 1400px) {
        grid-template-columns: 1fr;
    }
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
`;

const TableWrap = styled.div`
    overflow-x: auto;
`;

const Tbl = styled.table`
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border-top: 1px solid #e2e8f0;
    border-left: 1px solid #e2e8f0;
    font-size: 12px;
    white-space: nowrap;
    th, td {
        border-right: 1px solid #e2e8f0;
        border-bottom: 1px solid #e2e8f0;
        padding: 6px 10px;
        text-align: center;
    }
    th {
        background: #f1f5f9;
        font-weight: 700;
        color: #475569;
    }
    td { color: #475569; }
    tbody tr:hover td { background: #f8fafc; }
    .total-row td {
        background: #eff6ff !important;
        color: #1d4ed8 !important;
        font-weight: 700;
    }
    .main-row td {
        background: #eff6ff !important;
        font-weight: 700;
        color: #1e293b;
    }
    .num { text-align: right; }
    .name { text-align: left; }
`;

/* 일자별 탭 (경쟁작 화면과 같은 모양) */
const DayTab = styled.button<{ $active: boolean }>`
    padding: 8px 16px;
    font-size: 12.5px;
    font-weight: ${({ $active }) => ($active ? 800 : 500)};
    color: ${({ $active }) => ($active ? "#ffffff" : "#64748b")};
    background: ${({ $active }) => ($active ? "#2563eb" : "#ffffff")};
    border: 1px solid ${({ $active }) => ($active ? "#2563eb" : "#e2e8f0")};
    border-bottom: none;
    border-radius: 6px 6px 0 0;
    cursor: pointer;
    white-space: nowrap;
    &:hover { color: ${({ $active }) => ($active ? "#ffffff" : "#2563eb")}; }
`;

const MetricBtn = styled.button<{ $active: boolean }>`
    height: 28px;
    padding: 0 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid ${({ $active }) => ($active ? "#2563eb" : "#cbd5e1")};
    background: ${({ $active }) => ($active ? "#2563eb" : "#ffffff")};
    color: ${({ $active }) => ($active ? "#ffffff" : "#64748b")};
`;

const EmptyMsg = styled.div`
    text-align: center;
    padding: 28px 16px;
    color: #94a3b8;
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1.6;
`;

/* 증감 표기: 증가는 빨강, 감소는 파랑 (B002 화면 기준) */
const Delta = styled.span<{ $up: boolean }>`
    font-weight: 700;
    color: ${({ $up }) => ($up ? "#dc2626" : "#1d4ed8")};
`;

/* ── 증감 셀 렌더러 ── */
const seatDelta = (c: CmpDiff | null | undefined) => {
    if (!c) return <span style={{ color: "#cbd5e1" }}>-</span>;
    const up = c.diff >= 0;
    return <Delta $up={up}>{up ? "▲" : "▼"} {c.diff >= 0 ? "+" : ""}{fmt(c.diff)}석</Delta>;
};

const ppDelta = (c: CmpDiff | null | undefined) => {
    if (!c) return <span style={{ color: "#cbd5e1" }}>-</span>;
    const up = c.diff >= 0;
    return <Delta $up={up}>{up ? "▲" : "▼"} {Math.abs(c.diff).toFixed(1)}%p</Delta>;
};

const kpiDelta = (c: CmpNum | undefined, unit: string) => {
    if (!c) return <span style={{ color: "#cbd5e1" }}>-</span>;
    const up = c.diff >= 0;
    const rate = c.rate != null ? ` (${c.rate >= 0 ? "+" : ""}${c.rate.toFixed(1)}%)` : "";
    return (
        <Delta $up={up}>
            {up ? "▲" : "▼"} {c.diff >= 0 ? "+" : ""}{fmt(c.diff)}{unit}{rate}
        </Delta>
    );
};

/* 순위 변동: 양수=상승(▲ 빨강), 음수=하락(▼ 파랑), 0·없음='-' */
const rankMove = (v: number | null | undefined) => {
    if (v == null || v === 0) return <span style={{ color: "#cbd5e1" }}>-</span>;
    return <Delta $up={v > 0}>{v > 0 ? "▲" : "▼"} {Math.abs(v)}</Delta>;
};

type MetricKey = "total_seats" | "sold_seats" | "occupancy" | "shows";
const METRICS: { key: MetricKey; label: string; unit: string }[] = [
    { key: "total_seats", label: "총 좌석수", unit: "석" },
    { key: "sold_seats", label: "예매좌석수", unit: "석" },
    { key: "occupancy", label: "좌석점유율", unit: "%" },
    { key: "shows", label: "회차수", unit: "회" },
];

const MAX_DAYS = 7;   // 일자별 탭 최대 7개 (백엔드와 같은 상한)

/* ── ②③⑤ 멀티사별/포맷별/지역별 공용 표 ── */
function DetailTable({
    title, note, rows, countLabel,
}: { title: string; note?: string; rows: DetailRow[]; countLabel: string }) {
    const { sorted, sort } = useTableSort(rows);
    return (
        <SectionCard>
            <SectionTitle>
                <span>{title}</span>
                <SortHint>{note ?? "* 클릭 시 정렬가능"}</SortHint>
            </SectionTitle>
            <TableWrap>
                <Tbl>
                    <thead>
                        <tr>
                            <SortTh sortKey="label" sort={sort}>구분</SortTh>
                            <SortTh sortKey="total_seats" sort={sort}>총 좌석수</SortTh>
                            <SortTh sortKey="share" sort={sort}>비율</SortTh>
                            <SortTh sortKey="prev_day_cmp.diff" sort={sort}>전일比 좌석 증감</SortTh>
                            <SortTh sortKey="prev_week_cmp.diff" sort={sort}>전주比 좌석 증감</SortTh>
                            <SortTh sortKey="count" sort={sort}>{countLabel}</SortTh>
                            <SortTh sortKey="shows" sort={sort}>회차수</SortTh>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((r) => (
                            <tr key={r.label}>
                                <td style={{ fontWeight: 600 }}>{r.label}</td>
                                <td className="num">{fmt(r.total_seats)}석</td>
                                <td className="num">{fmtPct(r.share)}</td>
                                <td>{seatDelta(r.prev_day_cmp)}</td>
                                <td>{seatDelta(r.prev_week_cmp)}</td>
                                <td className="num">{fmt(r.count)}</td>
                                <td className="num">{fmt(r.shows)}</td>
                            </tr>
                        ))}
                        {sorted.length === 0 && (
                            <tr><td colSpan={7}><EmptyMsg>데이터가 없습니다</EmptyMsg></td></tr>
                        )}
                    </tbody>
                </Tbl>
            </TableWrap>
        </SectionCard>
    );
}

/* ── ④ 시간대별 상세 현황 ── */
function TimeTable({ rows }: { rows: TimeRow[] }) {
    const { sorted, sort } = useTableSort(rows);
    return (
        <SectionCard>
            <SectionTitle>
                <span>시간대별 상세 현황</span>
                <SortHint>* 클릭 시 정렬가능</SortHint>
            </SectionTitle>
            <TableWrap>
                <Tbl>
                    <thead>
                        <tr>
                            <SortTh sortKey="label" sort={sort}>시간대 구분</SortTh>
                            <SortTh sortKey="shows" sort={sort}>상영 회차수</SortTh>
                            <SortTh sortKey="total_seats" sort={sort}>총 좌석수</SortTh>
                            <SortTh sortKey="sold_seats" sort={sort}>예매 좌석수</SortTh>
                            <SortTh sortKey="occupancy" sort={sort}>좌석 점유율</SortTh>
                            <SortTh sortKey="prev_day_cmp.diff" sort={sort}>전일比 점유율 차이</SortTh>
                            <SortTh sortKey="prev_week_cmp.diff" sort={sort}>전주比 점유율 차이</SortTh>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((r) => (
                            <tr key={r.label}>
                                <td style={{ fontWeight: 600 }}>{r.label}</td>
                                <td className="num">{fmt(r.shows)}회</td>
                                <td className="num">{fmt(r.total_seats)}석</td>
                                <td className="num">{fmt(r.sold_seats)}석</td>
                                <td className="num">{fmtPct(r.occupancy)}</td>
                                <td>{ppDelta(r.prev_day_cmp)}</td>
                                <td>{ppDelta(r.prev_week_cmp)}</td>
                            </tr>
                        ))}
                    </tbody>
                </Tbl>
            </TableWrap>
        </SectionCard>
    );
}

/* ── ⑥ 주요작 vs 경쟁작 ── */
function CompetitorTable({ rows, label }: { rows: CompetitorRow[]; label: string }) {
    const { sorted, sort } = useTableSort(rows);
    return (
        <SectionCard>
            <SectionTitle>
                <span>주요작 vs 경쟁작 · 동시 상영 경쟁작 TOP 10 순위 ({label})</span>
                <SortHint>* 파란색 행: 당사 관리 영화 · 클릭 시 정렬가능</SortHint>
            </SectionTitle>
            <TableWrap>
                <Tbl>
                    <thead>
                        <tr>
                            <SortTh sortKey="rank" sort={sort}>순위</SortTh>
                            <SortTh sortKey="title" sort={sort}>영화명</SortTh>
                            <SortTh sortKey="total_seats" sort={sort}>총 좌석수</SortTh>
                            <SortTh sortKey="occupancy" sort={sort}>좌석 점유율</SortTh>
                            <SortTh sortKey="shows" sort={sort}>상영 회차수</SortTh>
                            <SortTh sortKey="prev_day_move" sort={sort}>전일比 순위변동</SortTh>
                            <SortTh sortKey="prev_week_move" sort={sort}>전주比 순위변동</SortTh>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((r) => (
                            <tr key={r.title} className={r.is_main ? "main-row" : ""}>
                                <td>{r.rank}{r.is_main ? " (★당사)" : ""}</td>
                                <td className="name">{r.title}</td>
                                <td className="num">{fmt(r.total_seats)}석</td>
                                <td className="num">{fmtPct(r.occupancy)}</td>
                                <td className="num">{fmt(r.shows)}회</td>
                                <td>{rankMove(r.prev_day_move)}</td>
                                <td>{rankMove(r.prev_week_move)}</td>
                            </tr>
                        ))}
                        {sorted.length === 0 && (
                            <tr><td colSpan={7}><EmptyMsg>동시 상영 경쟁작 데이터가 없습니다</EmptyMsg></td></tr>
                        )}
                    </tbody>
                </Tbl>
            </TableWrap>
        </SectionCard>
    );
}

/* ── ① KEY SUMMARY ── */
function KeySummaryTable({ ks, lastCrawled }: { ks: KeySummary; lastCrawled: string | null }) {
    const cmpRow = (label: string, c: KpiCmp | null) => (
        <tr>
            <td style={{ fontWeight: 600 }}>{label}</td>
            <td>{kpiDelta(c?.total_seats, "석")}</td>
            <td>{kpiDelta(c?.sold_seats, "석")}</td>
            <td>{ppDelta(c?.occupancy)}</td>
            <td>{kpiDelta(c?.shows, "회")}</td>
            <td>{kpiDelta(c?.theaters, "개")}</td>
            <td>{kpiDelta(c?.screens, "개")}</td>
        </tr>
    );
    return (
        <SectionCard>
            <SectionTitle>
                <span>KEY SUMMARY</span>
                <SortHint>기준 시간: {lastCrawled ?? "-"}</SortHint>
            </SectionTitle>
            <TableWrap>
                <Tbl>
                    <thead>
                        <tr>
                            <th>구분</th>
                            <th>총 좌석수</th>
                            <th>예매좌석수</th>
                            <th>좌석점유율</th>
                            <th>총 회차수</th>
                            <th>총 극장수</th>
                            <th>총 스크린수</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="total-row">
                            <td>{ks.label}</td>
                            <td className="num">{fmt(ks.total_seats)}석</td>
                            <td className="num">{fmt(ks.sold_seats)}석</td>
                            <td className="num">{fmtPct(ks.occupancy)}</td>
                            <td className="num">{fmt(ks.shows)}회</td>
                            <td className="num">{fmt(ks.theaters)}개</td>
                            <td className="num">{fmt(ks.screens)}개</td>
                        </tr>
                        {cmpRow(`증감 (전일比 ${ks.prev_day})`, ks.prev_day_cmp)}
                        {cmpRow(`증감 (전주比 ${ks.prev_week})`, ks.prev_week_cmp)}
                    </tbody>
                </Tbl>
            </TableWrap>
        </SectionCard>
    );
}

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
    const [activeTab, setActiveTab] = useState("");

    /* 엑셀/PDF 다운로드 */
    const [excelBusy, setExcelBusy] = useState(false);
    const [pdfBusy, setPdfBusy] = useState(false);

    /* 상영일자 추이 지표 선택 */
    const [metric, setMetric] = useState<MetricKey>("total_seats");

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
                    // 일자별 탭이 최대 7개이므로 기본 기간도 마지막 7일까지만 잡는다
                    setDateFrom(dates[Math.max(0, dates.length - MAX_DAYS)]);
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

    const dayCount = useMemo(() => {
        if (!dateFrom || !dateTo) return 0;
        const diff = (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000;
        return Math.floor(diff) + 1;
    }, [dateFrom, dateTo]);

    const validate = () => {
        const errs = { movie: !movieId, dateFrom: !dateFrom, dateTo: !dateTo };
        setFieldErrors(errs);
        if (Object.values(errs).some(Boolean)) return false;
        if (dayCount > MAX_DAYS) {
            toast.warning(`조회 기간은 최대 ${MAX_DAYS}일까지 지정할 수 있습니다.`);
            return false;
        }
        return true;
    };

    /* 검색 */
    const handleSearch = useCallback(() => {
        if (!validate()) return;
        setLoading(true);
        AxiosGet("score/timetable/", {
            params: { movie_id: movieId, date_from: dateFrom, date_to: dateTo },
        })
            .then(res => {
                setData(res.data);
                setActiveTab(res.data?.tabs?.[0]?.key ?? "");
            })
            .catch(err => {
                // 조회 실패 시 이전 결과를 지운다 — 남겨두면 헤더의 조사기간과
                // 표의 내용이 어긋나 다른 조건의 데이터로 오인하게 된다
                setData(null);
                toast.error(handleBackendErrors(err));
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [movieId, dateFrom, dateTo, dayCount, toast]);

    /* 엑셀: 화면 그대로 (그래프 제외) + 로고 */
    const handleExcel = useCallback(async () => {
        if (!validate()) return;
        setExcelBusy(true);
        try {
            await downloadTimetableExcel(
                "timetable",
                { movie_id: movieId, date_from: dateFrom, date_to: dateTo },
                `주요작 시간표_${selectedMovie?.title_ko ?? ""}`
            );
            toast.success("엑셀 파일이 다운로드 되었습니다.");
        } catch (err: any) {
            toast.error(handleBackendErrors(err));
        } finally {
            setExcelBusy(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [movieId, dateFrom, dateTo, dayCount, selectedMovie, toast]);

    /* PDF: 화면 그대로 (그래프 제외) + 로고 */
    const handlePdf = useCallback(async () => {
        if (!validate()) return;
        setPdfBusy(true);
        try {
            const response: any = await AxiosGet("score/timetable-pdf/", {
                params: { movie_id: movieId, date_from: dateFrom, date_to: dateTo },
                responseType: "blob",
            });
            const blob = new Blob([response.data], { type: "application/pdf" });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            let filename = `주요작 시간표_${selectedMovie?.title_ko ?? ""}.pdf`;
            const cd = response.headers?.["content-disposition"];
            if (cd) {
                const star = cd.match(/filename\*=(?:utf-8'')?([^;]+)/i);
                const plain = cd.match(/filename="?([^";]+)"?/);
                if (star?.[1]) filename = decodeURIComponent(star[1]);
                else if (plain?.[1]) filename = decodeURIComponent(plain[1]);
            }
            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success("PDF 보고서가 다운로드 되었습니다.");
        } catch (err: any) {
            toast.error(handleBackendErrors(err));
        } finally {
            setPdfBusy(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [movieId, dateFrom, dateTo, dayCount, selectedMovie, toast]);

    const minDate = availableDates[0] ?? "";
    const maxDate = availableDates[availableDates.length - 1] ?? "";

    const tab = useMemo(
        () => data?.tabs.find(t => t.key === activeTab) ?? data?.tabs[0] ?? null,
        [data, activeTab]
    );

    /* 추이 차트 데이터 */
    const metricConf = METRICS.find(m => m.key === metric)!;
    const chartData = useMemo(() => {
        if (!data) return [];
        return data.trend.points.map(p => ({
            label: p.label,
            금주: p.cur ? p.cur[metric] : null,
            전주: p.prev ? p.prev[metric] : null,
        }));
    }, [data, metric]);

    const chartValueFmt = (v: number | null | undefined) =>
        v == null ? "-" : metric === "occupancy" ? `${Number(v).toFixed(1)}%` : `${Math.round(v).toLocaleString("ko-KR")}${metricConf.unit}`;

    return (
        <PageWrapper>
            {/* ── 탭 네비게이션 ── */}
            <PageNavTabs tabs={TIME_TABLE_TABS} />

            {/* ── 필터 ── */}
            <CommonFilterBar
                actions={
                    <>
                        <SearchBtn onClick={handleSearch} disabled={loading}>
                            {loading ? "조회 중…" : "검색"}
                        </SearchBtn>
                        <SearchBtn
                            onClick={handleExcel}
                            disabled={excelBusy}
                            style={{ background: "#16a34a" }}
                            title="화면에 보이는 표 그대로 엑셀 다운로드 (그래프 제외 · 캐스팅라인 로고 포함)"
                        >
                            {excelBusy ? "생성 중…" : "엑셀"}
                        </SearchBtn>
                        <SearchBtn
                            onClick={handlePdf}
                            disabled={pdfBusy}
                            style={{ background: "#dc2626" }}
                            title="화면에 보이는 표 그대로 PDF 보고서 (그래프 제외 · 캐스팅라인 로고 포함)"
                        >
                            {pdfBusy ? "생성 중…" : "PDF 보고서"}
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

            {/* 기간 상한 안내 */}
            {dayCount > MAX_DAYS && (
                <div style={{ fontSize: 12, fontWeight: 600, color: "#dc2626" }}>
                    조회 기간은 최대 {MAX_DAYS}일까지 지정할 수 있습니다. (현재 {dayCount}일)
                </div>
            )}

            {/* ── 검색 결과 ── */}
            {data && (
                <>
                    {/* 영화 제목 + 조사기간 표시 */}
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
                        작품명 {data.meta.movie_title}
                        <span style={{ fontWeight: 400, fontSize: 13, color: "#64748b", marginLeft: 12 }}>
                            조사기간 {data.meta.date_from} ~ {data.meta.date_to}
                        </span>
                        <span style={{ fontWeight: 400, fontSize: 13, color: "#64748b", marginLeft: 12 }}>
                            전주 {data.meta.prev_from} ~ {data.meta.prev_to}
                        </span>
                        {data.meta.release_date && (
                            <span style={{ fontWeight: 400, fontSize: 13, color: "#64748b", marginLeft: 12 }}>
                                개봉일 {data.meta.release_date}
                            </span>
                        )}
                        <span style={{ fontWeight: 700, fontSize: 13, color: "#1e293b", marginLeft: 12 }}>
                            수집 완료 시간: {data.meta.last_crawled_at ?? "-"}
                        </span>
                    </div>

                    {/* 일자별 탭 (최대 7일) */}
                    <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #2563eb", flexWrap: "wrap" }}>
                        {data.tabs.map(t => (
                            <DayTab key={t.key} $active={(tab?.key ?? "") === t.key} onClick={() => setActiveTab(t.key)}>
                                {t.label} 뷰
                            </DayTab>
                        ))}
                    </div>

                    {!tab || tab.key_summary.total_seats === 0 ? (
                        <SectionCard>
                            <EmptyMsg>
                                선택한 일자에 해당하는 주요작 시간표 데이터가 없습니다.
                            </EmptyMsg>
                        </SectionCard>
                    ) : (
                        <>
                            <KeySummaryTable ks={tab.key_summary} lastCrawled={data.meta.last_crawled_at} />
                            {/* V002: 넓은 화면에서는 상세 데이터를 2열로 배치 */}
                            <TwoColGrid>
                                <DetailTable
                                    title="멀티사별 상세 현황 (CGV / 롯데 / 메가박스 / 일반)"
                                    note="* 멀티플렉스 체인별 배치 점유율 · 클릭 시 정렬가능"
                                    rows={tab.multi_detail}
                                    countLabel="총 극장수"
                                />
                                <DetailTable title="포맷별 상세 현황" rows={tab.format_detail} countLabel="스크린수" />
                            </TwoColGrid>
                            <TwoColGrid>
                                <TimeTable rows={tab.time_detail} />
                                <DetailTable title="지역별 상세 현황" rows={tab.region_detail} countLabel="총 극장수" />
                            </TwoColGrid>

                            {/* ── 상영일자 추이 (기간 전체) + 경쟁작 TOP 10 — V002: 넓은 화면 2열 ── */}
                            <TwoColGrid>
                            <SectionCard>
                                <SectionTitle><span>상영일자 추이</span></SectionTitle>
                                <div style={{ padding: "12px 14px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                                    <div style={{ display: "flex", gap: 6 }}>
                                        {METRICS.map(m => (
                                            <MetricBtn key={m.key} $active={metric === m.key} onClick={() => setMetric(m.key)}>
                                                {m.label}
                                            </MetricBtn>
                                        ))}
                                    </div>
                                    <div style={{ fontSize: 12, color: "#64748b", display: "flex", gap: 14 }}>
                                        <span><span style={{ color: "#2563eb", fontWeight: 700 }}>━</span> 금주 ({data.meta.date_from}~{data.meta.date_to})</span>
                                        <span><span style={{ color: "#94a3b8", fontWeight: 700 }}>┅</span> 전주 ({data.meta.prev_from}~{data.meta.prev_to})</span>
                                    </div>
                                </div>
                                <div style={{ padding: "8px 8px 4px" }}>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <LineChart data={chartData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} />
                                            <YAxis
                                                tick={{ fontSize: 11, fill: "#64748b" }}
                                                tickLine={false}
                                                axisLine={false}
                                                tickFormatter={(v: number) =>
                                                    metric === "occupancy" ? `${v}%` : v.toLocaleString("ko-KR")}
                                                width={70}
                                            />
                                            <Tooltip
                                                formatter={(value: any, name: any) => [chartValueFmt(value), name]}
                                                labelStyle={{ color: "#1e293b", fontWeight: 600 }}
                                            />
                                            <Legend wrapperStyle={{ fontSize: 12 }} />
                                            {/* 전주: 점선 */}
                                            <Line
                                                type="monotone"
                                                dataKey="전주"
                                                stroke="#94a3b8"
                                                strokeWidth={2}
                                                strokeDasharray="6 4"
                                                dot={{ r: 3, fill: "#94a3b8" }}
                                                connectNulls
                                            />
                                            {/* 금주: 실선 */}
                                            <Line
                                                type="monotone"
                                                dataKey="금주"
                                                stroke="#2563eb"
                                                strokeWidth={2.5}
                                                dot={{ r: 4, fill: "#2563eb" }}
                                                activeDot={{ r: 6 }}
                                                connectNulls
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                    <div style={{ fontSize: 11, color: "#94a3b8", padding: "0 8px 10px" }}>
                                        ※ 전주 동일요일 기준 비교 ({data.trend.compare_note})
                                    </div>
                                </div>
                            </SectionCard>

                            <CompetitorTable rows={tab.competitor_top} label={tab.label} />
                            </TwoColGrid>
                        </>
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
        </PageWrapper>
    );
}
