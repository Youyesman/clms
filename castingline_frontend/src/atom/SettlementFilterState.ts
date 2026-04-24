import { atom } from "recoil";

function yesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
}

export interface SettlementFilterDate {
    dateFrom: string;
    dateTo: string;
}

export const SettlementFilterState = atom<SettlementFilterDate>({
    key: "SettlementFilterState",
    default: {
        dateFrom: yesterday(),
        dateTo: yesterday(),
    },
});
