import React, { useState, useMemo } from "react";
import styled from "styled-components";

/** 1. 스타일 정의 **/
const ChartContainer = styled.div`
    width: 100%;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 24px;
    font-family: "SUIT", sans-serif;
    position: relative;
`;

const LegendWrapper = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 16px;
    margin-bottom: 20px;
`;

const LegendItem = styled.div<{ color: string; isLine?: boolean; isDashed?: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    color: #64748b;

    &::before {
        content: "";
        width: 12px;
        height: ${({ isLine }) => (isLine ? "2px" : "12px")};
        background-color: ${({ color }) => color};
        border-radius: ${({ isLine }) => (isLine ? "0" : "2px")};
        ${({ isDashed }) => isDashed && "border-bottom: 2px dashed #e74c3c; background: none;"}
    }
`;

const GraphArea = styled.div`
    height: 300px;
    width: 100%;
    display: flex;
    position: relative;
    border-left: 1px solid #cbd5e1;
    border-bottom: 1px solid #cbd5e1;
    margin-bottom: 40px; /* X축 라벨 공간 */
`;

/* 배경 그리드 라인 */
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
        background-color: #f1f5f9;
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
    &:hover { background: rgba(0,0,0,0.02); }
`;

const Bar = styled.div<{ height: number }>`
    width: 30px;
    height: ${({ height }) => height}%;
    background: #73a9ff;
    border-radius: 2px 2px 0 0;
    transition: height 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    position: absolute;
    bottom: 0;
`;

const XAxisLabel = styled.div`
    position: absolute;
    top: 100%;
    transform: rotate(25deg);
    transform-origin: top left;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    margin-top: 8px;
`;

const YAxisLabel = styled.div<{ $right?: boolean }>`
    position: absolute;
    top: -20px;
    ${({ $right }) => ($right ? "right: -10px;" : "left: -10px;")}
    font-size: 11px;
    font-weight: 800;
    color: #94a3b8;
`;

/* 툴팁 스타일 */
const Tooltip = styled.div<{ x: number; y: number }>`
    position: absolute;
    left: ${({ x }) => x}px;
    top: ${({ y }) => y}px;
    transform: translate(-50%, -120%);
    background: #1e293b;
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    z-index: 10;
    pointer-events: none;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    white-space: nowrap;
    line-height: 1.6;
    b { color: #73a9ff; }
`;

/** 2. 컴포넌트 본문 **/
export function ScoreChart({ data, sortBy }: { data: any[]; sortBy: string }) {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    // 데이터 가공 및 최대값 계산 (비율 계산용)
    const processedData = useMemo(() => {
        const visitors = data.map((d) => d.total_visitors ?? 0);
        const theaters = data.map((d) => d.theater_count ?? 0);
        const fares = data.map((d) => d.total_fare ?? 0);

        const maxLeft = Math.max(...visitors, ...theaters, 1);
        const maxRight = Math.max(...fares, 1);

        return { visitors, theaters, fares, maxLeft, maxRight };
    }, [data]);

    const sortLabel = { region: "지역", multi: "멀티", version: "버전" }[sortBy] ?? "구분";

    return (
        <ChartContainer>
            <LegendWrapper>
                <LegendItem color="#73a9ff">관객수</LegendItem>
                <LegendItem color="#f39c12" isLine>극장 수</LegendItem>
                <LegendItem color="#e74c3c" isLine isDashed>총요금</LegendItem>
            </LegendWrapper>

            <GraphArea>
                <YAxisLabel>관객/극장</YAxisLabel>
                <YAxisLabel $right>총요금(원)</YAxisLabel>

                <GridLines>
                    {[...Array(5)].map((_, i) => <div key={i} />)}
                </GridLines>

                {/* SVG Layer for Lines */}

                {/* 극장 수 라인 */}
                <polyline
                    fill="none"
                    stroke="#f39c12"
                    strokeWidth="1.5"
                    points={data
                        .map((d, i) => {
                            const x = (i / (data.length - 1)) * 100;
                            const y = 100 - ((d.theater_count ?? 0) / processedData.maxLeft) * 100;
                            return isNaN(x) ? `50,${y}` : `${x},${y}`;
                        })
                        .join(" ")}
                />
                {/* 총요금 라인 (Dashed) */}
                <polyline
                    fill="none"
                    stroke="#e74c3c"
                    strokeWidth="1.5"
                    strokeDasharray="2,2"
                    points={data
                        .map((d, i) => {
                            const x = (i / (data.length - 1)) * 100;
                            const y = 100 - ((d.total_fare ?? 0) / processedData.maxRight) * 100;
                            return isNaN(x) ? `50,${y}` : `${x},${y}`;
                        })
                        .join(" ")}
                />


                {/* Bar Layer & Interaction */}
                <BarWrapper>
                    {data.map((item, idx) => (
                        <BarColumn
                            key={idx}
                            onMouseEnter={(e) => {
                                setHoverIndex(idx);
                                setMousePos({ x: e.nativeEvent.offsetX + 40, y: e.nativeEvent.offsetY });
                            }}
                            onMouseMove={(e) => {
                                setMousePos({ x: e.nativeEvent.offsetX + 40, y: e.nativeEvent.offsetY });
                            }}
                            onMouseLeave={() => setHoverIndex(null)}
                        >
                            <Bar height={((item.total_visitors ?? 0) / processedData.maxLeft) * 100} />
                            <XAxisLabel>{item.section || "기타"}</XAxisLabel>
                        </BarColumn>
                    ))}
                </BarWrapper>

                {/* Custom Tooltip */}
                {hoverIndex !== null && (
                    <Tooltip x={mousePos.x} y={mousePos.y}>
                        <div style={{ fontWeight: 800, marginBottom: '4px', borderBottom: '1px solid #475569' }}>
                            {data[hoverIndex].section} ({sortLabel})
                        </div>
                        <div>관객수: <b>{(data[hoverIndex].total_visitors ?? 0).toLocaleString()}</b> 명</div>
                        <div>극장수: <b>{(data[hoverIndex].theater_count ?? 0).toLocaleString()}</b> 개</div>
                        <div>총요금: <b>{(data[hoverIndex].total_fare ?? 0).toLocaleString()}</b> 원</div>
                    </Tooltip>
                )}
            </GraphArea>
        </ChartContainer >
    );
}