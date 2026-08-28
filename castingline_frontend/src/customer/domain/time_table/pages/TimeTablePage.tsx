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

/* T001(0827): 집계작 시간표 화면 개편
   - KEY SUMMARY: 합계(전주 대비) + 일별 행
   - 지역별/포맷별 상세 현황: 일별 컬럼 + 비중(%)
   - 상영일자 추이: 4개 지표 버튼, 금주 실선 vs 전주 점선
   - 상단 엑셀/PDF: 그래프 제외 화면 그대로 + 캐스팅라인 로고 */

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

interface KeySummaryTotal extends Kpis {
    label: string;
    cmp: {
        total_seats: CmpNum; sold_seats: CmpNum; occupancy: { diff: number };
        shows: CmpNum; theaters: CmpNum; screens: CmpNum;
    } | null;
}

interface KeySummaryDay extends Kpis { date: string; label: string }

interface DetailDay { seats: number; share: number }

interface DetailRow {
    label: string;
    days: DetailDay[];
    total_seats: number;
    total_share: number;
    count: number;
    shows: number;
    is_total?: boolean;
}

interface DetailBlock {
    dates: string[];
    labels: string[];
    count_label: string;
    rows: DetailRow[];
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
    key_summary: { total: KeySummaryTotal; days: KeySummaryDay[] };
    region_detail: DetailBlock;
    format_detail: DetailBlock;
    trend: { dates: string[]; prev_dates: string[]; points: TrendPoint[]; compare_note: string };
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
    .share-cell { color: #94a3b8; font-size: 11.5px; }
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

const CmpText = styled.span`
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: #dc2626;
    margin-top: 2px;
`;

/* 전주 대비 표기: ▲/▼ + 증감(비율) — 보고서 규칙과 동일하게 빨간색 */
const cmpTxt = (c: CmpNum | undefined, unit: string) => {
    if (!c) return null;
    const arrow = c.diff >= 0 ? "▲" : "▼";
    const rate = c.rate != null ? ` (${c.rate >= 0 ? "+" : ""}${c.rate.toFixed(1)}%)` : "";
    return `${arrow} ${c.diff >= 0 ? "+" : ""}${Math.round(c.diff).toLocaleString("ko-KR")}${unit}${rate}`;
};

type MetricKey = "total_seats" | "sold_seats" | "occupancy" | "shows";
const METRICS: { key: MetricKey; label: string; unit: string }[] = [
    { key: "total_seats", label: "총 좌석수", unit: "석" },
    { key: "sold_seats", label: "예매좌석수", unit: "석" },
    { key: "occupancy", label: "좌석점유율", unit: "%" },
    { key: "shows", label: "회차수", unit: "회" },
];

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

    const validate = () => {
        const errs = { movie: !movieId, dateFrom: !dateFrom, dateTo: !dateTo };
        setFieldErrors(errs);
        return !Object.values(errs).some(Boolean);
    };

    /* 검색 */
    const handleSearch = useCallback(() => {
        if (!validate()) return;
        setLoading(true);
        AxiosGet("score/timetable/", {
            params: { movie_id: movieId, date_from: dateFrom, date_to: dateTo },
        })
            .then(res => setData(res.data))
            .catch(err => {
                // 조회 실패 시 이전 결과를 지운다 — 남겨두면 헤더의 조사기간과
                // 표의 내용이 어긋나 다른 조건의 데이터로 오인하게 된다
                setData(null);
                toast.error(handleBackendErrors(err));
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [movieId, dateFrom, dateTo, toast]);

    /* 엑셀: 화면 그대로 (그래프 제외) + 로고 */
    const handleExcel = useCallback(async () => {
        if (!validate()) return;
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [movieId, dateFrom, dateTo, selectedMovie, toast]);

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
            let filename = `집계작 시간표_${selectedMovie?.title_ko ?? ""}.pdf`;
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
    }, [movieId, dateFrom, dateTo, selectedMovie, toast]);

    const minDate = availableDates[0] ?? "";
    const maxDate = availableDates[availableDates.length - 1] ?? "";

    const hasData = !!data && data.key_summary.total.total_seats > 0;

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

    /* ── KEY SUMMARY 렌더 ── */
    const KeySummary = ({ ks }: { ks: TimetableData["key_summary"] }) => (
        <SectionCard>
            <SectionTitle>KEY SUMMARY</SectionTitle>
            <TableWrap>
                <Tbl>
                    <thead>
                        <tr>
                            <th>지표</th>
                            <th>총 좌석수</th>
                            <th>예매좌석수</th>
                            <th>좌석점유율</th>
                            <th>총 회차</th>
                            <th>총 극장수</th>
                            <th>총 스크린수</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="total-row">
                            <td>{ks.total.label}</td>
                            <td>
                                <b style={{ fontSize: 13 }}>{fmt(ks.total.total_seats)}석</b>
                                {ks.total.cmp && <CmpText>{cmpTxt(ks.total.cmp.total_seats, "석")}</CmpText>}
                            </td>
                            <td>
                                <b style={{ fontSize: 13 }}>{fmt(ks.total.sold_seats)}석</b>
                                {ks.total.cmp && <CmpText>{cmpTxt(ks.total.cmp.sold_seats, "석")}</CmpText>}
                            </td>
                            <td>
                                <b style={{ fontSize: 13 }}>{fmtPct(ks.total.occupancy)}</b>
                                {ks.total.cmp && (
                                    <CmpText>
                                        {ks.total.cmp.occupancy.diff >= 0 ? "▲" : "▼"} {Math.abs(ks.total.cmp.occupancy.diff).toFixed(1)}%p
                                    </CmpText>
                                )}
                            </td>
                            <td>
                                <b style={{ fontSize: 13 }}>{fmt(ks.total.shows)}회</b>
                                {ks.total.cmp && <CmpText>{cmpTxt(ks.total.cmp.shows, "회")}</CmpText>}
                            </td>
                            <td>
                                <b style={{ fontSize: 13 }}>{fmt(ks.total.theaters)}개</b>
                                {ks.total.cmp && <CmpText>{cmpTxt(ks.total.cmp.theaters, "개")}</CmpText>}
                            </td>
                            <td>
                                <b style={{ fontSize: 13 }}>{fmt(ks.total.screens)}개</b>
                                {ks.total.cmp && <CmpText>{cmpTxt(ks.total.cmp.screens, "개")}</CmpText>}
                            </td>
                        </tr>
                        {ks.days.map(d => (
                            <tr key={d.date}>
                                <td style={{ fontWeight: 600 }}>{d.label}</td>
                                <td>{fmt(d.total_seats)}석</td>
                                <td>{fmt(d.sold_seats)}석</td>
                                <td>{fmtPct(d.occupancy)}</td>
                                <td>{fmt(d.shows)}회</td>
                                <td>{fmt(d.theaters)}개</td>
                                <td>{fmt(d.screens)}개</td>
                            </tr>
                        ))}
                    </tbody>
                </Tbl>
            </TableWrap>
        </SectionCard>
    );

    /* ── 지역별/포맷별 상세 표 ── */
    const DetailTable = ({ title, detail }: { title: string; detail: DetailBlock }) => (
        <SectionCard>
            <SectionTitle>{title}</SectionTitle>
            <TableWrap>
                <Tbl>
                    <thead>
                        <tr>
                            <th rowSpan={2}>구분</th>
                            {detail.labels.map(lb => (
                                <th key={lb} colSpan={2}>{lb}</th>
                            ))}
                            <th colSpan={2}>합계 ({detail.labels.length}일)</th>
                            <th rowSpan={2}>{detail.count_label}</th>
                            <th rowSpan={2}>회차수<br /><span style={{ fontWeight: 400, fontSize: 11 }}>({detail.labels.length}일 합계)</span></th>
                        </tr>
                        <tr>
                            {detail.labels.map(lb => (
                                <React.Fragment key={lb}>
                                    <th>총 좌석수</th>
                                    <th>비중</th>
                                </React.Fragment>
                            ))}
                            <th>총 좌석수</th>
                            <th>비중</th>
                        </tr>
                    </thead>
                    <tbody>
                        {detail.rows.map((r, i) => (
                            <tr key={i} className={r.is_total ? "total-row" : ""}>
                                <td style={{ fontWeight: r.is_total ? 700 : 600 }}>{r.label}</td>
                                {r.days.map((d, di) => (
                                    <React.Fragment key={di}>
                                        <td>{fmt(d.seats)}석</td>
                                        <td className={r.is_total ? "" : "share-cell"}>{fmtPct(d.share)}</td>
                                    </React.Fragment>
                                ))}
                                <td style={{ fontWeight: 700 }}>{fmt(r.total_seats)}석</td>
                                <td className={r.is_total ? "" : "share-cell"}>{fmtPct(r.total_share)}</td>
                                <td>{fmt(r.count)}</td>
                                <td>{fmt(r.shows)}</td>
                            </tr>
                        ))}
                        {detail.rows.length === 0 && (
                            <tr><td colSpan={2 * detail.labels.length + 5}><EmptyMsg>데이터가 없습니다</EmptyMsg></td></tr>
                        )}
                    </tbody>
                </Tbl>
            </TableWrap>
        </SectionCard>
    );

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

                    {hasData ? (
                        <>
                            <KeySummary ks={data.key_summary} />
                            <DetailTable title="지역별 상세 현황" detail={data.region_detail} />
                            <DetailTable title="포맷별 상세 현황" detail={data.format_detail} />

                            {/* ── 상영일자 추이 ── */}
                            <SectionCard>
                                <SectionTitle>상영일자 추이</SectionTitle>
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
                        </>
                    ) : (
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
        </PageWrapper>
    );
}
