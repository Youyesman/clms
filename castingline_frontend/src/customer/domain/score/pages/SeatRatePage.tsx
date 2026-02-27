import React, { useState, useEffect, useCallback, useMemo } from "react";
import styled from "styled-components";
import { useToast } from "../../../../components/common/CustomToast";
import { AxiosGet } from "../../../../axios/Axios";
import { handleBackendErrors } from "../../../../axios/handleBackendErrors";
import { CustomInput } from "../../../../components/common/CustomInput";
import { CustomSelect } from "../../../../components/common/CustomSelect";
import { CustomMultiSelect } from "../../../../components/common/CustomMultiSelect";
import type { FormatGroup } from "../../../../components/common/CustomMultiSelect";

/* ── 유틸 ── */
const fmtN = (n: number) => n.toLocaleString("ko-KR");
const fmtRate = (r: number | null | undefined) =>
    r == null ? "-" : `${r.toFixed(1)}%`;

const getYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
};

/* ── 멀티 순서 ── */
const MULTI_ORDER: Record<string, number> = {
    CGV: 0,
    롯데: 1,
    메가박스: 2,
    씨네큐: 3,
    기타: 4,
    합계: 5,
};

const REGIONS = ["서울", "경강", "경남", "경북", "충청", "호남"] as const;

/* ── 타입 ── */
interface SummaryRow {
    multi: string;
    visitor: number;
    seat_count: number;
    seat_rate: number;
    regions: Record<string, number | null>;
}

interface DetailRow {
    multi: string;
    rank: number;
    region: string;
    classification: string;
    theater: string;
    date: string;
    visitor: number;
    revenue: number;
    show_count: number;
    seat_count: number;
    seat_rate: number;
}

interface SeatRateData {
    meta: { movie_title: string; release_date: string; date: string } | null;
    summary: SummaryRow[];
    detail: DetailRow[];
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

const FilterBar = styled.div`
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px 20px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-end;
`;

const MovieInfo = styled.div`
    font-size: 15px;
    font-weight: 700;
    color: #1e293b;
    span {
        color: #64748b;
        font-size: 12px;
        font-weight: 400;
        margin-left: 8px;
    }
`;

const SectionLabel = styled.div`
    font-size: 13px;
    font-weight: 700;
    color: #334155;
    margin-bottom: 6px;
`;

const TableContainer = styled.div`
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: auto;
`;

const StyledTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    min-width: 600px;

    th,
    td {
        border: 1px solid #e2e8f0;
        padding: 4px 8px;
        text-align: center;
        white-space: nowrap;
    }

    th {
        background: #f1f5f9;
        font-weight: 700;
        color: #334155;
        position: sticky;
        top: 0;
        z-index: 2;
    }

    td {
        color: #475569;
    }

    tbody tr:hover td {
        background: #f8fafc;
    }
`;

const TotalRow = styled.tr`
    background: #dbeafe !important;
    font-weight: 700;
    td {
        color: #1e40af !important;
        background: #dbeafe !important;
        font-size: 12px;
    }
`;

const SubTotalRow = styled.tr`
    background: #f0fdf4 !important;
    font-weight: 700;
    td {
        color: #166534 !important;
        background: #f0fdf4 !important;
    }
`;

const EmptyRow = styled.tr`
    td {
        padding: 40px !important;
        color: #94a3b8 !important;
    }
`;

/* ── 컴포넌트 ── */
export function SeatRatePage() {
    const toast = useToast();
    const yesterday = getYesterday();

    const [moviesList, setMoviesList] = useState<{ id: number; title_ko: string }[]>([]);
    const [data, setData] = useState<SeatRateData>({ meta: null, summary: [], detail: [] });
    const [loading, setLoading] = useState(false);

    const [searchParams, setSearchParams] = useState({
        yyyy: new Date().getFullYear().toString(),
        movie_id: "",
        date: yesterday,
    });

    // 포맷(서브영화)
    const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
    const [formatOptions, setFormatOptions] = useState<{ id: number; label: string; movie_code: string }[]>([]);

    const FORMAT_GROUPS: FormatGroup[] = useMemo(() => {
        if (formatOptions.length === 0) return [];
        return [
            {
                label: "서브영화",
                key: "sub_movies",
                items: formatOptions.map((f) => f.label),
            },
        ];
    }, [formatOptions]);

    const yearOptions = useMemo(() => {
        const cy = new Date().getFullYear();
        return Array.from({ length: 11 }, (_, i) => (cy - i).toString());
    }, []);

    const fetchMoviesByYear = useCallback(
        (year: string) => {
            AxiosGet(`score/movies-by-year/`, { params: { year } })
                .then((res) => {
                    setMoviesList(res.data || []);
                    setSearchParams((p) => ({ ...p, movie_id: "" }));
                    setFormatOptions([]);
                    setSelectedFormats([]);
                })
                .catch((err) => toast.error(handleBackendErrors(err)));
        },
        [toast]
    );

    const fetchMovieFormats = useCallback(
        (movieId: string) => {
            if (!movieId) {
                setFormatOptions([]);
                setSelectedFormats([]);
                return;
            }
            AxiosGet(`score/movie-formats/`, { params: { movie_id: movieId } })
                .then((res) => {
                    setFormatOptions(res.data || []);
                    setSelectedFormats([]);
                })
                .catch((err) => toast.error(handleBackendErrors(err)));
        },
        [toast]
    );

    useEffect(() => {
        fetchMoviesByYear(searchParams.yyyy);
    }, [searchParams.yyyy, fetchMoviesByYear]);

    const fetchData = useCallback(() => {
        if (!searchParams.movie_id) return;
        const formatIds = selectedFormats
            .map((label) => formatOptions.find((f) => f.label === label)?.id)
            .filter(Boolean)
            .join(",");
        setLoading(true);
        AxiosGet(`score/seat-rate/`, {
            params: {
                movie_id: searchParams.movie_id,
                date: searchParams.date,
                ...(formatIds ? { format_movie_ids: formatIds } : {}),
            },
        })
            .then((res) =>
                setData(
                    res.data || { meta: null, summary: [], detail: [] }
                )
            )
            .catch((err) => toast.error(handleBackendErrors(err)))
            .finally(() => setLoading(false));
    }, [searchParams.movie_id, searchParams.date, selectedFormats, formatOptions, toast]);

    useEffect(() => {
        if (searchParams.movie_id) fetchData();
    }, [searchParams.movie_id, searchParams.date, selectedFormats, fetchData]);

    const { meta, summary, detail } = data;

    // 멀티별로 detail 그룹화 (합계 행 삽입용)
    const detailByMulti = useMemo(() => {
        const groups: Record<string, DetailRow[]> = {};
        for (const row of detail) {
            if (!groups[row.multi]) groups[row.multi] = [];
            groups[row.multi].push(row);
        }
        return groups;
    }, [detail]);

    const multiKeys = useMemo(
        () =>
            Object.keys(detailByMulti).sort(
                (a, b) => (MULTI_ORDER[a] ?? 99) - (MULTI_ORDER[b] ?? 99)
            ),
        [detailByMulti]
    );

    return (
        <PageWrapper>
            {/* ── 필터 ── */}
            <FilterBar>
                <div>
                    <CustomSelect
                        style={{ width: "120px" }}
                        label="연도"
                        options={yearOptions}
                        value={searchParams.yyyy}
                        onChange={(v) =>
                            setSearchParams((p) => ({ ...p, yyyy: v }))
                        }
                    />
                </div>
                <div>
                    <CustomSelect
                        style={{ width: "360px" }}
                        label="영화선택"
                        allowClear={false}
                        options={moviesList.map((m) => ({
                            label: m.title_ko,
                            value: m.id.toString(),
                        }))}
                        value={searchParams.movie_id}
                        onChange={(val) => {
                            setSearchParams((p) => ({ ...p, movie_id: val }));
                            fetchMovieFormats(val);
                        }}
                    />
                </div>
                <div>
                    <CustomMultiSelect
                        label="포맷"
                        groups={FORMAT_GROUPS}
                        value={selectedFormats}
                        onChange={setSelectedFormats}
                        disabled={formatOptions.length === 0}
                    />
                </div>
                <div>
                    <CustomInput
                        inputType="date"
                        label="날짜"
                        value={searchParams.date}
                        setValue={(v) =>
                            setSearchParams((p) => ({ ...p, date: v }))
                        }
                    />
                </div>
            </FilterBar>

            {meta && (
                <MovieInfo>
                    {meta.movie_title}
                    <span>
                        (개봉일: {meta.release_date || "-"} | 기준일:{" "}
                        {meta.date})
                    </span>
                </MovieInfo>
            )}

            {/* ── 상단 요약표 ── */}
            <div>
                <SectionLabel>멀티별 좌석판매율 요약</SectionLabel>
                <TableContainer>
                    <StyledTable>
                        <thead>
                            <tr>
                                <th>영화관</th>
                                <th>관객수(명)</th>
                                <th>좌석수</th>
                                <th>좌석판매율(%)</th>
                                {REGIONS.map((r) => (
                                    <th key={r}>{r}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {summary.length === 0 && (
                                <EmptyRow>
                                    <td colSpan={4 + REGIONS.length}>
                                        {loading
                                            ? "데이터 조회 중..."
                                            : "영화를 선택하면 데이터가 표시됩니다"}
                                    </td>
                                </EmptyRow>
                            )}
                            {summary.map((row) =>
                                row.multi === "합계" ? (
                                    <TotalRow key="total">
                                        <td>합계</td>
                                        <td>{fmtN(row.visitor)}</td>
                                        <td>{fmtN(row.seat_count)}</td>
                                        <td>{fmtRate(row.seat_rate)}</td>
                                        {REGIONS.map((r) => (
                                            <td key={r}>
                                                {fmtRate(
                                                    row.regions?.[r] ?? null
                                                )}
                                            </td>
                                        ))}
                                    </TotalRow>
                                ) : (
                                    <tr key={row.multi}>
                                        <td style={{ fontWeight: 600 }}>
                                            {row.multi}
                                        </td>
                                        <td>{fmtN(row.visitor)}</td>
                                        <td>{fmtN(row.seat_count)}</td>
                                        <td>{fmtRate(row.seat_rate)}</td>
                                        {REGIONS.map((r) => (
                                            <td key={r}>
                                                {fmtRate(
                                                    row.regions?.[r] ?? null
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                )
                            )}
                        </tbody>
                    </StyledTable>
                </TableContainer>
            </div>

            {/* ── 하단 상세표 ── */}
            <div>
                <SectionLabel>극장별 좌석판매율 상세</SectionLabel>
                <TableContainer>
                    <StyledTable>
                        <thead>
                            <tr>
                                <th>멀티구분</th>
                                <th>순위</th>
                                <th>지역</th>
                                <th>구분</th>
                                <th style={{ minWidth: 120, textAlign: "left" }}>
                                    극장
                                </th>
                                <th>상영일</th>
                                <th>관객수(명)</th>
                                <th>매출액(원)</th>
                                <th>상영횟수</th>
                                <th>좌석수</th>
                                <th>좌석판매율(%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {detail.length === 0 && (
                                <EmptyRow>
                                    <td colSpan={11}>
                                        {loading
                                            ? "데이터 조회 중..."
                                            : "영화를 선택하면 데이터가 표시됩니다"}
                                    </td>
                                </EmptyRow>
                            )}
                            {multiKeys.map((multi) => {
                                const rows = detailByMulti[multi];
                                const subVisitor = rows.reduce(
                                    (s, r) => s + r.visitor,
                                    0
                                );
                                const subRevenue = rows.reduce(
                                    (s, r) => s + r.revenue,
                                    0
                                );
                                const subShow = rows.reduce(
                                    (s, r) => s + r.show_count,
                                    0
                                );
                                const subSeat = rows.reduce(
                                    (s, r) => s + r.seat_count,
                                    0
                                );
                                const subRate =
                                    subSeat > 0
                                        ? Math.round(
                                              (subVisitor / subSeat) * 1000
                                          ) / 10
                                        : 0;
                                return (
                                    <React.Fragment key={multi}>
                                        {rows.map((row, idx) => (
                                            <tr key={idx}>
                                                <td>{row.multi}</td>
                                                <td>{row.rank}</td>
                                                <td>{row.region}</td>
                                                <td>{row.classification}</td>
                                                <td
                                                    style={{
                                                        textAlign: "left",
                                                    }}
                                                >
                                                    {row.theater}
                                                </td>
                                                <td>{row.date}</td>
                                                <td>
                                                    {fmtN(row.visitor)}
                                                </td>
                                                <td>
                                                    {fmtN(row.revenue)}
                                                </td>
                                                <td>{fmtN(row.show_count)}</td>
                                                <td>{fmtN(row.seat_count)}</td>
                                                <td>
                                                    {fmtRate(row.seat_rate)}
                                                </td>
                                            </tr>
                                        ))}
                                        {/* 멀티별 합계 행 */}
                                        <SubTotalRow>
                                            <td
                                                colSpan={6}
                                                style={{ textAlign: "right" }}
                                            >
                                                {multi} 합계
                                            </td>
                                            <td>{fmtN(subVisitor)}</td>
                                            <td>{fmtN(subRevenue)}</td>
                                            <td>{fmtN(subShow)}</td>
                                            <td>{fmtN(subSeat)}</td>
                                            <td>{fmtRate(subRate)}</td>
                                        </SubTotalRow>
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </StyledTable>
                </TableContainer>
            </div>
        </PageWrapper>
    );
}
