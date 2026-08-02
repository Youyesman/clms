import { css } from "styled-components";
import { ui } from "./uiTokens";

/**
 * 칩 안 글자들의 공통 줄높이.
 *
 * 라벨은 line-height가 글자크기와 같게 조여 있고 input은 normal(≈21px)이라,
 * 상자는 가운데 정렬돼도 글자 baseline이 서로 어긋났습니다.
 * 세 요소(라벨·값·input)에 같은 줄높이를 줘서 글자 높이를 맞춥니다.
 */
const CHIP_LINE_HEIGHT = "20px";

/**
 * 필터바 칩(노션식) 공통 모양.
 *
 * CustomSelect / CustomInput / AutocompleteInputMovie / AutocompleteInputClient
 * 네 컴포넌트가 모두 이 파일을 봅니다. 각자 복사해두면 반드시 어긋납니다.
 *
 * $applied — 실제로 목록을 걸러내고 있는 필터인지.
 *   전 페이지 쿼리 빌더가 쓰는 규칙과 같습니다: 빈 값 또는 "전체"는 걸러내지 않음.
 *   (`!== "전체"` 조건이 코드 전반에 29곳, 나머지는 빈 문자열 체크)
 */

/** 필터가 걸리지 않은 것으로 보는 값 — CustomSelect의 기본값 */
export const NEUTRAL_FILTER_VALUES = ["", "전체"];

/** 칩 바깥 상자 (SelectButton / InputBox에 적용) */
export const filterChipBox = css<{ $applied?: boolean }>`
    height: 30px;
    width: auto;
    padding: 0 10px;
    /* 라벨/값 사이 간격은 각자의 padding으로 만듭니다 (사이에 구분선이 들어가므로) */
    gap: 0;
    background: ${({ $applied }) => ($applied ? ui.color.primarySoft : ui.color.surface)};
    border: 1px solid ${({ $applied }) => ($applied ? ui.color.primaryBorder : ui.color.border)};
    border-radius: ${ui.radius.md};
    box-shadow: none;
    transition: border-color 0.12s ease, background-color 0.12s ease;

    &:hover:not(:disabled) {
        border-color: ${({ $applied }) => ($applied ? ui.color.primary : ui.color.borderStrong)};
        background: ${({ $applied }) => ($applied ? ui.color.primarySoft : ui.color.surfaceMuted)};
    }
`;

/** 칩 안의 라벨 (항목 이름) */
export const filterChipLabel = css<{ $applied?: boolean }>`
    height: auto;
    line-height: ${CHIP_LINE_HEIGHT};
    /* labelWidth는 상세 폼에서 라벨 열을 맞추려고 넘기는 값입니다.
       칩에서는 고정폭 + 가운데정렬이 되면서 글자 앞뒤로 빈 여백이 생기므로 무시합니다. */
    width: auto;
    min-width: 0;
    justify-content: flex-start;
    background: transparent;
    font-size: ${ui.font.size.md};
    font-weight: ${ui.font.weight.regular};
    color: ${({ $applied }) => ($applied ? ui.color.primary : ui.color.textMuted)};

    /* 라벨과 값을 가르는 얇은 선.
       값이 비어 placeholder(옅은 회색)만 있을 때 라벨과 색이 비슷해
       어디까지가 항목 이름인지 구분되지 않던 문제를 해결합니다. */
    padding: 0 8px 0 0;
    border-right: 1px solid ${({ $applied }) => ($applied ? ui.color.primaryBorder : ui.color.border)};
`;

/** 칩 안의 값 */
export const filterChipValue = css<{ $applied?: boolean }>`
    flex: 0 0 auto;
    /* 값이 비거나 짧아도 셀렉트 칩이 너무 좁아지지 않게 최소폭을 확보한다
       (펼침 버튼이 좁아 누르기 어렵다는 요청) */
    min-width: 90px;
    line-height: ${CHIP_LINE_HEIGHT};
    padding-left: 8px;
    font-size: ${ui.font.size.md};
    font-weight: ${ui.font.weight.semibold};
    color: ${({ $applied }) => ($applied ? ui.color.primary : ui.color.textStrong)};
`;

/** 칩 안의 텍스트 입력 — 부모 폭이 내용에 맞춰지므로 스스로 폭을 가져야 합니다 */
export const filterChipInput = css<{ $applied?: boolean; $chipAuto?: boolean }>`
    flex: 0 0 auto;
    line-height: ${CHIP_LINE_HEIGHT};
    height: ${CHIP_LINE_HEIGHT};
    padding-top: 0;
    padding-bottom: 0;
    width: ${({ $chipAuto }) => ($chipAuto ? "auto" : "112px")};
    padding-left: 8px;
    font-size: ${ui.font.size.md};
    font-weight: ${({ $applied }) => ($applied ? ui.font.weight.semibold : ui.font.weight.regular)};
    color: ${({ $applied }) => ($applied ? ui.color.primary : ui.color.text)};

    &::placeholder {
        color: ${ui.color.textSubtle};
        font-weight: ${ui.font.weight.regular};
    }
`;

/** 칩 오른쪽 캐럿 */
export const filterChipCaret = css<{ $applied?: boolean }>`
    color: ${({ $applied }) => ($applied ? ui.color.primary : ui.color.textSubtle)};
`;
