import { useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { ForecastPayload, man } from "../types";

/**
 * 누적 관객 차트 — 기준일까지 실제(검정), 유사 작품(기준일 누적에 맞춘 회색),
 * 예상 범위(파란 띠·막대), 기준일 이후 실제(주황 점선, 상영 종료작만)
 */
const W = 860;
const H = 360;
const M = { l: 58, r: 96, t: 16, b: 38 };
const C = {
    ink: "#0f172a",
    muted: "#94a3b8",
    grid: "#e2e8f0",
    axis: "#cbd5e1",
    fc: "#2563eb",
    band: "rgba(37, 99, 235, 0.14)",
    comp: "#a8b3c2",
    after: "#ea580c",
};

interface Props {
    data: ForecastPayload;
    showAfter: boolean;
}

export const ForecastChart = ({ data, showAfter }: Props) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [hoverDay, setHoverDay] = useState<number | null>(null);
    const [tipPos, setTipPos] = useState({ x: 0, y: 0 });

    const g = useMemo(() => {
        const last = data.forecasts[data.forecasts.length - 1];
        const cut = data.dn_now;
        const base = data.film.cum_now;
        const after = data.actual_after?.curve ?? [];
        const comps = (data.comps ?? []).map((c) => {
            const pts = c.curve.filter((p) => p[0] <= (data.comp_basis ?? cut));
            const k = pts.length ? base / pts[pts.length - 1][1] : 1;
            return { title: c.title, scaled: c.curve.map(([d, v]) => [d, v * k] as [number, number]) };
        });
        const xMax = Math.max(70, ...after.map((p) => p[0]), ...comps.map((c) => c.scaled[c.scaled.length - 1]?.[0] ?? 0));
        const yRaw = Math.max(last.hi, data.actual_after?.total ?? 0, ...comps.map((c) => c.scaled[c.scaled.length - 1]?.[1] ?? 0));
        const step = [10000, 20000, 50000, 100000, 200000, 250000, 500000, 1000000, 2000000, 5000000].find((s) => yRaw / s <= 6) ?? 10000000;
        const yMax = Math.ceil(yRaw / step) * step;
        const x = (d: number) => M.l + ((d - 1) / (xMax - 1)) * (W - M.l - M.r);
        const y = (v: number) => H - M.b - (v / yMax) * (H - M.t - M.b);
        const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
        const yTicks: number[] = [];
        for (let v = 0; v <= yMax; v += step) yTicks.push(v);
        const xTicks: number[] = [1];
        for (let d = 7; d <= xMax; d += 7) if (x(d) < W - M.r - 24) xTicks.push(d);  // 오른쪽 '예상 최종' 라벨과 겹치지 않게
        const actual: [number, number][] = data.daily.map((r) => [r[0], r[3]]);
        return { last, cut, base, after, comps, xMax, yMax, x, y, path, yTicks, xTicks, actual };
    }, [data]);

    const xe = W - M.r + 20;
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
            tipRows.push(["누적", dr[3].toLocaleString()], ["당일 관객", dr[1].toLocaleString()], ["극장 수", `${dr[2]}개`]);
        } else {
            if (showAfter && afterMap.has(hoverDay)) tipRows.push(["기준일 이후 실제", (afterMap.get(hoverDay) as number).toLocaleString()]);
            g.comps.forEach((c) => {
                const p = c.scaled.find((q) => q[0] === hoverDay);
                if (p) tipRows.push([c.title, Math.round(p[1]).toLocaleString()]);
            });
        }
    }

    return (
        <Wrap>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="개봉일 기준 누적 관객 차트">
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
                <text x={g.x(g.cut) + 6} y={M.t + 12}>기준일</text>

                <path d={`M${g.x(g.cut)},${g.y(g.base)} L${g.x(g.xMax)},${g.y(g.last.hi)} L${g.x(g.xMax)},${g.y(g.last.lo)} Z`} fill={C.band} />
                {g.comps.map((c) => (
                    <path key={c.title} d={g.path(c.scaled.filter((p) => p[0] >= g.cut))} fill="none" stroke={C.comp} strokeWidth={1.5} />
                ))}
                <rect x={xe - 5} y={g.y(g.last.hi)} width={10} height={Math.max(2, g.y(g.last.lo) - g.y(g.last.hi))} rx={4} fill={C.band} stroke={C.fc} strokeWidth={1.5} />
                <line x1={xe - 9} x2={xe + 9} y1={g.y(g.last.pred)} y2={g.y(g.last.pred)} stroke={C.fc} strokeWidth={2.5} />
                <text x={xe + 14} y={g.y(g.last.pred) + 4} className="strong">{man(g.last.pred)}만</text>
                {g.y(g.last.pred) - g.y(g.last.hi) > 14 && <text x={xe + 14} y={g.y(g.last.hi) + 4}>{man(g.last.hi)}만</text>}
                {g.y(g.last.lo) - g.y(g.last.pred) > 14 && <text x={xe + 14} y={g.y(g.last.lo) + 4}>{man(g.last.lo)}만</text>}
                <text x={xe} y={H - M.b + 20} textAnchor="middle">예상 최종</text>

                {showAfter && data.actual_after && (
                    <g>
                        <path d={g.path(g.after.filter((p) => p[0] >= g.cut))} fill="none" stroke={C.after} strokeWidth={2} strokeDasharray="5 4" />
                        <circle cx={xe} cy={g.y(data.actual_after.total)} r={5} fill={C.after} stroke="#fff" strokeWidth={2} />
                        <text x={xe - 12} y={g.y(data.actual_after.total) - 9} textAnchor="end" className="strong">
                            실제 {man(data.actual_after.total)}만
                        </text>
                    </g>
                )}
                <path d={g.path(g.actual)} fill="none" stroke={C.ink} strokeWidth={2.5} strokeLinejoin="round" />
                <circle cx={g.x(g.cut)} cy={g.y(g.base)} r={5} fill={C.ink} stroke="#fff" strokeWidth={2} />

                {hoverDay != null && <line x1={g.x(hoverDay)} x2={g.x(hoverDay)} y1={M.t} y2={H - M.b} stroke={C.muted} />}
                <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="transparent"
                    onPointerMove={onMove} onPointerLeave={() => setHoverDay(null)} />
            </svg>
            {hoverDay != null && (
                <Tip style={{ left: tipPos.x + 14, top: Math.max(0, tipPos.y - 90) }}>
                    <b>개봉 {hoverDay}일차</b>
                    {tipRows.length ? tipRows.map(([k, v]) => (
                        <span key={k}>{k}<em>{v}</em></span>
                    )) : <span>데이터 없음</span>}
                </Tip>
            )}
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
    min-width: 160px;
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
