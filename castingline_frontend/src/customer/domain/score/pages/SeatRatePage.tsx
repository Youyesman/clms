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
import { ExcelIconButton } from "../../../../components/common/ExcelIconButton";
import { downloadExcel } from "../../../../utils/excelExport";
import { useRecoilState } from "recoil";
import { ScoreFilterState } from "../../../../atom/ScoreFilterState";

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
    /* 높이를 고정해 상세표가 내부 스크롤되게 함 — 요약표·헤더 틀고정(sticky) 동작 조건 */
    height: calc(100vh - 60px);
    padding: 20px;
    gap: 16px;
`;

const FilterBar = styled.div`
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-end;
`;

// 필터 줄 오른쪽 끝에 엑셀 버튼을 붙인다
const ExcelSlot = styled.div`
    margin-left: auto;
    padding-bottom: 2px;
`;

const MovieInfo = styled.div`
    font-size: 14px;
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
    color: #475569;
    margin-bottom: 6px;
`;

const TableContainer = styled.div`
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: auto;
`;

/* 상단 요약표: 스크롤과 무관하게 항상 위에 고정 */
const SummarySection = styled.div`
    flex-shrink: 0;
`;

/* 하단 상세표: 남은 높이를 차지하고 내부 스크롤 — 헤더는 sticky로 첫 줄 고정 */
const DetailSection = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;

    ${TableContainer} {
        flex: 1;
        min-height: 0;
    }
`;

const StyledTable = styled.table`
    width: 100%;
    /* collapse는 테두리가 셀과 분리돼 sticky 헤더 뒤로 글자가 비침 — separate로 셀에 귀속 */
    border-collapse: separate;
    border-spacing: 0;
    font-size: 12px;
    min-width: 600px;

    th,
    td {
        border-right: 1px solid #e2e8f0;
        border-bottom: 1px solid #e2e8f0;
        padding: 4px 8px;
        text-align: center;
        white-space: nowrap;
    }

    th {
        background: #f1f5f9;
        font-weight: 700;
        color: #475569;
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
    background: #bfdbfe !important;
    font-weight: 700;
    td {
        color: #1d4ed8 !important;
        background: #bfdbfe !important;
        font-size: 12px;
        /* 스크롤 없이 항상 보이도록 하단 고정 */
        position: sticky;
        bottom: 0;
        z-index: 3;
        border-top: 1px solid #bfdbfe;
    }
`;

const SubTotalRow = styled.tr`
    background: #f0fdf4 !important;
    font-weight: 700;
    td {
        color: #15803d !important;
        background: #f0fdf4 !important;
    }
`;

const EmptyRow = styled.tr`
    td {
        padding: 28px 16px !important;
        color: #94a3b8 !important;
    }
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1.6;
`;

/* ── 컴포넌트 ── */
export function SeatRatePage() {
    const toast = useToast();
    const yesterday = getYesterday();

    const [scoreFilter, setScoreFilter] = useRecoilState(ScoreFilterState);
    const [moviesList, setMoviesList] = useState<{ id: number; title_ko: string }[]>([]);
    const [data, setData] = useState<SeatRateData>({ meta: null, summary: [], detail: [] });
    const [loading, setLoading] = useState(false);

    const [searchParams, setSearchParams] = useState({
        yyyy: scoreFilter.yyyy,
        movie_id: scoreFilter.movieId,
        date: scoreFilter.date,
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

    // 다른 메뉴에서 넘어온 영화 선택이 있으면 포맷 목록도 같이 로드
    useEffect(() => {
        if (searchParams.movie_id) fetchMovieFormats(searchParams.movie_id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const { meta, summary } = data;

    // 극장 검색 — 극장 단위 표인 '극장별 좌석판매율 상세'에만 적용된다.
    // (상단 요약표는 멀티 단위 집계라 극장명으로 좁힐 대상이 아니다)
    const [theaterSearch, setTheaterSearch] = useState("");

    const detail = useMemo(() => {
        const all = data.detail || [];
        const q = theaterSearch.trim().toLowerCase();
        if (!q) return all;
        return all.filter((r) => (r.theater || "").toLowerCase().includes(q));
    }, [data.detail, theaterSearch]);

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

    /* ── 엑셀 다운로드 (요약표 + 상세표를 한 파일에) ── */
    const handleExcelDownload = () => {
        const summaryRows: (string | number)[][] = summary.map((row) => [
            row.multi, row.visitor, row.seat_count,
            row.seat_rate ?? "",
            ...REGIONS.map((r) => row.regions?.[r] ?? ""),
        ]);

        const detailRows: (string | number)[][] = [];
        multiKeys.forEach((multi) => {
            const rows = detailByMulti[multi];
            const sub = rows.reduce(
                (a, r) => ({
                    visitor: a.visitor + r.visitor, revenue: a.revenue + r.revenue,
                    show: a.show + r.show_count, seat: a.seat + r.seat_count,
                }),
                { visitor: 0, revenue: 0, show: 0, seat: 0 }
            );
            rows.forEach((row) => {
                detailRows.push([
                    row.multi, row.rank, row.region, row.classification, row.theater,
                    row.date, row.visitor, row.revenue, row.show_count, row.seat_count,
                    row.seat_rate ?? "",
                ]);
            });
            detailRows.push([
                `${multi} 합계`, "", "", "", "", "",
                sub.visitor, sub.revenue, sub.show, sub.seat,
                sub.seat > 0 ? Math.round((sub.visitor / sub.seat) * 1000) / 10 : 0,
            ]);
        });

        const n = downloadExcel(
            `스코어_좌석판매율_${meta?.movie_title || ""}_${searchParams.date}`,
            [
                {
                    caption: `[멀티별 좌석판매율 요약] ${meta?.movie_title || ""} (개봉일: ${meta?.release_date || "-"}) / 기준일: ${meta?.date || searchParams.date}`,
                    headers: [["영화관", "관객수(명)", "좌석수", "좌석판매율(%)", ...REGIONS]],
                    rows: summaryRows,
                },
                {
                    caption: `[극장별 좌석판매율 상세]${theaterSearch.trim() ? ` / 극장검색: ${theaterSearch.trim()}` : ""}`,
                    headers: [[
                        "멀티구분", "순위", "지역", "구분", "극장", "상영일",
                        "관객수(명)", "매출액(원)", "상영횟수", "좌석수", "좌석판매율(%)",
                    ]],
                    rows: detailRows,
                },
            ]
        );
        if (n === 0) toast.error("내보낼 데이터가 없습니다. 먼저 조회해 주세요.");
    };

    return (
        <PageWrapper>
            <PageNavTabs tabs={SCORE_TABS} />
            {/* ── 필터 ── */}
            <FilterBar>
                <div>
                    <CustomSelect
                        label="연도"
                        options={yearOptions}
                        value={searchParams.yyyy}
                        onChange={(v) => {
                            setSearchParams((p) => ({ ...p, yyyy: v, movie_id: "" }));
                            setScoreFilter((f) => ({ ...f, yyyy: v, movieId: "" }));
                            setFormatOptions([]);
                            setSelectedFormats([]);
                        }} variant="chip" />
                </div>
                <div>
                    <CustomSelect
                        label="영화선택"
                        allowClear={false}
                        options={moviesList.map((m) => ({
                            label: m.title_ko,
                            value: m.id.toString(),
                        }))}
                        value={searchParams.movie_id}
                        onChange={(val) => {
                            setSearchParams((p) => ({ ...p, movie_id: val }));
                            setScoreFilter((f) => ({ ...f, movieId: val }));
                            fetchMovieFormats(val);
                        }} variant="chip" />
                </div>
                <div>
                    <CustomMultiSelect
                        label="포맷"
                        groups={FORMAT_GROUPS}
                        value={selectedFormats}
                        onChange={setSelectedFormats}
                        disabled={formatOptions.length === 0} variant="chip" />
                </div>
                <div>
                    <CustomInput
                        inputType="date"
                        label="날짜"
                        value={searchParams.date}
                        setValue={(v) => {
                            setSearchParams((p) => ({ ...p, date: v }));
                            setScoreFilter((f) => ({ ...f, date: v, dateFrom: v, dateTo: v }));
                        }} variant="chip" />
                </div>
                <div>
                    <CustomInput
                        label="극장 검색"
                        placeholder="극장명 입력"
                        value={theaterSearch}
                        setValue={setTheaterSearch} variant="chip" />
                </div>
                <ExcelSlot>
                    <ExcelIconButton onClick={handleExcelDownload} title="조회 결과 엑셀 다운로드" />
                </ExcelSlot>
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
            <SummarySection>
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
            </SummarySection>

            {/* ── 하단 상세표 ── */}
            <DetailSection>
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
            </DetailSection>
        </PageWrapper>
    );
}
