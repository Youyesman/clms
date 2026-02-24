import React, { useState, useEffect, useCallback, useMemo } from "react";
import styled from "styled-components";
import { useToast } from "../../../../components/common/CustomToast";
import { AxiosGet } from "../../../../axios/Axios";
import { handleBackendErrors } from "../../../../axios/handleBackendErrors";
import { CustomInput } from "../../../../components/common/CustomInput";
import { CustomSelect } from "../../../../components/common/CustomSelect";
import { CustomMultiSelect } from "../../../../components/common/CustomMultiSelect";
import type { FormatGroup } from "../../../../components/common/CustomMultiSelect";
import { CustomIconButton } from "../../../../components/common/CustomIconButton";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { GenericTable } from "../../../../components/GenericTable";
import { ComparisonChart } from "../../../../components/common/ComparisonChart";
import LogoImg from "../../../../assets/img/logo/logo.png";


/** 스타일 정의 **/
const ScorePageWrapper = styled.div`
    display: flex;
    min-height: calc(100vh - 60px);
    background-color: #f8fafc;
`;

const ScoreSidebar = styled.aside`
    width: 200px;
    background-color: #ffffff;
    border-right: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    padding: 20px 0;
    flex-shrink: 0;
`;

const SidebarMenu = styled.button<{ active: boolean }>`
    width: 100%;
    padding: 12px 24px;
    text-align: left;
    border: none;
    background: ${(props) => (props.active ? "#f1f5f9" : "transparent")};
    color: ${(props) => (props.active ? "#2563eb" : "#64748b")};
    font-size: 14px;
    font-weight: ${(props) => (props.active ? "700" : "500")};
    border-right: 3px solid ${(props) => (props.active ? "#2563eb" : "transparent")};
    cursor: pointer;
    &:hover {
        background-color: #f8fafc;
        color: #0f172a;
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
    gap: 12px;
    padding: 16px 20px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
`;

const FilterRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
`;

const TableSection = styled.div`
    background: #ffffff;
    border: 1px solid #94a3b8;
    border-radius: 4px;
    overflow: hidden;
`;

const FooterRow = styled.div`
    display: flex;
    background-color: #f1f5f9;
    border-top: 2px solid #64748b;
    font-weight: 800;
    font-size: 13px;
    .cell {
        padding: 12px;
        text-align: right;
        border-right: 1px solid #cbd5e1;
        &:first-child {
            text-align: center;
        }
        &:last-child {
            border-right: none;
        }
    }
`;

export function ScorePage() {
    const toast = useToast();
    const [data, setData] = useState<any[]>([]);
    const [moviesList, setMoviesList] = useState<any[]>([]);

    const [searchParams, setSearchParams] = useState({
        yyyy: new Date().getFullYear().toString(),
        movie_id: "",
        sort_by: "region",
        region: "전체",
        multi: "전체",
        theater_type: "전체",
        date: new Date().toISOString().split("T")[0],
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

    const yearOptions = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return Array.from({ length: 11 }, (_, i) => (currentYear - i).toString());
    }, []);

    // 대표영화만 가져오는 API (score/movies-by-year/)
    const fetchMoviesByYear = useCallback(
        (year: string) => {
            AxiosGet(`score/movies-by-year/`, { params: { year } })
                .then((res) => {
                    setMoviesList(res.data || []);
                    setSearchParams((prev) => ({ ...prev, movie_id: "" }));
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

    const [compareMode, setCompareMode] = useState<"daily" | "weekly">("daily");
    const [activeFilters, setActiveFilters] = useState<any>({ movie_id: null });
    const [sortConfig, setSortConfig] = useState({
        key: "total_fare",
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
                date_from: activeFilters.date,
                date_to: activeFilters.date,
                ...(formatIds ? { format_movie_ids: formatIds } : {}),
            },
        })
            .then((res) => setData(res.data || []))
            .catch((err) => toast.error(handleBackendErrors(err)));
    }, [activeFilters, compareMode, selectedFormats, formatOptions]);

    useEffect(() => {
        fetchStatistics();
    }, [fetchStatistics]);

    const handleSearch = () => {
        if (!searchParams.movie_id) {
            toast.error("영화를 선택해주세요.");
            return;
        }
        setActiveFilters({ ...searchParams });
    };

    const handleSortChange = (newSort: string) => {
        setSearchParams((prev) => ({ ...prev, sort_by: newSort }));
        setActiveFilters((prev) => ({ ...prev, sort_by: newSort }));
    };
    const sortedData = useMemo(() => {
        if (!sortConfig.key) return data;

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
    }, [data, sortConfig]);
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

    const headers = [
        {
            key: "section",
            label:
                activeFilters.sort_by === "region"
                    ? "지역"
                    : activeFilters.sort_by === "multi"
                        ? "멀티구분"
                        : activeFilters.sort_by === "version"
                            ? "버전"
                            : "기간",
        },
        { key: "theater_count", label: "극장수" },
        { key: "screen_count", label: "스크린수" },
        { key: "base_day_visitors", label: "기준일관객(명)" },
        { key: "base_day_fare", label: "기준일총요금(원)" },
        { key: "total_visitors", label: "총누계(명)" },
        { key: "total_fare", label: "총요금(원)" },
    ];

    const columnWidths = ["150px", "100px", "100px", "140px", "160px", "140px", "160px", "120px"];
    const baseDate = searchParams.date; // 기준일

    const prevDate = useMemo(() => {
        const date = new Date(baseDate);
        const offset = compareMode === "daily" ? 1 : 7;
        date.setDate(date.getDate() - offset);
        return date.toISOString().split("T")[0]; // 대비일 (1/6 또는 12/31)
    }, [baseDate, compareMode]);

    const chartConfig = useMemo(() => {
        switch (activeFilters.sort_by) {
            case "region":
                return { categoryName: "지역", labelKey: "section" };
            case "multi":
                return { categoryName: "멀티사", labelKey: "section" };
            case "version":
                return { categoryName: "버전", labelKey: "section" };
            case "period":
                return { categoryName: "기간", labelKey: "section" };
            default:
                return { categoryName: "항목", labelKey: "section" };
        }
    }, [activeFilters.sort_by]);
    return (
        <ScorePageWrapper>
            <ScoreSidebar>
                <SidebarMenu active={searchParams.sort_by === "region"} onClick={() => handleSortChange("region")}>
                    지역별총괄
                </SidebarMenu>
                <SidebarMenu active={searchParams.sort_by === "multi"} onClick={() => handleSortChange("multi")}>
                    멀티별총괄
                </SidebarMenu>
                <SidebarMenu active={searchParams.sort_by === "version"} onClick={() => handleSortChange("version")}>
                    버전별총괄
                </SidebarMenu>
                <SidebarMenu active={searchParams.sort_by === "period"} onClick={() => handleSortChange("period")}>
                    기간별총괄
                </SidebarMenu>
            </ScoreSidebar>

            <MainSection>
                <FilterBar>
                    {/* 1열: 연도, 영화선택, 극장유형, 기준일 */}
                    <FilterRow>
                        <div>
                            <CustomSelect
                                style={{ width: "150px" }}
                                label="연도"
                                options={yearOptions}
                                value={searchParams.yyyy}
                                onChange={(v) => setSearchParams((p) => ({ ...p, yyyy: v }))}
                            />
                        </div>
                        <div>
                            <CustomSelect
                                style={{ width: "500px" }}
                                label="영화선택"
                                options={moviesList.length > 0 ? moviesList.map((m) => m.title_ko) : ["데이터 없음"]}
                                value={
                                    moviesList.find((m) => m.id.toString() === searchParams.movie_id)?.title_ko ||
                                    "선택해주세요"
                                }
                                onChange={(val) => {
                                    const selected = moviesList.find((m) => m.title_ko === val);
                                    const movieId = selected?.id.toString() || "";
                                    setSearchParams((prev) => {
                                        const next = { ...prev, movie_id: movieId };
                                        if (movieId) setActiveFilters(next);
                                        return next;
                                    });
                                    fetchMovieFormats(movieId);
                                }}
                            />
                        </div>
                        <div>
                            <CustomSelect
                                label="극장유형"
                                options={["전체", "직영", "위탁", "기타"]}
                                value={searchParams.theater_type}
                                onChange={(v) => setSearchParams((p) => ({ ...p, theater_type: v }))}
                            />
                        </div>
                        <div>
                            <CustomInput
                                inputType="date"
                                label="날짜"
                                value={searchParams.date}
                                setValue={(v) => setSearchParams((p) => ({ ...p, date: v }))}
                            />
                        </div>
                    </FilterRow>

                    {/* 2열: 나머지 필터들 */}
                    <FilterRow>
                        {formatOptions.length > 0 && (
                            <div>
                                <CustomMultiSelect
                                    label="포맷"
                                    groups={FORMAT_GROUPS}
                                    value={selectedFormats}
                                    onChange={setSelectedFormats}
                                />
                            </div>
                        )}
                        <div>
                            <CustomSelect
                                label="지역"
                                options={["전체", "서울", "경강", "경남", "경북", "충청", "호남"]}
                                value={searchParams.region}
                                onChange={(v) => setSearchParams((p) => ({ ...p, region: v }))}
                            />
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
                                onChange={(v) => setSearchParams((p) => ({ ...p, multi: v }))}
                            />
                        </div>
                        <CustomIconButton color="blue" onClick={handleSearch}>
                            <MagnifyingGlassIcon weight="bold" />
                        </CustomIconButton>
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
                        getRowKey={(row) => row.section}
                        formatCell={(key, val, row) => {
                            if (typeof val === "number") return val.toLocaleString();
                            return val || "-";
                        }}
                    />
                    <FooterRow>
                        <div className="cell" style={{ width: columnWidths[0] }}>
                            합계
                        </div>
                        <div className="cell" style={{ width: columnWidths[1] }}>
                            {totals.theater_count.toLocaleString()}
                        </div>
                        <div className="cell" style={{ width: columnWidths[2] }}>
                            {totals.screen_count.toLocaleString()}
                        </div>
                        <div className="cell" style={{ width: columnWidths[3] }}>
                            {totals.base_day_visitors.toLocaleString()}
                        </div>
                        <div className="cell" style={{ width: columnWidths[4] }}>
                            {totals.base_day_fare.toLocaleString()}
                        </div>
                        <div className="cell" style={{ width: columnWidths[5] }}>
                            {totals.total_visitors.toLocaleString()}
                        </div>
                        <div className="cell" style={{ width: columnWidths[6] }}>
                            {totals.total_fare.toLocaleString()}
                        </div>
                        <div className="cell" style={{ width: columnWidths[7] }}>
                            {totals.screen_count ? (totals.base_day_visitors / totals.screen_count).toFixed(1) : "0"}
                        </div>
                    </FooterRow>
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
