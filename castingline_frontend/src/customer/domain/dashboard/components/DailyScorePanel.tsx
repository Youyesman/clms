import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { Ticket } from "@phosphor-icons/react";
import { AxiosGet } from "../../../../axios/Axios";
import { handleBackendErrors } from "../../../../axios/handleBackendErrors";
import { useToast } from "../../../../components/common/CustomToast";
import { CustomInput } from "../../../../components/common/CustomInput";

/**
 * 거래처(배급사) 대시보드의 "전일 스코어" 패널.
 * 관리자 대시보드에서도 영화별 팝업으로 그대로 띄우기 위해 분리했다 (D001).
 */

/* ─────────────────────────  유틸  ───────────────────────── */
const toNum = (v: any) => (isNaN(Number(v)) ? 0 : Number(v));
const fmt = (n: number) => Math.round(n).toLocaleString();
const addDays = (dateStr: string, days: number) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
};
const pct = (cur: number, prev: number): number | null => {
    if (!prev) return null;
    return ((cur - prev) / prev) * 100;
};
const dateLabel = (d: string) => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}월 ${dt.getDate()}일`;
};

export interface DailyScoreCards {
    visitor: { cur: number; diff: number };
    fare: { cur: number; diff: number };
    screen: { cur: number; diff: number };
}

/* ─────────────────────────  스타일  ───────────────────────── */
const Panel = styled.div`
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
`;

const PanelHead = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid #e2e8f0;
`;

const PanelTitle = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 800;
    color: #0f172a;
`;

const PanelControls = styled.div`display: flex; align-items: center; gap: 10px; flex-wrap: wrap;`;
const PanelBody = styled.div`padding: 16px 18px;`;

const SubHead = styled.div`
    margin: 14px 0 6px;
    font-size: 13px;
    font-weight: 800;
    color: #dc2626;
    &:first-child { margin-top: 0; }
`;

const StatTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    th, td { padding: 7px 6px; border-bottom: 1px solid #f1f5f9; color: #334155; }
    th { color: #94a3b8; font-weight: 700; font-size: 12px; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    tr.total td { font-weight: 800; color: #0f172a; }
`;

const DeltaSpan = styled.span<{ $dir: number }>`
    font-size: 12px;
    font-weight: 700;
    color: ${(p) => (p.$dir > 0 ? "#dc2626" : p.$dir < 0 ? "#2563eb" : "#94a3b8")};
`;

function Delta({ value, unit }: { value: number | null; unit: string }) {
    if (value === null || isNaN(value)) return <DeltaSpan $dir={0}>-</DeltaSpan>;
    const dir = value > 0 ? 1 : value < 0 ? -1 : 0;
    const arrow = dir > 0 ? "▲" : dir < 0 ? "▼" : "";
    return (
        <DeltaSpan $dir={dir}>
            {arrow}
            {value > 0 ? "+" : ""}
            {value.toFixed(1)}
            {unit}
        </DeltaSpan>
    );
}

/* ─────────────────────────  본체  ───────────────────────── */
export function DailyScorePanel({
    movieId,
    releaseDate,
    date,
    onDateChange,
    onCardsChange,
    title = "전일 스코어",
}: {
    movieId: string;
    releaseDate?: string;
    date: string;
    onDateChange?: (v: string) => void;
    onCardsChange?: (cards: DailyScoreCards) => void;
    title?: string;
}) {
    const toast = useToast();
    const [regionRows, setRegionRows] = useState<any[]>([]);
    const [prevRegionRows, setPrevRegionRows] = useState<any[]>([]);
    const [multiRows, setMultiRows] = useState<any[]>([]);
    const [seatRows, setSeatRows] = useState<any[]>([]);
    const [prevSeatRows, setPrevSeatRows] = useState<any[]>([]);
    const [supplyRows, setSupplyRows] = useState<any[]>([]);

    const loadScore = useCallback(async () => {
        if (!movieId) return;
        const prevDate = addDays(date, -1);
        const from = releaseDate || "2006-01-01";
        try {
            const [region, prevRegion, multi, seat, prevSeat, supply] = await Promise.all([
                AxiosGet(`score/summary/`, { params: { movie_id: movieId, sort_by: "region", date_from: date, date_to: date, compare_mode: "daily" } }),
                AxiosGet(`score/summary/`, { params: { movie_id: movieId, sort_by: "region", date_from: prevDate, date_to: prevDate, compare_mode: "daily" } }),
                AxiosGet(`score/summary/`, { params: { movie_id: movieId, sort_by: "multi", date_from: date, date_to: date, compare_mode: "daily" } }),
                AxiosGet(`score/seat-rate/`, { params: { movie_id: movieId, date } }),
                AxiosGet(`score/seat-rate/`, { params: { movie_id: movieId, date: prevDate } }),
                AxiosGet(`score/supply-price/`, { params: { movie_id: movieId, date_from: from, date_to: date } }),
            ]);
            setRegionRows(region.data || []);
            setPrevRegionRows(prevRegion.data || []);
            setMultiRows(multi.data || []);
            setSeatRows(seat.data?.summary || []);
            setPrevSeatRows(prevSeat.data?.summary || []);
            setSupplyRows(supply.data?.rows || []);
        } catch (err) {
            toast.error(handleBackendErrors(err));
        }
    }, [movieId, date, releaseDate, toast]);

    useEffect(() => { loadScore(); }, [loadScore]);

    const sumField = (rows: any[], f: string) => rows.reduce((a, r) => a + toNum(r[f]), 0);

    // 상단 통계카드용 값 — 호출한 쪽이 필요하면 콜백으로 전달
    const cards = useMemo<DailyScoreCards>(() => {
        const curVisitor = sumField(regionRows, "base_day_visitors");
        const prevVisitor = sumField(prevRegionRows, "base_day_visitors");
        const curFare = sumField(regionRows, "base_day_fare");
        const prevFare = sumField(prevRegionRows, "base_day_fare");
        const curScreen = sumField(regionRows, "screen_count");
        const prevScreen = sumField(prevRegionRows, "screen_count");
        return {
            visitor: { cur: curVisitor, diff: curVisitor - prevVisitor },
            fare: { cur: curFare, diff: curFare - prevFare },
            screen: { cur: curScreen, diff: curScreen - prevScreen },
        };
    }, [regionRows, prevRegionRows]);

    useEffect(() => { onCardsChange?.(cards); }, [cards, onCardsChange]);

    // 지역별 (서울 / 지방 / 전국 / 총누계)
    const regionStat = useMemo(() => {
        const seoul = regionRows.find((r) => r.section === "서울");
        const seoulCur = toNum(seoul?.base_day_visitors);
        const seoulPrev = toNum(seoul?.prev_day_visitors);
        const allCur = sumField(regionRows, "base_day_visitors");
        const allPrev = sumField(regionRows, "prev_day_visitors");
        const localCur = allCur - seoulCur;
        const localPrev = allPrev - seoulPrev;
        const cumTotal = sumField(regionRows, "total_visitors");
        const cumPrev = cumTotal - allCur; // 전일까지 누계
        return [
            { label: "서울", value: seoulCur, delta: pct(seoulCur, seoulPrev) },
            { label: "지방", value: localCur, delta: pct(localCur, localPrev) },
            { label: "전국", value: allCur, delta: pct(allCur, allPrev) },
            { label: "총 누계", value: cumTotal, delta: pct(cumTotal, cumPrev) },
        ];
    }, [regionRows]);

    // 멀티별 관객수 (롯데 / CGV / 메가 / 기타)
    const multiStat = useMemo(() => {
        const grp = (names: string[]) => {
            const rs = multiRows.filter((r) => names.includes(r.section));
            const cur = sumField(rs, "base_day_visitors");
            const prev = sumField(rs, "prev_day_visitors");
            return { cur, delta: pct(cur, prev) };
        };
        const lotte = grp(["롯데"]);
        const cgv = grp(["CGV"]);
        const mega = grp(["메가박스"]);
        const known = ["롯데", "CGV", "메가박스"];
        const etcRows = multiRows.filter((r) => !known.includes(r.section));
        const etcCur = sumField(etcRows, "base_day_visitors");
        const etcPrev = sumField(etcRows, "prev_day_visitors");
        return [
            { label: "롯데", value: lotte.cur, delta: lotte.delta },
            { label: "CGV", value: cgv.cur, delta: cgv.delta },
            { label: "메가", value: mega.cur, delta: mega.delta },
            { label: "기타", value: etcCur, delta: pct(etcCur, etcPrev) },
        ];
    }, [multiRows]);

    // 좌석판매율 (멀티별, %p 전일대비)
    const seatStat = useMemo(() => {
        const rateOf = (rows: any[], multi: string) =>
            toNum(rows.find((r) => r.multi === multi)?.seat_rate);
        const row = (label: string, multi: string) => {
            const cur = rateOf(seatRows, multi);
            const prev = rateOf(prevSeatRows, multi);
            return { label, value: cur, deltaP: prev || cur ? cur - prev : null };
        };
        return [row("롯데", "롯데"), row("CGV", "CGV"), row("메가", "메가박스"), row("기타", "기타")];
    }, [seatRows, prevSeatRows]);

    // 공급가액 (당일 / 총누계, 전일대비%)
    const supplyStat = useMemo(() => {
        const byDate = (d: string) => supplyRows.find((r) => r.entry_date === d);
        const cur = toNum(byDate(date)?.supply_value);
        const prev = toNum(byDate(addDays(date, -1))?.supply_value);
        const cumTotal = sumField(supplyRows, "supply_value");
        const cumPrev = cumTotal - cur;
        return {
            day: { value: cur, delta: pct(cur, prev) },
            cum: { value: cumTotal, delta: pct(cumTotal, cumPrev) },
        };
    }, [supplyRows, date]);

    return (
        <Panel>
            <PanelHead>
                <PanelTitle><Ticket size={20} weight="duotone" /> {title}</PanelTitle>
                {onDateChange && (
                    <PanelControls>
                        <CustomInput inputType="date" value={date} setValue={(v: string) => onDateChange(v)} />
                    </PanelControls>
                )}
            </PanelHead>
            <PanelBody>
                <SubHead>관객수 (지역별)</SubHead>
                <StatTable>
                    <thead><tr><th>구분</th><th style={{ textAlign: "right" }}>관객수</th><th style={{ textAlign: "right" }}>전일대비</th></tr></thead>
                    <tbody>
                        {regionStat.map((r) => (
                            <tr key={r.label} className={r.label === "총 누계" ? "total" : ""}>
                                <td>{r.label}</td>
                                <td className="num">{fmt(r.value)}</td>
                                <td className="num"><Delta value={r.delta} unit="%" /></td>
                            </tr>
                        ))}
                    </tbody>
                </StatTable>

                <SubHead>관객수 (멀티별)</SubHead>
                <StatTable>
                    <tbody>
                        {multiStat.map((r) => (
                            <tr key={r.label}>
                                <td>{r.label}</td>
                                <td className="num">{fmt(r.value)}</td>
                                <td className="num"><Delta value={r.delta} unit="%" /></td>
                            </tr>
                        ))}
                    </tbody>
                </StatTable>

                <SubHead>좌석판매율 (멀티별)</SubHead>
                <StatTable>
                    <tbody>
                        {seatStat.map((r) => (
                            <tr key={r.label}>
                                <td>{r.label}</td>
                                <td className="num">{r.value.toFixed(1)}%</td>
                                <td className="num"><Delta value={r.deltaP} unit="%p" /></td>
                            </tr>
                        ))}
                    </tbody>
                </StatTable>

                <SubHead>공급가액</SubHead>
                <StatTable>
                    <tbody>
                        <tr>
                            <td>{dateLabel(date)}</td>
                            <td className="num">{fmt(supplyStat.day.value)}</td>
                            <td className="num"><Delta value={supplyStat.day.delta} unit="%" /></td>
                        </tr>
                        <tr className="total">
                            <td>총 누계</td>
                            <td className="num">{fmt(supplyStat.cum.value)}</td>
                            <td className="num"><Delta value={supplyStat.cum.delta} unit="%" /></td>
                        </tr>
                    </tbody>
                </StatTable>
            </PanelBody>
        </Panel>
    );
}

export default DailyScorePanel;
