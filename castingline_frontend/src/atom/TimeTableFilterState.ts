import { atom } from "recoil";

function yesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
}

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
