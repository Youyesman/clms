/**
 * B004(0829): 표 컬럼 헤더 클릭 정렬 (오름차순/내림차순)
 *
 * [시간표 조회]·[경쟁작]의 모든 표에서 공통으로 쓴다.
 * - 헤더에 항상 ▲▼ 표시를 두고, 현재 정렬 기준인 화살표만 진하게 칠한다.
 * - 정렬 키는 점 표기(dot path)를 지원한다. 예: "prev_day_cmp.diff"
 * - 같은 컬럼을 다시 누르면 방향이 뒤집히고, 세 번째로 누르면 정렬이 해제된다
 *   (원래 순위/기본 순서로 되돌아온다).
 */
import React, { useMemo, useState } from "react";
import styled from "styled-components";

export type SortDir = "asc" | "desc";

export interface TableSort {
    sortKey: string | null;
    sortDir: SortDir;
    toggle: (key: string) => void;
}

/** 점 표기 경로로 값 꺼내기 ("a.b.c") */
const pick = (row: any, path: string): any =>
    path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), row);

const compare = (a: any, b: any): number => {
    // 값이 없는 행은 방향과 무관하게 항상 뒤로 보낸다
    const aNil = a == null || a === "";
    const bNil = b == null || b === "";
    if (aNil && bNil) return 0;
    if (aNil) return 1;
    if (bNil) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), "ko");
};

export function useTableSort<T>(rows: T[]): { sorted: T[]; sort: TableSort } {
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>("desc");

    const toggle = (key: string) => {
        if (key !== sortKey) {
            setSortKey(key);
            setSortDir("desc");   // 수치 컬럼이 대부분이라 큰 값부터 보는 것이 기본
            return;
        }
        if (sortDir === "desc") {
            setSortDir("asc");
            return;
        }
        setSortKey(null);         // 세 번째 클릭 → 정렬 해제
        setSortDir("desc");
    };

    const sorted = useMemo(() => {
        if (!sortKey) return rows;
        const dir = sortDir === "asc" ? 1 : -1;
        // 값이 같으면 원래 순서를 유지해야 순위표가 흔들리지 않는다
        return rows
            .map((r, i) => ({ r, i }))
            .sort((x, y) => {
                const c = compare(pick(x.r, sortKey), pick(y.r, sortKey));
                return c !== 0 ? c * dir : x.i - y.i;
            })
            .map((x) => x.r);
    }, [rows, sortKey, sortDir]);

    return { sorted, sort: { sortKey, sortDir, toggle } };
}

const Th = styled.th`
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    &:hover { background: #e2e8f0 !important; }
`;

const Arrows = styled.span<{ $dir: SortDir | null }>`
    margin-left: 3px;
    font-size: 9px;
    letter-spacing: -1px;
    .up   { color: ${({ $dir }) => ($dir === "asc" ? "#2563eb" : "#cbd5e1")}; }
    .down { color: ${({ $dir }) => ($dir === "desc" ? "#2563eb" : "#cbd5e1")}; }
`;

interface SortThProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
    /** 정렬 기준 필드 (점 표기 가능). 생략하면 정렬되지 않는 일반 헤더 */
    sortKey?: string;
    sort?: TableSort;
    children: React.ReactNode;
}

export function SortTh({ sortKey, sort, children, ...rest }: SortThProps) {
    if (!sortKey || !sort) return <th {...rest}>{children}</th>;
    const active = sort.sortKey === sortKey ? sort.sortDir : null;
    return (
        <Th {...rest} onClick={() => sort.toggle(sortKey)} title="클릭하면 정렬됩니다">
            {children}
            <Arrows $dir={active}>
                <span className="up">▲</span>
                <span className="down">▼</span>
            </Arrows>
        </Th>
    );
}

/** 표 우측 상단 안내 문구 */
export const SortHint = styled.span`
    font-weight: 400;
    font-size: 11px;
    color: #94a3b8;
    margin-left: 8px;
`;
