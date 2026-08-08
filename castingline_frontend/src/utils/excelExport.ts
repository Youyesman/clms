/**
 * 조회 화면 공통 엑셀 내보내기 유틸.
 *
 * 저장 형식은 기존 부금정산상세(SettlementDetailPage)와 동일하게
 * HTML <table> 을 .xls 로 내려주는 방식이다. 별도 라이브러리 없이
 * 엑셀에서 바로 열리고 한글/숫자 서식이 화면과 같게 유지된다.
 */

export type ExcelCell = string | number | null | undefined;

export interface ExcelSheetSection {
    /** 표 위에 한 줄로 들어갈 부가 정보 (영화명·기간 등). 없으면 생략 */
    caption?: string;
    /** 헤더 행 (여러 줄 헤더가 필요하면 배열을 여러 개 넣는다) */
    headers: ExcelCell[][];
    /** 본문 행 */
    rows: ExcelCell[][];
    /** 가운데 정렬할 본문 컬럼 인덱스(0-based). 지정 없으면 엑셀 기본 정렬 */
    centerCols?: number[];
}

const escapeCell = (v: ExcelCell): string => {
    if (v === "" || v === null || v === undefined) return "&nbsp;";
    return String(v)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
};

/**
 * 숫자 셀에 붙일 엑셀 서식(천 단위 콤마).
 * HTML→엑셀 방식에서는 mso-number-format 으로 셀 서식을 지정한다.
 * 정수는 #,##0 / 소수는 소수점 둘째 자리까지 표시(#,##0.##)해
 * 좌석판매율(85.3%) 같은 값이 반올림돼 보이지 않게 한다.
 */
const numberFormatCss = (v: number) =>
    `mso-number-format:'${
        Number.isInteger(v) ? "\\#\\,\\#\\#0" : "\\#\\,\\#\\#0\\.\\#\\#"
    }'`;

const td = (v: ExcelCell, tag: "td" | "th" = "td", center = false) => {
    const css: string[] = [];
    if (tag === "td" && typeof v === "number" && Number.isFinite(v)) {
        css.push(numberFormatCss(v));
    }
    if (center) css.push("text-align:center");
    const style = css.length ? ` style="${css.join(";")}"` : "";
    return `<${tag}${style}>${escapeCell(v)}</${tag}>`;
};

const tr = (cells: ExcelCell[], tag: "td" | "th" = "td", centerCols?: Set<number>) =>
    `<tr>${cells.map((c, i) => td(c, tag, centerCols?.has(i))).join("")}</tr>`;

/** 파일명에 쓸 수 없는 문자 제거 */
const safeFileName = (name: string) =>
    name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");

/**
 * 표 데이터를 .xls 파일로 내려받는다.
 * @returns 내보낸 행 수 (본문 기준). 0이면 데이터가 없어 내려받지 않은 것.
 */
export function downloadExcel(
    fileName: string,
    sections: ExcelSheetSection | ExcelSheetSection[]
): number {
    const list = Array.isArray(sections) ? sections : [sections];
    const bodyCount = list.reduce((n, s) => n + s.rows.length, 0);
    if (bodyCount === 0) return 0;

    const tables = list
        .map((s) => {
            const caption = s.caption
                ? `<tr><td colspan="${Math.max(
                      1,
                      s.headers[0]?.length || 1
                  )}">${escapeCell(s.caption)}</td></tr>`
                : "";
            const headers = s.headers.map((h) => tr(h, "th")).join("");
            const centerSet = s.centerCols ? new Set(s.centerCols) : undefined;
            const rows = s.rows.map((r) => tr(r, "td", centerSet)).join("");
            return `<table border="1">${caption}${headers}${rows}</table>`;
        })
        .join("<br/>");

    // BOM 을 붙여야 엑셀에서 한글이 깨지지 않는다.
    const blob = new Blob(["﻿\n" + tables], {
        type: "application/vnd.ms-excel;charset=utf-8",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${safeFileName(fileName)}.xls`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return bodyCount;
}

/** 조회 조건을 파일명 뒤에 붙일 때 쓰는 기간 표기 (2026-01-01~2026-01-31) */
export function periodSuffix(from?: string, to?: string): string {
    if (from && to) return from === to ? from : `${from}~${to}`;
    return from || to || "";
}
