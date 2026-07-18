import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import styled, { keyframes } from "styled-components";
import {
    MagnifyingGlass,
    DownloadSimple,
    CircleNotch,
    Scales,
    CheckCircle,
    Circle,
    PencilSimple,
    Checks,
    CalendarCheck,
} from "@phosphor-icons/react";
import { AxiosGet, AxiosPost, AxiosDelete } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { useAppAlert } from "../../../atom/alertUtils";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomSelect } from "../../../components/common/CustomSelect";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { GenericTable } from "../../../components/GenericTable";
import { ExcelIconButton } from "../../../components/common/ExcelIconButton";
import dayjs from "dayjs";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { SettlementCompareModal } from "./SettlementCompareModal";

const rotate = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background-color: #f8fafc;
    min-height: 100vh;
    font-family: "SUIT", sans-serif;
`;


const ListSection = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    box-shadow: 
        0 4px 6px -1px rgba(0, 0, 0, 0.1), 
        0 2px 4px -1px rgba(0, 0, 0, 0.06);
    overflow: hidden;
    height: calc(100vh - 160px);
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
const EseroButton = styled.button<{ $tone?: "green" | "blue" | "sky" }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    height: 32px;
    border-radius: 6px;
    font-size: 12.5px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
    ${({ $tone }) =>
        $tone === "green"
            ? "background:#f0fdf4; border:1px solid #86efac; color:#15803d; &:hover:not(:disabled){background:#dcfce7; border-color:#4ade80;}"
            : $tone === "sky"
            ? "background:#f0f9ff; border:1px solid #7dd3fc; color:#0369a1; &:hover:not(:disabled){background:#e0f2fe; border-color:#38bdf8;}"
            : "background:#eff6ff; border:1px solid #93c5fd; color:#1d4ed8; &:hover:not(:disabled){background:#dbeafe; border-color:#60a5fa;}"}
    &:disabled {
        background: #f8fafc;
        border-color: #e2e8f0;
        color: #94a3b8;
        cursor: not-allowed;
    }
    .loading-icon {
        animation: ${rotate} 1s linear infinite;
    }
`;

const TheaterSearchWrapper = styled.div`
    position: relative;
    width: 220px;
    flex-shrink: 0;
`;

const TheaterSearchInput = styled.input`
    width: 100%;
    height: 32px;
    padding: 0 10px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 12px;
    font-family: "SUIT", sans-serif;
    outline: none;
    box-sizing: border-box;
    &:focus {
        border-color: #3b82f6;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
    }
    &::placeholder {
        color: #94a3b8;
    }
`;

const TheaterSuggestionList = styled.ul`
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: #fff;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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
    height: 32px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    background: #eff6ff;
    border: 1px solid #93c5fd;
    border-radius: 4px;
    font-size: 12px;
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
    font-size: 15px;
    line-height: 1;
    padding: 0;
    display: flex;
    align-items: center;
    margin-left: auto;
    &:hover {
        color: #ef4444;
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
    background: ${({ $on }) => ($on ? "#f0fdf4" : "#fff")};
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
    border: 1px solid #c7d2fe;
    border-radius: 4px;
    background: #fff;
    color: #4338ca;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    &:hover {
        background: #eef2ff;
    }
`;

const EditModalBody = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: "SUIT", sans-serif;
    font-size: 13px;
    color: #334155;
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
                border-color: #3b82f6;
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
            color: #fff;
        }
        .cancel {
            border: 1px solid #cbd5e1;
            background: #fff;
            color: #475569;
        }
    }
`;

/** 정산 금액 직접 수정 — 저장 시 수동조정(차액)으로 기록되고 해당 극장은 자동 확인 처리 */
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
    onSaved: () => void;
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

    const save = async () => {
        const ns = num(supply), nv = num(vat);
        if ([ns, nv].some(Number.isNaN)) {
            toast.error("금액을 숫자로 입력해주세요.");
            return;
        }
        const np = ns + nv;
        setSaving(true);
        try {
            await AxiosPost("settlement-adjustments", {
                yyyyMm,
                movie_id: Number(movieId),
                client_code: row["거래처코드"],
                screen_format: row["포맷버킷"] || "",
                supply_delta: ns - (row["공급가액"] || 0),
                vat_delta: nv - (row["부가세"] || 0),
                payout_delta: np - (row["영화사 지급금"] || 0),
                supply_original: row["공급가액"] ?? null,
                vat_original: row["부가세"] ?? null,
                payout_original: row["영화사 지급금"] ?? null,
                note: "정산 관리 직접 수정",
            });
            toast.success("저장했습니다 — '(수동조정)' 행으로 반영되고 확인 처리됩니다.");
            onClose();
            onSaved();
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
                차액이 <b>수동조정</b>으로 저장되며, 해당 극장은 <b>확인 처리</b>됩니다.
            </div>
            <div className="row">
                <label>공급가액</label>
                <input value={supply} onChange={(e) => setSupply(e.target.value)} />
                <span className="orig">계산값 {(row["공급가액"] ?? 0).toLocaleString()}</span>
            </div>
            <div className="row">
                <label>부가세</label>
                <input value={vat} onChange={(e) => setVat(e.target.value)} />
                <span className="orig">계산값 {(row["부가세"] ?? 0).toLocaleString()}</span>
            </div>
            <div className="row">
                <label>영화사 지급금</label>
                <input
                    value={Number.isNaN(payoutCalc) ? "" : payoutCalc.toLocaleString()}
                    disabled
                    title="공급가액 + 부가세 자동 계산"
                />
                <span className="orig">계산값 {(row["영화사 지급금"] ?? 0).toLocaleString()}</span>
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
 *  날짜 확정이 걸린 행이 있으면 일괄 해제 버튼도 제공한다. */
function BulkDateModal({
    yyyyMm,
    movieId,
    rows,
    onSaved,
    onClose,
}: {
    yyyyMm: string;
    movieId: string;
    rows: any[];
    onSaved: () => void;
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
                })),
            });
            const ok = (res.data?.results || []).length;
            const errs = (res.data?.errors || []).length;
            toast.success(
                `${ok}개 행의 날짜(To)를 ${dateTo}로 확정했습니다.` +
                    (errs ? ` (${errs}건 실패)` : "")
            );
            onClose();
            onSaved();
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
                    onSaved();
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
                        style={{ color: "#7c3aed", borderColor: "#ddd6fe" }}
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

export function ManageSettlement() {
    const toast = useToast();
    const { openModal, closeModal } = useGlobalModal();
    const { showAlert } = useAppAlert();
    const [settlements, setSettlements] = useState<any[]>([]);
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
    // 확인여부 필터 (클라이언트측) — 미확인 극장만 추려 월초 확인 작업용
    const [confirmFilter, setConfirmFilter] = useState("전체");
    // 멀티(체인) 필터 (클라이언트측)
    const [multiFilter, setMultiFilter] = useState("전체");

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
                    const list = res.data.results || [];
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
    const fetchSettlements = useCallback(async () => {
        if (!searchParams.movieId) {
            toast.error("조회할 영화를 선택해주세요.");
            return;
        }

        setSettlements([]); // 새 조회 시 이전 데이터 즉시 초기화
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

    // 수동조정 해제 (원래 계산값으로 복구) — 해제 후 재조회
    /** 수동조정 해제 — scope: "date"=날짜 확정만, "amount"=금액 조정만, 없으면 전체 */
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
                    fetchSettlements();
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

    /** 조회된 목록의 미확인 극장 전체 확인 */
    const confirmAll = () => {
        const codes = Array.from(
            new Set(
                settlements
                    .filter((r) => !r.is_subtotal && r["거래처코드"] && !r["확인"])
                    .map((r) => r["거래처코드"])
            )
        );
        if (!codes.length) {
            toast.info("확인 처리할 미확인 극장이 없습니다.");
            return;
        }
        showAlert(
            "전체 확인 처리",
            `조회된 미확인 극장 ${codes.length}곳을 모두 확인 처리하시겠습니까?`,
            "warning",
            async () => {
                try {
                    await AxiosPost("settlement-confirms", {
                        yyyyMm: searchParams.yyyyMm,
                        movie_id: Number(searchParams.movieId),
                        client_codes: codes,
                        confirmed: true,
                    });
                    setSettlements((prev) =>
                        prev.map((r) => (r.is_subtotal ? r : { ...r, 확인: true }))
                    );
                    toast.success(`${codes.length}곳을 확인 처리했습니다.`);
                } catch (e: any) {
                    toast.error(e?.response?.data?.error || "일괄 확인에 실패했습니다.");
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
                onSaved={fetchSettlements}
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
                onSaved={fetchSettlements}
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
                // 금액이 수동조정된 행: 태그 + 금액 조정만 해제 (날짜 확정은 유지)
                if (row.is_adjusted) {
                    return (
                        <span>
                            <span style={{ color: "#7c3aed", fontWeight: 700, fontSize: 11 }}>
                                수동조정
                            </span>
                            {row["조정ID"] && (
                                <button
                                    title="금액 수동조정만 해제 (날짜 확정은 유지)"
                                    style={{
                                        marginLeft: 5,
                                        padding: "1px 6px",
                                        fontSize: 11,
                                        border: "1px solid #ddd6fe",
                                        borderRadius: 4,
                                        background: "#fff",
                                        color: "#7c3aed",
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

    // 데이터에 존재하는 멀티구분 목록 (필터 옵션)
    const multiOptions = useMemo(() => {
        const set = new Set<string>();
        settlements.forEach((r) => {
            if (!r.is_subtotal && r["멀티구분"]) set.add(r["멀티구분"]);
        });
        return ["전체", ...Array.from(set)];
    }, [settlements]);

    // 멀티/확인여부 필터 적용된 표시 목록
    // (확인여부 필터 중엔 소계 행이 맞지 않으므로 숨김, 멀티 필터는 해당 멀티 소계만 유지)
    const displayedSettlements = useMemo(() => {
        let rows = settlements;
        if (multiFilter !== "전체") {
            rows = rows.filter((r) => {
                if (r.is_subtotal) {
                    // 소계 라벨 "[CGV 직영] 합계"의 브랜드가 선택 멀티의 접두면 유지 ("메가"↔"메가박스")
                    const m = /^\[([^\s\]]+)/.exec(String(r["극장명"] || ""));
                    return !!m && multiFilter.startsWith(m[1]);
                }
                return r["멀티구분"] === multiFilter;
            });
        }
        if (confirmFilter !== "전체") {
            rows = rows.filter(
                (r) => !r.is_subtotal && (confirmFilter === "확인" ? r["확인"] : !r["확인"])
            );
        }
        return rows;
    }, [settlements, confirmFilter, multiFilter]);

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
            if (selectedTheater) params.client_id = String(selectedTheater.id);
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
                onSearch={fetchSettlements}
                actions={
                    <>
                        <EseroButton
                            $tone="blue"
                            onClick={() =>
                                openModal(
                                    <BulkDateModal
                                        yyyyMm={searchParams.yyyyMm}
                                        movieId={searchParams.movieId}
                                        rows={displayedSettlements}
                                        onSaved={fetchSettlements}
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
                            onClick={confirmAll}
                            disabled={!settlements.length}
                            title="조회된 목록의 미확인 극장을 전부 확인 처리"
                        >
                            <Checks weight="bold" size={16} />
                            전체 확인
                        </EseroButton>
                        <EseroButton
                            $tone="blue"
                            onClick={() =>
                                openModal(
                                    <SettlementCompareModal yyyyMm={searchParams.yyyyMm} />,
                                    { title: "부금정산서 대사 (직영 엑셀 · 위탁/일반 PDF)", width: "1500px" }
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
                <div style={{ width: "200px" }}>
                    <CustomInput
                        label="부금년월"
                        inputType="month"
                        value={searchParams.yyyyMm}
                        setValue={(v) => {
                            setSearchParams((p: any) => ({ ...p, yyyyMm: v }));
                            setMultiFilter("전체"); // 월 변경 시 멀티 필터 초기화
                            setSettlements([]); // 이전 월 목록이 남아 헷갈리지 않게 비움
                        }}
                        labelWidth="60px"
                    />
                </div>
                <div style={{ width: "300px", position: "relative" }}>
                    <CustomSelect
                        label="영화명"
                        options={movieOptions.map((m) => ({ label: m.title, value: String(m.id) }))}
                        value={searchParams.movieId}
                        onChange={(val) => {
                            setSearchParams((p: any) => ({ ...p, movieId: val }));
                            setMultiFilter("전체"); // 영화 변경 시 멀티 필터 초기화
                            setSettlements([]); // 이전 영화 목록이 남아 헷갈리지 않게 비움 (검색 시 재조회)
                        }}
                        labelWidth="50px"
                        disabled={movieLoading}
                    />
                    {movieLoading && (
                        <div style={{ position: "absolute", right: "32px", top: "8px", zIndex: 5 }}>
                            <Spinner size={16} weight="bold" />
                        </div>
                    )}
                </div>
                <div style={{ width: "250px" }}>
                    <CustomSelect
                        label="조회대상"
                        options={["전체극장", "일반극장", "기금면제극장"]}
                        value={searchParams.target}
                        onChange={(v) => setSearchParams((p: any) => ({ ...p, target: v }))}
                        labelWidth="60px"
                    />
                </div>
                <div style={{ width: "200px" }}>
                    <CustomSelect
                        label="확인여부"
                        options={["전체", "확인", "미확인"]}
                        value={confirmFilter}
                        onChange={setConfirmFilter}
                        labelWidth="60px"
                    />
                </div>
                <div style={{ width: "170px" }}>
                    <CustomSelect
                        label="멀티"
                        options={multiOptions}
                        value={multiFilter}
                        onChange={setMultiFilter}
                        labelWidth="40px"
                    />
                </div>
                <TheaterSearchWrapper ref={theaterWrapperRef}>
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
                            placeholder="SEARCH (극장명)"
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
                <div style={{ height: "calc(100vh - 198px)", overflow: "hidden" }}>
                    <GenericTable
                        headers={headers}
                        data={displayedSettlements}
                        // Key를 더 고유하게 만들어 리액트 엔진의 혼동 방지
                        getRowKey={(item: any, idx: number) =>
                            item.is_subtotal
                                ? `subtotal-${item["극장명"]}-${idx}`
                                : `row-${item["거래처코드"]}-${item["날짜(From)"]}-${idx}`
                        }
                        formatCell={(k: string, v: any, row: any) => {
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
                                            <span style={{ color: "#7c3aed", fontWeight: 700 }}>
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
                                                background: "#fff",
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
                                                    border: "1px solid #ddd6fe",
                                                    borderRadius: 4,
                                                    background: "#fff",
                                                    color: "#7c3aed",
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
                                            <span style={{ color: "#7c3aed", fontWeight: 700 }}>
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
                                        <span style={{ color: "#7c3aed", fontWeight: 700 }}>
                                            수동조정
                                        </span>
                                        {row?.["조정ID"] && (
                                            <button
                                                title="수동조정 해제"
                                                style={{
                                                    marginLeft: 6,
                                                    padding: "1px 6px",
                                                    fontSize: 11,
                                                    border: "1px solid #ddd6fe",
                                                    borderRadius: 4,
                                                    background: "#fff",
                                                    color: "#7c3aed",
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
