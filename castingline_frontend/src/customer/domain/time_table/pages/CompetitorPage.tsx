import React, { useState, useEffect, useCallback, useMemo } from "react";
import styled from "styled-components";
import { PageNavTabs, TIME_TABLE_TABS } from "../../../../components/common/PageNavTabs";
import { useToast } from "../../../../components/common/CustomToast";
import { AxiosGet } from "../../../../axios/Axios";
import { handleBackendErrors } from "../../../../axios/handleBackendErrors";
import { CommonFilterBar } from "../../../../components/common/CommonFilterBar";
import { CustomInput } from "../../../../components/common/CustomInput";
import { CustomCheckbox } from "../../../../components/common/CustomCheckbox";
import { SortTh, SortHint, useTableSort } from "../../../../components/common/SortableTable";

/* T003(0827): [시간표 조회] - 경쟁작 화면.
   크롤링한 경쟁작 데이터를 일별 탭(최대 7일)으로 보여준다. (B003: 기간 합산 탭 삭제)
   - ① 경쟁작 성과 종합 요약  ② 서울·주요 권역별 좌석 점유  ③ 골든타임(14~21시) 집중도
   - ④ 특별관(IMAX/4DX/Dolby)  ⑤ 계열사별 세부 현황
   디자인은 주요작 시간표(T001)와 동일 계열. 상단 엑셀/PDF는 화면 그대로 + 캐스팅라인 로고 */

/* ── 유틸 ── */
const fmt = (n: number | null | undefined) =>
    n == null ? "-" : Math.round(n).toLocaleString("ko-KR");
const fmtPct = (n: number | null | undefined) =>
    n == null ? "-" : Number(n).toFixed(1) + "%";

/* ── 타입 ── */
interface MovieOpt { id: number; title: string }

interface SummaryRow {
    rank: number;
    title: string;
    total_seats: number;
    occupancy: number;
    shows: number;
    screens: number;
    theaters: number;
}

interface RegionCell { seats: number; occupancy: number; share?: number }
interface RegionRow { title: string; seoul: RegionCell; metro: RegionCell; local: RegionCell }
interface GoldenRow { title: string; seats: number; occupancy: number; share: number }
interface SpecialRow { title: string; shows: number; seats: number }
/* V004(0831): 특별관 합계 대신 타입별(IMAX/4DX/SCREENX/Dolby) 개별 블록 */
interface SpecialBlock { format: string; rows: SpecialRow[] }
interface BrandBlock { movies: string[]; rows: { brand: string; cells: { seats: number; share: number }[] }[] }

interface CompetitorTab {
    key: string;
    label: string;
    summary: SummaryRow[];
    regions: RegionRow[];
    golden: GoldenRow[];
    special: SpecialBlock[];
    by_brand: BrandBlock;
}

interface CompetitorData {
    meta: { date_from: string; date_to: string; movie_count: number; last_crawled_at: string | null };
    tabs: CompetitorTab[];
}

/* ── 스타일 (T001과 동일 계열) ── */
/* V002(0831): 와이드 모니터에서 전체 폭으로 퍼지지 않도록 최대 폭 + 중앙 정렬 */
const PageWrapper = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: #f8fafc;
    min-height: calc(100vh - 60px);
    padding: 20px;
    gap: 16px;
    width: 100%;
    max-width: 1700px;
    margin: 0 auto;
`;

const SearchBtn = styled.button`
    height: 30px;
    padding: 0 20px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    &:disabled { background: #94a3b8; cursor: not-allowed; }
`;

const SectionCard = styled.div`
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
`;

const SectionTitle = styled.div`
    font-size: 13px;
    font-weight: 700;
    color: #1e293b;
    padding: 10px 14px;
    background: #f1f5f9;
    border-bottom: 1px solid #e2e8f0;
`;

const TableWrap = styled.div`
    overflow-x: auto;
    max-height: 420px;
    overflow-y: auto;
`;

const Tbl = styled.table`
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border-top: 1px solid #e2e8f0;
    border-left: 1px solid #e2e8f0;
    font-size: 12px;
    white-space: nowrap;
    th, td {
        border-right: 1px solid #e2e8f0;
        border-bottom: 1px solid #e2e8f0;
        padding: 6px 10px;
        text-align: center;
    }
    th {
        background: #f1f5f9;
        font-weight: 700;
        color: #475569;
        position: sticky;
        top: 0;
        z-index: 1;
    }
    td { color: #475569; }
    tbody tr:hover td { background: #f8fafc; }
    .top-row td {
        background: #eff6ff !important;
        color: #1d4ed8 !important;
        font-weight: 700;
    }
    .share-cell { color: #94a3b8; font-size: 11.5px; }
`;

const DayTab = styled.button<{ $active: boolean }>`
    height: 32px;
    padding: 0 18px;
    border-radius: 6px 6px 0 0;
    font-size: 13px;
    font-weight: ${({ $active }) => ($active ? 800 : 500)};
    cursor: pointer;
    border: 1px solid ${({ $active }) => ($active ? "#2563eb" : "#e2e8f0")};
    border-bottom: none;
    background: ${({ $active }) => ($active ? "#2563eb" : "#ffffff")};
    color: ${({ $active }) => ($active ? "#ffffff" : "#64748b")};
    white-space: nowrap;
`;

const EmptyMsg = styled.div`
    text-align: center;
    padding: 28px 16px;
    color: #94a3b8;
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1.6;
`;

const TwoColGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    @media (max-width: 1100px) { grid-template-columns: 1fr; }
`;

/* ── B004(0829): 컬럼 헤더 클릭 정렬을 쓰는 표 컴포넌트들 ──
   훅을 쓰려면 표마다 컴포넌트로 분리해야 한다. ★(1위) 표시는 행 위치가 아니라
   정렬 전 원래 1위 작품을 기준으로 붙여, 정렬해도 표시가 따라 움직이지 않는다. */

const sortNote = "* 클릭 시 정렬가능";

function SummaryTable({ rows, label }: { rows: SummaryRow[]; label: string }) {
    const { sorted, sort } = useTableSort(rows);
    const topTitle = rows[0]?.title;
    return (
        <SectionCard>
            <SectionTitle>
                {rows.length}개 경쟁작 성과 종합 요약 {`(${label})`}
                <SortHint>★ = 총 좌석수 1위 · {sortNote}</SortHint>
            </SectionTitle>
            <TableWrap>
                <Tbl>
                    <thead>
                        <tr>
                            <SortTh sortKey="rank" sort={sort}>순위</SortTh>
                            <SortTh sortKey="title" sort={sort}>영화명</SortTh>
                            <SortTh sortKey="total_seats" sort={sort}>총 좌석수</SortTh>
                            <SortTh sortKey="occupancy" sort={sort}>평균 좌석점유율</SortTh>
                            <SortTh sortKey="shows" sort={sort}>총 상영회차</SortTh>
                            <SortTh sortKey="screens" sort={sort}>스크린수</SortTh>
                            <SortTh sortKey="theaters" sort={sort}>총 극장수</SortTh>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((s) => (
                            <tr key={s.title} className={s.title === topTitle ? "top-row" : ""}>
                                <td>{s.rank}</td>
                                <td style={{ textAlign: "left", fontWeight: 600 }}>
                                    {s.title === topTitle ? "★ " : ""}{s.title}
                                </td>
                                <td>{fmt(s.total_seats)}석</td>
                                <td>{fmtPct(s.occupancy)}</td>
                                <td>{fmt(s.shows)}회</td>
                                <td>{fmt(s.screens)}개</td>
                                <td>{fmt(s.theaters)}개</td>
                            </tr>
                        ))}
                    </tbody>
                </Tbl>
            </TableWrap>
        </SectionCard>
    );
}

function RegionTable({ rows, label }: { rows: RegionRow[]; label: string }) {
    const { sorted, sort } = useTableSort(rows);
    const topTitle = rows[0]?.title;
    return (
        <SectionCard>
            <SectionTitle>
                서울 및 주요 권역별 좌석 점유 현황 {`(${label})`}
                <SortHint>{sortNote}</SortHint>
            </SectionTitle>
            <TableWrap>
                <Tbl>
                    <thead>
                        <tr>
                            <SortTh sortKey="title" sort={sort} rowSpan={2}>영화명</SortTh>
                            <th colSpan={3}>서울 권역</th>
                            <th colSpan={2}>수도권(경강) 권역</th>
                            <th colSpan={2}>그 외 지방도시</th>
                        </tr>
                        <tr>
                            <SortTh sortKey="seoul.seats" sort={sort}>좌석수</SortTh>
                            <SortTh sortKey="seoul.occupancy" sort={sort}>좌점율</SortTh>
                            <SortTh sortKey="seoul.share" sort={sort}>비중</SortTh>
                            <SortTh sortKey="metro.seats" sort={sort}>좌석수</SortTh>
                            <SortTh sortKey="metro.occupancy" sort={sort}>좌점율</SortTh>
                            <SortTh sortKey="local.seats" sort={sort}>좌석수</SortTh>
                            <SortTh sortKey="local.occupancy" sort={sort}>좌점율</SortTh>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((r) => (
                            <tr key={r.title} className={r.title === topTitle ? "top-row" : ""}>
                                <td style={{ textAlign: "left", fontWeight: 600 }}>{r.title === topTitle ? "★ " : ""}{r.title}</td>
                                <td>{fmt(r.seoul.seats)}석</td>
                                <td>{fmtPct(r.seoul.occupancy)}</td>
                                <td className="share-cell">{fmtPct(r.seoul.share)}</td>
                                <td>{fmt(r.metro.seats)}석</td>
                                <td>{fmtPct(r.metro.occupancy)}</td>
                                <td>{fmt(r.local.seats)}석</td>
                                <td>{fmtPct(r.local.occupancy)}</td>
                            </tr>
                        ))}
                    </tbody>
                </Tbl>
            </TableWrap>
        </SectionCard>
    );
}

function GoldenTable({ rows }: { rows: GoldenRow[] }) {
    const { sorted, sort } = useTableSort(rows);
    const topTitle = rows[0]?.title;
    const rankOf = new Map(rows.map((g, i) => [g.title, i + 1]));
    return (
        <SectionCard>
            <SectionTitle>
                골든타임(14~21시) 집중도
                <SortHint>{sortNote}</SortHint>
            </SectionTitle>
            <TableWrap>
                <Tbl>
                    <thead>
                        <tr>
                            <th>순위</th>
                            <SortTh sortKey="title" sort={sort}>영화명</SortTh>
                            <SortTh sortKey="seats" sort={sort}>골든타임 좌석수</SortTh>
                            <SortTh sortKey="occupancy" sort={sort}>골든타임 점유율</SortTh>
                            <SortTh sortKey="share" sort={sort}>골든타임 비중</SortTh>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((g) => (
                            <tr key={g.title} className={g.title === topTitle ? "top-row" : ""}>
                                <td>{rankOf.get(g.title)}</td>
                                <td style={{ textAlign: "left", fontWeight: 600 }}>{g.title === topTitle ? "★ " : ""}{g.title}</td>
                                <td>{fmt(g.seats)}석</td>
                                <td>{fmtPct(g.occupancy)}</td>
                                <td>{fmtPct(g.share)}</td>
                            </tr>
                        ))}
                        {sorted.length === 0 && (
                            <tr><td colSpan={5}><EmptyMsg>데이터가 없습니다</EmptyMsg></td></tr>
                        )}
                    </tbody>
                </Tbl>
            </TableWrap>
        </SectionCard>
    );
}

/* B001(0901): 특별관 타입별 개별 카드가 자리를 많이 차지한다는 요청에 따라,
   카드 하나 안에서 포맷(IMAX/4DX/SCREENX/Dolby…) 탭으로 전환하는 구조로 통합.
   헤더는 고정(sticky)되고 영화 목록만 세로 스크롤된다 (TableWrap max-height, V004). */
const FmtTabs = styled.span`
    display: inline-flex;
    gap: 4px;
    margin-left: 10px;
    vertical-align: middle;
`;
const FmtTab = styled.button<{ $active: boolean }>`
    height: 22px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: ${({ $active }) => ($active ? 700 : 500)};
    cursor: pointer;
    border: 1px solid ${({ $active }) => ($active ? "#2563eb" : "#cbd5e1")};
    background: ${({ $active }) => ($active ? "#2563eb" : "#ffffff")};
    color: ${({ $active }) => ($active ? "#ffffff" : "#64748b")};
    white-space: nowrap;
`;

function SpecialTableBody({ block }: { block: SpecialBlock }) {
    const { sorted, sort } = useTableSort(block.rows);
    const topTitle = block.rows[0]?.title;
    return (
        <TableWrap>
            <Tbl>
                <thead>
                    <tr>
                        <SortTh sortKey="title" sort={sort}>영화명</SortTh>
                        <SortTh sortKey="shows" sort={sort}>특별관 회차</SortTh>
                        <SortTh sortKey="seats" sort={sort}>특별관 좌석수</SortTh>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((s) => (
                        <tr key={s.title} className={s.title === topTitle ? "top-row" : ""}>
                            <td style={{ textAlign: "left", fontWeight: 600 }}>{s.title === topTitle ? "★ " : ""}{s.title}</td>
                            <td>{fmt(s.shows)}회</td>
                            <td>{fmt(s.seats)}석</td>
                        </tr>
                    ))}
                </tbody>
            </Tbl>
        </TableWrap>
    );
}

function SpecialTabsCard({ blocks }: { blocks: SpecialBlock[] }) {
    // 일자 탭을 바꿔도 같은 포맷 탭 유지 — 그 날 없는 포맷이면 첫 포맷으로 폴백
    const [fmtKey, setFmtKey] = useState<string>("");
    const active = blocks.find((b) => b.format === fmtKey) ?? blocks[0];
    return (
        <SectionCard>
            <SectionTitle>
                특별관
                {blocks.length > 0 && (
                    <FmtTabs>
                        {blocks.map((b) => (
                            <FmtTab
                                key={b.format}
                                $active={b.format === active?.format}
                                onClick={() => setFmtKey(b.format)}
                            >
                                {b.format}
                            </FmtTab>
                        ))}
                    </FmtTabs>
                )}
                {blocks.length > 0 && <SortHint>{sortNote}</SortHint>}
            </SectionTitle>
            {active ? (
                <SpecialTableBody key={active.format} block={active} />
            ) : (
                <EmptyMsg>특별관 상영 데이터가 없습니다</EmptyMsg>
            )}
        </SectionCard>
    );
}

function BrandTable({ block, label }: { block: BrandBlock; label: string }) {
    // 행=계열사 / 열=작품. 작품 열을 누르면 그 작품의 좌석수 기준으로 계열사가 정렬된다.
    const { sorted, sort } = useTableSort(block.rows);
    return (
        <SectionCard>
            <SectionTitle>
                계열사별 세부 현황 {`(${label})`}
                <SortHint>
                    * 오른쪽으로 스크롤하여 전체 영화 확인 가능 · 괄호 안은 각 작품 내 계열사 비중 · {sortNote}
                </SortHint>
            </SectionTitle>
            <TableWrap>
                <Tbl>
                    <thead>
                        <tr>
                            <SortTh sortKey="brand" sort={sort} style={{ position: "sticky", left: 0, zIndex: 2 }}>구분</SortTh>
                            {block.movies.map((m, mi) => (
                                <SortTh key={m} sortKey={`cells.${mi}.seats`} sort={sort}>{m}</SortTh>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((r) => (
                            <tr key={r.brand}>
                                <td style={{ fontWeight: 700, position: "sticky", left: 0, background: "#f8fafc", zIndex: 1 }}>{r.brand}</td>
                                {r.cells.map((c, ci) => (
                                    <td key={ci}>
                                        {c.seats > 0 ? (
                                            <>
                                                <span style={{ fontWeight: ci === 0 ? 700 : 400, color: ci === 0 ? "#dc2626" : undefined }}>
                                                    {fmt(c.seats)}석
                                                </span>
                                                <span className="share-cell"> ({fmtPct(c.share)})</span>
                                            </>
                                        ) : (
                                            <span className="share-cell">0석 (0.0%)</span>
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </Tbl>
            </TableWrap>
        </SectionCard>
    );
}

/* ── 컴포넌트 ── */
export function CompetitorPage() {
    const toast = useToast();

    /* 필터 */
    const [movieOpts, setMovieOpts] = useState<MovieOpt[]>([]);
    const [selectedMovieIds, setSelectedMovieIds] = useState<number[]>([]);
    const [availableDates, setAvailableDates] = useState<string[]>([]);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [brandFilter, setBrandFilter] = useState({ cgv: true, lotte: true, mega: true, normal: true });
    const [loading, setLoading] = useState(false);
    const [excelBusy, setExcelBusy] = useState(false);
    const [pdfBusy, setPdfBusy] = useState(false);

    /* 결과 */
    const [data, setData] = useState<CompetitorData | null>(null);
    // B003(0829): 기간 합산 탭 삭제 — 첫 일자 뷰가 기본 선택
    const [activeTab, setActiveTab] = useState("");

    /* 옵션 로드 */
    useEffect(() => {
        AxiosGet("score/competitor-timetable/options/")
            .then(res => {
                setMovieOpts(res.data?.movies || []);
                const dates: string[] = res.data?.dates || [];
                setAvailableDates(dates);
                if (dates.length > 0) {
                    // 기본 기간: 데이터가 있는 마지막 날짜부터 최대 3일 전
                    const last = dates[dates.length - 1];
                    const from = dates[Math.max(0, dates.length - 3)];
                    setDateFrom(from);
                    setDateTo(last);
                }
            })
            .catch(err => toast.error(handleBackendErrors(err)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const buildParams = useCallback(() => {
        const params: Record<string, string> = { date_from: dateFrom, date_to: dateTo };
        if (selectedMovieIds.length > 0) {
            const titles = movieOpts
                .filter(m => selectedMovieIds.includes(m.id))
                .map(m => m.title);
            params.titles = titles.join("|");
        }
        const brands: string[] = [];
        if (brandFilter.cgv) brands.push("CGV");
        if (brandFilter.lotte) brands.push("LOTTE");
        if (brandFilter.mega) brands.push("MEGABOX");
        if (brandFilter.normal) brands.push("일반극장");
        if (brands.length > 0 && brands.length < 4) params.brands = brands.join(",");
        return params;
    }, [dateFrom, dateTo, selectedMovieIds, movieOpts, brandFilter]);

    const validate = () => {
        if (!dateFrom || !dateTo) {
            toast.warning("날짜 From/To를 입력해주세요.");
            return false;
        }
        const days = (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000 + 1;
        if (days < 1) {
            toast.warning("종료일이 시작일보다 빠릅니다.");
            return false;
        }
        if (days > 7) {
            toast.warning("조회 기간은 최대 7일까지 지정할 수 있습니다.");
            return false;
        }
        if (!brandFilter.cgv && !brandFilter.lotte && !brandFilter.mega && !brandFilter.normal) {
            toast.warning("계열사를 하나 이상 선택해주세요.");
            return false;
        }
        return true;
    };

    const handleSearch = useCallback(() => {
        if (!validate()) return;
        setLoading(true);
        AxiosGet("score/competitor-timetable/", { params: buildParams() })
            .then(res => {
                setData(res.data);
                setActiveTab(res.data?.tabs?.[0]?.key ?? "");
            })
            .catch(err => {
                // 조회 실패 시 이전 결과를 지운다 — 남겨두면 헤더의 조사기간과
                // 표의 내용이 어긋나 다른 기간 데이터를 현재 조건으로 오인하게 된다
                setData(null);
                toast.error(handleBackendErrors(err));
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buildParams, toast]);

    const downloadFile = useCallback(async (kind: "excel" | "pdf") => {
        if (!validate()) return;
        const setBusy = kind === "excel" ? setExcelBusy : setPdfBusy;
        setBusy(true);
        try {
            const url = kind === "excel" ? "score/competitor-timetable-excel/" : "score/competitor-timetable-pdf/";
            const response: any = await AxiosGet(url, { params: buildParams(), responseType: "blob" });
            const blob = new Blob([response.data], {
                type: kind === "excel"
                    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    : "application/pdf",
            });
            const objUrl = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = objUrl;
            let filename = `경쟁작.${kind === "excel" ? "xlsx" : "pdf"}`;
            const cd = response.headers?.["content-disposition"];
            if (cd) {
                const star = cd.match(/filename\*=(?:utf-8'')?([^;]+)/i);
                const plain = cd.match(/filename="?([^";]+)"?/);
                if (star?.[1]) filename = decodeURIComponent(star[1]);
                else if (plain?.[1]) filename = decodeURIComponent(plain[1]);
            }
            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(objUrl);
            toast.success(kind === "excel" ? "엑셀 파일이 다운로드 되었습니다." : "PDF 보고서가 다운로드 되었습니다.");
        } catch (err: any) {
            let msg = "데이터가 없거나 오류가 발생했습니다.";
            if (err.response?.data instanceof Blob) {
                try { msg = JSON.parse(await err.response.data.text()).error || msg; } catch {}
            } else {
                msg = err.response?.data?.error || msg;
            }
            toast.error("다운로드 실패: " + msg);
        } finally {
            setBusy(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buildParams, toast]);

    const tab = useMemo(
        () => data?.tabs.find(t => t.key === activeTab) ?? data?.tabs[0] ?? null,
        [data, activeTab]
    );

    const minDate = availableDates[0] ?? "";
    const maxDate = availableDates[availableDates.length - 1] ?? "";

    return (
        <PageWrapper>
            <PageNavTabs tabs={TIME_TABLE_TABS} />

            {/* ── 필터 ── */}
            <CommonFilterBar
                actions={
                    <>
                        <SearchBtn onClick={handleSearch} disabled={loading}>
                            {loading ? "조회 중…" : "검색"}
                        </SearchBtn>
                        <SearchBtn
                            onClick={() => downloadFile("excel")}
                            disabled={excelBusy}
                            style={{ background: "#16a34a" }}
                            title="화면 그대로 엑셀 다운로드 (캐스팅라인 로고 포함)"
                        >
                            {excelBusy ? "생성 중…" : "엑셀"}
                        </SearchBtn>
                        <SearchBtn
                            onClick={() => downloadFile("pdf")}
                            disabled={pdfBusy}
                            style={{ background: "#dc2626" }}
                            title="화면 그대로 PDF 보고서 (캐스팅라인 로고 포함)"
                        >
                            {pdfBusy ? "생성 중…" : "PDF 보고서"}
                        </SearchBtn>
                    </>
                }>
                <CustomInput
                    label="날짜 From"
                    required
                    inputType="date"
                    value={dateFrom}
                    setValue={setDateFrom}
                    min={minDate || undefined}
                    max={maxDate || undefined}
                />
                <CustomInput
                    label="날짜 To"
                    required
                    inputType="date"
                    value={dateTo}
                    setValue={setDateTo}
                    min={dateFrom || minDate || undefined}
                    max={maxDate || undefined}
                />
            </CommonFilterBar>

            {/* 경쟁작 선택 + 계열사 */}
            <SectionCard>
                <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>계열사</span>
                        <CustomCheckbox label="CGV" checked={brandFilter.cgv} onChange={() => setBrandFilter(p => ({ ...p, cgv: !p.cgv }))} />
                        <CustomCheckbox label="Lotte" checked={brandFilter.lotte} onChange={() => setBrandFilter(p => ({ ...p, lotte: !p.lotte }))} />
                        <CustomCheckbox label="Megabox" checked={brandFilter.mega} onChange={() => setBrandFilter(p => ({ ...p, mega: !p.mega }))} />
                        <CustomCheckbox label="일반극장" checked={brandFilter.normal} onChange={() => setBrandFilter(p => ({ ...p, normal: !p.normal }))} />
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", paddingTop: 4, whiteSpace: "nowrap" }}>
                            경쟁작 선택
                            <span style={{ fontWeight: 400, color: "#94a3b8", marginLeft: 6 }}>
                                (다중 선택 · 미선택 시 전체 {movieOpts.length}개)
                            </span>
                        </span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 90, overflowY: "auto" }}>
                            {movieOpts.map(m => {
                                const active = selectedMovieIds.includes(m.id);
                                return (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() =>
                                            setSelectedMovieIds(prev =>
                                                prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]
                                            )
                                        }
                                        style={{
                                            padding: "3px 10px",
                                            borderRadius: 999,
                                            fontSize: 11,
                                            fontWeight: 700,
                                            fontFamily: "SUIT, sans-serif",
                                            cursor: "pointer",
                                            border: `1px solid ${active ? "#2563eb" : "#cbd5e1"}`,
                                            background: active ? "#eff6ff" : "#ffffff",
                                            color: active ? "#1d4ed8" : "#64748b",
                                        }}
                                    >
                                        {m.title}
                                    </button>
                                );
                            })}
                            {movieOpts.length === 0 && (
                                <span style={{ fontSize: 12, color: "#94a3b8" }}>등록된 경쟁작이 없습니다. [크롤러 관리]에서 경쟁작을 등록해주세요.</span>
                            )}
                        </div>
                    </div>
                </div>
            </SectionCard>

            {/* ── 결과 ── */}
            {data && tab && (
                <>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
                        경쟁작 {data.meta.movie_count}개
                        <span style={{ fontWeight: 400, fontSize: 13, color: "#64748b", marginLeft: 12 }}>
                            조사기간 {data.meta.date_from} ~ {data.meta.date_to}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 13, color: "#1e293b", marginLeft: 12 }}>
                            수집 완료 시간: {data.meta.last_crawled_at ?? "-"}
                        </span>
                    </div>

                    {/* 일별 탭 (최대 7일 · B003으로 기간 합산 탭 삭제) */}
                    <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #2563eb", flexWrap: "wrap" }}>
                        {data.tabs.map(t => (
                            <DayTab key={t.key} $active={tab.key === t.key} onClick={() => setActiveTab(t.key)}>
                                {`${t.label} 뷰`}
                            </DayTab>
                        ))}
                    </div>

                    {tab.summary.length === 0 ? (
                        <SectionCard>
                            <EmptyMsg>해당 일자에 수집된 경쟁작 데이터가 없습니다.</EmptyMsg>
                        </SectionCard>
                    ) : (
                        <>
                            {/* ① 종합 요약 */}
                            <SummaryTable rows={tab.summary} label={tab.label} />

                            {/* ② 권역별 */}
                            <RegionTable rows={tab.regions} label={tab.label} />

                            {/* ③ 골든타임 + ④ 특별관 (B001: 카드 하나 + 포맷 탭) */}
                            <TwoColGrid>
                                <GoldenTable rows={tab.golden} />
                                <SpecialTabsCard blocks={tab.special} />
                            </TwoColGrid>

                            {/* ⑤ 계열사별 세부 현황 */}
                            {tab.by_brand.movies.length > 0 && (
                                <BrandTable block={tab.by_brand} label={tab.label} />
                            )}
                        </>
                    )}
                </>
            )}

            {/* 초기 안내 */}
            {!data && !loading && (
                <SectionCard>
                    <EmptyMsg>
                        날짜 범위(최대 7일)를 지정하고 검색 버튼을 눌러주세요.
                        <br />
                        경쟁작을 선택하지 않으면 등록된 경쟁작 전체를 집계합니다.
                    </EmptyMsg>
                </SectionCard>
            )}
        </PageWrapper>
    );
}
