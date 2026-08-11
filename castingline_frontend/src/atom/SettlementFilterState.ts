import { DefaultValue, selector } from "recoil";
import { ScoreFilterState } from "./ScoreFilterState";

export interface SettlementFilter {
    dateFrom: string;
    dateTo: string;
    yyyy: string;
    movieId: string;
    movieTitle: string;
}

/** @deprecated use SettlementFilter */
export type SettlementFilterDate = SettlementFilter;

/**
 * 정산 상세 하위 메뉴들의 조회 조건.
 * 스코어 현황과 영화·기간을 공유해야 하므로(V001) 별도 아톰이 아니라
 * ScoreFilterState를 감싼 쓰기 가능한 selector로 둔다.
 * · 스코어 현황의 단일 기준일(date)은 dateFrom/dateTo에도 함께 반영되어 있어
 *   "2026-08-09" 선택 → 정산 "2026-08-09 ~ 2026-08-09"로 이어진다.
 * · 반대로 정산에서 기간을 바꾸면 단일날짜 화면의 기준일은 종료일로 맞춘다.
 */
export const SettlementFilterState = selector<SettlementFilter>({
    key: "SettlementFilterState",
    get: ({ get }) => {
        const f = get(ScoreFilterState);
        return {
            dateFrom: f.dateFrom,
            dateTo: f.dateTo,
            yyyy: f.yyyy,
            movieId: f.movieId,
            movieTitle: f.movieTitle,
        };
    },
    set: ({ set }, newValue) => {
        if (newValue instanceof DefaultValue) {
            set(ScoreFilterState, newValue);
            return;
        }
        set(ScoreFilterState, (prev) => ({
            ...prev,
            ...newValue,
            date: newValue.dateTo || prev.date,
        }));
    },
});
