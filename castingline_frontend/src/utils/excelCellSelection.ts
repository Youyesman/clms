/**
 * 엑셀식 테이블 셀 범위 선택 (E001)
 *
 * 모든 페이지의 <table>에서 드래그 시 브라우저 기본 텍스트 선택(행 전체가 딸려오는)
 * 대신, 엑셀처럼 시작 셀 기준 사각형 범위만 선택되도록 한다. 헤더(th) 행 포함.
 * Ctrl/Cmd+C 로 선택 범위를 탭 구분 텍스트(TSV)로 복사 — 엑셀에 그대로 붙여넣기 가능.
 *
 * - 버튼/링크/입력요소 위에서 시작한 드래그는 건드리지 않음 (기존 동작 유지)
 * - 여러 셀을 드래그한 직후의 click 이벤트는 무시 (행 클릭 액션 오발동 방지)
 * - Escape 또는 테이블 밖 클릭 시 선택 해제
 */

const SEL_CLASS = "xls-cell-sel";
const STYLE_ID = "xls-cell-selection-style";

const INTERACTIVE =
    'button, a, input, select, textarea, label, [contenteditable="true"], [role="button"]';

export function initExcelCellSelection(): () => void {
    // 하이라이트 스타일 주입 (1회)
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            td.${SEL_CLASS}, th.${SEL_CLASS} {
                background-color: rgba(37, 99, 235, 0.18) !important;
                box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.35);
            }
        `;
        document.head.appendChild(style);
    }

    let anchorTable: HTMLTableElement | null = null;
    let anchorR = 0;
    let anchorC = 0;
    let selecting = false;
    let dragged = false; // 시작 셀 밖으로 드래그했는지 (click 억제용)
    let selected: HTMLTableCellElement[] = [];

    const clearSelection = () => {
        selected.forEach((el) => el.classList.remove(SEL_CLASS));
        selected = [];
    };

    const cellPos = (cell: HTMLTableCellElement) => ({
        r: (cell.parentElement as HTMLTableRowElement).rowIndex,
        c: cell.cellIndex,
    });

    const applyRect = (r2: number, c2: number) => {
        if (!anchorTable) return;
        clearSelection();
        const rA = Math.min(anchorR, r2);
        const rB = Math.max(anchorR, r2);
        const cA = Math.min(anchorC, c2);
        const cB = Math.max(anchorC, c2);
        const rows = anchorTable.rows;
        for (let i = rA; i <= rB && i < rows.length; i++) {
            const cells = rows[i].cells;
            for (let j = cA; j <= cB && j < cells.length; j++) {
                cells[j].classList.add(SEL_CLASS);
                selected.push(cells[j]);
            }
        }
    };

    const buildTsv = () => {
        const byRow = new Map<number, HTMLTableCellElement[]>();
        selected.forEach((cell) => {
            const r = (cell.parentElement as HTMLTableRowElement).rowIndex;
            if (!byRow.has(r)) byRow.set(r, []);
            byRow.get(r)!.push(cell);
        });
        return Array.from(byRow.keys())
            .sort((a, b) => a - b)
            .map((r) =>
                byRow
                    .get(r)!
                    .sort((a, b) => a.cellIndex - b.cellIndex)
                    .map((cell) => (cell.innerText || "").replace(/\s+/g, " ").trim())
                    .join("\t")
            )
            .join("\n");
    };

    const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        // 버튼/입력 등 상호작용 요소는 기존 동작 유지
        if (target.closest(INTERACTIVE)) {
            clearSelection();
            anchorTable = null;
            return;
        }
        const cell = target.closest("td, th") as HTMLTableCellElement | null;
        if (!cell) {
            // 테이블 밖 클릭 → 선택 해제
            clearSelection();
            anchorTable = null;
            return;
        }
        const table = cell.closest("table");
        if (!table) return;
        e.preventDefault(); // 브라우저 기본 텍스트 선택(행 전체 드래그) 방지
        window.getSelection()?.removeAllRanges();
        anchorTable = table as HTMLTableElement;
        const p = cellPos(cell);
        anchorR = p.r;
        anchorC = p.c;
        selecting = true;
        dragged = false;
        applyRect(p.r, p.c);
    };

    const onMouseOver = (e: MouseEvent) => {
        if (!selecting || !anchorTable) return;
        const cell = (e.target as HTMLElement).closest(
            "td, th"
        ) as HTMLTableCellElement | null;
        if (!cell || cell.closest("table") !== anchorTable) return;
        const p = cellPos(cell);
        if (p.r !== anchorR || p.c !== anchorC) dragged = true;
        applyRect(p.r, p.c);
    };

    const onMouseUp = () => {
        if (selecting && dragged) {
            // 드래그 선택 직후의 click은 행 클릭 액션(상세 열기 등)으로 새지 않게 차단
            const swallow = (ev: MouseEvent) => {
                ev.stopPropagation();
                ev.preventDefault();
            };
            document.addEventListener("click", swallow, { capture: true, once: true });
            // 클릭이 발생하지 않는 경우(드래그 후 포커스 이동 등) 핸들러 잔류 방지
            setTimeout(
                () => document.removeEventListener("click", swallow, { capture: true } as any),
                0
            );
        }
        selecting = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            clearSelection();
            anchorTable = null;
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selected.length) {
            // 입력요소에 포커스가 있으면 기본 복사 동작 유지
            const ae = document.activeElement;
            if (
                ae &&
                (ae.tagName === "INPUT" ||
                    ae.tagName === "TEXTAREA" ||
                    (ae as HTMLElement).isContentEditable)
            )
                return;
            e.preventDefault();
            const tsv = buildTsv();
            if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(tsv);
            } else {
                // 구형 폴백
                const ta = document.createElement("textarea");
                ta.value = tsv;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                ta.remove();
            }
        }
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);

    return () => {
        clearSelection();
        document.removeEventListener("mousedown", onMouseDown);
        document.removeEventListener("mouseover", onMouseOver);
        document.removeEventListener("mouseup", onMouseUp);
        document.removeEventListener("keydown", onKeyDown);
        document.getElementById(STYLE_ID)?.remove();
    };
}
