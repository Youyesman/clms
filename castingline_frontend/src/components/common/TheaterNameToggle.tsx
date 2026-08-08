/**
 * 극장명 표기 선택 (배급사별 ↔ 캐스팅라인).
 *
 * 다른 필터들과 같은 칩 셀렉트 형태라 폭이 작고, 선택된 표기가
 * 칩 값으로 그대로 보여 현재 상태가 명확하다. 배급사별(매핑명)을
 * 선택하면 필터가 걸린 것처럼 파란 강조로 표시된다.
 */
import React from "react";
import styled from "styled-components";
import { CustomSelect } from "./CustomSelect";

const DIST = "배급사별";
const CASTING = "캐스팅라인";

const UnregisteredBadge = styled.span`
    margin-left: 4px;
    color: #dc2626;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
`;

/**
 * 극장명 표시 셀 — 배급사별 모드에서 극장명 매핑이 등록되지 않은 극장은
 * 캐스팅라인 극장명 뒤에 빨간색 '미등록관' 배지를 붙인다.
 */
export function TheaterNameCell({
    useDistName,
    theater,
    distributorTheater,
}: {
    useDistName: boolean;
    theater: string;
    distributorTheater?: string | null;
}) {
    if (useDistName && !distributorTheater) {
        return (
            <>
                {theater}
                <UnregisteredBadge>미등록관</UnregisteredBadge>
            </>
        );
    }
    return <>{useDistName ? distributorTheater || theater : theater}</>;
}

export function TheaterNameToggle({
    useDistName,
    onChange,
}: {
    /** true면 배급사별 극장명(극장명 매핑) 표기 */
    useDistName: boolean;
    onChange: (next: boolean) => void;
}) {
    return (
        <CustomSelect
            label="극장명"
            options={[DIST, CASTING]}
            value={useDistName ? DIST : CASTING}
            onChange={(v) => onChange(v === DIST)}
            allowClear={false}
            variant="chip"
            /* 캐스팅라인(원래 이름)일 땐 중립 표시, 배급사별일 땐 강조 */
            neutralValues={[CASTING]}
        />
    );
}
