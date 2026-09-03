import { atom } from "recoil";
// S003(0903): 어제 날짜는 로컬 기준 공용 유틸 사용 (UTC 변환으로 이틀 전이 되던 문제)
import { yesterdayStr as yesterday } from "../utils/dateUtils";

export interface TimeTableFilter {
    dateFrom: string;
    dateTo: string;
    selectedBrands: string[];
    selectedRegions: string[];
    selectedMovies: string[];
}

export const TimeTableFilterState = atom<TimeTableFilter>({
    key: "TimeTableFilterState",
    default: {
        dateFrom: yesterday(),
        dateTo: yesterday(),
        selectedBrands: [],
        selectedRegions: [],
        selectedMovies: [],
    },
});
