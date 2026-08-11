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
    yyyy: string;      // 조회 연도 (메뉴 간 연동)
    movieId: string;   // 선택 영화 (메뉴 간 연동)
    movieTitle: string; // 선택 영화명 (엑셀 파일명 등에 사용)
}

/**
 * 스코어 현황·정산 상세의 모든 하위 메뉴가 공유하는 조회 조건 (V001).
 * SettlementFilterState는 이 아톰을 감싼 쓰기 가능한 selector다.
 */
export const ScoreFilterState = atom<ScoreFilterDate>({
    key: "ScoreFilterState",
    default: {
        date: yesterday(),
        dateFrom: yesterday(),
        dateTo: yesterday(),
        yyyy: new Date().getFullYear().toString(),
        movieId: "",
        movieTitle: "",
    },
});
