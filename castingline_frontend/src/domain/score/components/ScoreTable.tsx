import styled from "styled-components";

/* ── 스타일 ── */
const TableContainer = styled.div`
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
`;

const MovieInfoBar = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
`;

const MovieTitle = styled.div`
    font-size: 15px;
    font-weight: 700;
    color: #111827;

    span {
        font-weight: 400;
        color: #6b7280;
        margin-left: 8px;
        font-size: 13px;
    }
`;

const ExcelBtn = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #fff;
    color: #374151;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
        background: #f3f4f6;
        border-color: #9ca3af;
    }

    svg { width: 16px; height: 16px; }
`;

const StyledTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;

    thead {
        background: #f1f5f9;
    }

    th {
        padding: 10px 16px;
        text-align: right;
        font-weight: 700;
        color: #374151;
        border-bottom: 2px solid #cbd5e1;
        white-space: nowrap;

        &:first-child { text-align: center; }
    }

    td {
        padding: 10px 16px;
        text-align: right;
        color: #111827;
        border-bottom: 1px solid #e5e7eb;

        &:first-child {
            text-align: center;
            font-weight: 600;
            color: #374151;
        }
    }

    tbody tr:hover { background: #f8fafc; }

    tfoot {
        tr {
            background: #fef2f2;
            font-weight: 700;

            td {
                border-top: 2px solid #e5e7eb;
                color: #111827;
            }
        }
    }
`;

/* ── 타입 ── */
interface ScoreTableProps {
    data: any[];
    movieTitle?: string;
    releaseDate?: string;
    onExcelDownload?: () => void;
}

export function ScoreTable({ data, movieTitle, releaseDate, onExcelDownload }: ScoreTableProps) {
    // 합계 계산
    const total = data.reduce(
        (acc, cur) => {
            acc.theaters += cur.theater_count ?? 0;
            acc.screens += cur.screen_count ?? 0;
            acc.base_visitors += cur.base_day_visitors ?? 0;
            acc.base_fare += cur.base_day_fare ?? 0;
            acc.total_visitors += cur.total_visitors ?? 0;
            acc.total_fare += cur.total_fare ?? 0;
            return acc;
        },
        { theaters: 0, screens: 0, base_visitors: 0, base_fare: 0, total_visitors: 0, total_fare: 0 }
    );

    const fmt = (n: number) => n?.toLocaleString() ?? "-";

    return (
        <TableContainer>
            {/* 영화 정보 바 */}
            {movieTitle && (
                <MovieInfoBar>
                    <MovieTitle>
                        {movieTitle}
                        {releaseDate && <span>(개봉일: {releaseDate})</span>}
                    </MovieTitle>
                    {onExcelDownload && (
                        <ExcelBtn onClick={onExcelDownload}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 3v4a1 1 0 001 1h4M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" />
                                <path d="M12 11v6M9 14l3 3 3-3" />
                            </svg>
                            엑셀 다운로드
                        </ExcelBtn>
                    )}
                </MovieInfoBar>
            )}

            <StyledTable>
                <thead>
                    <tr>
                        <th>지역</th>
                        <th>극장수</th>
                        <th>스크린수</th>
                        <th>기준일 관객수(명)</th>
                        <th>기준일 총 요금(원)</th>
                        <th>총 누계(명)</th>
                        <th>총 요금(원)</th>
                    </tr>
                </thead>
                <tbody>
                    {data.length === 0 && (
                        <tr>
                            <td colSpan={7} style={{ textAlign: "center", color: "#9ca3af", padding: "40px" }}>
                                검색 조건을 입력하고 검색 버튼을 눌러주세요.
                            </td>
                        </tr>
                    )}
                    {data.map((row, i) => (
                        <tr key={i}>
                            <td>{row.section || "-"}</td>
                            <td>{fmt(row.theater_count)}</td>
                            <td>{fmt(row.screen_count)}</td>
                            <td>{fmt(row.base_day_visitors)}</td>
                            <td>{fmt(row.base_day_fare)}</td>
                            <td>{fmt(row.total_visitors)}</td>
                            <td>{fmt(row.total_fare)}</td>
                        </tr>
                    ))}
                </tbody>
                {data.length > 0 && (
                    <tfoot>
                        <tr>
                            <td>합계</td>
                            <td>{fmt(total.theaters)}</td>
                            <td>{fmt(total.screens)}</td>
                            <td>{fmt(total.base_visitors)}</td>
                            <td>{fmt(total.base_fare)}</td>
                            <td>{fmt(total.total_visitors)}</td>
                            <td>{fmt(total.total_fare)}</td>
                        </tr>
                    </tfoot>
                )}
            </StyledTable>
        </TableContainer>
    );
}
