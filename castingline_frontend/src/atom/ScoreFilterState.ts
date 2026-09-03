import { atom } from "recoil";
// S003(0903): 어제 날짜는 로컬 기준 공용 유틸 사용 (UTC 변환으로 이틀 전이 되던 문제)
import { yesterdayStr as yesterday } from "../utils/dateUtils";

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
