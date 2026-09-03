/**
 * 로컬(브라우저 시간대) 기준 날짜 문자열 유틸.
 *
 * S003(0903): 예전엔 `new Date()`에 하루를 뺀 뒤 `toISOString()`으로 잘라 썼는데,
 * toISOString은 UTC 기준이라 KST 00:00~08:59 사이에 접속하면 '이틀 전'이 나왔다.
 * 반드시 로컬 연·월·일로 직접 조립한다.
 */
export const toLocalDateStr = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

/** 오늘 기준 n일 뒤(음수면 이전) 날짜 — 'YYYY-MM-DD' */
export const addDaysStr = (n: number, base: Date = new Date()): string => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    d.setDate(d.getDate() + n);
    return toLocalDateStr(d);
};

/** 어제 — 'YYYY-MM-DD' (스코어 현황 기본 조회일) */
export const yesterdayStr = (): string => addDaysStr(-1);

/**
 * S002(0903): 스코어 현황 연도 선택 범위 — 올해부터 2010년까지.
 * (2015년작 <연평해전>이 2026년 재상영되는 등 옛 작품 조회가 필요)
 */
export const SCORE_YEAR_MIN = 2010;
export const scoreYearOptions = (): string[] => {
    const cy = new Date().getFullYear();
    return Array.from({ length: cy - SCORE_YEAR_MIN + 1 }, (_, i) => (cy - i).toString());
};
