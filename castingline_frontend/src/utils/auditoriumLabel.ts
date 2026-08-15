/**
 * S001: 관명 표기 유틸 — 관명 옆에 좌석수를 괄호로 붙인다. (예: "1관(144석)")
 * 좌석수 정보([거래처 관리] - 극장관 정보)가 없으면 관명만 그대로 보여준다.
 */
export function formatAuditoriumLabel(
    name?: string | null,
    seatCount?: number | string | null,
): string {
    const label = (name ?? "").toString().trim();
    if (seatCount === null || seatCount === undefined || seatCount === "") return label;

    const seats = Number(seatCount);
    if (!Number.isFinite(seats) || seats <= 0) return label;

    return label ? `${label}(${seats.toLocaleString()}석)` : `(${seats.toLocaleString()}석)`;
}

/**
 * S001 2-1: 같은 관이 중복 등록된 경우 가장 최근에 추가된 관 정보만 남긴다.
 * (관 코드 기준 — 등록일자가 같으면 id가 큰 쪽이 최신)
 */
export function dedupeLatestAuditoriums<
    T extends { id: number; auditorium: string; created_date?: string | null },
>(theaters: T[]): T[] {
    const latest = new Map<string, T>();
    theaters.forEach((t) => {
        const key = t.auditorium ?? "";
        const prev = latest.get(key);
        if (!prev) {
            latest.set(key, t);
            return;
        }
        const a = prev.created_date || "";
        const b = t.created_date || "";
        if (b > a || (b === a && t.id > prev.id)) latest.set(key, t);
    });
    return Array.from(latest.values());
}
