export function ScoreTable({ data }) {
    // 총계 계산
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
        {
            theaters: 0,
            screens: 0,
            base_visitors: 0,
            base_fare: 0,
            total_visitors: 0,
            total_fare: 0,
        }
    );

    const format = (n: number) => n?.toLocaleString() ?? "-";

    return (
        <table className="small-table">
            <thead>
                <tr>
                    <th>SECTION</th>
                    <th>극장수</th>
                    <th>스크린수</th>
                    <th>기준일관객(명)</th>
                    <th>기준일요금(원)</th>
                    <th>총누계(명)</th>
                    <th>총요금(원)</th>
                </tr>
            </thead>
            <tbody>
                {data.map((row, i) => (
                    <tr key={i}>
                        <td>
                            {row.region || row.multi || row.section || "-"}
                        </td>
                        <td>{format(row.theater_count)}</td>
                        <td>{format(row.screen_count)}</td>
                        <td>{format(row.base_day_visitors)}</td>
                        <td>{format(row.base_day_fare)}</td>
                        <td>{format(row.total_visitors)}</td>
                        <td>{format(row.total_fare)}</td>
                    </tr>
                ))}
                <tr style={{ backgroundColor: "#f9dede" }}>
                    <td>합계</td>
                    <td>{format(total.theaters)}</td>
                    <td>{format(total.screens)}</td>
                    <td>{format(total.base_visitors)}</td>
                    <td>{format(total.base_fare)}</td>
                    <td>{format(total.total_visitors)}</td>
                    <td>{format(total.total_fare)}</td>
                </tr>
            </tbody>
        </table>
    );
}
