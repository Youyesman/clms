import { useState, useMemo, useRef } from "react";
import styled from "styled-components";

/* ── 스타일 ── */
const ChartContainer = styled.div`
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 24px;
    position: relative;
`;

const ChartTitle = styled.div`
    font-size: 14px;
    font-weight: 700;
    color: #374151;
    margin-bottom: 16px;
`;

const LegendWrap = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 20px;
    margin-bottom: 16px;
`;

const LegendItem = styled.div<{ color: string; isLine?: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #64748b;

    &::before {
        content: "";
        width: 14px;
        height: ${({ isLine }) => (isLine ? "3px" : "14px")};
        background: ${({ color }) => color};
        border-radius: ${({ isLine }) => (isLine ? "2px" : "3px")};
    }
`;

const GraphArea = styled.div`
    height: 320px;
    display: flex;
    position: relative;
    border-left: 1px solid #cbd5e1;
    border-bottom: 1px solid #cbd5e1;
    margin-bottom: 40px;
    margin-left: 50px;
`;

const YAxisLabels = styled.div`
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 50px;
    display: flex;
    flex-direction: column-reverse;
    justify-content: space-between;
    padding: 0 4px 0 0;
`;

const YLabel = styled.div`
    font-size: 11px;
    color: #94a3b8;
    text-align: right;
`;

const GridLines = styled.div`
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    pointer-events: none;

    div {
        width: 100%;
        height: 1px;
        background: #f1f5f9;
    }
`;

const BarWrapper = styled.div`
    flex: 1;
    display: flex;
    align-items: flex-end;
    justify-content: space-around;
    height: 100%;
    z-index: 1;
`;

const BarColumn = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    position: relative;
    cursor: pointer;

    &:hover { background: rgba(0,0,0,0.02); }
`;

const Bar = styled.div<{ $height: number }>`
    width: 36px;
    height: ${({ $height }) => $height}%;
    background: linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%);
    border-radius: 3px 3px 0 0;
    transition: height 0.6s cubic-bezier(0.4,0,0.2,1);
    position: absolute;
    bottom: 0;
`;

const XAxisLabel = styled.div`
    position: absolute;
    top: 100%;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    margin-top: 12px;
    text-align: center;
`;

/* 팝오버 스타일 */
const Popover = styled.div<{ $x: number; $y: number }>`
    position: absolute;
    left: ${({ $x }) => $x}px;
    top: ${({ $y }) => $y}px;
    transform: translate(-50%, -120%);
    background: #1e293b;
    color: #fff;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 12px;
    z-index: 10;
    pointer-events: none;
    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2);
    white-space: nowrap;
    line-height: 1.6;

    b { color: #60a5fa; }

    &::after {
        content: "";
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 6px solid transparent;
        border-top-color: #1e293b;
    }
`;

/* ── Y축 눈금 생성 유틸 ── */
function niceScale(maxVal: number, tickCount = 5): number[] {
    if (maxVal === 0) return [0];
    const roughStep = maxVal / tickCount;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const residual = roughStep / magnitude;
    let niceStep: number;
    if (residual <= 1.5) niceStep = 1 * magnitude;
    else if (residual <= 3) niceStep = 2 * magnitude;
    else if (residual <= 7) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    const ticks: number[] = [];
    for (let i = 0; i <= tickCount; i++) {
        ticks.push(niceStep * i);
    }
    return ticks;
}

/* ── 컴포넌트 ── */
interface ScoreChartProps {
    data: any[];
}

export function ScoreChart({ data }: ScoreChartProps) {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [hoverType, setHoverType] = useState<"bar" | "line">("bar");
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const graphRef = useRef<HTMLDivElement>(null);

    const processed = useMemo(() => {
        const visitors = data.map(d => d.base_day_visitors ?? 0);
        const screens = data.map(d => d.screen_count ?? 0);
        const maxVisitor = Math.max(...visitors, 1);
        const maxScreen = Math.max(...screens, 1);
        const yTicks = niceScale(maxVisitor);
        const yMax = yTicks[yTicks.length - 1] || 1;
        return { visitors, screens, maxVisitor, maxScreen, yTicks, yMax };
    }, [data]);

    if (data.length === 0) return null;

    // SVG로 꺾은선 그래프 포인트 계산
    const linePoints = data.map((d, i) => {
        const x = ((i + 0.5) / data.length) * 100;
        const y = 100 - ((d.screen_count ?? 0) / (processed.yMax || 1)) * 100 * (processed.maxVisitor / (processed.yMax || 1));
        return { x, y: Math.max(0, Math.min(100, y)) };
    });

    return (
        <ChartContainer>
            <ChartTitle>관객수 & 스크린수</ChartTitle>
            <LegendWrap>
                <LegendItem color="#3b82f6">관객수 (막대)</LegendItem>
                <LegendItem color="#f59e0b" isLine>스크린수 (꺾은선)</LegendItem>
            </LegendWrap>

            <div style={{ position: "relative" }}>
                {/* Y축 라벨 */}
                <YAxisLabels>
                    {processed.yTicks.map((tick, i) => (
                        <YLabel key={i}>{tick.toLocaleString()}</YLabel>
                    ))}
                </YAxisLabels>

                <GraphArea ref={graphRef}>
                    <GridLines>
                        {processed.yTicks.map((_, i) => <div key={i} />)}
                    </GridLines>

                    {/* SVG 꺾은선 레이어 */}
                    <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 2, pointerEvents: "none" }}
                    >
                        <polyline
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="0.8"
                            vectorEffect="non-scaling-stroke"
                            points={linePoints.map(p => `${p.x},${p.y}`).join(" ")}
                        />
                        {linePoints.map((p, i) => (
                            <circle
                                key={i}
                                cx={p.x}
                                cy={p.y}
                                r="1.5"
                                fill="#f59e0b"
                                style={{ pointerEvents: "all", cursor: "pointer" }}
                                onMouseEnter={(e) => {
                                    setHoverIndex(i);
                                    setHoverType("line");
                                    const rect = graphRef.current?.getBoundingClientRect();
                                    if (rect) {
                                        setMousePos({
                                            x: (e.clientX - rect.left),
                                            y: (e.clientY - rect.top),
                                        });
                                    }
                                }}
                                onMouseLeave={() => setHoverIndex(null)}
                            />
                        ))}
                    </svg>

                    {/* 막대 레이어 */}
                    <BarWrapper>
                        {data.map((item, idx) => (
                            <BarColumn
                                key={idx}
                                onMouseEnter={(e) => {
                                    setHoverIndex(idx);
                                    setHoverType("bar");
                                    const rect = graphRef.current?.getBoundingClientRect();
                                    if (rect) {
                                        setMousePos({
                                            x: (e.clientX - rect.left),
                                            y: (e.clientY - rect.top),
                                        });
                                    }
                                }}
                                onMouseLeave={() => setHoverIndex(null)}
                            >
                                <Bar $height={((item.base_day_visitors ?? 0) / processed.yMax) * 100} />
                                <XAxisLabel>{item.section || "기타"}</XAxisLabel>
                            </BarColumn>
                        ))}
                    </BarWrapper>

                    {/* 팝오버 */}
                    {hoverIndex !== null && (
                        <Popover $x={mousePos.x} $y={mousePos.y}>
                            <div style={{ fontWeight: 700, borderBottom: "1px solid #475569", paddingBottom: 4, marginBottom: 4 }}>
                                {data[hoverIndex]?.section || "기타"}
                            </div>
                            {hoverType === "bar" ? (
                                <div>관객수: <b>{(data[hoverIndex]?.base_day_visitors ?? 0).toLocaleString()}</b> 명</div>
                            ) : (
                                <div>스크린수: <b>{(data[hoverIndex]?.screen_count ?? 0).toLocaleString()}</b> 개</div>
                            )}
                        </Popover>
                    )}
                </GraphArea>
            </div>
        </ChartContainer>
    );
}