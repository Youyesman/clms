import { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { AxiosGet } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { EmptyState } from "../../../components/common/EmptyState";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomSelect } from "../../../components/common/CustomSelect";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IScheduleItem {
    id: number;
    brand: string;
    theater_name: string;
    movie_title: string;
    target_title: string | null;
    screen_name: string;
    start_time: string;
    end_time: string | null;
    play_date: string;
    remaining_seats: number;
    total_seats: number;
    tags: string[];
    is_booking_available: boolean;
    created_at: string | null;
    updated_at: string | null;
}

interface IStats {
    theater_count: number;
    movie_count: number;
    total_seats: number;
    by_brand: Record<string, number>;
    raw_logs: Record<string, number | null>;
}

interface IResponse {
    total: number;
    page: number;
    page_size: number;
    results: IScheduleItem[];
    stats: IStats;
}

// ─── Styled Components ────────────────────────────────────────────────────────

const PageWrapper = styled.div`
    padding: 20px;
    background: #f8fafc;
    min-height: 100%;
    font-family: "SUIT", sans-serif;
`;

const PageHeader = styled.div`
    margin-bottom: 20px;
    h2 {
        font-size: 20px;
        font-weight: 700;
        color: #0f172a;
        margin: 0 0 4px;
    }
    p {
        font-size: 13px;
        color: #64748b;
        margin: 0;
    }
`;





const ApplyButton = styled.button`
    height: 30px;
    padding: 0 18px;
    background: #2563eb;
    color: #ffffff;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    align-self: flex-end;
    &:hover { background: #1e293b; }
    &:disabled { background: #94a3b8; cursor: not-allowed; }
`;

const ResetButton = styled.button`
    height: 30px;
    padding: 0 12px;
    background: transparent;
    color: #64748b;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    align-self: flex-end;
    &:hover { background: #f1f5f9; color: #0f172a; }
`;

const StatsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
`;

const StatCard = styled.div<{ $accent?: string }>`
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 16px 18px;
    border-left: 3px solid ${({ $accent }) => $accent || "#2563eb"};

    .label {
        font-size: 11px;
        font-weight: 700;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
    }
    .value {
        font-size: 22px;
        font-weight: 800;
        color: #0f172a;
        line-height: 1;
    }
    .sub {
        font-size: 11px;
        color: #94a3b8;
        margin-top: 4px;
    }
`;

const TableWrapper = styled.div`
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
`;

const TableHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid #f1f5f9;
    .title {
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
    }
    .count {
        font-size: 13px;
        color: #64748b;
    }
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
`;

const Th = styled.th`
    padding: 10px 14px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    white-space: nowrap;
`;

const Td = styled.td`
    padding: 10px 14px;
    color: #1e293b;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
`;

const Tr = styled.tr`
    &:hover { background: #f8fafc; }
    &:last-child td { border-bottom: none; }
`;

const BrandBadge = styled.span<{ $brand: string }>`
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    ${({ $brand }) => {
        if ($brand === "CGV") return `background:#fecaca; color:#dc2626;`;
        if ($brand === "LOTTE") return `background:#f3e8ff; color:#7c3aed;`;
        if ($brand === "MEGABOX") return `background:#bfdbfe; color:#1d4ed8;`;
        if ($brand === "일반극장") return `background:#dcfce7; color:#15803d;`;
        return `background:#f1f5f9; color:#475569;`;
    }}
`;

const SeatBar = styled.div<{ $ratio: number }>`
    display: flex;
    align-items: center;
    gap: 6px;
    .bar-bg {
        width: 60px;
        height: 6px;
        background: #e2e8f0;
        border-radius: 4px;
        overflow: hidden;
    }
    .bar-fill {
        height: 100%;
        border-radius: 4px;
        width: ${({ $ratio }) => Math.min(100, $ratio)}%;
        background: ${({ $ratio }) =>
            $ratio > 70 ? "#16a34a" : $ratio > 30 ? "#d97706" : "#dc2626"};
    }
    .text { font-size: 12px; color: #64748b; white-space: nowrap; }
`;

const TagChip = styled.span`
    display: inline-block;
    padding: 1px 6px;
    background: #f1f5f9;
    color: #475569;
    border-radius: 4px;
    font-size: 11px;
    margin: 1px 2px 1px 0;
`;

const PaginationRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 14px 20px;
    border-top: 1px solid #f1f5f9;
`;

const PageBtn = styled.button<{ $active?: boolean }>`
    min-width: 32px;
    height: 32px;
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid ${({ $active }) => ($active ? "#2563eb" : "#e2e8f0")};
    background: ${({ $active }) => ($active ? "#2563eb" : "#ffffff")};
    color: ${({ $active }) => ($active ? "#ffffff" : "#475569")};
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    &:hover:not(:disabled) { background: ${({ $active }) => ($active ? "#2563eb" : "#f1f5f9")}; }
    &:disabled { opacity: 0.4; cursor: not-allowed; }
`;


// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateInputValue(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function formatTime(dt: string | null): string {
    if (!dt) return "-";
    return dt.slice(11, 16); // "HH:MM"
}

// ─── Component ───────────────────────────────────────────────────────────────

const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toDateInputValue(d);
})();

export function ScheduleViewerPage() {
    const toast = useToast();

    const [startDate, setStartDate] = useState(tomorrow);
    const [endDate, setEndDate] = useState(tomorrow);
    const [brand, setBrand] = useState("");
    const [theaterName, setTheaterName] = useState("");
    const [movieTitle, setMovieTitle] = useState("");

    const [appliedFilters, setAppliedFilters] = useState({
        start_date: tomorrow,
        end_date: tomorrow,
        brand: "",
        theater_name: "",
        movie_title: "",
    });

    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<IResponse | null>(null);
    const [page, setPage] = useState(1);

    const PAGE_SIZE = 50;

    const fetchData = useCallback(
        async (filters: typeof appliedFilters, p: number) => {
            setLoading(true);
            try {
                const params: Record<string, string | number> = {
                    page: p,
                    page_size: PAGE_SIZE,
                };
                if (filters.start_date) params.start_date = filters.start_date;
                if (filters.end_date) params.end_date = filters.end_date;
                if (filters.brand) params.brand = filters.brand;
                if (filters.theater_name) params.theater_name = filters.theater_name;
                if (filters.movie_title) params.movie_title = filters.movie_title;

                const res = await AxiosGet("crawler/schedules/list/", { params });
                setData(res.data);
            } catch (e) {
                toast.error("데이터 조회에 실패했습니다.");
            } finally {
                setLoading(false);
            }
        },
        [toast]
    );

    useEffect(() => {
        fetchData(appliedFilters, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appliedFilters, page]);

    const handleApply = () => {
        setPage(1);
        setAppliedFilters({ start_date: startDate, end_date: endDate, brand, theater_name: theaterName, movie_title: movieTitle });
    };

    const handleReset = () => {
        setStartDate(tomorrow);
        setEndDate(tomorrow);
        setBrand("");
        setTheaterName("");
        setMovieTitle("");
        setPage(1);
        setAppliedFilters({ start_date: tomorrow, end_date: tomorrow, brand: "", theater_name: "", movie_title: "" });
    };

    const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
    const stats = data?.stats;

    const brandColors: Record<string, string> = {
        CGV: "#dc2626",
        LOTTE: "#7c3aed",
        MEGABOX: "#1d4ed8",
        일반극장: "#15803d",
    };

    const brandLabels: Record<string, string> = {
        CGV: "CGV",
        LOTTE: "롯데",
        MEGABOX: "메가박스",
        일반극장: "일반극장",
    };

    return (
        <PageWrapper>
            <PageHeader>
                <h2>시간표 수집 현황</h2>
                <p>크롤링된 MovieSchedule 데이터를 조회합니다. Raw Log(수집 건수) vs Schedule(변환 건수)를 비교해 크롤링/변환 상태를 확인할 수 있습니다.</p>
            </PageHeader>

            {/* Filter Bar */}
            <CommonFilterBar
                actions={
                    <>
                        <ApplyButton onClick={handleApply} disabled={loading}>
                            {loading ? "조회 중..." : "조회"}
                        </ApplyButton>
                        <ResetButton onClick={handleReset}>초기화</ResetButton>
                    </>
                }>
                <CustomInput label="시작일" inputType="date" value={startDate} setValue={setStartDate} />
                <CustomInput label="종료일" inputType="date" value={endDate} setValue={setEndDate} />
                <CustomSelect
                    label="브랜드"
                    options={["전체", "CGV", "롯데시네마", "메가박스", "일반극장"]}
                    value={brand === "" ? "전체" : brand === "LOTTE" ? "롯데시네마" : brand === "MEGABOX" ? "메가박스" : brand}
                    onChange={(v) =>
                        setBrand(v === "전체" ? "" : v === "롯데시네마" ? "LOTTE" : v === "메가박스" ? "MEGABOX" : v)
                    }
                />
                <CustomInput
                    label="극장명"
                    placeholder="예: 강남"
                    value={theaterName}
                    setValue={setTheaterName}
                    onKeyDown={(e) => e.key === "Enter" && handleApply()}
                />
                <CustomInput
                    label="영화제목"
                    placeholder="예: 주토피아"
                    value={movieTitle}
                    setValue={setMovieTitle}
                    onKeyDown={(e) => e.key === "Enter" && handleApply()}
                />
            </CommonFilterBar>

            {/* Stats Cards */}
            {stats && (
                <StatsGrid>
                    <StatCard $accent="#0f172a">
                        <div className="label">총 상영회차</div>
                        <div className="value">{(data?.total ?? 0).toLocaleString()}</div>
                        <div className="sub">MovieSchedule</div>
                    </StatCard>
                    <StatCard $accent="#475569">
                        <div className="label">극장 수</div>
                        <div className="value">{stats.theater_count.toLocaleString()}</div>
                        <div className="sub">지점</div>
                    </StatCard>
                    <StatCard $accent="#475569">
                        <div className="label">영화 수</div>
                        <div className="value">{stats.movie_count.toLocaleString()}</div>
                        <div className="sub">종목</div>
                    </StatCard>
                    <StatCard $accent="#475569">
                        <div className="label">총 좌석수</div>
                        <div className="value">{(stats.total_seats ?? 0).toLocaleString()}</div>
                        <div className="sub">석</div>
                    </StatCard>
                </StatsGrid>
            )}

            {/* Table */}
            <TableWrapper>
                <TableHeader>
                    <span className="title">상영 목록</span>
                    <span className="count">
                        {data ? `총 ${data.total.toLocaleString()}건` : ""}
                        {loading && " (로딩 중...)"}
                    </span>
                </TableHeader>

                {!loading && data?.results.length === 0 ? (
                    <EmptyState>
                        조건에 맞는 데이터가 없습니다.<br />
                        날짜 범위를 조정하거나 Transform을 먼저 실행해 주세요.
                    </EmptyState>
                ) : (
                    <Table>
                        <thead>
                            <tr>
                                <Th>브랜드</Th>
                                <Th>극장</Th>
                                <Th>타겟 제목</Th>
                                <Th>크롤링 제목</Th>
                                <Th>상영관</Th>
                                <Th>상영일</Th>
                                <Th>시작</Th>
                                <Th>종료</Th>
                                <Th>좌석</Th>
                                <Th>태그</Th>
                                <Th>최초 수집</Th>
                                <Th>최종 갱신</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {data?.results.map((row) => {
                                const ratio = row.total_seats > 0
                                    ? (row.remaining_seats / row.total_seats) * 100
                                    : 0;
                                return (
                                    <Tr key={row.id}>
                                        <Td><BrandBadge $brand={row.brand}>{row.brand}</BrandBadge></Td>
                                        <Td>{row.theater_name}</Td>
                                        <Td style={{ color: row.target_title ? "#475569" : "#94a3b8", fontSize: 13 }}>
                                            {row.target_title || "-"}
                                        </Td>
                                        <Td style={{ fontSize: 13, color: row.target_title && row.target_title !== row.movie_title ? "#d97706" : "#475569" }}>
                                            {row.movie_title}
                                        </Td>
                                        <Td style={{ color: "#64748b" }}>{row.screen_name}</Td>
                                        <Td style={{ color: "#64748b", whiteSpace: "nowrap" }}>{row.play_date}</Td>
                                        <Td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{formatTime(row.start_time)}</Td>
                                        <Td style={{ color: "#94a3b8", whiteSpace: "nowrap" }}>{row.end_time || "-"}</Td>
                                        <Td>
                                            {row.total_seats > 0 ? (
                                                <SeatBar $ratio={ratio}>
                                                    <div className="bar-bg">
                                                        <div className="bar-fill" />
                                                    </div>
                                                    <span className="text">{row.remaining_seats}/{row.total_seats}</span>
                                                </SeatBar>
                                            ) : (
                                                <span style={{ color: "#94a3b8", fontSize: 12 }}>-</span>
                                            )}
                                        </Td>
                                        <Td>
                                            {row.tags.map((tag) => (
                                                <TagChip key={tag}>{tag}</TagChip>
                                            ))}
                                        </Td>
                                        <Td style={{ color: "#64748b", whiteSpace: "nowrap", fontSize: 12 }}>
                                            {row.created_at || "-"}
                                        </Td>
                                        <Td style={{
                                            whiteSpace: "nowrap",
                                            fontSize: 12,
                                            color: row.updated_at && row.created_at && row.updated_at !== row.created_at ? "#d97706" : "#64748b",
                                            fontWeight: row.updated_at && row.created_at && row.updated_at !== row.created_at ? 600 : 400,
                                        }}>
                                            {row.updated_at || "-"}
                                        </Td>
                                    </Tr>
                                );
                            })}
                        </tbody>
                    </Table>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <PaginationRow>
                        <PageBtn onClick={() => setPage(1)} disabled={page === 1}>«</PageBtn>
                        <PageBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</PageBtn>
                        {Array.from({ length: Math.min(9, totalPages) }, (_, i) => {
                            let p: number;
                            if (totalPages <= 9) {
                                p = i + 1;
                            } else if (page <= 5) {
                                p = i + 1;
                            } else if (page >= totalPages - 4) {
                                p = totalPages - 8 + i;
                            } else {
                                p = page - 4 + i;
                            }
                            return (
                                <PageBtn key={p} $active={page === p} onClick={() => setPage(p)}>
                                    {p}
                                </PageBtn>
                            );
                        })}
                        <PageBtn onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</PageBtn>
                        <PageBtn onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</PageBtn>
                    </PaginationRow>
                )}
            </TableWrapper>
        </PageWrapper>
    );
}
