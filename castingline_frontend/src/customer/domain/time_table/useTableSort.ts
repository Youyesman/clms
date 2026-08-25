import { useMemo, useState } from "react";

/* V004: 주요작 데이터 표 정렬 훅.
   - 헤더 클릭으로 오름차순(▲)/내림차순(▼) 토글
   - 기본값은 탭의 핵심 지표(합계 수치) 내림차순 */

export type SortDir = "asc" | "desc";

export interface SortState {
    key: string;
    dir: SortDir;
}

export function useTableSort<T>(
    rows: T[],
    defaultKey: string,
    getValue: (row: T, key: string) => string | number | null | undefined,
    defaultDir: SortDir = "desc",
) {
    const [sort, setSort] = useState<SortState>({ key: defaultKey, dir: defaultDir });

    /* 같은 컬럼 재클릭 → 방향 토글, 다른 컬럼 클릭 → 그 컬럼의 기본 방향으로 */
    const toggle = (key: string, dirDefault: SortDir = "desc") => {
        setSort(s =>
            s.key === key
                ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
                : { key, dir: dirDefault },
        );
    };

    const sorted = useMemo(() => {
        const arr = [...rows];
        arr.sort((a, b) => {
            const va = getValue(a, sort.key);
            const vb = getValue(b, sort.key);
            // 값 없는 행은 정렬 방향과 무관하게 항상 뒤로
            const aNull = va == null;
            const bNull = vb == null;
            if (aNull && bNull) return 0;
            if (aNull) return 1;
            if (bNull) return -1;
            let cmp: number;
            if (typeof va === "string" || typeof vb === "string") {
                cmp = String(va).localeCompare(String(vb), "ko-KR");
            } else {
                cmp = va - vb;
            }
            return sort.dir === "asc" ? cmp : -cmp;
        });
        return arr;
    }, [rows, sort, getValue]);

    return { sort, toggle, sorted };
}
