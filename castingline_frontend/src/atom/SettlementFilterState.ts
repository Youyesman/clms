import { atom } from "recoil";

function yesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
}

export interface SettlementFilter {
    dateFrom: string;
    dateTo: string;
    yyyy: string;
    movieId: string;
    movieTitle: string;
}

/** @deprecated use SettlementFilter */
export type SettlementFilterDate = SettlementFilter;

export const SettlementFilterState = atom<SettlementFilter>({
    key: "SettlementFilterState",
    default: {
        dateFrom: yesterday(),
        dateTo: yesterday(),
        yyyy: new Date().getFullYear().toString(),
        movieId: "",
        movieTitle: "",
    },
});
