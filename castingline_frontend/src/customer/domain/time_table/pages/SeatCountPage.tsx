import React, { useState, useEffect, useCallback, useRef } from "react";
import styled from "styled-components";
import { useRecoilState } from "recoil";
import { TimeTableFilterState } from "../../../../atom/TimeTableFilterState";
import { PageNavTabs, TIME_TABLE_TABS } from "../../../../components/common/PageNavTabs";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { useToast } from "../../../../components/common/CustomToast";
import { AxiosGet } from "../../../../axios/Axios";
import { handleBackendErrors } from "../../../../axios/handleBackendErrors";

/* ── 유틸 ── */
const fmt = (n: number | null | undefined) =>
    n == null ? "-" : Math.round(n).toLocaleString("ko-KR");
const fmtPct = (n: number | null | undefined) =>
    n == null ? "-" : Number(n).toFixed(1) + "%";

function yesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
}

/* ── 타입 ── */
interface DailyCell {
    total_seats: number;
    sold_seats: number;
    lw_total_seats: number;
}

interface MovieSeat {
    title: string;
    daily: Record<string, DailyCell>;
    period_total: number;
    period_sold: number;
    lw_period_total: number;
}

interface GrandTotal {
    period_total: number;
    period_sold: number;
    lw_period_total: number;
    daily: Record<string, { total_seats: number; sold_seats: number }>;
}

interface CompetitorData {
    dates: string[];
    movies: MovieSeat[];
    grand: GrandTotal;
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
    align-items: flex-start;
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
    select[multiple] {
        height: auto;
        min-height: 80px;
        padding: 4px 6px;
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
    align-self: flex-end;
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
    .lw-col { color: #94a3b8; }
`;

const ChartGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 16px;
    @media (max-width: 1100px) { grid-template-columns: 1fr; }
`;

const PieStack = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const EmptyMsg = styled.div`
    text-align: center;
    padding: 40px;
    color: #94a3b8;
    font-size: 13px;
`;

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

const HintText = styled.div`
    font-size: 11px;
    color: #94a3b8;
    margin-top: 2px;
`;

/* ── 파이 차트 색상 ── */
const PIE_COLORS = [
    "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
    "#06b6d4", "#84cc16", "#f97316", "#ec4899", "#6366f1",
    "#14b8a6", "#fb7185", "#a78bfa", "#fbbf24", "#34d399",
];

const RADIAN = Math.PI / 180;

interface PieLabelProps {
    cx?: number;
    cy?: number;
    midAngle?: number;
    outerRadius?: number;
    name?: string;
    value?: number;
}

function renderPieLabel({ cx = 0, cy = 0, midAngle = 0, outerRadius = 0, name = "", value = 0 }: PieLabelProps) {
    if (value < 0.3) return null;
    const radius = outerRadius + 34;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
        <text
            x={x}
            y={y}
            fill="#e2e8f0"
            textAnchor={x > cx ? "start" : "end"}
            dominantBaseline="central"
            fontSize={10}
            fontWeight={500}
        >
            {name} {value.toFixed(2)}%
        </text>
    );
}

const DarkSectionCard = styled(SectionCard)`
    background: #1a2236;
    border-color: #2d3f5a;
`;

const DarkSectionTitle = styled(SectionTitle)`
    background: #111827;
    border-bottom-color: #2d3f5a;
    color: #e2e8f0;
`;

/* ── 메인 컴포넌트 ── */
export function SeatCountPage() {
    const toast = useToast();
    const [filter, setFilter] = useRecoilState(TimeTableFilterState);
    const { dateFrom, dateTo, selectedBrands, selectedRegions, selectedMovies } = filter;
    const setDateFrom = (v: string) => setFilter(f => ({ ...f, dateFrom: v }));
    const setDateTo = (v: string) => setFilter(f => ({ ...f, dateTo: v }));
    const setSelectedBrands = (v: string[]) => setFilter(f => ({ ...f, selectedBrands: v }));
    const setSelectedRegions = (v: string[]) => setFilter(f => ({ ...f, selectedRegions: v }));
    const setSelectedMovies = (v: string[]) => setFilter(f => ({ ...f, selectedMovies: v }));

    const [movieOptions, setMovieOptions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<CompetitorData | null>(null);
    const [fieldErrors, setFieldErrors] = useState({ dateFrom: false, dateTo: false });
    const [popover, setPopover] = useState<{ x: number; y: number; title: string; period: string; value: number } | null>(null);
    const isFirstMount = useRef(true);

    /* 영화 목록 로드 */
    const fetchMovies = useCallback((resetMovies = true) => {
        if (!dateFrom || !dateTo) return;
        const params: Record<string, string> = { date_from: dateFrom, date_to: dateTo };
        if (selectedBrands.length) params.brands = selectedBrands.join(",");
        if (selectedRegions.length) params.regions = selectedRegions.join(",");

        AxiosGet("score/competitor/movies/", { params })
            .then(res => {
                setMovieOptions(res.data?.movies || []);
                if (resetMovies) setSelectedMovies([]);
            })
            .catch(err => toast.error(handleBackendErrors(err)));
    }, [dateFrom, dateTo, selectedBrands, selectedRegions, toast]);

    useEffect(() => {
        if (isFirstMount.current) return;
        fetchMovies(true);
    }, [dateFrom, dateTo]);

    /* 검색 */
    const handleSearch = useCallback(() => {
        const errs = { dateFrom: !dateFrom, dateTo: !dateTo };
        setFieldErrors(errs);
        if (Object.values(errs).some(Boolean)) return;

        setLoading(true);
        setPopover(null);
        const params: Record<string, string> = { date_from: dateFrom, date_to: dateTo };
        if (selectedMovies.length) params.movies = selectedMovies.join(",");
        if (selectedBrands.length) params.brands = selectedBrands.join(",");
        if (selectedRegions.length) params.regions = selectedRegions.join(",");

        AxiosGet("score/competitor/seats/", { params })
            .then(res => setData(res.data))
            .catch(err => toast.error(handleBackendErrors(err)))
            .finally(() => setLoading(false));
    }, [dateFrom, dateTo, selectedMovies, selectedBrands, selectedRegions, toast]);

    /* 마운트 시 영화 목록 로드 후 자동 검색 */
    useEffect(() => {
        if (!dateFrom || !dateTo) return;
        const params: Record<string, string> = { date_from: dateFrom, date_to: dateTo };
        if (selectedBrands.length) params.brands = selectedBrands.join(",");
        if (selectedRegions.length) params.regions = selectedRegions.join(",");
        AxiosGet("score/competitor/movies/", { params })
            .then(res => setMovieOptions(res.data?.movies || []))
            .catch(() => {})
            .finally(() => {
                isFirstMount.current = false;
                handleSearch();
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* 화면 클릭으로 popover 닫기 */
    useEffect(() => {
        if (!popover) return;
        const close = () => setPopover(null);
        window.addEventListener("click", close);
        return () => window.removeEventListener("click", close);
    }, [popover]);

    /* 바 차트 데이터 */
    const barData = data?.movies.map(m => ({
        title: m.title.length > 10 ? m.title.slice(0, 10) + "…" : m.title,
        fullTitle: m.title,
        period_total: m.period_total,
        lw_period_total: m.lw_period_total,
    })) ?? [];

    /* 파이 차트 데이터 */
    const rateData = data?.movies.map((m, i) => ({
        name: m.title.length > 10 ? m.title.slice(0, 10) + "…" : m.title,
        value: data.grand.period_sold > 0
            ? Math.round(m.period_sold / data.grand.period_sold * 10000) / 100
            : 0,
        color: PIE_COLORS[i % PIE_COLORS.length],
    })) ?? [];

    const seatData = data?.movies.map((m, i) => ({
        name: m.title.length > 10 ? m.title.slice(0, 10) + "…" : m.title,
        value: data.grand.period_total > 0
            ? Math.round(m.period_total / data.grand.period_total * 10000) / 100
            : 0,
        color: PIE_COLORS[i % PIE_COLORS.length],
    })) ?? [];

    const BRAND_OPTIONS = ["CGV", "롯데", "메가박스"];
    const REGION_OPTIONS = ["서울", "경강", "경남", "경북", "충청", "호남"];

    return (
        <PageWrapper onClick={() => setPopover(null)}>
            {/* ── 탭 네비게이션 ── */}
            <PageNavTabs tabs={TIME_TABLE_TABS} />

            {/* ── 필터 ── */}
            <FilterCard>
                <FilterRow>
                    {/* 날짜 From */}
                    <FieldBox $error={fieldErrors.dateFrom}>
                        <label>날짜 From *</label>
                        <input
                            type="date"
                            value={dateFrom}
                            max={dateTo || undefined}
                            onChange={e => {
                                setDateFrom(e.target.value);
                                setFieldErrors(ev => ({ ...ev, dateFrom: false }));
                            }}
                            style={{ width: 140 }}
                        />
                        {fieldErrors.dateFrom && <span className="err-msg">필수 입력값입니다</span>}
                    </FieldBox>

                    {/* 날짜 To */}
                    <FieldBox $error={fieldErrors.dateTo}>
                        <label>날짜 To *</label>
                        <input
                            type="date"
                            value={dateTo}
                            min={dateFrom || undefined}
                            onChange={e => {
                                setDateTo(e.target.value);
                                setFieldErrors(ev => ({ ...ev, dateTo: false }));
                            }}
                            style={{ width: 140 }}
                        />
                        {fieldErrors.dateTo && <span className="err-msg">필수 입력값입니다</span>}
                    </FieldBox>

                    {/* 계열사 멀티셀렉트 */}
                    <FieldBox>
                        <label>계열사 (복수 선택)</label>
                        <select
                            multiple
                            size={3}
                            value={selectedBrands}
                            onChange={e => setSelectedBrands(Array.from(e.target.selectedOptions, o => o.value))}
                            style={{ width: 130 }}
                        >
                            {BRAND_OPTIONS.map(b => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                        <HintText>Ctrl+클릭으로 복수 선택</HintText>
                    </FieldBox>

                    {/* 지역 멀티셀렉트 */}
                    <FieldBox>
                        <label>지역 (복수 선택)</label>
                        <select
                            multiple
                            size={6}
                            value={selectedRegions}
                            onChange={e => setSelectedRegions(Array.from(e.target.selectedOptions, o => o.value))}
                            style={{ width: 110 }}
                        >
                            {REGION_OPTIONS.map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                        <HintText>Ctrl+클릭으로 복수 선택</HintText>
                    </FieldBox>

                    {/* 영화 멀티셀렉트 */}
                    <FieldBox>
                        <label>영화 (복수 선택, 미선택 시 전체)</label>
                        <select
                            multiple
                            size={6}
                            value={selectedMovies}
                            onChange={e => setSelectedMovies(Array.from(e.target.selectedOptions, o => o.value))}
                            style={{ width: 280 }}
                        >
                            {movieOptions.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                        <HintText>Ctrl+클릭으로 복수 선택 / 미선택 시 전체 영화</HintText>
                    </FieldBox>

                    {/* 검색 버튼 */}
                    <SearchBtn onClick={handleSearch} disabled={loading}>
                        {loading ? "검색 중..." : "검색"}
                    </SearchBtn>
                </FilterRow>
            </FilterCard>

            {/* ── 검색 결과 ── */}
            {data && data.movies.length > 0 && (
                <>
                    {/* 차트 영역 */}
                    <ChartGrid onClick={e => e.stopPropagation()}>
                        {/* 바 차트 */}
                        <SectionCard>
                            <SectionTitle>전주 대비 총좌석수 비교</SectionTitle>
                            <div style={{ padding: "16px 8px 8px" }}>
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart data={barData} margin={{ top: 5, right: 10, left: 10, bottom: 40 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis
                                            dataKey="title"
                                            tick={{ fontSize: 11, fill: "#64748b" }}
                                            tickLine={false}
                                            angle={-20}
                                            textAnchor="end"
                                        />
                                        <YAxis
                                            tick={{ fontSize: 11, fill: "#64748b" }}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(v: number) => v.toLocaleString("ko-KR")}
                                            width={70}
                                        />
                                        <Tooltip
                                            formatter={(value, name) => [
                                                Number(value ?? 0).toLocaleString("ko-KR") + "석",
                                                name === "lw_period_total" ? "지난 주 총 좌석수" : "총 좌석수",
                                            ]}
                                            labelFormatter={(label) => {
                                                const l = String(label ?? "");
                                                const item = barData.find(d => d.title === l);
                                                return item?.fullTitle ?? l;
                                            }}
                                        />
                                        <Bar
                                            dataKey="lw_period_total"
                                            name="지난 주 총 좌석수"
                                            fill="#94a3b8"
                                            radius={[3, 3, 0, 0]}
                                            cursor="pointer"
                                            onClick={(d: any, _idx: number, e: any) => {
                                                setPopover({
                                                    x: e?.clientX ?? 0,
                                                    y: e?.clientY ?? 0,
                                                    title: d.fullTitle ?? d.title,
                                                    period: "지난 주 총 좌석수",
                                                    value: d.lw_period_total ?? 0,
                                                });
                                            }}
                                        />
                                        <Bar
                                            dataKey="period_total"
                                            name="총 좌석수"
                                            fill="#1d4ed8"
                                            radius={[3, 3, 0, 0]}
                                            cursor="pointer"
                                            onClick={(d: any, _idx: number, e: any) => {
                                                setPopover({
                                                    x: e?.clientX ?? 0,
                                                    y: e?.clientY ?? 0,
                                                    title: d.fullTitle ?? d.title,
                                                    period: "총 좌석수",
                                                    value: d.period_total ?? 0,
                                                });
                                            }}
                                        />
                                        <Legend />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </SectionCard>

                        {/* 파이 차트 2개 */}
                        <PieStack>
                            <DarkSectionCard>
                                <DarkSectionTitle>실시간 예매율</DarkSectionTitle>
                                <div style={{ padding: "8px 4px" }}>
                                    <ResponsiveContainer width="100%" height={280}>
                                        <PieChart>
                                            <Pie
                                                data={rateData}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="45%"
                                                innerRadius={55}
                                                outerRadius={85}
                                                label={renderPieLabel}
                                                labelLine={{ stroke: "#4b5e7a", strokeWidth: 1 }}
                                            >
                                                {rateData.map((entry, index) => (
                                                    <Cell key={index} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ background: "#1e2536", border: "1px solid #334155", color: "#e2e8f0", fontSize: 12 }}
                                                formatter={(value) => [
                                                    `${Number(value ?? 0).toFixed(2)}%`,
                                                    "예매율",
                                                ]}
                                            />
                                            <Legend
                                                iconSize={8}
                                                wrapperStyle={{ fontSize: 10, color: "#94a3b8", paddingTop: 4 }}
                                                formatter={(value) => <span style={{ color: "#94a3b8" }}>{value}</span>}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </DarkSectionCard>

                            <DarkSectionCard>
                                <DarkSectionTitle>좌점율</DarkSectionTitle>
                                <div style={{ padding: "8px 4px" }}>
                                    <ResponsiveContainer width="100%" height={280}>
                                        <PieChart>
                                            <Pie
                                                data={seatData}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="45%"
                                                innerRadius={55}
                                                outerRadius={85}
                                                label={renderPieLabel}
                                                labelLine={{ stroke: "#4b5e7a", strokeWidth: 1 }}
                                            >
                                                {seatData.map((entry, index) => (
                                                    <Cell key={index} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ background: "#1e2536", border: "1px solid #334155", color: "#e2e8f0", fontSize: 12 }}
                                                formatter={(value) => [
                                                    `${Number(value ?? 0).toFixed(2)}%`,
                                                    "좌점율",
                                                ]}
                                            />
                                            <Legend
                                                iconSize={8}
                                                wrapperStyle={{ fontSize: 10, color: "#94a3b8", paddingTop: 4 }}
                                                formatter={(value) => <span style={{ color: "#94a3b8" }}>{value}</span>}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </DarkSectionCard>
                        </PieStack>
                    </ChartGrid>

                    {/* 매트릭스 테이블 */}
                    <SectionCard>
                        <SectionTitle>일자별 좌석수 현황</SectionTitle>
                        <TableWrap>
                            <Tbl>
                                <thead>
                                    <tr>
                                        <th rowSpan={2} style={{ minWidth: 140 }}>영화명</th>
                                        {data.dates.map(d => (
                                            <th key={d} colSpan={2}>{d}</th>
                                        ))}
                                        <th colSpan={2}>합계</th>
                                    </tr>
                                    <tr>
                                        {data.dates.map(d => (
                                            <React.Fragment key={d}>
                                                <th className="lw-col">전주</th>
                                                <th>총 좌석수</th>
                                            </React.Fragment>
                                        ))}
                                        <th className="lw-col">전주</th>
                                        <th>총 좌석수</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.movies.map((m, i) => (
                                        <tr key={i}>
                                            <td style={{ textAlign: "left" }}>{m.title}</td>
                                            {data.dates.map(d => {
                                                const cell = m.daily[d];
                                                return (
                                                    <React.Fragment key={d}>
                                                        <td className="lw-col">{fmt(cell?.lw_total_seats)}</td>
                                                        <td>{fmt(cell?.total_seats)}</td>
                                                    </React.Fragment>
                                                );
                                            })}
                                            <td className="lw-col">{fmt(m.lw_period_total)}</td>
                                            <td>{fmt(m.period_total)}</td>
                                        </tr>
                                    ))}
                                    {/* 합계 행 */}
                                    <tr className="total-row">
                                        <td style={{ textAlign: "left" }}>합계</td>
                                        {data.dates.map(d => {
                                            const cell = data.grand.daily[d];
                                            return (
                                                <React.Fragment key={d}>
                                                    <td>-</td>
                                                    <td>{fmt(cell?.total_seats)}</td>
                                                </React.Fragment>
                                            );
                                        })}
                                        <td>-</td>
                                        <td>{fmt(data.grand.period_total)}</td>
                                    </tr>
                                </tbody>
                            </Tbl>
                        </TableWrap>
                    </SectionCard>

                    {/* 예매율/좌점율 요약 테이블 */}
                    <SectionCard>
                        <SectionTitle>실시간 예매율 / 좌점율 현황</SectionTitle>
                        <TableWrap>
                            <Tbl>
                                <thead>
                                    <tr>
                                        <th>영화명</th>
                                        <th>총 좌석수</th>
                                        <th>판매좌석수</th>
                                        <th>실시간 예매율</th>
                                        <th>좌점율</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.movies.map((m, i) => (
                                        <tr key={i}>
                                            <td style={{ textAlign: "left" }}>{m.title}</td>
                                            <td>{fmt(m.period_total)}</td>
                                            <td>{fmt(m.period_sold)}</td>
                                            <td>
                                                {data.grand.period_sold > 0
                                                    ? fmtPct(m.period_sold / data.grand.period_sold * 100)
                                                    : "-"}
                                            </td>
                                            <td>
                                                {data.grand.period_total > 0
                                                    ? fmtPct(m.period_total / data.grand.period_total * 100)
                                                    : "-"}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="total-row">
                                        <td style={{ textAlign: "left" }}>합계</td>
                                        <td>{fmt(data.grand.period_total)}</td>
                                        <td>{fmt(data.grand.period_sold)}</td>
                                        <td>100%</td>
                                        <td>100%</td>
                                    </tr>
                                </tbody>
                            </Tbl>
                        </TableWrap>
                    </SectionCard>
                </>
            )}

            {/* 데이터 없음 */}
            {data && data.movies.length === 0 && (
                <SectionCard>
                    <EmptyMsg>선택한 조건에 해당하는 데이터가 없습니다.</EmptyMsg>
                </SectionCard>
            )}

            {/* 초기 안내 */}
            {!data && !loading && (
                <SectionCard>
                    <EmptyMsg>날짜 범위를 선택한 후 검색 버튼을 눌러주세요.</EmptyMsg>
                </SectionCard>
            )}

            {/* 바 차트 클릭 Popover */}
            {popover && (
                <PopoverBox $x={popover.x} $y={popover.y}>
                    {popover.title} ({popover.period}) | {popover.value.toLocaleString("ko-KR")}석
                </PopoverBox>
            )}
        </PageWrapper>
    );
}
