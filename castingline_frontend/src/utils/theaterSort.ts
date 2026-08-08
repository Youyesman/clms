/**
 * 극장명 자동완성 정렬 유틸 (S001).
 *
 * (폐관)/(휴관)/(임시중단) 극장은 검색 제안 목록의 아래로 보낸다.
 * 판정: 거래처의 영업 상태(operational_status=false) 또는 이름 접두 표기.
 */

const CLOSED_PREFIX_RE = /^\((폐관|휴관|임시중단)\)/;

export const isClosedTheaterName = (name: string | null | undefined) =>
    CLOSED_PREFIX_RE.test((name || "").trim());

/** 폐관류 극장을 뒤로 보낸 새 배열 반환 (원래 순서는 각 그룹 안에서 유지) */
export function closedTheatersLast<T>(
    list: T[],
    getName: (t: T) => string,
    isClosed?: (t: T) => boolean
): T[] {
    const closed = (t: T) =>
        (isClosed ? isClosed(t) : false) || isClosedTheaterName(getName(t));
    return [...list.filter((t) => !closed(t)), ...list.filter(closed)];
}
