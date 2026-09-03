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
import { TheaterNameToggle, TheaterNameCell } from "../../../../components/common/TheaterNameToggle";
import { downloadExcel } from "../../../../utils/excelExport";
import { useRecoilState } from "recoil";
import { scoreYearOptions } from "../../../../utils/dateUtils";
import { ScoreFilterState } from "../../../../atom/ScoreFilterState";

/* ── 유틸 ── */
const fmtN = (n: number) => n.toLocaleString("ko-KR");


/* ── 타입 ── */
type SortKey = "visitor" | "revenue";

interface RankingRow {
    theater: string;
    /** 배급사별 극장명 (극장명 매핑, 없으면 빈 문자열) */
    distributor_theater?: string;
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
    /* 높이를 고정해 테이블이 내부 스크롤되게 함 — 헤더 틀고정(sticky)이 동작하는 조건 */
    height: calc(100vh - 60px);
`;

/* 탭바 아래 본문 — 스코어 현황 메인과 동일하게 탭은 상단에 붙이고 내용에만 패딩 */
const MainSection = styled.div`
    flex: 1;
    min-height: 0; /* 내부 테이블 스크롤(sticky 헤더) 유지 조건 */
    padding: 20px;
    display: flex;
    flex-direction: column;
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

// 검색 버튼 (정산조회와 동일 규격)
const SearchBtn = styled.button`
    height: 30px;
    padding: 0 14px;
    background: #2563eb;
    color: #ffffff;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.12s ease;
    &:hover {
        background: #1d4ed8;
    }
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

const TableContainer = styled.div`
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: auto;
    flex: 1;
`;

const StyledTable = styled.table`
    width: 100%;
    /* collapse는 테두리가 셀과 분리돼 sticky 헤더 뒤로 글자가 비침 — separate로 셀에 귀속 */
    border-collapse: separate;
    border-spacing: 0;
    font-size: 12px;
    min-width: 560px;

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

const SortableTh = styled.th<{ $active: boolean }>`
    cursor: pointer;
    user-select: none;
    background: ${({ $active }) => ($active ? "#bfdbfe" : "#f1f5f9")} !important;
    color: ${({ $active }) => ($active ? "#1d4ed8" : "#475569")} !important;
    transition: background 0.15s;

    &:hover {
        background: #e2e8f0 !important;
    }
`;

const SortArrow = styled.span`
    margin-left: 4px;
    font-size: 11px;
`;

const TotalRow = styled.tr`
    background: #bfdbfe !important;
    font-weight: 700;
    td {
        color: #1d4ed8 !important;
        background: #bfdbfe !important;
        /* 스크롤 없이 항상 보이도록 하단 고정 */
        position: sticky;
        bottom: 0;
        z-index: 3;
        border-top: 1px solid #bfdbfe;
    }
`;

const EmptyTd = styled.td`
    padding: 28px 16px !important;
    color: #94a3b8 !important;
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1.6;
`;

/* ── 컴포넌트 ── */
export function RankingPage() {
    const toast = useToast();

    const [scoreFilter, setScoreFilter] = useRecoilState(ScoreFilterState);
    const [moviesList, setMoviesList] = useState<{ id: number; title_ko: string }[]>([]);
    const [data, setData] = useState<RankingData>({ meta: null, rows: [] });
    const [loading, setLoading] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>("visitor");

    const [searchParams, setSearchParams] = useState({
        yyyy: scoreFilter.yyyy,
        movie_id: scoreFilter.movieId,
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

    // S002(0903): 연도 범위는 올해~2010 (공용 유틸)
    const yearOptions = useMemo(() => scoreYearOptions(), []);

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

    // 조회는 검색 버튼으로만 실행 — 필터를 바꿔도 자동 조회하지 않는다 (정산조회와 동일)
    const handleSearch = () => {
        if (!searchParams.movie_id) {
            toast.error("영화를 선택해 주세요.");
            return;
        }
        fetchData();
    };

    const handleSortClick = (key: SortKey) => {
        setSortKey(key);
    };

    // 정렬은 서버에서 수행하므로, 이미 조회한 결과가 있을 때 정렬을 바꾸면
    // 그 결과를 새 정렬로 다시 불러온다 (새 검색은 검색 버튼으로만)
    useEffect(() => {
        if ((data.rows || []).length > 0 && searchParams.movie_id) fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortKey]);

    const { meta } = data;

    // 배급사별 극장명(극장명 매핑) 표기 토글 — 기본 ON (매핑 없으면 캐스팅라인명 폴백)
    const [useDistName, setUseDistName] = useState(true);
    const getTheaterName = (row: RankingRow) =>
        useDistName ? row.distributor_theater || row.theater : row.theater;

    // 극장 검색 (조회 결과 내에서 극장명으로 좁히기 — 순위/합계도 함께 재계산됨)
    const [theaterSearch, setTheaterSearch] = useState("");

    const rows = useMemo(() => {
        const all = data.rows || [];
        const q = theaterSearch.trim().toLowerCase();
        if (!q) return all;
        return all.filter(
            (r) =>
                (r.theater || "").toLowerCase().includes(q) ||
                (r.distributor_theater || "").toLowerCase().includes(q)
        );
    }, [data.rows, theaterSearch]);

    // 합계
    const totalVisitor = rows.reduce((s, r) => s + r.visitor, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

    /* ── 엑셀 다운로드 (화면 표시와 동일: 순위 + 합계 행 포함) ── */
    const handleExcelDownload = () => {
        const body: (string | number)[][] = rows.map((row, idx) => [
            idx + 1,
            getTheaterName(row),
            row.visitor,
            row.min_date === row.max_date ? row.min_date : `${row.min_date} ~ ${row.max_date}`,
            row.revenue,
        ]);
        if (body.length > 0) body.push(["", "합계", totalVisitor, "-", totalRevenue]);

        const n = downloadExcel(
            `스코어_순위조회_${meta?.movie_title || ""}_${searchParams.date_from}~${searchParams.date_to}`,
            {
                caption: `${meta?.movie_title || ""} (개봉일: ${meta?.release_date || "-"}) / 집계기간: ${meta?.date_from || searchParams.date_from} ~ ${meta?.date_to || searchParams.date_to}${theaterSearch.trim() ? ` / 극장검색: ${theaterSearch.trim()}` : ""} / 정렬: ${sortKey === "visitor" ? "누적 관객수" : "누적 매출액"}`,
                headers: [["순위", "극장", "누적 관객수(명)", "상영기간", "누적 매출액(원)"]],
                rows: body,
            }
        );
        if (n === 0) toast.error("내보낼 데이터가 없습니다. 먼저 조회해 주세요.");
    };

    return (
        <PageWrapper>
            <PageNavTabs tabs={SCORE_TABS} />
            <MainSection>
                {/* ── 필터 ── */}
                <FilterBar>
                    <div>
                        <CustomSelect
                            label="연도"
                            options={yearOptions}
                            value={searchParams.yyyy}
                            onChange={(v) => {
                                setSearchParams((p) => ({ ...p, yyyy: v, movie_id: "" }));
                                setScoreFilter((f) => ({ ...f, yyyy: v, movieId: "", movieTitle: "" }));
                                setFormatOptions([]);
                                setSelectedFormats([]);
                            }} variant="chip" />
                    </div>
                    <div>
                        <CustomSelect
                            label="영화선택"
                            allowClear={false}
                            chipValueMinWidth={200}
                            options={moviesList.map((m) => ({
                                label: m.title_ko,
                                value: m.id.toString(),
                            }))}
                            value={searchParams.movie_id}
                            onChange={(val) => {
                                setSearchParams((p) => ({ ...p, movie_id: val }));
                                setScoreFilter((f) => ({ ...f, movieId: val, movieTitle: moviesList.find((m) => m.id.toString() === val)?.title_ko || "" }));
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
                        <CustomSelect
                            label="지역"
                            options={["전체", "서울", "경강", "경남", "경북", "충청", "호남"]}
                            value={searchParams.region}
                            onChange={(v) =>
                                setSearchParams((p) => ({ ...p, region: v }))
                            } variant="chip" />
                    </div>
                    <div>
                        <CustomSelect
                            label="멀티"
                            options={["전체", "롯데", "CGV", "메가박스", "자동차극장", "씨네큐", "작은영화관", "기타"]}
                            value={searchParams.multi}
                            onChange={(v) =>
                                setSearchParams((p) => ({ ...p, multi: v }))
                            } variant="chip" />
                    </div>
                    <div>
                        <CustomSelect
                            label="극장유형"
                            options={["전체", "직영", "위탁", "기타"]}
                            value={searchParams.theater_type}
                            onChange={(v) =>
                                setSearchParams((p) => ({ ...p, theater_type: v }))
                            } variant="chip" />
                    </div>
                    <div>
                        <CustomInput
                            inputType="date"
                            label="날짜 from"
                            value={searchParams.date_from}
                            setValue={(v) => {
                                setSearchParams((p) => ({ ...p, date_from: v }));
                                setScoreFilter((f) => ({ ...f, dateFrom: v, date: v }));
                            }} variant="chip" />
                    </div>
                    <div>
                        <CustomInput
                            inputType="date"
                            label="날짜 to"
                            value={searchParams.date_to}
                            setValue={(v) => {
                                setSearchParams((p) => ({ ...p, date_to: v }));
                                setScoreFilter((f) => ({ ...f, dateTo: v }));
                            }} variant="chip" />
                    </div>
                    <TheaterNameToggle useDistName={useDistName} onChange={setUseDistName} />
                    <div>
                        <CustomInput
                            label="극장 검색"
                            placeholder="극장명 입력"
                            value={theaterSearch}
                            setValue={setTheaterSearch} variant="chip" />
                    </div>
                    <SearchBtn onClick={handleSearch}>검색</SearchBtn>
                    <ExcelSlot>
                        <ExcelIconButton onClick={handleExcelDownload} title="조회 결과 엑셀 다운로드" />
                    </ExcelSlot>
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
                                            : "검색 조건을 선택 후 검색 버튼을 클릭하세요"}
                                    </EmptyTd>
                                </tr>
                            )}
                            {rows.map((row, idx) => (
                                <tr key={idx}>
                                    <td>{idx + 1}</td>
                                    <td style={{ textAlign: "left" }}>
                                        <TheaterNameCell useDistName={useDistName} theater={row.theater} distributorTheater={row.distributor_theater} />
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
            </MainSection>
        </PageWrapper>
    );
}
