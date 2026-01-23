import React, { useState, useMemo } from "react";
import styled from "styled-components";
import { TrendUp, TrendDown, ArrowsLeftRight } from "@phosphor-icons/react";

/** --- Styles (기존 디자인 유지 및 최적화) --- **/
const ChartCard = styled.div`
    background: #ffffff;
    border-radius: 4px;
    padding: 24px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
    display: flex;
    flex-direction: column;
    gap: 32px;
    position: relative;
`;

const ChartToolbar = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 20px;
    border-bottom: 1px solid #f1f5f9;
`;

const SwitchContainer = styled.div`
    display: flex;
    background-color: #f1f5f9;
    padding: 4px;
    border-radius: 8px;
`;

const SwitchButton = styled.button<{ active: boolean }>`
    padding: 7px 16px;
    border-radius: 6px;
    border: none;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.2s;
    background-color: ${(props) => (props.active ? "#ffffff" : "transparent")};
    color: ${(props) => (props.active ? "#2563eb" : "#64748b")};
    box-shadow: ${(props) => (props.active ? "0 2px 8px rgba(37, 99, 235, 0.15)" : "none")};
`;

const DateComparisonBadge = styled.div`
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 18px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    .date-box {
        display: flex;
        flex-direction: column;
        .label {
            font-size: 9px;
            color: #94a3b8;
            font-weight: 800;
        }
        .value {
            font-size: 13px;
            color: #475569;
            font-weight: 700;
        }
    }
    .date-box.highlight {
        .label {
            color: #2563eb;
        }
        .value {
            color: #1e293b;
        }
    }
    .arrow {
        color: #cbd5e1;
    }
`;

const SummaryRow = styled.div`
    display: flex;
    gap: 60px;
    align-items: flex-end;
`;

const MetricItem = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    .label-group {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        font-weight: 800;
        color: #64748b;
    }
    .value-group {
        display: flex;
        align-items: baseline;
        gap: 10px;
        .main-val {
            font-size: 32px;
            font-weight: 900;
        }
        .sub-val {
            font-size: 15px;
            font-weight: 700;
            opacity: 0.8;
        }
    }
    &.up {
        .value-group,
        svg {
            color: #10b981;
        }
    }
    &.down {
        .value-group,
        svg {
            color: #ef4444;
        }
    }
`;

const SvgWrapper = styled.div`
    width: 100%;
    position: relative;
    aspect-ratio: 800 / 300;
    svg {
        width: 100%;
        height: 100%;
        display: block;
        overflow: visible;
    }
`;

const TooltipBox = styled.div<{ x: string; y: string }>`
    position: absolute;
    left: ${(props) => props.x};
    top: ${(props) => props.y};
    transform: translate(-50%, -125%);
    background: rgba(15, 23, 42, 0.98);
    color: #ffffff;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 12px;
    pointer-events: none;
    z-index: 100;
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
    &::after {
        content: "";
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        border-width: 6px 6px 0;
        border-style: solid;
        border-color: rgba(15, 23, 42, 0.98) transparent transparent;
    }
    .title {
        font-weight: 900;
        color: #60a5fa;
        margin-bottom: 4px;
    }
    .row {
        display: flex;
        justify-content: space-between;
        gap: 20px;
    }
`;

/** --- Helpers --- **/
const getNiceStep = (max: number, ticks: number): number => {
    if (max === 0) return 1;

    // 1. 대략적인 스텝 크기 계산
    const rawStep = max / ticks;

    // 2. 숫자의 자릿수(지수) 계산 (예: 150 -> 10^2, 0.15 -> 10^-1)
    const exponent = Math.floor(Math.log10(rawStep));
    const magnitude = Math.pow(10, exponent);

    // 3. 1~10 사이의 값으로 정규화
    const unit = rawStep / magnitude;

    // 4. "예쁜 숫자" 선택
    let niceUnit;
    if (unit <= 1) niceUnit = 1;
    else if (unit <= 2) niceUnit = 2;
    else if (unit <= 5) niceUnit = 5;
    else niceUnit = 10;

    return niceUnit * magnitude;
};
/** --- Props Interface --- **/
interface ComparisonChartProps {
    data: any[];
    baseDate: string;
    prevDate: string;
    compareMode: "daily" | "weekly";
    onCompareModeChange: (mode: "daily" | "weekly") => void;
    labelKey?: string; // x축에 표시할 데이터의 키 (기본값: 'section')
    categoryName: string; // "지역", "멀티" 등 카테고리 명칭
}

/** --- Main Component --- **/
export function ComparisonChart({
    data,
    baseDate,
    prevDate,
    compareMode,
    onCompareModeChange,
    labelKey = "section",
    categoryName,
}: ComparisonChartProps) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    // 1. 통계 요약 로직
    const summary = useMemo(() => {
        const todayV = data.reduce((acc, cur) => acc + (cur.base_day_visitors || 0), 0);
        const prevV = data.reduce((acc, cur) => acc + (cur.prev_day_visitors || 0), 0);
        const tDiff = data.reduce((acc, cur) => acc + (cur.theater_change || 0), 0);
        const vDiffAbs = todayV - prevV;
        return {
            vDiffAbs,
            vPercent: prevV === 0 ? "0.0" : ((vDiffAbs / prevV) * 100).toFixed(1),
            tDiff,
            vDiffRaw: vDiffAbs,
        };
    }, [data]);

    // 2. SVG 좌표 계산 로직
    const width = 800;
    const height = 300;
    const padX = 85;
    const padY = 40;
    const cW = width - padX * 2;
    const cH = height - padY * 2;

    const scales = useMemo(() => {
        if (data.length === 0) return { maxV: 500, stepV: 100, stepC: 1, cMin: -2, cMax: 3 };
        const rawMaxV = Math.max(...data.map((d) => d.base_day_visitors)) || 100;
        const stepV = getNiceStep(rawMaxV, 5);
        const maxV = stepV * 5;
        const absMaxC = Math.max(...data.map((d) => Math.abs(d.theater_change || 0)), 1);
        const stepC = getNiceStep(absMaxC, 2);
        return { maxV, stepV, stepC, cMin: -2 * stepC, cMax: 3 * stepC };
    }, [data]);

    const points = useMemo(() => {
        const step = cW / data.length;
        const cRange = scales.cMax - scales.cMin;
        return data.map((d, i) => {
            const x = padX + i * step + step / 2;
            const bH = ((d.base_day_visitors || 0) / scales.maxV) * cH;
            const lineY = padY + cH - (((d.theater_change || 0) - scales.cMin) / cRange) * cH;
            return { x, bH, barTopY: padY + cH - bH, lineY, name: d[labelKey], original: d, stepWidth: step };
        });
    }, [data, cW, cH, scales, labelKey]);

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.lineY}`).join(" ");

    return (
        <ChartCard>
            <ChartToolbar>
                <SwitchContainer>
                    <SwitchButton active={compareMode === "daily"} onClick={() => onCompareModeChange("daily")}>
                        전일 데이터
                    </SwitchButton>
                    <SwitchButton active={compareMode === "weekly"} onClick={() => onCompareModeChange("weekly")}>
                        전주 데이터
                    </SwitchButton>
                </SwitchContainer>

                <DateComparisonBadge>
                    <div className="date-box">
                        <span className="label">과거</span>
                        <span className="value">{prevDate}</span>
                    </div>
                    <ArrowsLeftRight size={16} weight="bold" className="arrow" />
                    <div className="date-box highlight">
                        <span className="label">현재</span>
                        <span className="value">{baseDate}</span>
                    </div>
                </DateComparisonBadge>
            </ChartToolbar>

            <SummaryRow>
                <MetricItem className={summary.vDiffRaw >= 0 ? "up" : "down"}>
                    <div className="label-group">
                        관객 수 증감 추이 {summary.vDiffRaw >= 0 ? <TrendUp size={20} /> : <TrendDown size={20} />}
                    </div>
                    <div className="value-group">
                        <span className="main-val">
                            {summary.vDiffRaw > 0 ? "+" : ""}
                            {summary.vPercent}%
                        </span>
                        <span className="sub-val">
                            ({summary.vDiffRaw > 0 ? "+" : ""}
                            {summary.vDiffAbs.toLocaleString()}명)
                        </span>
                    </div>
                </MetricItem>
                <MetricItem className={summary.tDiff >= 0 ? "up" : "down"}>
                    <div className="label-group">
                        스크린 수 증감 추이 {summary.tDiff >= 0 ? <TrendUp size={20} /> : <TrendDown size={20} />}
                    </div>
                    <div className="value-group">
                        <span className="main-val">
                            {summary.tDiff > 0 ? "+" : ""}
                            {summary.tDiff}개
                        </span>
                        <span className="sub-val"> 변동</span>
                    </div>
                </MetricItem>
            </SummaryRow>

            <SvgWrapper>
                <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
                    {[0, 1, 2, 3, 4, 5].map((idx) => {
                        const v = idx / 5;
                        const yPos = padY + cH - v * cH;
                        const vLabel = (scales.stepV * idx).toLocaleString();
                        const cValue = scales.cMin + idx * scales.stepC;
                        const cLabel = (cValue > 0 ? "+" : "") + cValue;
                        return (
                            <g key={idx}>
                                <line
                                    x1={padX}
                                    y1={yPos}
                                    x2={width - padX}
                                    y2={yPos}
                                    stroke={cValue === 0 ? "#cbd5e1" : "#e2e8f0"}
                                    strokeWidth={cValue === 0 ? "1.5" : "1"}
                                />
                                <text
                                    x={padX - 12}
                                    y={yPos + 4}
                                    textAnchor="end"
                                    fill="#94a3b8"
                                    fontSize="11"
                                    fontWeight="700">
                                    {vLabel}
                                </text>
                                <text
                                    x={width - padX + 12}
                                    y={yPos + 4}
                                    textAnchor="start"
                                    fill="#94a3b8"
                                    fontSize="11"
                                    fontWeight="700">
                                    {cLabel}
                                </text>
                            </g>
                        );
                    })}
                    {points.map((p, i) => (
                        <rect
                            key={i}
                            x={p.x - 14}
                            y={p.barTopY}
                            width="28"
                            height={p.bH}
                            fill={hoveredIdx === i ? "#1d4ed8" : "#2563eb"}
                            rx="3"
                        />
                    ))}
                    <path d={linePath} fill="none" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" />
                    {points.map((p, i) => (
                        <circle
                            key={i}
                            cx={p.x}
                            cy={p.lineY}
                            r={hoveredIdx === i ? 6 : 4}
                            fill={hoveredIdx === i ? "#ef4444" : "#1e293b"}
                            stroke="#fff"
                            strokeWidth="2"
                        />
                    ))}
                    {points.map((p, i) => (
                        <text
                            key={i}
                            x={p.x}
                            y={height - 10}
                            textAnchor="middle"
                            fill={hoveredIdx === i ? "#0f172a" : "#64748b"}
                            fontSize="12"
                            fontWeight="800">
                            {p.name}
                        </text>
                    ))}
                    {points.map((p, i) => (
                        <rect
                            key={i}
                            x={p.x - p.stepWidth / 2}
                            y={padY}
                            width={p.stepWidth}
                            height={cH}
                            fill="transparent"
                            style={{ cursor: "pointer" }}
                            onMouseEnter={() => setHoveredIdx(i)}
                            onMouseLeave={() => setHoveredIdx(null)}
                        />
                    ))}
                </svg>

                {hoveredIdx !== null && points[hoveredIdx] && (
                    <TooltipBox
                        x={(points[hoveredIdx].x / width) * 100 + "%"}
                        y={(Math.min(points[hoveredIdx].barTopY, points[hoveredIdx].lineY) / height) * 100 + "%"}>
                        <div className="title">
                            {categoryName} : {points[hoveredIdx].name} 분석
                        </div>
                        <div className="row">
                            <span>관객수</span>
                            <span style={{ fontWeight: 800 }}>
                                {points[hoveredIdx].original.base_day_visitors.toLocaleString()}명
                            </span>
                        </div>
                        <div className="row">
                            <span>증감폭</span>
                            <span
                                style={{
                                    fontWeight: 800,
                                    color: points[hoveredIdx].original.theater_change >= 0 ? "#10b981" : "#ef4444",
                                }}>
                                {points[hoveredIdx].original.theater_change > 0 ? "+" : ""}
                                {points[hoveredIdx].original.theater_change}개
                            </span>
                        </div>
                    </TooltipBox>
                )}
            </SvgWrapper>
        </ChartCard>
    );
}
