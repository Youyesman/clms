import { atom } from "recoil";

function yesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
}

export interface ScoreFilterDate {
    date: string;      // 단일날짜 페이지용 (ScorePage, CriteriaPage, SeatRatePage)
    dateFrom: string;  // 범위 시작 (DailyStatusPage, RankingPage)
    dateTo: string;    // 범위 끝
}

export const ScoreFilterState = atom<ScoreFilterDate>({
    key: "ScoreFilterState",
    default: {
        date: yesterday(),
        dateFrom: yesterday(),
        dateTo: yesterday(),
    },
});
