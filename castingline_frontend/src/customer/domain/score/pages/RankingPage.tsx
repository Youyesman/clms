import React, { useState, useEffect, useCallback, useMemo } from "react";
import styled from "styled-components";
import { useToast } from "../../../../components/common/CustomToast";
import { AxiosGet } from "../../../../axios/Axios";
import { handleBackendErrors } from "../../../../axios/handleBackendErrors";
import { CustomInput } from "../../../../components/common/CustomInput";
import { CustomSelect } from "../../../../components/common/CustomSelect";
import { CustomMultiSelect } from "../../../../components/common/CustomMultiSelect";
import type { FormatGroup } from "../../../../components/common/CustomMultiSelect";
import { PageNavTabs, SCORE_TABS } from "../../../../components/common/PageNavTabs";
import { useRecoilState } from "recoil";
import { ScoreFilterState } from "../../../../atom/ScoreFilterState";

/* ── 유틸 ── */
const fmtN = (n: number) => n.toLocaleString("ko-KR");

const getYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
};

/* ── 타입 ── */
type SortKey = "visitor" | "revenue";

interface RankingRow {
    theater: string;
    visitor: number;
    revenue: number;
    min_date: string;
    max_date: string;
}

interface RankingData {
    meta: {
        movie_title: string;
        release_date: string;
        date_from: string;
        date_to: string;
    } | null;
    rows: RankingRow[];
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

const TableContainer = styled.div`
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: auto;
    flex: 1;
`;

const StyledTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    min-width: 560px;

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

const SortableTh = styled.th<{ $active: boolean }>`
    cursor: pointer;
    user-select: none;
    background: ${({ $active }) => ($active ? "#dbeafe" : "#f1f5f9")} !important;
    color: ${({ $active }) => ($active ? "#1e40af" : "#334155")} !important;
    transition: background 0.15s;

    &:hover {
        background: #e2e8f0 !important;
    }
`;

const SortArrow = styled.span`
    margin-left: 4px;
    font-size: 10px;
`;

const TotalRow = styled.tr`
    background: #dbeafe !important;
    font-weight: 700;
    td {
        color: #1e40af !important;
        background: #dbeafe !important;
    }
`;

const EmptyTd = styled.td`
    padding: 40px !important;
    color: #94a3b8 !important;
`;

/* ── 컴포넌트 ── */
export function RankingPage() {
    const toast = useToast();
    const yesterday = getYesterday();

    const [scoreFilter, setScoreFilter] = useRecoilState(ScoreFilterState);
    const [moviesList, setMoviesList] = useState<{ id: number; title_ko: string }[]>([]);
    const [data, setData] = useState<RankingData>({ meta: null, rows: [] });
    const [loading, setLoading] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>("visitor");

    const [searchParams, setSearchParams] = useState({
        yyyy: new Date().getFullYear().toString(),
        movie_id: "",
        region: "전체",
        multi: "전체",
        theater_type: "전체",
        date_from: scoreFilter.dateFrom,
        date_to: scoreFilter.dateTo,
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
        AxiosGet(`score/ranking/`, {
            params: {
                movie_id: searchParams.movie_id,
                date_from: searchParams.date_from,
                date_to: searchParams.date_to,
                region: searchParams.region,
                multi: searchParams.multi,
                theater_type: searchParams.theater_type,
                sort_by: sortKey,
                ...(formatIds ? { format_movie_ids: formatIds } : {}),
            },
        })
            .then((res) =>
                setData(res.data || { meta: null, rows: [] })
            )
            .catch((err) => toast.error(handleBackendErrors(err)))
            .finally(() => setLoading(false));
    }, [
        searchParams.movie_id,
        searchParams.date_from,
        searchParams.date_to,
        searchParams.region,
        searchParams.multi,
        searchParams.theater_type,
        selectedFormats,
        formatOptions,
        sortKey,
        toast,
    ]);

    useEffect(() => {
        if (searchParams.movie_id) fetchData();
    }, [
        searchParams.movie_id,
        searchParams.date_from,
        searchParams.date_to,
        searchParams.region,
        searchParams.multi,
        searchParams.theater_type,
        selectedFormats,
        sortKey,
        fetchData,
    ]);

    const handleSortClick = (key: SortKey) => {
        setSortKey(key);
    };

    const { meta, rows } = data;

    // 합계
    const totalVisitor = rows.reduce((s, r) => s + r.visitor, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

    return (
        <PageWrapper>
            <PageNavTabs tabs={SCORE_TABS} />
            {/* ── 필터 ── */}
            <FilterBar>
                <div>
                    <CustomSelect
                        style={{ width: "160px" }}
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
                    <CustomSelect
                        label="지역"
                        options={["전체", "서울", "경강", "경남", "경북", "충청", "호남"]}
                        value={searchParams.region}
                        onChange={(v) =>
                            setSearchParams((p) => ({ ...p, region: v }))
                        }
                    />
                </div>
                <div>
                    <CustomSelect
                        label="멀티"
                        options={["전체", "롯데", "CGV", "메가박스", "자동차극장", "씨네큐", "작은영화관", "기타"]}
                        value={searchParams.multi}
                        onChange={(v) =>
                            setSearchParams((p) => ({ ...p, multi: v }))
                        }
                    />
                </div>
                <div>
                    <CustomSelect
                        label="극장유형"
                        options={["전체", "직영", "위탁", "기타"]}
                        value={searchParams.theater_type}
                        onChange={(v) =>
                            setSearchParams((p) => ({ ...p, theater_type: v }))
                        }
                    />
                </div>
                <div>
                    <CustomInput
                        inputType="date"
                        label="날짜 from"
                        value={searchParams.date_from}
                        setValue={(v) => {
                            setSearchParams((p) => ({ ...p, date_from: v }));
                            setScoreFilter((f) => ({ ...f, dateFrom: v, date: v }));
                        }}
                    />
                </div>
                <div>
                    <CustomInput
                        inputType="date"
                        label="날짜 to"
                        value={searchParams.date_to}
                        setValue={(v) => {
                            setSearchParams((p) => ({ ...p, date_to: v }));
                            setScoreFilter((f) => ({ ...f, dateTo: v }));
                        }}
                    />
                </div>
            </FilterBar>

            {meta && (
                <MovieInfo>
                    {meta.movie_title}
                    <span>
                        (개봉일: {meta.release_date || "-"} | 집계기간:{" "}
                        {meta.date_from} ~ {meta.date_to})
                    </span>
                </MovieInfo>
            )}

            {/* ── 테이블 ── */}
            <TableContainer>
                <StyledTable>
                    <thead>
                        <tr>
                            <th>순위</th>
                            <th style={{ minWidth: 130, textAlign: "left" }}>극장</th>
                            <SortableTh
                                $active={sortKey === "visitor"}
                                onClick={() => handleSortClick("visitor")}
                            >
                                누적 관객수(명)
                                <SortArrow>
                                    {sortKey === "visitor" ? "▼" : "▽"}
                                </SortArrow>
                            </SortableTh>
                            <th>상영기간</th>
                            <SortableTh
                                $active={sortKey === "revenue"}
                                onClick={() => handleSortClick("revenue")}
                            >
                                누적 매출액(원)
                                <SortArrow>
                                    {sortKey === "revenue" ? "▼" : "▽"}
                                </SortArrow>
                            </SortableTh>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && (
                            <tr>
                                <EmptyTd colSpan={5}>
                                    {loading
                                        ? "데이터 조회 중..."
                                        : "영화를 선택하면 데이터가 표시됩니다"}
                                </EmptyTd>
                            </tr>
                        )}
                        {rows.map((row, idx) => (
                            <tr key={idx}>
                                <td>{idx + 1}</td>
                                <td style={{ textAlign: "left" }}>
                                    {row.theater}
                                </td>
                                <td>{fmtN(row.visitor)}</td>
                                <td>
                                    {row.min_date === row.max_date
                                        ? row.min_date
                                        : `${row.min_date} ~ ${row.max_date}`}
                                </td>
                                <td>{fmtN(row.revenue)}</td>
                            </tr>
                        ))}
                        {rows.length > 0 && (
                            <TotalRow>
                                <td colSpan={2} style={{ textAlign: "right" }}>
                                    합계
                                </td>
                                <td>{fmtN(totalVisitor)}</td>
                                <td>-</td>
                                <td>{fmtN(totalRevenue)}</td>
                            </TotalRow>
                        )}
                    </tbody>
                </StyledTable>
            </TableContainer>
        </PageWrapper>
    );
}
