import React, {
    useState,
    useEffect,
    useCallback,
    useMemo,
    useRef,
} from "react";
import styled from "styled-components";
import { useToast } from "../../../../components/common/CustomToast";
import { AxiosGet } from "../../../../axios/Axios";
import { handleBackendErrors } from "../../../../axios/handleBackendErrors";
import { CustomInput } from "../../../../components/common/CustomInput";
import { CustomSelect } from "../../../../components/common/CustomSelect";
import { CustomMultiSelect } from "../../../../components/common/CustomMultiSelect";
import type { FormatGroup } from "../../../../components/common/CustomMultiSelect";
import { PageNavTabs, SETTLEMENT_TABS } from "../../../../components/common/PageNavTabs";
import { useRecoilState } from "recoil";
import { SettlementFilterState } from "../../../../atom/SettlementFilterState";

/* ── 유틸 ── */
const fmtN = (n: number) => n.toLocaleString("ko-KR");

const getYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
};

/* ── 타입 ── */
interface SupplyRow {
    entry_date: string;
    visitor: number;
    ticket_revenue: number;
    fund_excluded: number;
    vat_excluded: number;
    supply_value: number;
    vat: number;
    total_payment: number;
    unit_price: number;
}

interface SupplyData {
    meta: {
        movie_title: string;
        release_date: string;
    } | null;
    rows: SupplyRow[];
}

interface MovieSuggestion {
    id: number;
    title_ko: string;
    release_date: string;
    year: number | null;
}

/* ── 스타일 ── */
const PageWrapper = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: #f8fafc;
    min-height: calc(100vh - 60px);
    padding: 20px;
    gap: 14px;
`;

const FilterBar = styled.div`
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const FilterRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-end;
`;

const SearchWrapper = styled.div`
    position: relative;
    display: flex;
    flex-direction: column;
`;

const SearchInput = styled.input`
    height: 32px;
    padding: 0 10px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 12px;
    width: 200px;
    outline: none;
    &:focus {
        border-color: #2563eb;
    }
`;

const SearchLabel = styled.div`
    font-size: 11px;
    color: #64748b;
    margin-bottom: 3px;
    font-weight: 600;
`;

const SuggestionList = styled.ul`
    position: absolute;
    top: 100%;
    left: 0;
    width: 280px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    list-style: none;
    padding: 4px 0;
    margin: 2px 0 0;
    z-index: 100;
    max-height: 200px;
    overflow-y: auto;
`;

const SuggestionItem = styled.li`
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
    color: #334155;
    &:hover {
        background: #f1f5f9;
    }
    span {
        color: #94a3b8;
        font-size: 11px;
        margin-left: 6px;
    }
`;

const SearchBtn = styled.button`
    height: 32px;
    padding: 0 16px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    &:hover {
        background: #1d4ed8;
    }
`;

const FieldWrapper = styled.div<{ $error?: boolean }>`
    display: flex;
    flex-direction: column;
    & > * {
        border-color: ${({ $error }) =>
            $error ? "#ef4444 !important" : "inherit"};
    }
`;

const ErrorMsg = styled.div`
    font-size: 10px;
    color: #ef4444;
    margin-top: 2px;
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
    border-collapse: collapse;
    font-size: 11px;
    min-width: 1200px;

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

/* 헤더 그룹 구분용 */
const ThGroup = styled.th`
    background: #e2e8f0 !important;
    color: #1e293b !important;
    font-size: 10px;
    padding: 3px 6px !important;
`;

const GrandTotalRow = styled.tr`
    td {
        background: #1e40af !important;
        color: #ffffff !important;
        font-weight: 700;
        font-size: 11px;
        border-top: 2px solid #1d4ed8 !important;
    }
    &:hover td {
        background: #1e3a8a !important;
    }
`;

const EmptyTd = styled.td`
    padding: 40px !important;
    color: #94a3b8 !important;
`;

/* ── 컴포넌트 ── */
export function SupplyPricePage() {
    const toast = useToast();
    const [settlementFilter, setSettlementFilter] = useRecoilState(SettlementFilterState);
    const yesterday = getYesterday();
    const searchWrapperRef = useRef<HTMLDivElement>(null);

    const [moviesList, setMoviesList] = useState<
        { id: number; title_ko: string }[]
    >([]);
    const [data, setData] = useState<SupplyData>({ meta: null, rows: [] });
    const [loading, setLoading] = useState(false);

    const [searchInput, setSearchInput] = useState("");
    const [movieSuggestions, setMovieSuggestions] = useState<MovieSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const [validationErrors, setValidationErrors] = useState<
        Record<string, boolean>
    >({});

    const [searchParams, setSearchParams] = useState({
        yyyy: new Date().getFullYear().toString(),
        movie_id: "",
        region: "전체",
        multi: "전체",
        theater_type: "전체",
        date_from: settlementFilter.dateFrom,
        date_to: settlementFilter.dateTo,
    });

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

    /* 영화명 자동완성 */
    useEffect(() => {
        if (searchInput.length < 2) {
            setMovieSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        const timer = setTimeout(() => {
            AxiosGet(`score/movies-search/`, { params: { q: searchInput } })
                .then((res) => {
                    const list = res.data || [];
                    setMovieSuggestions(list);
                    setShowSuggestions(list.length > 0);
                })
                .catch(() => {});
        }, 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    /* 외부 클릭 시 드롭다운 닫기 */
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (
                searchWrapperRef.current &&
                !searchWrapperRef.current.contains(e.target as Node)
            ) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const handleMovieSelect = (movie: MovieSuggestion) => {
        const year = movie.year?.toString() || new Date().getFullYear().toString();
        setSearchParams((p) => ({ ...p, yyyy: year, movie_id: movie.id.toString() }));
        setSearchInput("");
        setShowSuggestions(false);
        fetchMovieFormats(movie.id.toString());
    };

    /* 검색 실행 */
    const fetchData = useCallback(() => {
        if (!searchParams.movie_id || !searchParams.date_from || !searchParams.date_to) return;
        const formatIds = selectedFormats
            .map((label) => formatOptions.find((f) => f.label === label)?.id)
            .filter(Boolean)
            .join(",");
        setLoading(true);
        AxiosGet(`score/supply-price/`, {
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
            .then((res) => setData(res.data || { meta: null, rows: [] }))
            .catch((err) => toast.error(handleBackendErrors(err)))
            .finally(() => setLoading(false));
    }, [searchParams, selectedFormats, formatOptions, toast]);

    const handleSearch = () => {
        const errors: Record<string, boolean> = {};
        if (!searchParams.yyyy) errors.yyyy = true;
        if (!searchParams.movie_id) errors.movie_id = true;
        if (!searchParams.date_from) errors.date_from = true;
        if (!searchParams.date_to) errors.date_to = true;
        setValidationErrors(errors);
        if (Object.keys(errors).length > 0) return;
        fetchData();
    };

    /* 전체 합계 */
    const totals = useMemo(() => {
        const s = {
            visitor: 0,
            ticket_revenue: 0,
            fund_excluded: 0,
            vat_excluded: 0,
            supply_value: 0,
            vat: 0,
            total_payment: 0,
        };
        for (const r of data.rows) {
            s.visitor += r.visitor;
            s.ticket_revenue += r.ticket_revenue;
            s.fund_excluded += r.fund_excluded;
            s.vat_excluded += r.vat_excluded;
            s.supply_value += r.supply_value;
            s.vat += r.vat;
            s.total_payment += r.total_payment;
        }
        return {
            ...s,
            ticket_vat: s.fund_excluded - s.vat_excluded,
            unit_price: s.visitor > 0 ? Math.round(s.supply_value / s.visitor) : 0,
        };
    }, [data.rows]);

    const { meta } = data;
    const movieTitle = meta?.movie_title || "";

    return (
        <PageWrapper>
            <PageNavTabs tabs={SETTLEMENT_TABS} />
            {/* ── 필터 ── */}
            <FilterBar>
                {/* Row 1: 영화 검색 자동완성 */}
                <FilterRow>
                    <SearchWrapper ref={searchWrapperRef}>
                        <SearchLabel>SEARCH (영화명)</SearchLabel>
                        <div style={{ display: "flex", gap: 4 }}>
                            <SearchInput
                                placeholder="영화명 검색..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        setShowSuggestions(false);
                                        handleSearch();
                                    }
                                    if (e.key === "Escape") setShowSuggestions(false);
                                }}
                            />
                            <SearchBtn onClick={handleSearch}>검색</SearchBtn>
                        </div>
                        {showSuggestions && (
                            <SuggestionList>
                                {movieSuggestions.map((m) => (
                                    <SuggestionItem
                                        key={m.id}
                                        onMouseDown={() => handleMovieSelect(m)}
                                    >
                                        {m.title_ko}
                                        <span>({m.release_date})</span>
                                    </SuggestionItem>
                                ))}
                            </SuggestionList>
                        )}
                    </SearchWrapper>
                </FilterRow>

                {/* Row 2: 필터들 */}
                <FilterRow>
                    <FieldWrapper $error={validationErrors.yyyy}>
                        <CustomSelect
                            style={{ width: "160px" }}
                            label="연도 *"
                            options={yearOptions}
                            value={searchParams.yyyy}
                            onChange={(v) => {
                                setSearchParams((p) => ({ ...p, yyyy: v }));
                                setValidationErrors((e) => ({ ...e, yyyy: false }));
                            }}
                        />
                        {validationErrors.yyyy && (
                            <ErrorMsg>필수 입력값입니다</ErrorMsg>
                        )}
                    </FieldWrapper>

                    <FieldWrapper $error={validationErrors.movie_id}>
                        <CustomSelect
                            style={{ width: "340px" }}
                            label="영화선택 *"
                            allowClear={false}
                            options={moviesList.map((m) => ({
                                label: m.title_ko,
                                value: m.id.toString(),
                            }))}
                            value={searchParams.movie_id}
                            onChange={(val) => {
                                setSearchParams((p) => ({ ...p, movie_id: val }));
                                setValidationErrors((e) => ({ ...e, movie_id: false }));
                                fetchMovieFormats(val);
                            }}
                        />
                        {validationErrors.movie_id && (
                            <ErrorMsg>필수 입력값입니다</ErrorMsg>
                        )}
                    </FieldWrapper>

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
                            options={["전체", "CGV", "롯데", "메가박스", "씨네큐", "일반극장", "자동차극장"]}
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

                    <FieldWrapper $error={validationErrors.date_from}>
                        <CustomInput
                            inputType="date"
                            label="날짜 from *"
                            value={searchParams.date_from}
                            setValue={(v) => {
                                setSearchParams((p) => ({ ...p, date_from: v }));
                                setValidationErrors((e) => ({ ...e, date_from: false }));
                                setSettlementFilter((f) => ({ ...f, dateFrom: v }));
                            }}
                        />
                        {validationErrors.date_from && (
                            <ErrorMsg>필수 입력값입니다</ErrorMsg>
                        )}
                    </FieldWrapper>

                    <FieldWrapper $error={validationErrors.date_to}>
                        <CustomInput
                            inputType="date"
                            label="날짜 to *"
                            value={searchParams.date_to}
                            setValue={(v) => {
                                setSearchParams((p) => ({ ...p, date_to: v }));
                                setValidationErrors((e) => ({ ...e, date_to: false }));
                                setSettlementFilter((f) => ({ ...f, dateTo: v }));
                            }}
                        />
                        {validationErrors.date_to && (
                            <ErrorMsg>필수 입력값입니다</ErrorMsg>
                        )}
                    </FieldWrapper>
                </FilterRow>
            </FilterBar>

            {meta && (
                <MovieInfo>
                    {meta.movie_title}
                    <span>(개봉일: {meta.release_date || "-"})</span>
                </MovieInfo>
            )}

            {/* ── 테이블 ── */}
            <TableContainer>
                <StyledTable>
                    <thead>
                        {/* 그룹 헤더 */}
                        <tr>
                            <ThGroup rowSpan={2}>영화</ThGroup>
                            <ThGroup rowSpan={2}>날짜</ThGroup>
                            <ThGroup rowSpan={2}>인원(명)</ThGroup>
                            <ThGroup colSpan={4}>입장료 기준</ThGroup>
                            <ThGroup colSpan={4}>정산 기준</ThGroup>
                        </tr>
                        <tr>
                            {/* 입장료 기준 */}
                            <th>금액(입장료)</th>
                            <th>기금제외입장료</th>
                            <th>부가세</th>
                            <th>부가세제외입장료</th>
                            {/* 정산 기준 */}
                            <th>공급가액</th>
                            <th>부가세</th>
                            <th>영화사지급액</th>
                            <th>객단가</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.length === 0 && (
                            <tr>
                                <EmptyTd colSpan={11}>
                                    {loading
                                        ? "데이터 조회 중..."
                                        : "영화를 선택하고 검색 버튼을 클릭하세요"}
                                </EmptyTd>
                            </tr>
                        )}

                        {data.rows.map((row, idx) => {
                            const ticketVat = row.fund_excluded - row.vat_excluded;
                            return (
                                <tr key={idx}>
                                    <td>{movieTitle}</td>
                                    <td>{row.entry_date}</td>
                                    <td>{fmtN(row.visitor)}</td>
                                    <td>{fmtN(row.ticket_revenue)}</td>
                                    <td>{fmtN(row.fund_excluded)}</td>
                                    <td>{fmtN(ticketVat)}</td>
                                    <td>{fmtN(row.vat_excluded)}</td>
                                    <td>{fmtN(row.supply_value)}</td>
                                    <td>{fmtN(row.vat)}</td>
                                    <td>{fmtN(row.total_payment)}</td>
                                    <td>{fmtN(row.unit_price)}</td>
                                </tr>
                            );
                        })}

                        {/* 총 합계 행 */}
                        {data.rows.length > 0 && (
                            <GrandTotalRow>
                                <td colSpan={2} style={{ textAlign: "right", paddingRight: 10 }}>
                                    총 합계
                                </td>
                                <td>{fmtN(totals.visitor)}</td>
                                <td>{fmtN(totals.ticket_revenue)}</td>
                                <td>{fmtN(totals.fund_excluded)}</td>
                                <td>{fmtN(totals.ticket_vat)}</td>
                                <td>{fmtN(totals.vat_excluded)}</td>
                                <td>{fmtN(totals.supply_value)}</td>
                                <td>{fmtN(totals.vat)}</td>
                                <td>{fmtN(totals.total_payment)}</td>
                                <td>{fmtN(totals.unit_price)}</td>
                            </GrandTotalRow>
                        )}
                    </tbody>
                </StyledTable>
            </TableContainer>
        </PageWrapper>
    );
}
