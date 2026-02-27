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
const fmt = (n: number) => n.toLocaleString("ko-KR");

const getYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
};

/* ── 스타일 ── */
const PageWrapper = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: #f8fafc;
    min-height: calc(100vh - 60px);
    padding: 20px;
`;

const FilterBar = styled.div`
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
`;

const FilterRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
`;

const MovieInfo = styled.div`
    font-size: 16px;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 12px;

    span {
        color: #64748b;
        font-size: 13px;
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
    min-width: 700px;

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

const GrandTotalRow = styled.tr`
    background: #dbeafe !important;
    font-weight: 700;

    td {
        color: #1e40af !important;
        background: #dbeafe !important;
        font-size: 13px;
    }
`;

/* ── 타입 ── */
interface DailyRow {
    date: string;
    theater: string;
    auditorium: string;
    fare: string;
    visitor: number;
    revenue: number;
}

interface DailyData {
    meta: { movie_title: string; release_date: string } | null;
    rows: DailyRow[];
    grand_total: { visitor: number; revenue: number };
}

/* ── 컴포넌트 ── */
export function DailyStatusPage() {
    const toast = useToast();
    const yesterday = getYesterday();

    const [moviesList, setMoviesList] = useState<any[]>([]);
    const [data, setData] = useState<DailyData>({
        meta: null,
        rows: [],
        grand_total: { visitor: 0, revenue: 0 },
    });

    const [searchParams, setSearchParams] = useState({
        yyyy: new Date().getFullYear().toString(),
        movie_id: "",
        region: "전체",
        multi: "전체",
        theater_type: "전체",
        date_from: yesterday,
        date_to: yesterday,
    });

    // 포맷(서브영화)
    const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
    const [formatOptions, setFormatOptions] = useState<
        { id: number; label: string; movie_code: string }[]
    >([]);

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

    useEffect(() => {
        fetchMoviesByYear(searchParams.yyyy);
    }, [searchParams.yyyy, fetchMoviesByYear]);

    const fetchData = useCallback(() => {
        if (!searchParams.movie_id) return;
        const formatIds = selectedFormats
            .map((label) => formatOptions.find((f) => f.label === label)?.id)
            .filter(Boolean)
            .join(",");
        AxiosGet(`score/daily/`, {
            params: {
                movie_id: searchParams.movie_id,
                date_from: searchParams.date_from,
                date_to: searchParams.date_to,
                region: searchParams.region,
                multi: searchParams.multi,
                theater_type: searchParams.theater_type,
                ...(formatIds ? { format_movie_ids: formatIds } : {}),
            },
        })
            .then((res) =>
                setData(
                    res.data || {
                        meta: null,
                        rows: [],
                        grand_total: { visitor: 0, revenue: 0 },
                    }
                )
            )
            .catch((err) => toast.error(handleBackendErrors(err)));
    }, [
        searchParams.movie_id,
        searchParams.date_from,
        searchParams.date_to,
        searchParams.region,
        searchParams.multi,
        searchParams.theater_type,
        selectedFormats,
        formatOptions,
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
        fetchData,
    ]);

    const { meta, rows, grand_total } = data;

    return (
        <PageWrapper>
            <FilterBar>
                <FilterRow>
                    <div>
                        <CustomSelect
                            style={{ width: "150px" }}
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
                            style={{ width: "400px" }}
                            label="영화선택"
                            allowClear={false}
                            options={moviesList.map((m) => ({
                                label: m.title_ko,
                                value: m.id.toString(),
                            }))}
                            value={searchParams.movie_id}
                            onChange={(val) => {
                                setSearchParams((p) => ({
                                    ...p,
                                    movie_id: val,
                                }));
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
                            options={[
                                "전체",
                                "서울",
                                "경강",
                                "경남",
                                "경북",
                                "충청",
                                "호남",
                            ]}
                            value={searchParams.region}
                            onChange={(v) =>
                                setSearchParams((p) => ({ ...p, region: v }))
                            }
                        />
                    </div>
                    <div>
                        <CustomSelect
                            label="멀티"
                            options={[
                                "전체",
                                "롯데",
                                "CGV",
                                "메가박스",
                                "자동차극장",
                                "씨네큐",
                                "작은영화관",
                                "기타",
                            ]}
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
                                setSearchParams((p) => ({
                                    ...p,
                                    theater_type: v,
                                }))
                            }
                        />
                    </div>
                    <div>
                        <CustomInput
                            inputType="date"
                            label="날짜 from"
                            value={searchParams.date_from}
                            setValue={(v) =>
                                setSearchParams((p) => ({
                                    ...p,
                                    date_from: v,
                                }))
                            }
                        />
                    </div>
                    <div>
                        <CustomInput
                            inputType="date"
                            label="날짜 to"
                            value={searchParams.date_to}
                            setValue={(v) =>
                                setSearchParams((p) => ({ ...p, date_to: v }))
                            }
                        />
                    </div>
                </FilterRow>
            </FilterBar>

            {meta && (
                <MovieInfo>
                    {meta.movie_title}
                    <span>(개봉일: {meta.release_date || "-"})</span>
                </MovieInfo>
            )}

            <TableContainer>
                <StyledTable>
                    <thead>
                        <tr>
                            <th>날짜</th>
                            <th>극장</th>
                            <th>상영관</th>
                            <th>--</th>
                            <th>요금(원)</th>
                            <th>관객수(명)</th>
                            <th>매출액</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, idx) => (
                            <tr key={idx}>
                                <td>{row.date}</td>
                                <td style={{ textAlign: "left" }}>
                                    {row.theater}
                                </td>
                                <td>{row.auditorium}</td>
                                <td>1</td>
                                <td>{fmt(Number(row.fare) || 0)}</td>
                                <td>{fmt(row.visitor)}</td>
                                <td>{fmt(row.revenue)}</td>
                            </tr>
                        ))}
                        {rows.length > 0 && (
                            <GrandTotalRow>
                                <td colSpan={5} style={{ textAlign: "center" }}>
                                    전체합계
                                </td>
                                <td>{fmt(grand_total.visitor)}</td>
                                <td>{fmt(grand_total.revenue)}</td>
                            </GrandTotalRow>
                        )}
                        {rows.length === 0 && (
                            <tr>
                                <td
                                    colSpan={7}
                                    style={{ padding: 40, color: "#94a3b8" }}
                                >
                                    영화를 선택하면 데이터가 표시됩니다
                                </td>
                            </tr>
                        )}
                    </tbody>
                </StyledTable>
            </TableContainer>
        </PageWrapper>
    );
}
