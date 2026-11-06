import React, { useState, useEffect, useCallback, useMemo } from "react";
import styled from "styled-components";
import { useToast } from "../../../../components/common/CustomToast";
import { AxiosGet } from "../../../../axios/Axios";
import { handleBackendErrors } from "../../../../axios/handleBackendErrors";
import { CustomInput } from "../../../../components/common/CustomInput";
import { CustomSelect } from "../../../../components/common/CustomSelect";
import { CustomMultiSelect } from "../../../../components/common/CustomMultiSelect";
import type { FormatGroup } from "../../../../components/common/CustomMultiSelect";
import { GenericTable } from "../../../../components/GenericTable";
import { ComparisonChart } from "../../../../components/common/ComparisonChart";
import LogoImg from "../../../../assets/img/logo/logo.png";
import { PageNavTabs, SCORE_TABS } from "../../../../components/common/PageNavTabs";
import { ExcelIconButton } from "../../../../components/common/ExcelIconButton";
import { downloadExcel } from "../../../../utils/excelExport";
import { useRecoilState } from "recoil";
import { scoreYearOptions } from "../../../../utils/dateUtils";
import { ScoreFilterState } from "../../../../atom/ScoreFilterState";


/** 스타일 정의 **/
const ScorePageWrapper = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: #f8fafc;
    min-height: calc(100vh - 60px);
`;

const SortTabGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const SortTabLabel = styled.span`
    font-size: 12px;
    font-weight: 600;
    color: #dc2626;
    margin-right: 4px;
`;

/* 분류 선택 — 빨강 계열은 의도된 것이라 유지합니다.
   크기·테두리 굵기·라운드만 다른 버튼과 같은 규격으로 맞추고,
   glow 그림자와 hover 부양 효과는 뺐습니다. */
const SortTab = styled.button<{ $active: boolean }>`
    height: 32px;
    padding: 0 16px;
    border-radius: 6px;
    border: 1px solid ${({ $active }) => ($active ? "#dc2626" : "#fecaca")};
    background: ${({ $active }) => ($active ? "#dc2626" : "#ffffff")};
    color: ${({ $active }) => ($active ? "#ffffff" : "#dc2626")};
    font-size: 12px;
    font-weight: ${({ $active }) => ($active ? 700 : 600)};
    cursor: pointer;
    transition: border-color 0.12s ease, background-color 0.12s ease, color 0.12s ease;

    &:hover {
        border-color: #dc2626;
        background: ${({ $active }) => ($active ? "#b91c1c" : "#fef2f2")};
    }
`;

const MainSection = styled.div`
    flex: 1;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-x: hidden;
`;

const FilterBar = styled.div`
    display: flex;
    flex-direction: column; /* 행 분리를 위해 column 방향 설정 */
    gap: 8px;
    padding: 10px 12px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
`;

const FilterRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
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

const TableSection = styled.div`
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
`;

// R001: 지역별/멀티별 총괄은 집계값과 무관하게 아래 순서로 고정 표시한다.
// (사용자가 표 헤더를 눌러 직접 정렬하면 그때만 값 정렬로 전환)
// V001(1106): 기간별 총괄은 지역별 총괄과 동일해 삭제했다.
const FIXED_SECTION_ORDER: Record<string, string[]> = {
    region: ["경강", "경남", "경북", "서울", "충청", "호남"],
    multi: ["CGV", "롯데", "메가박스", "씨네큐", "일반극장"],
};

const SORT_LABELS: Record<string, string> = {
    region: "지역별총괄",
    multi: "멀티별총괄",
    version: "버전별총괄",
};

// 'YYYY-MM-DD'에서 days만큼 이동 (로컬 기준 — UTC 변환으로 하루 밀리는 문제 방지)
const shiftDate = (ymd: string, days: number) => {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(y, m - 1, d + days);
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${dt.getFullYear()}-${mm}-${dd}`;
};
const periodText = (from: string, to: string) => (from === to ? from : `${from} ~ ${to}`);

export function ScorePage() {
    const toast = useToast();
    const [scoreFilter, setScoreFilter] = useRecoilState(ScoreFilterState);
    const [data, setData] = useState<any[]>([]);
    const [moviesList, setMoviesList] = useState<any[]>([]);

    const [searchParams, setSearchParams] = useState({
        yyyy: scoreFilter.yyyy,
        movie_id: scoreFilter.movieId,
        sort_by: "region",
        region: "전체",
        multi: "전체",
        theater_type: "전체",
        // V002(1106): 하루 → 기간(From~To). 처음 접속 시 기본값은 전일~전일 (ScoreFilterState 기본값)
        date_from: scoreFilter.dateFrom,
        date_to: scoreFilter.dateTo,
    });

    // 포맷(서브영화) 선택 상태
    const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
    // API에서 가져온 하위영화(포맷) 목록
    const [formatOptions, setFormatOptions] = useState<{ id: number; label: string; movie_code: string }[]>([]);

    // 하위영화 목록 → CustomMultiSelect 그룹 형태로 변환
    const FORMAT_GROUPS: FormatGroup[] = useMemo(() => {
        if (formatOptions.length === 0) return [];
        return [{
            label: '서브영화',
            key: 'sub_movies',
            items: formatOptions.map((f) => f.label),
        }];
    }, [formatOptions]);

    // 영화 선택 시 → 하위영화(포맷) 목록 조회
    const fetchMovieFormats = useCallback((movieId: string) => {
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
    }, [toast]);

    // S002(0903): 연도 범위는 올해~2010 (공용 유틸)
    const yearOptions = useMemo(() => scoreYearOptions(), []);

    // 대표영화만 가져오는 API (score/movies-by-year/)
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

    const [compareMode, setCompareMode] = useState<"daily" | "weekly">("daily");
    const [activeFilters, setActiveFilters] = useState<any>({ movie_id: null });
    // key가 비어 있으면 "직접 정렬 안 함" → 고정 순서(FIXED_SECTION_ORDER) 적용
    const [sortConfig, setSortConfig] = useState({
        key: "",
        order: "desc" as "asc" | "desc",
    });
    const handleTableSort = (key: string) => {
        setSortConfig((prev) => ({
            key,
            order: prev.key === key && prev.order === "desc" ? "asc" : "desc",
        }));
    };
    const fetchStatistics = useCallback(() => {
        if (!activeFilters.movie_id) return;
        // 선택된 포맷 라벨 → 서브영화 ID 매핑
        const formatIds = selectedFormats
            .map((label) => formatOptions.find((f) => f.label === label)?.id)
            .filter(Boolean)
            .join(",");
        AxiosGet(`score/summary/`, {
            params: {
                ...activeFilters,
                compare_mode: compareMode,
                date_from: activeFilters.date_from,
                date_to: activeFilters.date_to,
                ...(formatIds ? { format_movie_ids: formatIds } : {}),
            },
        })
            .then((res) =>
                // 같은 라벨(section)이 여러 행 올 수 있으므로 행 고유키를 부여 (React key 충돌 → 유령 행 방지)
                setData((res.data || []).map((r: any, i: number) => ({ ...r, _rowKey: `${r.section}-${i}` })))
            )
            .catch((err) => toast.error(handleBackendErrors(err)));
    }, [activeFilters, compareMode, selectedFormats, formatOptions]);

    // 조회는 검색 버튼으로만 실행 — 필터를 바꿔도 자동 조회하지 않는다 (정산조회와 동일).
    // compareMode 는 이미 조회한 데이터의 차트 표시 방식이라 즉시 반영한다.
    useEffect(() => {
        if (activeFilters.movie_id) fetchStatistics();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFilters, compareMode]);

    const handleSearch = () => {
        if (!searchParams.movie_id) {
            toast.error("영화를 선택해 주세요.");
            return;
        }
        if (!searchParams.date_from || !searchParams.date_to) {
            toast.error("기간을 선택해 주세요.");
            return;
        }
        if (searchParams.date_from > searchParams.date_to) {
            toast.error("시작일이 종료일보다 늦습니다.");
            return;
        }
        setActiveFilters({ ...searchParams });
    };

    const handleSortChange = (newSort: string) => {
        setSearchParams((prev) => ({ ...prev, sort_by: newSort }));
        setActiveFilters((prev) => ({ ...prev, sort_by: newSort }));
        // 분류를 바꾸면 직접 정렬을 해제해 고정 순서로 되돌린다 (R001)
        setSortConfig({ key: "", order: "desc" });
    };
    const sortedData = useMemo(() => {
        if (!sortConfig.key) {
            // R001: 지역/멀티 총괄은 고정 순서. 목록에 없는 값은 뒤에 이름순으로.
            const fixedOrder = FIXED_SECTION_ORDER[activeFilters.sort_by];
            if (!fixedOrder) return data;
            const rank = (row: any) => {
                const i = fixedOrder.indexOf(String(row.section ?? "").trim());
                return i === -1 ? fixedOrder.length : i;
            };
            return [...data].sort(
                (a, b) =>
                    rank(a) - rank(b) ||
                    String(a.section ?? "").localeCompare(String(b.section ?? ""), "ko")
            );
        }

        const sorted = [...data].sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];

            // 숫자인 경우 처리
            if (!isNaN(Number(aVal)) && !isNaN(Number(bVal))) {
                aVal = Number(aVal);
                bVal = Number(bVal);
            }

            if (aVal < bVal) return sortConfig.order === "asc" ? -1 : 1;
            if (aVal > bVal) return sortConfig.order === "asc" ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [data, sortConfig, activeFilters.sort_by]);
    const totals = useMemo(() => {
        const initial = {
            theater_count: 0,
            screen_count: 0,
            base_day_visitors: 0,
            base_day_fare: 0,
            total_visitors: 0,
            total_fare: 0,
        };
        return data.reduce(
            (acc, curr) => ({
                theater_count: acc.theater_count + (Number(curr.theater_count) || 0),
                screen_count: acc.screen_count + (Number(curr.screen_count) || 0),
                base_day_visitors: acc.base_day_visitors + (Number(curr.base_day_visitors) || 0),
                base_day_fare: acc.base_day_fare + (Number(curr.base_day_fare) || 0),
                total_visitors: acc.total_visitors + (Number(curr.total_visitors) || 0),
                total_fare: acc.total_fare + (Number(curr.total_fare) || 0),
            }),
            initial
        );
    }, [data]);

    // 조회한 기간이 하루가 아니면 표 머리글을 '기간'으로 표기
    const isRange = !!activeFilters.date_from && activeFilters.date_from !== activeFilters.date_to;

    const headers = [
        {
            key: "section",
            label:
                activeFilters.sort_by === "multi"
                    ? "멀티구분"
                    : activeFilters.sort_by === "version"
                        ? "버전"
                        : "지역",
        },
        { key: "theater_count", label: "극장수" },
        { key: "screen_count", label: "스크린수" },
        // V002: 기간 조회 시 기간 총합 (하루면 기존 기준일 값과 동일)
        { key: "base_day_visitors", label: isRange ? "기간관객(명)" : "기준일관객(명)" },
        { key: "base_day_fare", label: isRange ? "기간총요금(원)" : "기준일총요금(원)" },
        { key: "total_visitors", label: "총누계(명)" },
        { key: "total_fare", label: "총요금(원)" },
    ];

    /* ── 엑셀 다운로드 (화면 표시와 동일: 정렬 상태 + 합계 행 포함) ── */
    const handleExcelDownload = () => {
        const movieTitle =
            moviesList.find((m) => m.id?.toString() === searchParams.movie_id)?.title_ko || "";
        const sortLabel = SORT_LABELS[activeFilters.sort_by] || "지역별총괄";
        // 파일명·캡션은 화면에 조회된 기간 기준
        const from = activeFilters.date_from || searchParams.date_from;
        const to = activeFilters.date_to || searchParams.date_to;

        const body: (string | number)[][] = sortedData.map((row) =>
            headers.map((h) => row[h.key] ?? "")
        );
        if (body.length > 0) {
            body.push([
                "합계", totals.theater_count, totals.screen_count,
                totals.base_day_visitors, totals.base_day_fare,
                totals.total_visitors, totals.total_fare,
            ]);
        }

        const n = downloadExcel(`스코어_${sortLabel}_${movieTitle}_${from === to ? from : `${from}~${to}`}`, {
            caption: `${movieTitle} / ${sortLabel} / ${from === to ? "기준일" : "기간"}: ${periodText(from, to)} / 극장유형: ${searchParams.theater_type} / 지역: ${searchParams.region} / 멀티: ${searchParams.multi}`,
            headers: [headers.map((h) => h.label)],
            rows: body,
        });
        if (n === 0) toast.error("내보낼 데이터가 없습니다. 먼저 조회해 주세요.");
    };

    // V002: 차트 비교군도 같은 길이의 기간 — 전일(1일)/전주(7일)만큼 당긴 기간의 총합과 비교
    //   예) 11/01~11/05, 전일 → 10/31~11/04  (백엔드 _summary_periods 와 같은 규칙)
    const { baseDate, prevDate } = useMemo(() => {
        const from = activeFilters.date_from;
        const to = activeFilters.date_to;
        if (!from || !to) return { baseDate: "", prevDate: "" };
        const offset = compareMode === "daily" ? 1 : 7;
        return {
            baseDate: periodText(from, to),
            prevDate: periodText(shiftDate(from, -offset), shiftDate(to, -offset)),
        };
    }, [activeFilters.date_from, activeFilters.date_to, compareMode]);

    const chartConfig = useMemo(() => {
        switch (activeFilters.sort_by) {
            case "region":
                return { categoryName: "지역", labelKey: "section" };
            case "multi":
                return { categoryName: "멀티사", labelKey: "section" };
            case "version":
                return { categoryName: "버전", labelKey: "section" };
            default:
                return { categoryName: "항목", labelKey: "section" };
        }
    }, [activeFilters.sort_by]);
    return (
        <ScorePageWrapper>
            <PageNavTabs tabs={SCORE_TABS} />
            <MainSection>
                <FilterBar>
                    {/* 0열: 분류 탭 */}
                    <SortTabGroup>
                        <SortTabLabel>분류</SortTabLabel>
                        <SortTab $active={searchParams.sort_by === "region"} onClick={() => handleSortChange("region")}>지역별총괄</SortTab>
                        <SortTab $active={searchParams.sort_by === "multi"} onClick={() => handleSortChange("multi")}>멀티별총괄</SortTab>
                        <SortTab $active={searchParams.sort_by === "version"} onClick={() => handleSortChange("version")}>버전별총괄</SortTab>
                    </SortTabGroup>

                    {/* 필터: 모두 한 줄 */}
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
                                    setSearchParams((prev) => ({ ...prev, movie_id: val }));
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
                                label="극장유형"
                                options={["전체", "직영", "위탁", "기타"]}
                                value={searchParams.theater_type}
                                onChange={(v) => setSearchParams((p) => ({ ...p, theater_type: v }))} variant="chip" />
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
                        <div>
                            <CustomSelect
                                label="지역"
                                options={["전체", "서울", "경강", "경남", "경북", "충청", "호남"]}
                                value={searchParams.region}
                                onChange={(v) => setSearchParams((p) => ({ ...p, region: v }))} variant="chip" />
                        </div>
                        <div>
                            <CustomSelect
                                label="멀티분류"
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
                                onChange={(v) => setSearchParams((p) => ({ ...p, multi: v }))} variant="chip" />
                        </div>
                        <SearchBtn onClick={handleSearch}>검색</SearchBtn>
                        <ExcelSlot>
                            <ExcelIconButton onClick={handleExcelDownload} title="조회 결과 엑셀 다운로드" />
                        </ExcelSlot>
                    </FilterRow>
                </FilterBar>

                <TableSection>
                    <GenericTable
                        headers={headers}
                        data={sortedData}
                        summaryData={totals}
                        onSelectItem={() => { }}
                        sortKey={sortConfig.key} // 현재 정렬 기준 키
                        sortOrder={sortConfig.order} // 현재 정렬 순서
                        onSortChange={handleTableSort} // 헤더 클릭 시 함수
                        getRowKey={(row) => row._rowKey ?? row.section}
                        formatCell={(key, val, row) => {
                            if (typeof val === "number") return val.toLocaleString();
                            return val || "-";
                        }}
                    />
                </TableSection>
                <div style={{ width: "800px" }}>
                    {sortedData.length > 0 && (
                        <ComparisonChart
                            data={sortedData}
                            baseDate={baseDate}
                            prevDate={prevDate}
                            compareMode={compareMode}
                            onCompareModeChange={setCompareMode}
                            categoryName={chartConfig.categoryName} // "지역", "멀티사" 등
                            labelKey={chartConfig.labelKey} // 데이터에서 이름을 꺼낼 키 ("section")
                        />
                    )}
                </div>
            </MainSection>
        </ScorePageWrapper>
    );
}
