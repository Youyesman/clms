import { useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { ForecastPayload, man } from "../types";

/**
 * 누적 관객 차트
 * - 검은 실선: 기준일까지 실제 누적 관객
 * - 파란 점선: 기준일 이후 예상 누적 — 유사 작품들이 기준일 뒤에 늘어난 모양(진행률 중앙값)을 따라
 *   현재 누적에서 예상 최종까지 이어 그린다
 * - 파란 띠: 예상 범위 (같은 모양으로 범위 하단~상단)
 * - 회색 선(선택): 유사 작품의 실제 흐름을 이 영화의 기준일 누적에 맞춰 그린 것
 * - 주황 점선: 상영이 끝난 작품에서 기준일 이후 실제 누적 (검증용)
 */
const W = 860;
const H = 360;
const M = { l: 58, r: 104, t: 16, b: 38 };
const C = {
    ink: "#0f172a",
    muted: "#94a3b8",
    grid: "#e2e8f0",
    axis: "#cbd5e1",
    fc: "#2563eb",
    band: "rgba(37, 99, 235, 0.13)",
    comp: "#b6c0cd",
    after: "#ea580c",
};

interface Props {
    data: ForecastPayload;
    showAfter: boolean;
    showComps: boolean;
}

type Pt = [number, number];

/** 정렬된 곡선에서 d일차 값 (그날 데이터가 없으면 직전 값) */
const valueAt = (curve: Pt[], d: number) => {
    let v: number | null = null;
    for (const [day, val] of curve) {
        if (day > d) break;
        v = val;
    }
    return v;
};

export const ForecastChart = ({ data, showAfter, showComps }: Props) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [hoverDay, setHoverDay] = useState<number | null>(null);
    const [tipPos, setTipPos] = useState({ x: 0, y: 0 });

    const g = useMemo(() => {
        const last = data.forecasts[data.forecasts.length - 1];
        const cut = data.dn_now;
        const base = data.film.cum_now;
        const after = data.actual_after?.curve ?? [];
        const comps = (data.comps ?? []).map((c) => {
            const k = base / (valueAt(c.curve, data.comp_basis ?? cut) || base || 1);
            return { title: c.title, scaled: c.curve.map(([d, v]) => [d, v * k] as Pt) };
        });
        // 기준일 이후 진행률: 유사 작품들이 (기준일 → 최종) 사이에서 d일차까지 채운 비율의 중앙값
        const compEnd = Math.max(0, ...comps.map((c) => c.scaled[c.scaled.length - 1]?.[0] ?? 0));
        const projEnd = Math.max(cut + 21, Math.min(compEnd || cut + 42, cut + 70));
        const progress = (d: number) => {
            const fr = comps
                .map((c) => {
                    const fin = c.scaled[c.scaled.length - 1][1];
                    const v = valueAt(c.scaled, d);
                    return fin - base > 0 && v != null ? Math.min(1, Math.max(0, (v - base) / (fin - base))) : null;
                })
                .filter((v): v is number => v != null)
                .sort((a, b) => a - b);
            if (!fr.length) return 1 - Math.exp(-(d - cut) / 8);
            return fr[Math.floor(fr.length / 2)];
        };
        const proj: { d: number; p: number }[] = [];
        let prev = 0;
        for (let d = cut; d <= projEnd; d++) {
            prev = d === projEnd ? 1 : Math.max(prev, progress(d)); // 누적이므로 줄어들지 않게
            proj.push({ d, p: prev });
        }
        const line = (target: number) => proj.map(({ d, p }) => [d, base + (target - base) * p] as Pt);
        const projMid = line(last.pred);
        const projHi = line(last.hi);
        const projLo = line(last.lo);

        const compLast = showComps ? comps.map((c) => c.scaled[c.scaled.length - 1] ?? ([0, 0] as Pt)) : [];
        const xMax = Math.max(projEnd, ...after.map((p) => p[0]), ...compLast.map((p) => p[0]));
        const yRaw = Math.max(last.hi, data.actual_after?.total ?? 0, ...compLast.map((p) => p[1]));
        const step = [10000, 20000, 50000, 100000, 200000, 250000, 500000, 1000000, 2000000, 5000000].find((s) => yRaw / s <= 6) ?? 10000000;
        const yMax = Math.ceil(yRaw / step) * step;
        const x = (d: number) => M.l + ((d - 1) / (xMax - 1)) * (W - M.l - M.r);
        const y = (v: number) => H - M.b - (v / yMax) * (H - M.t - M.b);
        const xy = (p: Pt) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`;
        const path = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${xy(p)}`).join("");
        const band = `${path(projHi)}L${[...projLo].reverse().map(xy).join("L")}Z`;
        const yTicks: number[] = [];
        for (let v = 0; v <= yMax; v += step) yTicks.push(v);
        const xTicks: number[] = [1];
        for (let d = 7; d <= xMax; d += 7) if (x(d) < W - M.r - 24) xTicks.push(d); // 오른쪽 라벨과 겹치지 않게
        const actual: Pt[] = data.daily.map((r) => [r[0], r[3]]);
        const projMap = new Map(proj.map(({ d }, i) => [d, [projMid[i][1], projLo[i][1], projHi[i][1]]]));
        return { last, cut, base, after, comps, xMax, x, y, path, band, projMid, projEnd, projMap, yTicks, xTicks, actual };
    }, [data, showComps]);

    const xe = W - M.r + 22;
    const dailyMap = useMemo(() => new Map(data.daily.map((r) => [r[0], r])), [data]);
    const afterMap = useMemo(() => new Map(g.after), [g]);

    const onMove = (e: React.PointerEvent) => {
        const r = svgRef.current?.getBoundingClientRect();
        if (!r) return;
        const sx = ((e.clientX - r.left) / r.width) * W;
        const d = Math.round(1 + ((sx - M.l) / (W - M.l - M.r)) * (g.xMax - 1));
        setHoverDay(Math.max(1, Math.min(g.xMax, d)));
        setTipPos({ x: e.clientX - r.left, y: e.clientY - r.top });
    };

    const tipRows: [string, string][] = [];
    if (hoverDay != null) {
        const dr = dailyMap.get(hoverDay);
        if (hoverDay <= g.cut && dr) {
            tipRows.push(["누적 관객", `${dr[3].toLocaleString()}명`], ["당일 관객", `${dr[1].toLocaleString()}명`], ["상영 극장", `${dr[2]}곳`]);
        } else if (hoverDay > g.cut) {
            const pm = g.projMap.get(Math.min(hoverDay, g.projEnd));
            if (pm) tipRows.push(["예상 누적", `${man(pm[0])}만 명`], ["예상 범위", `${man(pm[1])}만~${man(pm[2])}만`]);
            if (showAfter && afterMap.has(hoverDay)) tipRows.push(["실제 누적", `${man(afterMap.get(hoverDay) as number)}만 명`]);
            if (showComps)
                g.comps.forEach((c) => {
                    const v = valueAt(c.scaled, hoverDay);
                    if (v != null) tipRows.push([c.title, `${man(v)}만`]);
                });
        }
    }

    const after = showAfter ? data.actual_after : undefined;
    return (
        <Wrap>
            <Legend>
                <span><i style={{ borderColor: C.ink }} />실제 누적 관객</span>
                <span><i style={{ borderColor: C.fc, borderTopStyle: "dashed" }} />앞으로 예상되는 누적 관객</span>
                <span><i className="band" />예상 범위</span>
                {showComps && <span><i style={{ borderColor: C.comp }} />유사 작품의 실제 흐름</span>}
                {after && <span><i style={{ borderColor: C.after, borderTopStyle: "dotted" }} />기준일 이후 실제 누적</span>}
            </Legend>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="개봉일부터의 누적 관객과 예상 흐름">
                {g.yTicks.map((v) => (
                    <g key={v}>
                        <line x1={M.l} x2={W - M.r} y1={g.y(v)} y2={g.y(v)} stroke={v ? C.grid : C.axis} />
                        <text x={M.l - 10} y={g.y(v) + 4} textAnchor="end">{v ? `${man(v)}만` : "0"}</text>
                    </g>
                ))}
                {g.xTicks.map((d) => (
                    <text key={d} x={g.x(d)} y={H - M.b + 20} textAnchor="middle">{d === 1 ? "개봉일" : `${d}일`}</text>
                ))}
                <line x1={g.x(g.cut)} x2={g.x(g.cut)} y1={M.t} y2={H - M.b} stroke={C.axis} strokeDasharray="3 4" />
                <text x={g.x(g.cut) + 6} y={M.t + 12}>기준일 (개봉 {g.cut}일차)</text>

                <path d={g.band} fill={C.band} />
                {showComps && g.comps.map((c) => {
                    const pts = c.scaled.filter((p) => p[0] >= g.cut);
                    const end = pts[pts.length - 1];
                    return (
                        <g key={c.title}>
                            <path d={g.path(pts)} fill="none" stroke={C.comp} strokeWidth={1.3} />
                            {end && <text x={g.x(end[0]) + 4} y={g.y(end[1]) + 4} className="comp">{c.title}</text>}
                        </g>
                    );
                })}
                <path d={g.path(g.projMid)} fill="none" stroke={C.fc} strokeWidth={2.2} strokeDasharray="6 4" />
                {after && <path d={g.path(g.after.filter((p) => p[0] >= g.cut))} fill="none" stroke={C.after} strokeWidth={2} strokeDasharray="2 3" />}
                <path d={g.path(g.actual)} fill="none" stroke={C.ink} strokeWidth={2.5} strokeLinejoin="round" />
                <circle cx={g.x(g.cut)} cy={g.y(g.base)} r={5} fill={C.ink} stroke="#fff" strokeWidth={2} />
                <text x={g.x(g.cut) - 8} y={g.y(g.base) - 10} textAnchor="end" className="strong">현재 {man(g.base)}만</text>

                {/* 오른쪽 끝: 예상 최종과 범위 */}
                <rect x={xe - 5} y={g.y(g.last.hi)} width={10} height={Math.max(2, g.y(g.last.lo) - g.y(g.last.hi))} rx={4} fill={C.band} stroke={C.fc} strokeWidth={1.5} />
                <line x1={xe - 9} x2={xe + 9} y1={g.y(g.last.pred)} y2={g.y(g.last.pred)} stroke={C.fc} strokeWidth={2.5} />
                <text x={xe + 14} y={g.y(g.last.pred) + 4} className="strong">{man(g.last.pred)}만</text>
                {g.y(g.last.pred) - g.y(g.last.hi) > 14 && <text x={xe + 14} y={g.y(g.last.hi) + 4}>{man(g.last.hi)}만</text>}
                {g.y(g.last.lo) - g.y(g.last.pred) > 14 && <text x={xe + 14} y={g.y(g.last.lo) + 4}>{man(g.last.lo)}만</text>}
                <text x={xe} y={H - M.b + 20} textAnchor="middle">예상 최종</text>
                {after && (
                    <g>
                        <circle cx={xe} cy={g.y(after.total)} r={5} fill={C.after} stroke="#fff" strokeWidth={2} />
                        <text x={xe - 12} y={g.y(after.total) - 9} textAnchor="end" className="strong">실제 {man(after.total)}만</text>
                    </g>
                )}

                {hoverDay != null && <line x1={g.x(hoverDay)} x2={g.x(hoverDay)} y1={M.t} y2={H - M.b} stroke={C.muted} />}
                <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="transparent"
                    onPointerMove={onMove} onPointerLeave={() => setHoverDay(null)} />
            </svg>
            {hoverDay != null && (
                <Tip style={{ left: tipPos.x + 14, top: Math.max(0, tipPos.y - 90) }}>
                    <b>개봉 {hoverDay}일차</b>
                    {tipRows.length ? tipRows.map(([k, v]) => <span key={k}>{k}<em>{v}</em></span>) : <span>데이터 없음</span>}
                </Tip>
            )}
            <Caption>
                검은 선은 기준일까지 실제로 든 누적 관객입니다. 파란 점선은 앞으로의 예상 흐름으로, 비슷한 작품들이 같은 시점 이후 늘어난 모양을 따라
                최종 {man(g.last.pred)}만 명까지 이었습니다. 파란 영역은 실제 결과가 들어올 가능성이 높은 범위({man(g.last.lo)}만~{man(g.last.hi)}만 명)입니다.
            </Caption>
        </Wrap>
    );
};

const Wrap = styled.div`
    position: relative;
    max-width: 1040px;
    svg {
        display: block;
        width: 100%;
        height: auto;
        overflow: visible;
    }
    text {
        font-size: 12px;
        fill: #94a3b8;
        font-family: "SUIT", sans-serif;
    }
    text.strong {
        fill: #0f172a;
        font-weight: 700;
    }
    text.comp {
        font-size: 11px;
        fill: #94a3b8;
    }
`;

const Legend = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    font-size: 12px;
    color: #475569;
    margin-bottom: 6px;
    span {
        display: inline-flex;
        align-items: center;
        gap: 7px;
    }
    i {
        width: 20px;
        height: 0;
        border-top: 2px solid;
    }
    i.band {
        height: 10px;
        border: 0;
        background: rgba(37, 99, 235, 0.13);
    }
`;

const Caption = styled.p`
    margin: 6px 0 0;
    font-size: 12.5px;
    color: #64748b;
    line-height: 1.6;
    max-width: 80ch;
`;

const Tip = styled.div`
    position: absolute;
    pointer-events: none;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
    padding: 8px 11px;
    font-size: 12.5px;
    min-width: 170px;
    display: grid;
    gap: 2px;
    z-index: 2;
    b {
        color: #0f172a;
    }
    span {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        color: #64748b;
    }
    em {
        font-style: normal;
        color: #0f172a;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
    }
`;
