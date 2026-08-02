/**
 * 테이블 열 너비 조절 (E002)
 *
 * 모든 페이지의 <table> 헤더에서 열 경계를 드래그하면 엑셀처럼 열 너비를 조절한다.
 * - 헤더 셀 오른쪽 끝 6px 안에 커서를 올리면 col-resize 커서 표시 → 드래그로 조절
 * - 경계 더블클릭 시 해당 테이블의 너비 설정 초기화(자동 너비로 복귀)
 * - 조절한 너비는 경로 + 헤더 구성 기준으로 localStorage에 저장, 재방문 시 자동 적용
 * - 고정열(sticky)이 있으면 left 오프셋을 실제 폭으로 다시 계산해 어긋남 방지
 * - 헤더가 병합(colspan)된 테이블은 열 경계가 1:1로 대응되지 않아 대상에서 제외
 *
 * 셀 범위 선택(excelCellSelection)보다 먼저 잡아야 하므로 mousedown은 capture 단계에서 처리한다.
 */

const HANDLE = 6; // 열 경계로 인식하는 폭(px)
const MIN_W = 40; // 최소 열 너비(px)
const STYLE_ID = "tcr-style";
const STORE_KEY = "tcr.col.widths.v1";
const STORE_MAX = 200;

/** 저장된 너비 (키: 경로 + 헤더 구성) */
type WidthStore = Record<string, number[]>;

const readStore = (): WidthStore => {
    try {
        return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") as WidthStore;
    } catch {
        return {};
    }
};

const writeStore = (all: WidthStore) => {
    try {
        const keys = Object.keys(all);
        // 오래된 항목부터 정리 (localStorage 무한 증가 방지)
        if (keys.length > STORE_MAX) {
            keys.slice(0, keys.length - STORE_MAX).forEach((k) => delete all[k]);
        }
        localStorage.setItem(STORE_KEY, JSON.stringify(all));
    } catch {
        /* 용량 초과 등은 무시 — 너비 저장은 부가 기능 */
    }
};

/** 열 경계가 1:1로 대응되는 헤더 행만 대상 (병합 헤더 제외) */
const resizableHeaderRow = (table: HTMLTableElement): HTMLTableRowElement | null => {
    const head = table.tHead;
    if (!head || head.rows.length === 0) return null;
    const row = head.rows[0];
    if (row !== table.rows[0]) return null; // table-layout:fixed는 첫 행 기준으로 열 폭 결정
    if (row.cells.length < 2) return null;
    for (let i = 0; i < row.cells.length; i++) {
        if (row.cells[i].colSpan > 1) return null;
    }
    return row;
};

const cellText = (cell: HTMLTableCellElement) =>
    (cell.innerText || "").replace(/\s+/g, " ").trim();

const storeKeyOf = (row: HTMLTableRowElement) =>
    `${window.location.pathname}|${Array.from(row.cells).map(cellText).join("~")}`;

const setCellWidth = (cell: HTMLTableCellElement, px: number) => {
    cell.style.boxSizing = "border-box";
    cell.style.width = `${px}px`;
    cell.style.minWidth = `${px}px`;
    cell.style.maxWidth = `${px}px`;
};

/** 현재 렌더된 폭을 그대로 고정해 table-layout:fixed로 전환 (겉보기 변화 없음) */
const pin = (
    table: HTMLTableElement,
    row: HTMLTableRowElement,
    widths?: number[]
): number[] | null => {
    const cells = Array.from(row.cells);
    const w =
        widths && widths.length === cells.length
            ? widths.slice()
            : cells.map((c) => c.getBoundingClientRect().width);
    if (w.some((x) => !x || x <= 0)) return null; // 아직 렌더 전(숨김 등)이면 보류

    cells.forEach((c, i) => setCellWidth(c, w[i]));
    table.style.tableLayout = "fixed";
    table.style.width = `${w.reduce((a, b) => a + b, 0)}px`;
    table.dataset.tcrPinned = "1";
    restick(table);
    return w;
};

/** 고정열 left 오프셋을 실제 폭 기준으로 재계산 */
const restick = (table: HTMLTableElement) => {
    const head = table.tHead;
    if (!head || !head.rows.length) return;
    const headCells = Array.from(head.rows[0].cells);

    // 선두 고정열 개수와 누적 오프셋을 헤더에서 한 번만 계산
    const offsets: number[] = [];
    let acc = 0;
    for (const cell of headCells) {
        if (window.getComputedStyle(cell).position !== "sticky") break;
        offsets.push(acc);
        acc += cell.getBoundingClientRect().width;
    }
    if (offsets.length === 0) return;

    for (const r of Array.from(table.rows)) {
        for (let i = 0; i < offsets.length && i < r.cells.length; i++) {
            r.cells[i].style.left = `${offsets[i]}px`;
        }
    }
};

/** 인라인으로 넣은 너비를 모두 걷어내고 자동 너비로 복귀 */
const unpin = (table: HTMLTableElement) => {
    const row = resizableHeaderRow(table);
    if (row) {
        Array.from(row.cells).forEach((c) => {
            c.style.width = "";
            c.style.minWidth = "";
            c.style.maxWidth = "";
        });
    }
    // 고정열 left는 원래 스타일시트 값으로 되돌림
    for (const r of Array.from(table.rows)) {
        for (const c of Array.from(r.cells)) c.style.left = "";
    }
    table.style.tableLayout = "";
    table.style.width = "";
    delete table.dataset.tcrPinned;
};

export function initTableColumnResize(): () => void {
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            th.tcr-hot { cursor: col-resize !important; }
            body.tcr-resizing, body.tcr-resizing * {
                cursor: col-resize !important;
                user-select: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    let hotTh: HTMLTableCellElement | null = null;

    // 드래그 상태
    let dragTh: HTMLTableCellElement | null = null;
    let dragTable: HTMLTableElement | null = null;
    let dragRow: HTMLTableRowElement | null = null;
    let startX = 0;
    let startW = 0;
    let startTotal = 0;
    let moved = false;
    let frame = 0;
    let pendingX = 0;

    const setHot = (th: HTMLTableCellElement | null) => {
        if (hotTh === th) return;
        hotTh?.classList.remove("tcr-hot");
        hotTh = th;
        hotTh?.classList.add("tcr-hot");
    };

    /** 커서가 열 경계 위인지 판단 → 대상 th 반환 */
    const handleAt = (e: MouseEvent): HTMLTableCellElement | null => {
        const th = (e.target as HTMLElement | null)?.closest?.(
            "th"
        ) as HTMLTableCellElement | null;
        if (!th) return null;
        const row = th.parentElement as HTMLTableRowElement | null;
        const table = th.closest("table") as HTMLTableElement | null;
        if (!row || !table || resizableHeaderRow(table) !== row) return null;
        const rect = th.getBoundingClientRect();
        return e.clientX >= rect.right - HANDLE && e.clientX <= rect.right + 1 ? th : null;
    };

    const applyDrag = () => {
        frame = 0;
        if (!dragTh || !dragTable) return;
        const next = Math.max(MIN_W, Math.round(startW + (pendingX - startX)));
        setCellWidth(dragTh, next);
        dragTable.style.width = `${startTotal - startW + next}px`;
        // 행이 많으면 드래그 중 고정열 재계산은 생략하고 마우스를 뗄 때 한 번만 맞춘다
        if (dragTable.rows.length <= 200) restick(dragTable);
    };

    const onMouseDownCapture = (e: MouseEvent) => {
        if (e.button !== 0) return;
        const th = handleAt(e);
        if (!th) return;

        const table = th.closest("table") as HTMLTableElement;
        const row = th.parentElement as HTMLTableRowElement;

        if (!table.dataset.tcrPinned && !pin(table, row)) return;

        dragTh = th;
        dragTable = table;
        dragRow = row;
        startX = e.clientX;
        startW = th.getBoundingClientRect().width;
        startTotal = table.getBoundingClientRect().width;
        pendingX = e.clientX;
        moved = false;

        document.body.classList.add("tcr-resizing");
        // 셀 범위 선택/정렬 클릭으로 새지 않도록 여기서 이벤트를 끊는다
        e.preventDefault();
        e.stopPropagation();
    };

    const onMouseMove = (e: MouseEvent) => {
        if (dragTh) {
            pendingX = e.clientX;
            if (Math.abs(e.clientX - startX) > 2) moved = true;
            if (!frame) frame = window.requestAnimationFrame(applyDrag);
            return;
        }
        setHot(handleAt(e));
    };

    const onMouseUpCapture = (e: MouseEvent) => {
        if (!dragTh || !dragTable || !dragRow) return;
        if (frame) {
            window.cancelAnimationFrame(frame);
            applyDrag();
        }
        restick(dragTable);
        document.body.classList.remove("tcr-resizing");

        if (moved) {
            // 정렬 등 헤더 클릭 액션 오발동 방지
            const swallow = (ev: MouseEvent) => {
                ev.stopPropagation();
                ev.preventDefault();
            };
            document.addEventListener("click", swallow, { capture: true, once: true });
            window.setTimeout(
                () => document.removeEventListener("click", swallow, { capture: true } as any),
                0
            );

            const all = readStore();
            all[storeKeyOf(dragRow)] = Array.from(dragRow.cells).map((c) =>
                Math.round(c.getBoundingClientRect().width)
            );
            writeStore(all);
            e.stopPropagation();
        }

        dragTh = null;
        dragTable = null;
        dragRow = null;
    };

    /** 경계 더블클릭 → 해당 테이블 너비 초기화 */
    const onDblClickCapture = (e: MouseEvent) => {
        const th = handleAt(e);
        if (!th) return;
        const table = th.closest("table") as HTMLTableElement;
        const row = th.parentElement as HTMLTableRowElement;
        unpin(table);
        const all = readStore();
        delete all[storeKeyOf(row)];
        writeStore(all);
        e.preventDefault();
        e.stopPropagation();
    };

    /** 새로 그려진 테이블에 저장된 너비 적용 */
    const applySaved = () => {
        const tables = document.querySelectorAll<HTMLTableElement>("table:not([data-tcr-seen])");
        if (!tables.length) return;
        const all = readStore();
        tables.forEach((table) => {
            table.dataset.tcrSeen = "1";
            const row = resizableHeaderRow(table);
            if (!row) return;
            const saved = all[storeKeyOf(row)];
            if (saved && saved.length === row.cells.length) pin(table, row, saved);
        });
    };

    let scanFrame = 0;
    const scheduleScan = () => {
        if (scanFrame) return;
        scanFrame = window.requestAnimationFrame(() => {
            scanFrame = 0;
            applySaved();
        });
    };

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of Array.from(m.addedNodes)) {
                if (node.nodeType !== 1) continue;
                const el = node as Element;
                if (el.tagName === "TABLE" || el.querySelector?.("table")) {
                    scheduleScan();
                    return;
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleScan();

    document.addEventListener("mousedown", onMouseDownCapture, true);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUpCapture, true);
    document.addEventListener("dblclick", onDblClickCapture, true);

    return () => {
        observer.disconnect();
        if (frame) window.cancelAnimationFrame(frame);
        if (scanFrame) window.cancelAnimationFrame(scanFrame);
        setHot(null);
        document.body.classList.remove("tcr-resizing");
        document.removeEventListener("mousedown", onMouseDownCapture, true);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUpCapture, true);
        document.removeEventListener("dblclick", onDblClickCapture, true);
        document.getElementById(STYLE_ID)?.remove();
    };
}

/** 드래그 중인지 — 셀 범위 선택 등 다른 전역 핸들러가 비켜서기 위한 플래그 */
export const isColumnResizing = () => document.body.classList.contains("tcr-resizing");
