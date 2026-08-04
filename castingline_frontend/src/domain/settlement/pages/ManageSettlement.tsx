import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import styled, { keyframes } from "styled-components";
import {
    DownloadSimple,
    CircleNotch,
    Scales,
    CheckCircle,
    Circle,
    PencilSimple,
    Checks,
    CalendarCheck,
    Warning,
    X,
} from "@phosphor-icons/react";
import { AxiosGet, AxiosPost, AxiosDelete } from "../../../axios/Axios";
import { closedTheatersLast } from "../../../utils/theaterSort";
import { useToast } from "../../../components/common/CustomToast";
import { useAppAlert } from "../../../atom/alertUtils";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomSelect } from "../../../components/common/CustomSelect";
import { GenericTable } from "../../../components/GenericTable";
import { ExcelIconButton } from "../../../components/common/ExcelIconButton";
import { TheaterNameToggle } from "../../../components/common/TheaterNameToggle";
import dayjs from "dayjs";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { SettlementCompareModal } from "./SettlementCompareModal";

const rotate = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

// 멀티(체인) 필터 고정 옵션 — Client.theater_kind에 실제 사용되는 값들 (F002)
const KNOWN_MULTI_KINDS = ["CGV", "롯데", "메가박스", "씨네큐", "일반극장", "자동차극장", "프리머스"];

/* Topbar(60)+TabBar(36)=96px 아래 영역에 페이지가 정확히 들어가게 해서
   세로 페이지 스크롤 없이 테이블 가로 스크롤바가 항상 화면에 보이게 한다 (F004) */
const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background-color: #f8fafc;
    height: calc(100vh - 96px);
    box-sizing: border-box;
    overflow: hidden;
    font-family: "SUIT", sans-serif;
`;


const ListSection = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background-color: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    box-shadow:
        0 4px 6px -1px rgba(15, 23, 42, 0.1),
        0 2px 4px -1px rgba(15, 23, 42, 0.06);
    overflow: hidden;
    position: relative;
`;

const LoadingOverlay = styled.div`
    position: absolute;
    top: 48px; /* ListHeader height */
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(255, 255, 255, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
`;

const Spinner = styled(CircleNotch)`
    animation: ${rotate} 1s linear infinite;
    color: #2563eb;
`;
// ... (omitting ListHeader unchanged)

/* 필터바 액션 버튼 — 통일된 소프트 톤 (연한 배경 + 컬러 텍스트) */
const EseroButton = styled.button<{ $tone?: "green" | "blue" | "sky" | "amber" | "red" }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    height: 32px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
    ${({ $tone }) =>
        $tone === "green"
            ? "background:#f0fdf4; border:1px solid #dcfce7; color:#15803d; &:hover:not(:disabled){background:#dcfce7; border-color:#16a34a;}"
            : $tone === "sky"
            ? "background:#eff6ff; border:1px solid #bfdbfe; color:#0369a1; &:hover:not(:disabled){background:#e0f2fe; border-color:#38bdf8;}"
            : $tone === "amber"
            ? "background:#fffbeb; border:1px solid #fde68a; color:#b45309; &:hover:not(:disabled){background:#fde68a; border-color:#f59e0b;}"
            : $tone === "red"
            ? "background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; &:hover:not(:disabled){background:#fecaca; border-color:#ef4444;}"
            : "background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; &:hover:not(:disabled){background:#bfdbfe; border-color:#60a5fa;}"}
    &:disabled {
        background: #f8fafc;
        border-color: #e2e8f0;
        color: #94a3b8;
        cursor: not-allowed;
    }
`;

/* 다른 필터와 같은 칩 모양 (styles/chipStyles.ts 기준).
   position: relative는 아래 추천목록 위치 기준이라 유지합니다. */
const TheaterSearchWrapper = styled.div`
    position: relative;
    width: 220px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    height: 30px;
    padding: 0 10px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #ffffff;
    transition: border-color 0.12s ease;

    &:hover { border-color: #cbd5e1; }
    &:focus-within {
        border-color: #2563eb;
        box-shadow: 0 0 0 3px #eff6ff;
    }

    > .chip-label {
        flex-shrink: 0;
        font-size: 12.5px;
        line-height: 20px;
        color: #64748b;
        padding-right: 8px;
        border-right: 1px solid #e2e8f0;
    }
`;

/* 테두리는 바깥 칩(TheaterSearchWrapper)이 그립니다 */
const TheaterSearchInput = styled.input`
    flex: 1;
    min-width: 0;
    height: 20px;
    padding: 0 0 0 8px;
    border: none;
    background: transparent;
    font-size: 12.5px;
    line-height: 20px;
    font-family: "SUIT", sans-serif;
    color: #0f172a;
    outline: none;
    &::placeholder {
        color: #94a3b8;
    }
`;

const TheaterSuggestionList = styled.ul`
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
    max-height: 200px;
    overflow-y: auto;
    z-index: 100;
    margin: 0;
    padding: 0;
    list-style: none;
`;

const TheaterSuggestionItem = styled.li`
    padding: 8px 12px;
    font-size: 12px;
    color: #1e293b;
    cursor: pointer;
    &:hover {
        background: #eff6ff;
        color: #1d4ed8;
    }
`;

const TheaterChip = styled.div`
    flex: 1;
    min-width: 0;
    height: 20px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 0 0 8px;
    background: transparent;
    border: none;
    font-size: 12.5px;
    line-height: 20px;
    color: #1d4ed8;
    font-weight: 600;
    white-space: nowrap;
    width: 100%;
    box-sizing: border-box;
`;

const ClearBtn = styled.button`
    background: none;
    border: none;
    cursor: pointer;
    color: #94a3b8;
    font-size: 14px;
    line-height: 1;
    padding: 0;
    display: flex;
    align-items: center;
    margin-left: auto;
    &:hover {
        color: #dc2626;
    }
`;

const ConfirmToggle = styled.button<{ $on: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid ${({ $on }) => ($on ? "#16a34a" : "#cbd5e1")};
    background: ${({ $on }) => ($on ? "#f0fdf4" : "#ffffff")};
    color: ${({ $on }) => ($on ? "#16a34a" : "#94a3b8")};
    white-space: nowrap;
    &:hover {
        border-color: ${({ $on }) => ($on ? "#dc2626" : "#16a34a")};
        color: ${({ $on }) => ($on ? "#dc2626" : "#16a34a")};
    }
`;

const EditIconBtn = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 22px;
    padding: 0 7px;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
    background: #ffffff;
    color: #2563eb;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    &:hover {
        background: #eff6ff;
    }
`;

const EditModalBody = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: "SUIT", sans-serif;
    font-size: 13px;
    color: #475569;
    .row {
        display: flex;
        align-items: center;
        gap: 10px;
        label {
            width: 90px;
            font-weight: 600;
            flex-shrink: 0;
        }
        input {
            flex: 1;
            height: 32px;
            padding: 0 10px;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            font-size: 13px;
            text-align: right;
            outline: none;
            &:focus {
                border-color: #2563eb;
            }
            &:disabled {
                background: #f1f5f9;
                color: #475569;
            }
        }
        .orig {
            width: 110px;
            text-align: right;
            color: #94a3b8;
            font-size: 12px;
            flex-shrink: 0;
        }
    }
    .hint {
        font-size: 12px;
        color: #64748b;
    }
    .btns {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        button {
            height: 32px;
            padding: 0 16px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
        }
        .save {
            border: none;
            background: #2563eb;
            color: #ffffff;
        }
        .cancel {
            border: 1px solid #cbd5e1;
            background: #ffffff;
            color: #475569;
        }
    }
`;

/** 정산 금액 직접 수정 — 저장 시 수동조정(차액)으로 기록된다. 확인여부는 바꾸지 않는다 (K002).
 *  저장 응답(조정 레코드)을 onSaved로 넘겨 부모가 재조회 없이 목록에 즉시 반영한다. */
function AmountEditModal({
    yyyyMm,
    movieId,
    row,
    onSaved,
    onClose,
}: {
    yyyyMm: string;
    movieId: string;
    row: any;
    onSaved: (saved: any) => void;
    onClose: () => void;
}) {
    const toast = useToast();
    const [supply, setSupply] = useState(String(row["공급가액"] ?? ""));
    const [vat, setVat] = useState(String(row["부가세"] ?? ""));
    const [saving, setSaving] = useState(false);

    const num = (s: string) => {
        const n = Number(String(s).replace(/,/g, "").trim());
        return Number.isFinite(n) ? Math.round(n) : NaN;
    };

    // 영화사 지급금 = 공급가액 + 부가세 (자동 계산)
    const payoutCalc = num(supply) + num(vat);

    // 조정 전 계산값(base) — 이미 조정된 행을 다시 수정할 때도 델타는 base 기준으로
    // 저장해야 한다 (조정 레코드는 upsert로 델타가 통째로 교체되므로).
    const oldDelta: any = row["조정액"] || {};
    const baseSupply = (row["공급가액"] || 0) - (oldDelta["공급가액"] || 0);
    const baseVat = (row["부가세"] || 0) - (oldDelta["부가세"] || 0);
    const basePayout = (row["영화사 지급금"] || 0) - (oldDelta["영화사 지급금"] || 0);

    const save = async () => {
        const ns = num(supply), nv = num(vat);
        if ([ns, nv].some(Number.isNaN)) {
            toast.error("금액을 숫자로 입력해주세요.");
            return;
        }
        const np = ns + nv;
        setSaving(true);
        try {
            const res = await AxiosPost("settlement-adjustments", {
                yyyyMm,
                movie_id: Number(movieId),
                client_code: row["거래처코드"],
                screen_format: row["포맷버킷"] || "",
                supply_delta: ns - baseSupply,
                vat_delta: nv - baseVat,
                payout_delta: np - basePayout,
                // 원본은 조정 전 계산값 — 서버가 같은 극장·포맷의 여러 행 중
                // 어느 행의 조정인지 이 값으로 식별한다
                supply_original: baseSupply,
                vat_original: baseVat,
                payout_original: basePayout,
                // 행 단위 수정 표시 — 같은 극장·포맷이 부율 차이로 여러 행일 때
                // 다른 행의 조정을 덮어쓰지 않고 행마다 별도 레코드로 저장된다.
                // 재수정이면 이 행의 조정ID로 해당 레코드를 지정한다.
                row_scoped: true,
                adjustment_id:
                    row["조정ID"] ?? row["조정경고"]?.["조정ID"] ?? null,
                note: "정산 관리 직접 수정",
                // 수기 수정은 확인여부를 바꾸지 않는다 (K002)
                auto_confirm: false,
                // 조회 후 부율·스코어가 바뀐 화면에서 수정해도 저장이 유효하도록
                // 서버가 현재 계산값 기준으로 원본/델타를 재계산해 저장한다
                rebase_on_mismatch: true,
            });
            if (res.data?.rebased) {
                toast.success(
                    "저장했습니다 — 조회 후 부율·스코어가 바뀌어 현재 계산값 기준으로 반영했습니다."
                );
            } else {
                toast.success("저장했습니다 — 수동조정으로 반영됩니다. (확인여부는 그대로)");
            }
            onClose();
            onSaved(res.data);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "저장에 실패했습니다.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <EditModalBody>
            <div className="hint">
                {row["극장명"]}
                {row["상영타입"] ? ` · ${row["상영타입"]}` : ""} — 수정 금액은 계산값과의
                차액이 <b>수동조정</b>으로 저장됩니다. (확인여부는 바뀌지 않습니다)
            </div>
            {/* name/inputMode/autoComplete: 크롬 비밀번호 관리자가 이름 없는 텍스트
                인풋 입력 후 모달 닫힘을 '비밀번호 변경'으로 오인해 저장할 때마다
                비밀번호 업데이트 팝업을 띄우는 것 방지 */}
            <div className="row">
                <label>공급가액</label>
                <input
                    name="supply-amount"
                    inputMode="numeric"
                    autoComplete="off"
                    value={supply}
                    onChange={(e) => setSupply(e.target.value)}
                />
                <span className="orig">계산값 {baseSupply.toLocaleString()}</span>
            </div>
            <div className="row">
                <label>부가세</label>
                <input
                    name="vat-amount"
                    inputMode="numeric"
                    autoComplete="off"
                    value={vat}
                    onChange={(e) => setVat(e.target.value)}
                />
                <span className="orig">계산값 {baseVat.toLocaleString()}</span>
            </div>
            <div className="row">
                <label>영화사 지급금</label>
                <input
                    value={Number.isNaN(payoutCalc) ? "" : payoutCalc.toLocaleString()}
                    disabled
                    title="공급가액 + 부가세 자동 계산"
                />
                <span className="orig">계산값 {basePayout.toLocaleString()}</span>
            </div>
            <div className="btns">
                <button className="cancel" onClick={onClose} disabled={saving}>
                    취소
                </button>
                <button className="save" onClick={save} disabled={saving}>
                    {saving ? "저장 중…" : "저장"}
                </button>
            </div>
        </EditModalBody>
    );
}

/** 날짜(To) 수정 — rows가 1개면 해당 행만, 여러 개면 표시된(필터 적용) 행 전체 일괄.
 *  날짜 확정이 걸린 행이 있으면 일괄 해제 버튼도 제공한다.
 *  저장/해제 결과를 부모로 넘겨 재조회 없이 목록에 즉시 반영한다. */
function BulkDateModal({
    yyyyMm,
    movieId,
    rows,
    onSaved,
    onCleared,
    onClose,
}: {
    yyyyMm: string;
    movieId: string;
    rows: any[];
    onSaved: (results: any[]) => void;
    onCleared: (adjIds: number[]) => void;
    onClose: () => void;
}) {
    const toast = useToast();
    const { showAlert } = useAppAlert();
    const single = rows.length === 1;
    const [dateTo, setDateTo] = useState(single ? rows[0]["날짜(To)"] || "" : "");
    const [saving, setSaving] = useState(false);

    // 대상: 소계/총계 제외, 거래처코드 있는 행 — (거래처, 포맷) 단위로 중복 제거
    const targets = useMemo(() => {
        const map = new Map<string, any>();
        rows.forEach((r: any) => {
            if (r.is_subtotal || !r["거래처코드"] || r["지역"] === "전체 총계") return;
            const key = `${r["거래처코드"]}|${r["포맷버킷"] || ""}`;
            if (!map.has(key)) map.set(key, r);
        });
        return Array.from(map.values());
    }, [rows]);

    // 날짜 확정이 걸려있는 조정 ID 목록 (해제용)
    const clearIds = useMemo(() => {
        const ids = new Set<number>();
        targets.forEach((r: any) => {
            const id = r?.["날짜조정"]?.["조정ID"];
            if (id) ids.add(id);
        });
        return Array.from(ids);
    }, [targets]);

    const save = async () => {
        if (!dateTo) {
            toast.error("적용할 날짜를 선택해주세요.");
            return;
        }
        if (!targets.length) {
            toast.error("적용할 극장 행이 없습니다.");
            return;
        }
        setSaving(true);
        try {
            const res = await AxiosPost("settlement-adjustments", {
                yyyyMm,
                items: targets.map((r: any) => ({
                    movie_id: Number(movieId),
                    client_code: r["거래처코드"],
                    screen_format: r["포맷버킷"] || "",
                    date_to: dateTo,
                    date_to_original: r["날짜조정"]?.["원본"] ?? (r["날짜(To)"] || ""),
                    // 수기 수정은 확인여부를 바꾸지 않는다 (K002)
                    auto_confirm: false,
                })),
            });
            const results = res.data?.results || [];
            const errs = (res.data?.errors || []).length;
            toast.success(
                `${results.length}개 행의 날짜(To)를 ${dateTo}로 확정했습니다.` +
                    (errs ? ` (${errs}건 실패)` : "")
            );
            onClose();
            onSaved(results);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "날짜 수정에 실패했습니다.");
        } finally {
            setSaving(false);
        }
    };

    const clearAll = () => {
        if (!clearIds.length) return;
        showAlert(
            "날짜(To) 확정 해제",
            single
                ? `'${rows[0]["극장명"]}'의 날짜(To) 확정을 해제하고 원래 날짜로 복구하시겠습니까? (금액 조정은 유지)`
                : `날짜(To) 확정이 걸린 ${clearIds.length}개 행을 모두 해제하고 원래 날짜로 복구하시겠습니까? (금액 조정은 유지)`,
            "warning",
            async () => {
                setSaving(true);
                try {
                    await Promise.all(
                        clearIds.map((id) =>
                            AxiosDelete(`settlement-adjustments/${id}`, "date")
                        )
                    );
                    toast.success(`${clearIds.length}건의 날짜 확정을 해제했습니다.`);
                    onClose();
                    onCleared(clearIds);
                } catch {
                    toast.error("해제 중 오류가 발생했습니다.");
                } finally {
                    setSaving(false);
                }
            },
            true
        );
    };

    return (
        <EditModalBody>
            <div className="hint">
                {single ? (
                    <>
                        <b>{rows[0]["극장명"]}</b>
                        {rows[0]["상영타입"] ? ` · ${rows[0]["상영타입"]}` : ""} 행의
                        날짜(To)를 확정합니다. 정산 조회·엑셀·이세로에 반영되고, 해당
                        극장은 <b>확인 처리</b>됩니다. (금액 조정은 그대로 유지)
                    </>
                ) : (
                    <>
                        현재 화면에 표시된(필터 적용){" "}
                        <b>{targets.length}개 행(극장×포맷)</b>의 날짜(To)를 지정한
                        날짜로 일괄 확정합니다. 정산 조회·엑셀·이세로에 반영되고, 해당
                        극장은 <b>확인 처리</b>됩니다. (금액 조정은 그대로 유지)
                    </>
                )}
            </div>
            <div className="row">
                <label>날짜(To)</label>
                <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                />
                <span className="orig">
                    {single && rows[0]["날짜조정"]?.["원본"]
                        ? `원래 ${rows[0]["날짜조정"]["원본"]}`
                        : "예: 마지막 상영일"}
                </span>
            </div>
            <div className="btns">
                <button className="cancel" onClick={onClose} disabled={saving}>
                    취소
                </button>
                {clearIds.length > 0 && (
                    <button
                        className="cancel"
                        style={{ color: "#d97706", borderColor: "#fde68a" }}
                        onClick={clearAll}
                        disabled={saving}
                        title="날짜(To) 확정만 원래 날짜로 복구 (금액 조정 유지)"
                    >
                        {single ? "확정 해제" : `확정 일괄 해제 (${clearIds.length})`}
                    </button>
                )}
                <button className="save" onClick={save} disabled={saving}>
                    {saving ? "저장 중…" : single ? "저장" : `${targets.length}개 행에 적용`}
                </button>
            </div>
        </EditModalBody>
    );
}

const StaleModalBody = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: "SUIT", sans-serif;
    font-size: 13px;
    color: #475569;
    .hint {
        font-size: 12px;
        color: #64748b;
    }
    .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 40px 0;
        color: #64748b;
    }
    .empty {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 40px 0;
        color: #15803d;
        font-weight: 600;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        th, td {
            padding: 6px 10px;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
            white-space: nowrap;
        }
        th {
            background: #f8fafc;
            font-weight: 700;
            color: #334155;
        }
        td.num {
            text-align: right;
            font-variant-numeric: tabular-nums;
        }
        .go {
            padding: 2px 10px;
            font-size: 12px;
            font-weight: 700;
            border: 1px solid #bfdbfe;
            border-radius: 4px;
            background: #eff6ff;
            color: #1d4ed8;
            cursor: pointer;
            &:hover { background: #bfdbfe; }
        }
    }
`;

/** '기준 변경'(적용 중지) 상태인 수동 조정 점검 — 선택한 부금년월에 조정이 있는
 *  영화를 서버가 재계산해 깨진 조정만 모아 보여준다. '이동'으로 해당 영화 화면 점프. */
function StaleCheckModal({
    yyyyMm,
    onJump,
}: {
    yyyyMm: string;
    onJump: (yyyyMm: string, movieId: number) => void;
}) {
    const [loading, setLoading] = useState(true);
    const [checked, setChecked] = useState(0);
    const [stale, setStale] = useState<any[]>([]);
    const [error, setError] = useState("");

    useEffect(() => {
        AxiosGet("settlement-adjustments-stale/", { params: { yyyyMm } })
            .then((res) => {
                setChecked(res.data?.checked ?? 0);
                setStale(res.data?.stale ?? []);
            })
            .catch((e) => setError(handleBackendErrors(e)))
            .finally(() => setLoading(false));
    }, [yyyyMm]);

    if (loading)
        return (
            <StaleModalBody>
                <div className="loading">
                    <Spinner size={18} weight="bold" />
                    {yyyyMm}월에 조정이 저장된 영화를 재계산해 점검하는 중…
                </div>
            </StaleModalBody>
        );
    if (error)
        return (
            <StaleModalBody>
                <div className="loading" style={{ color: "#dc2626" }}>{error}</div>
            </StaleModalBody>
        );
    return (
        <StaleModalBody>
            {stale.length === 0 ? (
                <div className="empty">
                    <CheckCircle size={18} weight="fill" />
                    {yyyyMm}월에 기준 변경 상태인 조정이 없습니다. (영화 {checked}개 점검)
                </div>
            ) : (
                <>
                    <div className="hint">
                        조정 후 부율·스코어가 바뀌어 <b>적용이 중지된 조정 {stale.length}건</b>
                        입니다 ({yyyyMm}월, 영화 {checked}개 점검). '이동'을 눌러 해당
                        화면에서 해제하거나 재수정해주세요.
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>영화</th>
                                <th>극장</th>
                                <th>지역</th>
                                <th style={{ textAlign: "right" }}>중지된 조정액(지급금)</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {stale.map((s) => (
                                <tr key={`${s.yyyyMm}-${s.movie_id}-${s.adjustment_id}`}>
                                    <td>{s.movie_title}</td>
                                    <td title={s.client_code}>{s.client_name}</td>
                                    <td>{s.region}</td>
                                    <td className="num" title={s.reason}>
                                        {typeof s.payout_delta === "number"
                                            ? `${s.payout_delta >= 0 ? "+" : ""}${s.payout_delta.toLocaleString()}`
                                            : "-"}
                                    </td>
                                    <td>
                                        <button
                                            className="go"
                                            onClick={() => onJump(s.yyyyMm, s.movie_id)}
                                            title="해당 월·영화 정산 화면으로 이동"
                                        >
                                            이동
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </StaleModalBody>
    );
}

export function ManageSettlement() {
    const toast = useToast();
    const { openModal, closeModal } = useGlobalModal();
    const { showAlert } = useAppAlert();
    const [settlements, setSettlements] = useState<any[]>([]);
    // 클릭한 행 전체 하이라이트 — 어느 칸을 잡았는지 한눈에 보이게 (K003)
    const [selectedRow, setSelectedRow] = useState<any>(null);
    const [movieOptions, setMovieOptions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [movieLoading, setMovieLoading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isEseroDownloading, setIsEseroDownloading] = useState(false);
    const [theaterInput, setTheaterInput] = useState("");
    const [theaterSuggestions, setTheaterSuggestions] = useState<any[]>([]);
    const [showTheaterSuggestions, setShowTheaterSuggestions] = useState(false);
    const [selectedTheater, setSelectedTheater] = useState<{ id: number; client_name: string } | null>(null);
    const theaterWrapperRef = useRef<HTMLDivElement>(null);
    const [searchParams, setSearchParams] = useState({
        yyyyMm: dayjs().subtract(1, "month").format("YYYY-MM"),
        movieId: "",
        target: "전체극장",
    });
    // 배급사별 극장명(극장명 매핑) 표기 토글 — 기본 ON, 영화 배급사 기준 매핑
    // (매핑 없는 극장은 캐스팅라인 극장명 그대로)
    const [useDistName, setUseDistName] = useState(true);

    // 확인여부 필터 (클라이언트측) — 미확인 극장만 추려 월초 확인 작업용
    const [confirmFilter, setConfirmFilter] = useState("전체");
    // 멀티(체인) 필터 (클라이언트측)
    const [multiFilter, setMultiFilter] = useState("전체");
    // 직위(직영/위탁/기타) 구분 필터 (클라이언트측)
    const [classFilter, setClassFilter] = useState("전체");

    useEffect(() => {
        if (theaterInput.length < 1) {
            setTheaterSuggestions([]);
            setShowTheaterSuggestions(false);
            return;
        }
        const timer = setTimeout(() => {
            AxiosGet(`clients/`, {
                params: { ordering: "-operational_status,client_name", search: theaterInput, client_type: "극장" },
            })
                .then((res) => {
                    // (폐관)/(휴관) 극장은 목록 아래로 (S001)
                    const list = closedTheatersLast(
                        res.data.results || [],
                        (t: any) => t.client_name || "",
                        (t: any) => t.operational_status === false
                    );
                    setTheaterSuggestions(list);
                    setShowTheaterSuggestions(list.length > 0);
                })
                .catch(() => {});
        }, 300);
        return () => clearTimeout(timer);
    }, [theaterInput]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (theaterWrapperRef.current && !theaterWrapperRef.current.contains(e.target as Node)) {
                setShowTheaterSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // 기준변경 점검 모달 '이동' 대기 상태 — 영화 전환 후 자동 조회용
    const pendingJumpRef = useRef<{ yyyyMm: string; movieId: string } | null>(null);

    // 1. 년월 변경 시 영화 목록 자동 호출
    const fetchMoviesByMonth = useCallback(async () => {
        setMovieLoading(true);
        try {
            const res = await AxiosGet(`settlement-movies/?yyyyMm=${searchParams.yyyyMm}`);
            setMovieOptions(res.data);
            // 영화 목록이 바뀌면 선택값과 결과 리스트 모두 초기화 (잔상 방지)
            setSearchParams((prev) => ({ ...prev, movieId: "" }));
            setSettlements([]);
        } catch (error: any) {
            setMovieOptions([]);
            setSettlements([]);
        } finally {
            setMovieLoading(false);
        }
    }, [searchParams.yyyyMm]);

    useEffect(() => {
        fetchMoviesByMonth();
    }, [fetchMoviesByMonth]);

    // 2. 최종 정산 조회
    // keepList=true면 기존 목록을 비우지 않고 갱신 — 스크롤 위치가 유지된다.
    const fetchSettlements = useCallback(async (keepList = false) => {
        if (!searchParams.movieId) {
            toast.error("조회할 영화를 선택해주세요.");
            return;
        }

        if (!keepList) setSettlements([]); // 새 조회 시 이전 데이터 즉시 초기화
        setIsLoading(true);

        try {
            // searchParams.target 값이 "전체극장", "일반극장", "기금면제극장"으로 서버에 전달됨
            const params: Record<string, string> = {
                yyyyMm: searchParams.yyyyMm,
                movie_id: searchParams.movieId,
                target: searchParams.target,
            };
            if (selectedTheater) params.client_id = String(selectedTheater.id);
            const res = await AxiosGet(`settlements/`, { params });
            setSettlements(res.data);
        } catch (error: any) {
            toast.error(handleBackendErrors(error));
        } finally {
            setIsLoading(false);
        }
    }, [searchParams, selectedTheater, toast]);

    /** 목록만 다시 불러오기 (스크롤 유지) — 로컬 반영이 불가능한 경우의 폴백 */
    const refreshSettlements = useCallback(() => fetchSettlements(true), [fetchSettlements]);

    // 기준변경 점검 '이동' — 영화 선택 상태가 목표에 도달하면 자동 조회
    useEffect(() => {
        const jump = pendingJumpRef.current;
        if (
            jump &&
            searchParams.yyyyMm === jump.yyyyMm &&
            searchParams.movieId === jump.movieId
        ) {
            pendingJumpRef.current = null;
            fetchSettlements();
        }
    }, [searchParams.yyyyMm, searchParams.movieId, fetchSettlements]);

    /** 기준변경 점검 모달 '이동' — 해당 영화로 전환해 자동 조회 (같은 부금년월).
     *  대상 행이 필터에 가려 안 보이지 않게 극장 검색·필터도 초기화한다. */
    const jumpToStale = useCallback(
        (yyyyMm: string, movieId: number) => {
            closeModal();
            pendingJumpRef.current = { yyyyMm, movieId: String(movieId) };
            setSelectedTheater(null);
            setTheaterInput("");
            setConfirmFilter("전체");
            setMultiFilter("전체");
            setClassFilter("전체");
            setSettlements([]);
            setSearchParams((p) => ({ ...p, movieId: String(movieId), target: "전체극장" }));
        },
        [closeModal]
    );

    const AMOUNT_KEYS = ["공급가액", "부가세", "영화사 지급금"] as const;

    /** 조정이 적용될 행 인덱스 — 백엔드 적용 규칙과 동일:
     *  같은 거래처 중 포맷버킷이 일치하는 행 우선, 없으면 전체에서 지급금 최대 행 */
    const findAdjustTargetIdx = (
        list: any[],
        clientCode: string,
        screenFormat: string,
        saved?: any
    ) => {
        const cands = list
            .map((r, i) => ({ r, i }))
            .filter(
                ({ r }) =>
                    !r.is_subtotal &&
                    !r.is_adjustment &&
                    r["거래처코드"] === clientCode &&
                    typeof r["영화사 지급금"] === "number"
            );
        if (!cands.length) return -1;
        const fmt = screenFormat || "";
        const fmtCands = fmt ? cands.filter(({ r }) => (r["포맷버킷"] || "") === fmt) : [];
        const pool = fmtCands.length ? fmtCands : cands;
        // 같은 극장·포맷이 여러 행일 때는 사용자가 실제로 수정한 행을 찾는다:
        // ① 이미 이 조정이 붙어 있는 행(재수정) ② 저장된 원본 금액과 일치하는 행
        if (saved) {
            const byId = pool.find(({ r }) => r["조정ID"] === saved.id);
            if (byId) return byId.i;
            if (saved.supply_original != null) {
                const byOrig = pool.find(
                    ({ r }) =>
                        r["공급가액"] === saved.supply_original &&
                        r["부가세"] === saved.vat_original &&
                        r["영화사 지급금"] === saved.payout_original
                );
                if (byOrig) return byOrig.i;
            }
        }
        return pool.reduce((best, cur) =>
            cur.r["영화사 지급금"] > best.r["영화사 지급금"] ? cur : best
        ).i;
    };

    /** 행이 속한 섹션의 소계 행 인덱스 (행 뒤 첫 is_subtotal) */
    const findSubtotalIdx = (list: any[], fromIdx: number) => {
        for (let i = fromIdx + 1; i < list.length; i++) {
            if (list[i].is_subtotal) return i;
        }
        return -1;
    };

    /** 금액 수정 저장 결과를 재조회 없이 목록에 즉시 반영 (F001) */
    const applyAmountSavedLocally = (saved: any) => {
        if (saved?.rebased) {
            // 화면 계산값이 낡아 서버가 현재 계산값 기준으로 재기준(rebase)해 저장한
            // 경우 — 화면의 금액 자체가 낡았으므로 서버 기준으로 갱신 (스크롤 유지)
            refreshSettlements();
            return;
        }
        const ti = findAdjustTargetIdx(
            settlements, saved.client_code, saved.screen_format || "", saved
        );
        if (ti < 0) {
            refreshSettlements(); // 대상 행을 못 찾으면 서버 기준으로 갱신
            return;
        }
        setSettlements((prev) => {
            const list = prev.map((r) => ({ ...r }));
            const row = list[ti];
            const oldDelta = row["조정액"] || {};
            const savedDelta: Record<string, number> = {
                공급가액: saved.supply_delta || 0,
                부가세: saved.vat_delta || 0,
                "영화사 지급금": saved.payout_delta || 0,
            };
            const net: Record<string, number> = {};
            AMOUNT_KEYS.forEach((k) => {
                net[k] = savedDelta[k] - (oldDelta[k] || 0);
                if (typeof row[k] === "number") row[k] += net[k];
            });
            const adjusted = AMOUNT_KEYS.some((k) => savedDelta[k] !== 0);
            row.is_adjusted = adjusted;
            row["조정액"] = adjusted ? savedDelta : undefined;
            if (adjusted) row["조정ID"] = saved.id;
            // '기준 변경' 상태였던 조정을 재수정한 경우 — 새 저장이 기존 조정을
            // 대체(업서트)했으므로 경고 태그를 지운다
            row["조정경고"] = undefined;
            const si = findSubtotalIdx(list, ti);
            if (si >= 0) {
                AMOUNT_KEYS.forEach((k) => {
                    list[si][k] = (list[si][k] || 0) + net[k];
                });
            }
            // 수기 수정은 확인여부를 바꾸지 않는다 (K002)
            return list;
        });
    };

    /** 날짜(To) 확정 저장 결과를 재조회 없이 목록에 즉시 반영 (F001) */
    const applyDateSavedLocally = (results: any[]) => {
        if (!results.length) return;
        setSettlements((prev) => {
            const list = prev.map((r) => ({ ...r }));
            results.forEach((saved) => {
                if (!saved?.date_to_override) return;
                const ti = findAdjustTargetIdx(list, saved.client_code, saved.screen_format || "");
                if (ti < 0) return;
                const row = list[ti];
                row["날짜(To)"] = saved.date_to_override;
                row["날짜조정"] = { 원본: saved.date_to_original || "", 조정ID: saved.id };
                // 수기 수정은 확인여부를 바꾸지 않는다 (K002)
            });
            return list;
        });
    };

    /** 날짜(To) 확정 해제 결과를 재조회 없이 반영 — 원본 날짜로 복구 */
    const applyDateClearedLocally = (adjIds: number[]) => {
        const ids = new Set(adjIds);
        // 원본 날짜가 보존되지 않은 행이 있으면 서버 기준으로 갱신 (스크롤 유지)
        const missingOrig = settlements.some(
            (r) =>
                !r.is_subtotal &&
                ids.has(r?.["날짜조정"]?.["조정ID"]) &&
                !r?.["날짜조정"]?.["원본"]
        );
        if (missingOrig) {
            refreshSettlements();
            return;
        }
        setSettlements((prev) =>
            prev.map((r) => {
                if (r.is_subtotal || !ids.has(r?.["날짜조정"]?.["조정ID"])) return r;
                return { ...r, "날짜(To)": r["날짜조정"]["원본"], 날짜조정: undefined };
            })
        );
    };

    /** 부율·스코어 변경으로 적용이 중지된 조정(조정경고) 해제 — 금액은 이미 미적용이라
     *  로컬에서는 경고 표시만 지운다 */
    const handleRemoveStaleAdjustment = (row: any) => {
        const warn = row?.["조정경고"];
        if (!warn?.["조정ID"]) return;
        showAlert(
            "적용 중지된 조정 해제",
            `'${row["극장명"]}'의 금액 수동조정을 해제할까요?\n(부율·스코어 변경으로 현재 적용되지 않은 조정입니다. 필요하면 해제 후 다시 수정해주세요.)`,
            "warning",
            async () => {
                try {
                    await AxiosDelete(`settlement-adjustments/${warn["조정ID"]}`, "amount");
                    toast.success("조정을 해제했습니다. 필요하면 다시 수정해주세요.");
                    setSettlements((prev) =>
                        prev.map((r) =>
                            !r.is_subtotal && r["조정경고"]?.["조정ID"] === warn["조정ID"]
                                ? { ...r, 조정경고: undefined }
                                : r
                        )
                    );
                } catch (e: any) {
                    toast.error(e?.response?.data?.error || "해제에 실패했습니다.");
                }
            },
            true
        );
    };

    /** 수동조정 해제 — scope: "date"=날짜 확정만, "amount"=금액 조정만, 없으면 전체.
     *  해제 결과는 재조회 없이 목록에 즉시 반영 (스크롤 유지, F001) */
    const handleRemoveAdjustment = (row: any, scope?: "date" | "amount") => {
        const adjId = row?.["조정ID"];
        if (!adjId) return;
        const label =
            scope === "date" ? "날짜(To) 확정" : scope === "amount" ? "금액 수동조정" : "수동조정";
        showAlert(
            `${label} 해제`,
            `'${row["극장명"]}'의 ${label}을 해제하고 원래 계산값으로 복구하시겠습니까?`,
            "warning",
            async () => {
                try {
                    if (scope) {
                        await AxiosDelete(`settlement-adjustments/${adjId}`, scope);
                    } else {
                        await AxiosDelete("settlement-adjustments", adjId);
                    }
                    toast.success(`${label}을 해제했습니다.`);
                    if (scope === "date") {
                        applyDateClearedLocally([adjId]);
                        return;
                    }
                    setSettlements((prev) => {
                        const list = prev.map((r) => ({ ...r }));
                        if (scope === "amount") {
                            const ti = list.findIndex(
                                (r) => !r.is_subtotal && r.is_adjusted && r["조정ID"] === adjId
                            );
                            if (ti < 0) return prev;
                            const target = list[ti];
                            const delta = target["조정액"] || {};
                            AMOUNT_KEYS.forEach((k) => {
                                if (typeof target[k] === "number") target[k] -= delta[k] || 0;
                            });
                            const si = findSubtotalIdx(list, ti);
                            if (si >= 0) {
                                AMOUNT_KEYS.forEach((k) => {
                                    list[si][k] = (list[si][k] || 0) - (delta[k] || 0);
                                });
                            }
                            target.is_adjusted = false;
                            target["조정액"] = undefined;
                            target["조정ID"] = undefined;
                            return list;
                        }
                        // scope 없음: 계산 행이 없어 조정만 별도 행(is_adjustment)인 경우 — 행 제거
                        const ti = list.findIndex(
                            (r) => r.is_adjustment && r["조정ID"] === adjId
                        );
                        if (ti < 0) return prev;
                        const removed = list[ti];
                        const si = findSubtotalIdx(list, ti);
                        if (si >= 0) {
                            AMOUNT_KEYS.forEach((k) => {
                                list[si][k] = (list[si][k] || 0) - (removed[k] || 0);
                            });
                        }
                        list.splice(ti, 1);
                        return list;
                    });
                } catch (e: any) {
                    toast.error(e?.response?.data?.error || "해제에 실패했습니다.");
                }
            },
            true
        );
    };

    const handleDownloadEsero = async () => {
        if (!searchParams.movieId) {
            toast.error("조회할 영화를 먼저 선택해주세요.");
            return;
        }

        setIsEseroDownloading(true);
        try {
            const res = await AxiosGet("settlement-esero-export/", {
                params: {
                    yyyyMm: searchParams.yyyyMm,
                    movie_id: searchParams.movieId,
                    target: searchParams.target,
                    // 화면 토글 상태 그대로 — 비고(극장명)에 배급사별 극장명 사용
                    ...(useDistName ? { theater_name: "dist" } : {}),
                },
                responseType: "blob",
            });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement("a");
            link.href = url;

            const movieTitle = movieOptions.find((m) => m.id === searchParams.movieId)?.title || "이세로";
            link.setAttribute("download", `이세로업로드_${movieTitle}_${searchParams.yyyyMm}.xlsx`);

            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success("이세로 엑셀 다운로드가 완료되었습니다.");
        } catch (e) {
            toast.error("엑셀 생성 중 오류가 발생했습니다.");
        } finally {
            setIsEseroDownloading(false);
        }
    };

    /** 극장(거래처) 단위 확인 토글 — 같은 극장의 모든 행에 함께 반영 */
    const toggleConfirm = async (row: any) => {
        const code = row["거래처코드"];
        if (!code || !searchParams.movieId) return;
        const next = !row["확인"];
        try {
            await AxiosPost("settlement-confirms", {
                yyyyMm: searchParams.yyyyMm,
                movie_id: Number(searchParams.movieId),
                client_codes: [code],
                confirmed: next,
            });
            setSettlements((prev) =>
                prev.map((r) =>
                    !r.is_subtotal && r["거래처코드"] === code ? { ...r, 확인: next } : r
                )
            );
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "확인 처리에 실패했습니다.");
        }
    };

    /** 화면에 표시된(멀티/직위/확인여부 필터 적용) 극장 전체 확인/해제 (E003·E004).
     *  필터를 걸어 두면 그 극장들에만 적용된다 — 예) 직위=직영이면 직영만. */
    const bulkConfirm = (confirmed: boolean) => {
        const codes = Array.from(
            new Set(
                displayedSettlements
                    .filter(
                        (r) =>
                            !r.is_subtotal &&
                            r["거래처코드"] &&
                            !!r["확인"] !== confirmed
                    )
                    .map((r) => r["거래처코드"])
            )
        );
        if (!codes.length) {
            toast.info(
                confirmed
                    ? "확인 처리할 미확인 극장이 없습니다."
                    : "해제할 확인 극장이 없습니다."
            );
            return;
        }
        showAlert(
            confirmed ? "전체 확인 처리" : "전체 확인 해제",
            confirmed
                ? `조회된 미확인 극장 ${codes.length}곳을 모두 확인 처리하시겠습니까?`
                : `조회된 극장 ${codes.length}건 확인을 해제할까요?`,
            "warning",
            async () => {
                try {
                    await AxiosPost("settlement-confirms", {
                        yyyyMm: searchParams.yyyyMm,
                        movie_id: Number(searchParams.movieId),
                        client_codes: codes,
                        confirmed,
                    });
                    const codeSet = new Set(codes);
                    setSettlements((prev) =>
                        prev.map((r) =>
                            !r.is_subtotal && codeSet.has(r["거래처코드"])
                                ? { ...r, 확인: confirmed }
                                : r
                        )
                    );
                    toast.success(
                        confirmed
                            ? `${codes.length}곳을 확인 처리했습니다.`
                            : `${codes.length}곳의 확인을 해제했습니다.`
                    );
                } catch (e: any) {
                    toast.error(
                        e?.response?.data?.error ||
                            (confirmed ? "일괄 확인에 실패했습니다." : "일괄 해제에 실패했습니다.")
                    );
                }
            },
            true
        );
    };

    /** 날짜(To) 행별 수정 모달 */
    const openRowDateEdit = (row: any) => {
        openModal(
            <BulkDateModal
                yyyyMm={searchParams.yyyyMm}
                movieId={searchParams.movieId}
                rows={[row]}
                onSaved={applyDateSavedLocally}
                onCleared={applyDateClearedLocally}
                onClose={closeModal}
            />,
            { title: `날짜(To) 수정 — ${row["극장명"]}`, width: "480px" }
        );
    };

    const openAmountEdit = (row: any) => {
        openModal(
            <AmountEditModal
                yyyyMm={searchParams.yyyyMm}
                movieId={searchParams.movieId}
                row={row}
                onClose={closeModal}
                onSaved={applyAmountSavedLocally}
            />,
            { title: `금액 직접 수정 — ${row["극장명"]}`, width: "560px" }
        );
    };

    const headers = [
        { key: "지역", label: "지역", stickyLeft: "0px", width: "60px" },
        { key: "멀티구분", label: "멀티구분", stickyLeft: "60px", width: "80px" },
        { key: "classification", label: "구분", stickyLeft: "140px", width: "60px" },
        { key: "거래처코드(바이포엠만 해당)", label: "거래처코드(바이포엠만 해당)", stickyLeft: "200px", width: "120px" },
        { key: "극장명", label: "극장명", stickyLeft: "320px", width: "120px" },
        { key: "사업자 등록번호", label: "사업자 등록번호" },
        { key: "종사업장번호", label: "종사업장번호" },
        { key: "공급받는자 상호", label: "공급받는자 상호" },
        { key: "공급받는자 성명", label: "공급받는자 성명" },
        { key: "사업장 소재", label: "사업장 소재지" },
        { key: "업태", label: "업태" },
        { key: "업종", label: "업종" },
        { key: "수신자이메일", label: "공급받는자 이메일1" },
        { key: "수신자이메일2", label: "공급받는자 이메일2" },
        { key: "수신자 전화번호", label: "수신자 전화번호" },
        { key: "날짜(From)", label: "날짜(From)" },
        { key: "날짜(To)", label: "날짜(To)" },
        { key: "상영타입", label: "상영타입" },
        { key: "인원", label: "인원" },
        { key: "금액(입장료)", label: "금액(입장료)" },
        { key: "기금제외금액", label: "기금제외금액" },
        { key: "부가세제외금액", label: "부가세제외금액" },
        { key: "부율", label: "부율" },
        { key: "공급가액", label: "공급가액" },
        { key: "부가세", label: "부가세" },
        { key: "영화사 지급금", label: "영화사 지급금" },
        // R002: 확인/수정은 영화사 지급금 우측 맨 끝 (클라이언트 요청)
        {
            key: "확인",
            label: "확인",
            width: "76px",
            renderCell: (_v: any, row: any) => {
                // 수동조정 행(is_adjusted/is_adjustment)도 확인 대상 — 조정했다는 것 자체가 확인
                if (row.is_subtotal || !row["거래처코드"]) return "";
                if (row["지역"] === "전체 총계") return "";
                return (
                    <ConfirmToggle
                        $on={!!row["확인"]}
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleConfirm(row);
                        }}
                        title={
                            row["확인"]
                                ? `확인됨${row["확인자"] ? ` (${row["확인자"]})` : ""} — 클릭 시 해제`
                                : "클릭하여 확인 처리"
                        }
                    >
                        {row["확인"] ? (
                            <>
                                <CheckCircle size={13} weight="fill" /> 확인
                            </>
                        ) : (
                            <>
                                <Circle size={13} /> 미확인
                            </>
                        )}
                    </ConfirmToggle>
                );
            },
        },
        {
            key: "금액수정",
            label: "수정",
            width: "110px",
            renderCell: (_v: any, row: any) => {
                if (
                    row.is_subtotal ||
                    row.is_adjustment ||
                    !row["거래처코드"] ||
                    typeof row["공급가액"] !== "number"
                )
                    return "";
                if (row["지역"] === "전체 총계") return "";
                // 부율·스코어 변경으로 적용이 중지된 조정: 경고 태그 + 해제/재수정 (K002 후속)
                if (row["조정경고"]) {
                    return (
                        <span title={row["조정경고"]["사유"]}>
                            <span style={{ color: "#dc2626", fontWeight: 700, fontSize: 11 }}>
                                ⚠ 기준 변경
                            </span>
                            <button
                                title="적용 중지된 금액 조정 해제 (날짜 확정은 유지)"
                                style={{
                                    marginLeft: 5,
                                    padding: "1px 6px",
                                    fontSize: 11,
                                    border: "1px solid #fecaca",
                                    borderRadius: 4,
                                    background: "#ffffff",
                                    color: "#dc2626",
                                    cursor: "pointer",
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveStaleAdjustment(row);
                                }}
                            >
                                해제
                            </button>
                            <button
                                title="현재 계산값 기준으로 다시 수정 (기존 조정을 대체)"
                                style={{
                                    marginLeft: 4,
                                    padding: "1px 6px",
                                    fontSize: 11,
                                    border: "1px solid #e2e8f0",
                                    borderRadius: 4,
                                    background: "#ffffff",
                                    color: "#475569",
                                    cursor: "pointer",
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openAmountEdit(row);
                                }}
                            >
                                수정
                            </button>
                        </span>
                    );
                }
                // 금액이 수동조정된 행: 태그 + 금액 조정만 해제 (날짜 확정은 유지)
                if (row.is_adjusted) {
                    return (
                        <span>
                            <span style={{ color: "#d97706", fontWeight: 700, fontSize: 11 }}>
                                수동조정
                            </span>
                            {row["조정ID"] && (
                                <button
                                    title="금액 수동조정만 해제 (날짜 확정은 유지)"
                                    style={{
                                        marginLeft: 5,
                                        padding: "1px 6px",
                                        fontSize: 11,
                                        border: "1px solid #fde68a",
                                        borderRadius: 4,
                                        background: "#ffffff",
                                        color: "#d97706",
                                        cursor: "pointer",
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveAdjustment(row, "amount");
                                    }}
                                >
                                    해제
                                </button>
                            )}
                        </span>
                    );
                }
                return (
                    <EditIconBtn
                        onClick={(e) => {
                            e.stopPropagation();
                            openAmountEdit(row);
                        }}
                        title="공급가액/부가세/지급금 직접 수정 (수동조정으로 저장)"
                    >
                        <PencilSimple size={12} /> 수정
                    </EditIconBtn>
                );
            },
        },
    ];

    // 멀티(체인) 필터 옵션 — 조회 전에도 선택할 수 있게 고정 목록을 기본으로 제공하고,
    // 데이터에 있는 그 밖의 멀티구분 값은 추가로 합친다. (F002)
    const multiOptions = useMemo(() => {
        const set = new Set<string>(KNOWN_MULTI_KINDS);
        settlements.forEach((r) => {
            if (!r.is_subtotal && r["멀티구분"]) set.add(r["멀티구분"]);
        });
        return ["전체", ...Array.from(set)];
    }, [settlements]);

    // 헤더 클릭 정렬 (B002) — 정렬 중엔 소계 행이 위치가 맞지 않으므로 숨기고,
    // 같은 헤더를 다시 누르면 오름→내림→해제(서버 기본 정렬+소계 복귀) 순환
    const [sortState, setSortState] = useState<{ key: string | null; dir: "asc" | "desc" }>({
        key: null,
        dir: "asc",
    });
    const handleSortChange = (key: string) => {
        setSortState((prev) => {
            if (prev.key !== key) return { key, dir: "asc" };
            if (prev.dir === "asc") return { key, dir: "desc" };
            return { key: null, dir: "asc" };
        });
    };

    // 멀티/확인여부 필터 적용된 표시 목록
    // (확인여부 필터 중엔 소계 행이 맞지 않으므로 숨김, 멀티 필터는 해당 멀티 소계만 유지)
    const displayedSettlements = useMemo(() => {
        let rows = settlements;
        if (multiFilter && multiFilter !== "전체") {
            rows = rows.filter((r) => {
                if (r.is_subtotal) {
                    // 소계 라벨 "[CGV 직영] 합계"의 브랜드가 선택 멀티의 접두면 유지 ("메가"↔"메가박스")
                    const m = /^\[([^\s\]]+)/.exec(String(r["극장명"] || ""));
                    return !!m && multiFilter.startsWith(m[1]);
                }
                return r["멀티구분"] === multiFilter;
            });
        }
        if (classFilter && classFilter !== "전체") {
            rows = rows.filter((r) => {
                if (r.is_subtotal) {
                    // 소계 라벨 "[CGV 직영] 합계"의 구분이 선택값과 같으면 유지
                    const m = /^\[[^\s\]]+\s+([^\]]+)\]/.exec(String(r["극장명"] || ""));
                    return !!m && m[1].trim() === classFilter;
                }
                return r.classification === classFilter;
            });
        }
        if (confirmFilter === "확인" || confirmFilter === "미확인") {
            rows = rows.filter(
                (r) => !r.is_subtotal && (confirmFilter === "확인" ? r["확인"] : !r["확인"])
            );
        }
        if (sortState.key) {
            const k = sortState.key;
            const dirMul = sortState.dir === "asc" ? 1 : -1;
            rows = rows
                .filter((r) => !r.is_subtotal)
                .slice()
                .sort((a, b) => {
                    const av = a[k], bv = b[k];
                    if (av == null && bv == null) return 0;
                    if (av == null) return 1; // 빈 값은 항상 뒤로
                    if (bv == null) return -1;
                    if (typeof av === "number" && typeof bv === "number") {
                        return (av - bv) * dirMul;
                    }
                    return String(av).localeCompare(String(bv), "ko") * dirMul;
                });
        }
        return rows;
    }, [settlements, confirmFilter, multiFilter, classFilter, sortState]);

    const summaryData = useMemo(() => {
        // 합계 계산 시 소계 행(is_subtotal)은 제외
        const rawData = displayedSettlements.filter((s) => !s.is_subtotal);
        if (!rawData.length) return null;
        const sums = rawData.reduce(
            (acc: any, cur: any) => {
                acc["인원"] += cur["인원"] || 0;
                acc["금액(입장료)"] += cur["금액(입장료)"] || 0;
                acc["기금제외금액"] += cur["기금제외금액"] || 0;
                acc["부가세제외금액"] += cur["부가세제외금액"] || 0;
                acc["공급가액"] += cur["공급가액"] || 0;
                acc["부가세"] += cur["부가세"] || 0;
                acc["영화사 지급금"] += cur["영화사 지급금"] || 0;
                return acc;
            },
            {
                인원: 0,
                "금액(입장료)": 0,
                기금제외금액: 0,
                부가세제외금액: 0,
                공급가액: 0,
                부가세: 0,
                "영화사 지급금": 0,
            },
        );
        return { ...sums, 지역: "전체 총계" };
    }, [displayedSettlements]);
    const handleDownloadExcel = async () => {
        if (!searchParams.movieId) {
            toast.error("조회할 영화를 먼저 선택해주세요.");
            return;
        }

        setIsDownloading(true);
        try {
            // 화면에 걸린 필터(확인여부/극장) 그대로 내려받기
            const params: Record<string, string> = {
                yyyyMm: searchParams.yyyyMm,
                movie_id: searchParams.movieId,
                target: searchParams.target,
            };
            if (confirmFilter !== "전체") params.confirm = confirmFilter;
            if (multiFilter !== "전체") params.multi = multiFilter;
            if (classFilter !== "전체") params.classification = classFilter;
            if (selectedTheater) params.client_id = String(selectedTheater.id);
            // 화면 토글 상태 그대로 — 극장명 컬럼에 배급사별 극장명 사용
            if (useDistName) params.theater_name = "dist";
            const res = await AxiosGet("settlement-excel-export/", {
                params,
                responseType: "blob",
            });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement("a");
            link.href = url;

            const movieTitle = movieOptions.find((m) => m.id === searchParams.movieId)?.title || "정산내역";
            const suffix =
                (multiFilter !== "전체" ? `_${multiFilter}` : "") +
                (classFilter !== "전체" ? `_${classFilter}` : "") +
                (confirmFilter !== "전체" ? `_${confirmFilter}` : "");
            link.setAttribute("download", `부금정산_${movieTitle}_${searchParams.yyyyMm}${suffix}.xlsx`);

            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success("엑셀 다운로드가 완료되었습니다.");
        } catch (e) {
            toast.error("엑셀 생성 중 오류가 발생했습니다.");
        } finally {
            setIsDownloading(false);
        }
    };
    return (
        <PageContainer>
            <CommonFilterBar
                wrap
                onSearch={() => fetchSettlements()}
                actions={
                    <>
                        <TheaterNameToggle useDistName={useDistName} onChange={setUseDistName} />
                        <EseroButton
                            $tone="blue"
                            onClick={() =>
                                openModal(
                                    <BulkDateModal
                                        yyyyMm={searchParams.yyyyMm}
                                        movieId={searchParams.movieId}
                                        rows={displayedSettlements}
                                        onSaved={applyDateSavedLocally}
                                        onCleared={applyDateClearedLocally}
                                        onClose={closeModal}
                                    />,
                                    { title: "날짜(To) 일괄 수정", width: "480px" }
                                )
                            }
                            disabled={!settlements.length || !searchParams.movieId}
                            title="현재 표시된(필터 적용) 극장 행 전체의 날짜(To)를 지정 날짜로 확정"
                        >
                            <CalendarCheck weight="bold" size={16} />
                            날짜 일괄수정
                        </EseroButton>
                        <EseroButton
                            $tone="green"
                            onClick={() => bulkConfirm(true)}
                            disabled={!settlements.length}
                            title="현재 표시된(필터 적용) 목록의 미확인 극장을 전부 확인 처리"
                        >
                            <Checks weight="bold" size={16} />
                            전체 확인
                        </EseroButton>
                        <EseroButton
                            $tone="red"
                            onClick={() => bulkConfirm(false)}
                            disabled={!settlements.length}
                            title="현재 표시된(필터 적용) 목록의 확인 극장을 전부 확인 해제"
                        >
                            <X weight="bold" size={16} />
                            전체 해제
                        </EseroButton>
                        <EseroButton
                            $tone="amber"
                            onClick={() =>
                                openModal(
                                    <StaleCheckModal
                                        yyyyMm={searchParams.yyyyMm}
                                        onJump={jumpToStale}
                                    />,
                                    {
                                        title: `기준 변경 조정 점검 (${searchParams.yyyyMm})`,
                                        width: "700px",
                                    }
                                )
                            }
                            title="선택한 부금년월에서 부율·스코어 변경으로 적용이 중지된(기준 변경) 조정을 한 번에 점검"
                        >
                            <Warning weight="bold" size={16} />
                            기준변경 점검
                        </EseroButton>
                        <EseroButton
                            $tone="blue"
                            onClick={() =>
                                openModal(
                                    <SettlementCompareModal yyyyMm={searchParams.yyyyMm} />,
                                    {
                                        title: "부금정산서 대사 (직영 엑셀 · 위탁/일반 PDF)",
                                        width: "1500px",
                                        // 대사 작업 중 바깥을 클릭해도 작업 내용이 사라지지 않게 (B001)
                                        disableBackdropClose: true,
                                    }
                                )
                            }
                            title="부금정산서 파일과 화면 데이터 비교 (직영 엑셀 + 위탁/일반극장 PDF, 파일 내 전체 영화 자동 대사)"
                        >
                            <Scales weight="bold" size={16} />
                            부금 대사
                        </EseroButton>
                        <EseroButton $tone="sky" onClick={handleDownloadEsero} disabled={isEseroDownloading}>
                            {isEseroDownloading ? (
                                <CircleNotch size={16} weight="bold" className="loading-icon" />
                            ) : (
                                <DownloadSimple weight="bold" size={16} />
                            )}
                            이세로 다운로드
                        </EseroButton>
                        <ExcelIconButton
                            onClick={handleDownloadExcel}
                            isLoading={isDownloading}
                            title="정산 내역 엑셀 다운로드"
                        />
                    </>
                }
            >
                <div>
                    <CustomInput
                        label="부금년월"
                        inputType="month"
                        value={searchParams.yyyyMm}
                        setValue={(v) => {
                            setSearchParams((p: any) => ({ ...p, yyyyMm: v }));
                            setSettlements([]); // 이전 월 목록이 남아 헷갈리지 않게 비움
                        }}
                        labelWidth="60px"
                    />
                </div>
                <div style={{position: "relative" }}>
                    <CustomSelect
                        label="영화명"
                        options={movieOptions.map((m) => ({ label: m.title, value: String(m.id) }))}
                        value={searchParams.movieId}
                        onChange={(val) => {
                            setSearchParams((p: any) => ({ ...p, movieId: val }));
                            setSettlements([]); // 이전 영화 목록이 남아 헷갈리지 않게 비움 (검색 시 재조회)
                        }}
                        labelWidth="50px"
                        disabled={movieLoading}
                        chipValueMinWidth={200}
                    />
                    {movieLoading && (
                        <div style={{ position: "absolute", right: "32px", top: "8px", zIndex: 5 }}>
                            <Spinner size={16} weight="bold" />
                        </div>
                    )}
                </div>
                <div>
                    <CustomSelect
                        label="조회대상"
                        options={["전체극장", "일반극장", "기금면제극장"]}
                        value={searchParams.target}
                        onChange={(v) => setSearchParams((p: any) => ({ ...p, target: v }))}
                        labelWidth="60px"
                        allowClear={false}
                    />
                </div>
                <div>
                    <CustomSelect
                        label="확인여부"
                        options={["전체", "확인", "미확인"]}
                        value={confirmFilter}
                        onChange={setConfirmFilter}
                        labelWidth="60px"
                        allowClear={false}
                    />
                </div>
                <div>
                    <CustomSelect
                        label="멀티"
                        options={multiOptions}
                        value={multiFilter}
                        onChange={setMultiFilter}
                        labelWidth="40px"
                        allowClear={false}
                    />
                </div>
                <div>
                    <CustomSelect
                        label="직위"
                        options={["전체", "직영", "위탁", "기타"]}
                        value={classFilter}
                        onChange={setClassFilter}
                        labelWidth="40px"
                        allowClear={false}
                    />
                </div>
                <TheaterSearchWrapper ref={theaterWrapperRef}>
                    <span className="chip-label">극장명</span>
                    {selectedTheater ? (
                        <TheaterChip>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                {selectedTheater.client_name}
                            </span>
                            <ClearBtn
                                onClick={() => {
                                    setSelectedTheater(null);
                                    setTheaterInput("");
                                }}
                                title="극장 선택 해제"
                            >
                                ×
                            </ClearBtn>
                        </TheaterChip>
                    ) : (
                        <TheaterSearchInput
                            placeholder="극장 검색"
                            name="theater-search"
                            autoComplete="off"
                            value={theaterInput}
                            onChange={(e) => setTheaterInput(e.target.value)}
                            onFocus={() => {
                                if (theaterSuggestions.length > 0) setShowTheaterSuggestions(true);
                            }}
                        />
                    )}
                    {showTheaterSuggestions && (
                        <TheaterSuggestionList>
                            {theaterSuggestions.map((t) => (
                                <TheaterSuggestionItem
                                    key={t.id}
                                    onMouseDown={() => {
                                        setSelectedTheater({ id: t.id, client_name: t.client_name });
                                        setTheaterInput("");
                                        setShowTheaterSuggestions(false);
                                    }}
                                >
                                    {t.client_name}
                                </TheaterSuggestionItem>
                            ))}
                        </TheaterSuggestionList>
                    )}
                </TheaterSearchWrapper>
            </CommonFilterBar>

            <ListSection>
            <CommonListHeader title="월간 부금 정산 관리 내역" />
                {isLoading && (
                    <LoadingOverlay>
                        <Spinner size={40} weight="bold" />
                    </LoadingOverlay>
                )}
                <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                    <GenericTable
                        headers={headers}
                        data={displayedSettlements}
                        // 한 페이지에 전체가 나오는 구조라 하단 페이지네이션은 숨긴다
                        hidePagination
                        // 헤더 클릭 정렬은 부모(sortState)가 담당 — 정렬 중엔 소계를
                        // 숨기고, 해제하면 서버 기본 정렬+소계로 복귀 (B002)
                        onSortChange={handleSortChange}
                        sortKey={sortState.key}
                        sortOrder={sortState.dir}
                        // 행 클릭 시 줄 전체 하이라이트, 같은 행 다시 클릭하면 해제 (K003)
                        selectedItem={selectedRow}
                        onSelectItem={(item: any) => {
                            if (item?.is_subtotal) return;
                            setSelectedRow((prev: any) => (prev === item ? null : item));
                        }}
                        // Key를 더 고유하게 만들어 리액트 엔진의 혼동 방지
                        getRowKey={(item: any, idx: number) =>
                            item.is_subtotal
                                ? `subtotal-${item["극장명"]}-${idx}`
                                : `row-${item["거래처코드"]}-${item["날짜(From)"]}-${idx}`
                        }
                        formatCell={(k: string, v: any, row: any) => {
                            // 극장명: 배급사별 극장명 토글 ON이면 영화 배급사의 매핑명 표시.
                            // 매핑 미등록 극장은 빨간 '미등록관' 배지로 알린다
                            if (
                                k === "극장명" &&
                                useDistName &&
                                !row?.is_subtotal &&
                                row?.["거래처코드"]
                            ) {
                                if (row["배급사별 극장명"]) return row["배급사별 극장명"];
                                return (
                                    <span>
                                        {v}
                                        <span
                                            style={{
                                                marginLeft: 4,
                                                color: "#dc2626",
                                                fontSize: 11,
                                                fontWeight: 700,
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            미등록관
                                        </span>
                                    </span>
                                );
                            }
                            // 날짜(To) 셀: 확정된 행은 보라 표시+해제, 모든 행에서 ✏로 개별 수정
                            if (
                                k === "날짜(To)" &&
                                !row?.is_subtotal &&
                                !row?.is_adjustment &&
                                row?.["거래처코드"] &&
                                row?.["지역"] !== "전체 총계"
                            ) {
                                const dc = row["날짜조정"];
                                return (
                                    <span
                                        style={{ whiteSpace: "nowrap" }}
                                        title={
                                            dc
                                                ? `확정된 날짜(To)${
                                                      dc["원본"] ? ` — 원래 ${dc["원본"]}` : ""
                                                  }`
                                                : undefined
                                        }
                                    >
                                        {dc ? (
                                            <span style={{ color: "#d97706", fontWeight: 700 }}>
                                                {v}
                                            </span>
                                        ) : (
                                            v ?? "-"
                                        )}
                                        <button
                                            title="날짜(To) 수정 (이 행만)"
                                            style={{
                                                marginLeft: 5,
                                                padding: "1px 4px",
                                                fontSize: 11,
                                                border: "1px solid #e2e8f0",
                                                borderRadius: 4,
                                                background: "#ffffff",
                                                color: "#64748b",
                                                cursor: "pointer",
                                                verticalAlign: "middle",
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openRowDateEdit(row);
                                            }}
                                        >
                                            <PencilSimple size={11} />
                                        </button>
                                        {dc?.["조정ID"] && (
                                            <button
                                                title="날짜(To) 확정만 해제 (금액 조정은 유지)"
                                                style={{
                                                    marginLeft: 4,
                                                    padding: "1px 6px",
                                                    fontSize: 11,
                                                    border: "1px solid #fde68a",
                                                    borderRadius: 4,
                                                    background: "#ffffff",
                                                    color: "#d97706",
                                                    cursor: "pointer",
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemoveAdjustment(
                                                        { ...row, 조정ID: dc["조정ID"] },
                                                        "date"
                                                    );
                                                }}
                                            >
                                                해제
                                            </button>
                                        )}
                                    </span>
                                );
                            }
                            // 수동조정 행: 조정액을 보라색으로 함께 표시
                            const delta = row?.["조정액"]?.[k];
                            if (typeof v === "number" && k !== "부율") {
                                if (delta) {
                                    return (
                                        <span>
                                            {v.toLocaleString()}{" "}
                                            <span style={{ color: "#d97706", fontWeight: 700 }}>
                                                ({delta > 0 ? "+" : ""}
                                                {delta.toLocaleString()})
                                            </span>
                                        </span>
                                    );
                                }
                                return v.toLocaleString();
                            }
                            // 계산 행이 없어 조정만 별도 행으로 표시된 경우 (스코어 삭제 등)
                            if (
                                k === "상영타입" &&
                                row?.is_adjustment &&
                                typeof v === "string"
                            ) {
                                return (
                                    <span>
                                        <span style={{ color: "#d97706", fontWeight: 700 }}>
                                            수동조정
                                        </span>
                                        {row?.["조정ID"] && (
                                            <button
                                                title="수동조정 해제"
                                                style={{
                                                    marginLeft: 6,
                                                    padding: "1px 6px",
                                                    fontSize: 11,
                                                    border: "1px solid #fde68a",
                                                    borderRadius: 4,
                                                    background: "#ffffff",
                                                    color: "#d97706",
                                                    cursor: "pointer",
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemoveAdjustment(row);
                                                }}
                                            >
                                                해제
                                            </button>
                                        )}
                                    </span>
                                );
                            }
                            return v ?? "-";
                        }}
                        summaryData={summaryData}
                        getRowHighlight={(row: any) => row.is_subtotal} // 합계 행 색상 구분
                        page={1}
                        pageSize={1000}
                        totalCount={displayedSettlements.length}
                        onPageChange={() => {}}
                    />
                </div>
            </ListSection>
        </PageContainer>
    );
}
