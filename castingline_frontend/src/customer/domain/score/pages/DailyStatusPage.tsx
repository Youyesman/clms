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
import { Pagination } from "../../../../components/common/Pagination";
import { ExcelIconButton } from "../../../../components/common/ExcelIconButton";
import { TheaterNameToggle, TheaterNameCell } from "../../../../components/common/TheaterNameToggle";
import { downloadExcel } from "../../../../utils/excelExport";
import { useRecoilState } from "recoil";
import { scoreYearOptions } from "../../../../utils/dateUtils";
import { ScoreFilterState } from "../../../../atom/ScoreFilterState";

/* ── 유틸 ── */
const fmt = (n: number) => n.toLocaleString("ko-KR");


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
`;

const FilterBar = styled.div`
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
`;

const FilterRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
`;

// 필터 줄 오른쪽 끝에 엑셀 버튼을 붙인다
const ExcelSlot = styled.div`
    margin-left: auto;
    align-self: flex-end;
    padding-bottom: 2px;
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
    /* collapse는 테두리가 셀과 분리돼 sticky 헤더 뒤로 글자가 비침 — separate로 셀에 귀속 */
    border-collapse: separate;
    border-spacing: 0;
    font-size: 12px;
    min-width: 700px;

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

/* 테이블 아래 페이지네이션 줄 */
const PagerBar = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-top: 8px;
`;

const PagerInfo = styled.span`
    font-size: 12px;
    color: #64748b;
`;

const GrandTotalRow = styled.tr`
    background: #bfdbfe !important;
    font-weight: 700;

    td {
        color: #1d4ed8 !important;
        background: #bfdbfe !important;
        font-size: 13px;
        /* 스크롤 없이 항상 보이도록 하단 고정 */
        position: sticky;
        bottom: 0;
        z-index: 3;
        border-top: 1px solid #bfdbfe;
    }
`;

/* ── 타입 ── */
interface DailyRow {
    date: string;
    theater: string;
    /** 배급사별 극장명 (극장명 매핑, 없으면 빈 문자열) */
    distributor_theater?: string;
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

    const [moviesList, setMoviesList] = useState<any[]>([]);
    const [data, setData] = useState<DailyData>({
        meta: null,
        rows: [],
        grand_total: { visitor: 0, revenue: 0 },
    });

    const [scoreFilter, setScoreFilter] = useRecoilState(ScoreFilterState);

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

    // 조회는 검색 버튼으로만 실행 — 필터를 바꿔도 자동 조회하지 않는다 (정산조회와 동일)
    const handleSearch = () => {
        if (!searchParams.movie_id) {
            toast.error("영화를 선택해 주세요.");
            return;
        }
        fetchData();
    };

    const { meta } = data;

    // 극장 검색 (조회 결과 내에서 극장명으로 좁히기 — 전체합계도 함께 재계산됨)
    const [theaterSearch, setTheaterSearch] = useState("");

    // 배급사별 극장명(극장명 매핑) 표기 토글.
    // 기본 ON — 배급사 계정은 예전처럼 매핑명이 기본으로 보이게 (매핑 없거나
    // 관리자면 distributor_theater가 비어 캐스팅라인 극장명으로 폴백되므로 동일)
    const [useDistName, setUseDistName] = useState(true);
    const getTheaterName = (row: DailyRow) =>
        useDistName ? row.distributor_theater || row.theater : row.theater;

    const rows = useMemo(() => {
        const all = data.rows || [];
        const q = theaterSearch.trim().toLowerCase();
        if (!q) return all;
        // 캐스팅라인/배급사별 극장명 어느 쪽으로 검색해도 걸리게 둘 다 비교
        return all.filter(
            (r) =>
                (r.theater || "").toLowerCase().includes(q) ||
                (r.distributor_theater || "").toLowerCase().includes(q)
        );
    }, [data.rows, theaterSearch]);

    // 극장 검색으로 걸러진 경우 합계도 걸러진 행 기준으로 다시 계산한다
    const grand_total = useMemo(() => {
        if (!theaterSearch.trim()) return data.grand_total;
        return rows.reduce(
            (acc, r) => ({ visitor: acc.visitor + r.visitor, revenue: acc.revenue + r.revenue }),
            { visitor: 0, revenue: 0 }
        );
    }, [rows, theaterSearch, data.grand_total]);

    /* 대용량 대응(십만 행+): 페이지네이션으로 한 번에 일부만 렌더한다.
       합계·엑셀 다운로드는 전체 rows 기준이라 표시 페이지와 무관하게 정확하다. */
    const PAGE_SIZE = 100;
    const [page, setPage] = useState(1);
    useEffect(() => {
        setPage(1); // 검색/필터 결과가 바뀌면 1페이지로
    }, [rows]);
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const pagedRows = useMemo(
        () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        [rows, page]
    );

    /* ── 엑셀 다운로드 (전체합계 행 포함) ──
       S001(0903): 관객수 0명 행(자동차극장 등 누락 방지용 0명 등록분)은 배급사 전달용
       파일에서 제외한다. 마이너스 관객수(멀티사 당일 취소건)는 정상 추출 대상이라 남긴다.
       화면 표시는 그대로. 합계는 0명 행을 빼도 값이 같으므로 화면 합계를 그대로 쓴다. */
    const handleExcelDownload = () => {
        const body: (string | number)[][] = rows
            .filter((row) => Number(row.visitor) !== 0)
            .map((row) => [
                row.date, getTheaterName(row), row.auditorium, 1,
                Number(row.fare) || 0, row.visitor, row.revenue,
            ]);
        if (body.length > 0) {
            body.push(["전체합계", "", "", "", "", grand_total.visitor, grand_total.revenue]);
        }

        // S001(0903): 시트명(=파일명)은 '일별스코어_영화명' 으로 간소화 (예: 일별스코어_비광)
        const n = downloadExcel(
            `일별스코어_${meta?.movie_title || ""}`,
            {
                caption: `${meta?.movie_title || ""} (개봉일: ${meta?.release_date || "-"}) / 조회기간: ${searchParams.date_from} ~ ${searchParams.date_to}${theaterSearch.trim() ? ` / 극장검색: ${theaterSearch.trim()}` : ""}`,
                headers: [["날짜", "극장", "상영관", "--", "요금(원)", "관객수(명)", "매출액"]],
                rows: body,
                centerCols: [0, 1, 2, 3], // 날짜~'--' 컬럼은 가운데 정렬

            }
        );
        if (n === 0) toast.error("내보낼 데이터가 없습니다. 먼저 조회해 주세요.");
    };

    return (
        <PageWrapper>
            <PageNavTabs tabs={SCORE_TABS} />
            <MainSection>
                <FilterBar>
                    <FilterRow>
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
                                    setSearchParams((p) => ({
                                        ...p,
                                        movie_id: val,
                                    }));
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
                                } variant="chip" />
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
                                } variant="chip" />
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
                            {pagedRows.map((row, idx) => (
                                <tr key={idx}>
                                    <td>{row.date}</td>
                                    <td style={{ textAlign: "left" }}>
                                        <TheaterNameCell useDistName={useDistName} theater={row.theater} distributorTheater={row.distributor_theater} />
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
                                        검색 조건을 선택 후 검색 버튼을 클릭하세요
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </StyledTable>
                </TableContainer>

                {/* 페이지네이션 (전체합계는 테이블 하단 고정 행에서 전체 기준으로 표시) */}
                {rows.length > PAGE_SIZE && (
                    <PagerBar>
                        <PagerInfo>총 {rows.length.toLocaleString()}행</PagerInfo>
                        <Pagination
                            totalPages={totalPages}
                            currentPage={page}
                            onPageChange={setPage}
                        />
                    </PagerBar>
                )}
            </MainSection>
        </PageWrapper>
    );
}
