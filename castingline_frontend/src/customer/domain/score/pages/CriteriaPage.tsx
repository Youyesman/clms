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
    min-width: 1600px;

    th, td {
        border: 1px solid #e2e8f0;
        padding: 4px 6px;
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
`;

const SubtotalRow = styled.tr`
    background: #fef9c3 !important;
    font-weight: 700;

    td {
        color: #92400e !important;
        background: #fef9c3 !important;
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

/* ── 컴포넌트 ── */
export function CriteriaPage() {
    const toast = useToast();
    const [moviesList, setMoviesList] = useState<any[]>([]);
    const [data, setData] = useState<any>({ meta: null, rows: [] });

    const [searchParams, setSearchParams] = useState({
        yyyy: new Date().getFullYear().toString(),
        movie_id: "",
        region: "전체",
        multi: "전체",
        theater_type: "전체",
        date: new Date().toISOString().split("T")[0],
    });
    // 날짜 디바운스용 확정 상태
    const [debouncedDate, setDebouncedDate] = useState(searchParams.date);

    // 포맷(서브영화)
    const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
    const [formatOptions, setFormatOptions] = useState<{ id: number; label: string; movie_code: string }[]>([]);

    const FORMAT_GROUPS: FormatGroup[] = useMemo(() => {
        if (formatOptions.length === 0) return [];
        return [{ label: '서브영화', key: 'sub_movies', items: formatOptions.map((f) => f.label) }];
    }, [formatOptions]);

    const fetchMovieFormats = useCallback((movieId: string) => {
        if (!movieId) { setFormatOptions([]); setSelectedFormats([]); return; }
        AxiosGet(`score/movie-formats/`, { params: { movie_id: movieId } })
            .then((res) => { setFormatOptions(res.data || []); setSelectedFormats([]); })
            .catch((err) => toast.error(handleBackendErrors(err)));
    }, [toast]);

    // 연도별 영화 목록
    const yearOptions = useMemo(() => {
        const cy = new Date().getFullYear();
        return Array.from({ length: 11 }, (_, i) => (cy - i).toString());
    }, []);

    const fetchMoviesByYear = useCallback((year: string) => {
        AxiosGet(`score/movies-by-year/`, { params: { year } })
            .then((res) => {
                setMoviesList(res.data || []);
                setSearchParams((p) => ({ ...p, movie_id: "" }));
                setFormatOptions([]); setSelectedFormats([]);
            })
            .catch((err) => toast.error(handleBackendErrors(err)));
    }, [toast]);

    useEffect(() => { fetchMoviesByYear(searchParams.yyyy); }, [searchParams.yyyy, fetchMoviesByYear]);

    // 데이터 조회
    const fetchData = useCallback(() => {
        if (!searchParams.movie_id) return;
        const formatIds = selectedFormats
            .map((label) => formatOptions.find((f) => f.label === label)?.id)
            .filter(Boolean).join(",");
        AxiosGet(`score/criteria/`, {
            params: {
                movie_id: searchParams.movie_id,
                date: debouncedDate,
                region: searchParams.region,
                multi: searchParams.multi,
                theater_type: searchParams.theater_type,
                ...(formatIds ? { format_movie_ids: formatIds } : {}),
            },
        })
            .then((res) => setData(res.data || { meta: null, rows: [] }))
            .catch((err) => toast.error(handleBackendErrors(err)));
    }, [searchParams.movie_id, debouncedDate, searchParams.region, searchParams.multi, searchParams.theater_type, selectedFormats, formatOptions, toast]);

    // 날짜 디바운스 (500ms)
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedDate(searchParams.date), 500);
        return () => clearTimeout(timer);
    }, [searchParams.date]);

    // 필터 변경 시 자동 검색
    useEffect(() => {
        if (searchParams.movie_id) fetchData();
    }, [
        searchParams.movie_id, debouncedDate, searchParams.region,
        searchParams.multi, searchParams.theater_type,
        selectedFormats, fetchData,
    ]);

    // 소계 행 삽입 로직
    const processedRows = useMemo(() => {
        const rows = data.rows || [];
        if (rows.length === 0) return [];

        const result: any[] = [];
        // 합계 누적
        const grandTotal = { sessions: new Array(12).fill(0), daily_total: 0, prev_day: 0, prev_week: 0, cumulative: 0 };

        let lastTheater = "";
        let lastAud = "";
        // 관별 소계
        let audSub = { sessions: new Array(12).fill(0), daily_total: 0, prev_day: 0, prev_week: 0, cumulative: 0 };
        // 극장별 소계
        let theaterSub = { sessions: new Array(12).fill(0), daily_total: 0, prev_day: 0, prev_week: 0, cumulative: 0 };

        const addSum = (target: any, row: any) => {
            for (let i = 0; i < 12; i++) target.sessions[i] += (row.sessions?.[i] || 0);
            target.daily_total += row.daily_total || 0;
            target.prev_day += row.prev_day || 0;
            target.prev_week += row.prev_week || 0;
            target.cumulative += row.cumulative || 0;
        };

        const resetSub = () => ({ sessions: new Array(12).fill(0), daily_total: 0, prev_day: 0, prev_week: 0, cumulative: 0 });

        const pushSubtotal = (label: string, sub: any, type: string) => {
            result.push({ ...sub, type, label, sessions: [...sub.sessions] });
        };

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const theaterKey = `${row.client_id}`;
            const audKey = `${row.client_id}_${row.auditorium}`;

            // 극장이 바뀌면 이전 관 소계 + 극장 소계
            if (lastTheater && theaterKey !== lastTheater) {
                pushSubtotal(`합계`, audSub, "aud_subtotal");
                pushSubtotal(`${rows[i - 1]?.theater} 총 합계`, theaterSub, "theater_subtotal");
                audSub = resetSub();
                theaterSub = resetSub();
                lastAud = "";
            }
            // 같은 극장 내에서 관이 바뀌면 관 소계
            else if (lastAud && audKey !== lastAud && lastTheater === theaterKey) {
                pushSubtotal(`합계`, audSub, "aud_subtotal");
                audSub = resetSub();
            }

            result.push(row);
            addSum(audSub, row);
            addSum(theaterSub, row);
            addSum(grandTotal, row);

            lastTheater = theaterKey;
            lastAud = audKey;
        }

        // 마지막 관/극장 소계
        if (rows.length > 0) {
            pushSubtotal(`합계`, audSub, "aud_subtotal");
            pushSubtotal(`${rows[rows.length - 1]?.theater} 총 합계`, theaterSub, "theater_subtotal");
        }

        // 전체 합계
        pushSubtotal("합 계", grandTotal, "grand_total");
        return result;
    }, [data.rows]);

    const meta = data.meta;

    return (
        <PageWrapper>
            <PageNavTabs tabs={SCORE_TABS} />
            <FilterBar>
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
                            allowClear={false}
                            options={moviesList.map((m) => ({ label: m.title_ko, value: m.id.toString() }))}
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
                            onChange={(v) => setSearchParams((p) => ({ ...p, region: v }))}
                        />
                    </div>
                    <div>
                        <CustomSelect
                            label="멀티"
                            options={["전체", "롯데", "CGV", "메가박스", "자동차극장", "씨네큐", "작은영화관", "기타"]}
                            value={searchParams.multi}
                            onChange={(v) => setSearchParams((p) => ({ ...p, multi: v }))}
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
                            <th>지역</th>
                            <th>멀티</th>
                            <th>구분</th>
                            <th>포맷</th>
                            <th>극장</th>
                            <th>관</th>
                            <th>요금</th>
                            {Array.from({ length: 12 }, (_, i) => (
                                <th key={i}>{i + 1}회</th>
                            ))}
                            <th>일계</th>
                            <th>전일</th>
                            <th>전주일</th>
                            <th>누계</th>
                        </tr>
                    </thead>
                    <tbody>
                        {processedRows.map((row, idx) => {
                            // 소계 행
                            if (row.type === "aud_subtotal") {
                                return (
                                    <SubtotalRow key={`sub-${idx}`}>
                                        <td colSpan={7} style={{ textAlign: "right", paddingRight: 12 }}>{row.label}</td>
                                        {row.sessions.map((s: number, i: number) => <td key={i}>{s || ""}</td>)}
                                        <td>{row.daily_total || ""}</td>
                                        <td>{row.prev_day || ""}</td>
                                        <td>{row.prev_week || ""}</td>
                                        <td>{row.cumulative || ""}</td>
                                    </SubtotalRow>
                                );
                            }
                            if (row.type === "theater_subtotal") {
                                return (
                                    <SubtotalRow key={`tsub-${idx}`}>
                                        <td colSpan={7} style={{ textAlign: "right", paddingRight: 12 }}>{row.label}</td>
                                        {row.sessions.map((s: number, i: number) => <td key={i}>{s || ""}</td>)}
                                        <td>{row.daily_total || ""}</td>
                                        <td>{row.prev_day || ""}</td>
                                        <td>{row.prev_week || ""}</td>
                                        <td>{row.cumulative || ""}</td>
                                    </SubtotalRow>
                                );
                            }
                            if (row.type === "grand_total") {
                                return (
                                    <GrandTotalRow key={`grand-${idx}`}>
                                        <td colSpan={7} style={{ textAlign: "center" }}>{row.label}</td>
                                        {row.sessions.map((s: number, i: number) => <td key={i}>{s || ""}</td>)}
                                        <td>{row.daily_total || ""}</td>
                                        <td>{row.prev_day || ""}</td>
                                        <td>{row.prev_week || ""}</td>
                                        <td>{row.cumulative || ""}</td>
                                    </GrandTotalRow>
                                );
                            }

                            // 데이터 행
                            return (
                                <tr key={idx}>
                                    <td>{row.region}</td>
                                    <td>{row.multi}</td>
                                    <td>{row.classification}</td>
                                    <td>{row.format}</td>
                                    <td>{row.theater}</td>
                                    <td>{row.auditorium}</td>
                                    <td>{row.fare}</td>
                                    {row.sessions.map((s: number, i: number) => (
                                        <td key={i}>{s || ""}</td>
                                    ))}
                                    <td style={{ fontWeight: 600 }}>{row.daily_total || ""}</td>
                                    <td>{row.prev_day || ""}</td>
                                    <td>{row.prev_week || ""}</td>
                                    <td>{row.cumulative || ""}</td>
                                </tr>
                            );
                        })}
                        {processedRows.length === 0 && (
                            <tr>
                                <td colSpan={23} style={{ padding: 40, color: "#94a3b8" }}>
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
