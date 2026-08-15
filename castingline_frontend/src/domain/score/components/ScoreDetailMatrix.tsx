import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import styled from "styled-components";
import { useRecoilValue } from "recoil";
import { ActiveTabIdState } from "../../../atom/TabState";
import { AxiosGet, AxiosPatch, AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { PencilSimple, PlusIcon, FloppyDisk } from "@phosphor-icons/react";
import { FareManagerModal } from "./FareManagerModal";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { EmptyState } from "../../../components/common/EmptyState";
import { dedupeLatestAuditoriums, formatAuditoriumLabel } from "../../../utils/auditoriumLabel";

/* ---------------- Styled Components ---------------- */

const TableContainer = styled.div`
    overflow-x: auto;
    background-color: #ffffff;
    min-height: 120px;
    outline: none;
    &::-webkit-scrollbar {
        height: 6px;
    }
    &::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 8px;
    }
`;

const StyledTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    font-family: "SUIT", sans-serif;
    table-layout: fixed;
    th,
    td {
        border: 1px solid #e2e8f0;
        padding: 4px 6px;
        text-align: right;
        height: 28px;
    }
    th {
        background-color: #f8fafc;
        color: #475569;
        font-weight: 700;
        text-align: center;
    }
    td:first-child {
        background-color: #f8fafc;
        font-weight: 700;
        text-align: center;
        width: 70px;
    }
    .total-cell {
        background-color: #f1f5f9;
        font-weight: 800;
        color: #1e293b;
    }
`;

const EditableCell = styled.td<{
    $isSelected: boolean;
    $isHighlight: boolean;
    $hasValue: boolean;
    $isNegative: boolean;
    $isDirty: boolean;
}>`
    cursor: pointer;
    transition: all 0.2s;
    color: ${({ $isNegative, $hasValue, $isDirty }) =>
        $isNegative ? "#dc2626" : $isDirty ? "#b45309" : $hasValue ? "#1e293b" : "#e2e8f0"};
    font-weight: ${({ $hasValue }) => ($hasValue ? "800" : "400")};
    background-color: ${({ $isSelected, $isHighlight, $isNegative, $isDirty }) =>
        $isSelected ? "#bfdbfe" : $isDirty ? "#fffbeb" : $isNegative ? "#fef2f2" : $isHighlight ? "#f1f5f9" : "transparent"};
    border: ${({ $isSelected, $isDirty }) =>
        $isSelected ? "2px solid #2563eb !important" : $isDirty ? "1px solid #d97706" : "1px solid #e2e8f0"};
    &:hover {
        background-color: #bfdbfe;
    }
`;

const InlineInput = styled.input`
    width: 100%;
    height: 100%;
    border: none;
    outline: none;
    background: transparent;
    text-align: right;
    font-size: 11px;
    color: #2563eb;
    font-weight: 900;
`;

const InfoSection = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background-color: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    font-size: 14px;
`;

const InfoBadge = styled.span<{ $type?: "theater" | "movie" | "room" }>`
    font-weight: 700;
    color: #1e293b;
    display: flex;
    align-items: center;
    strong {
        color: ${({ $type }) => ($type === "theater" ? "#2563eb" : $type === "movie" ? "#0f172a" : "#64748b")};
        margin-right: 4px;
    }
    &::after {
        content: "/";
        margin-left: 12px;
        color: #cbd5e1;
        font-weight: 300;
    }
    &:last-child::after {
        display: none;
    }
`;

const AuditoriumSelect = styled.select`
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #cbd5e1;
    font-size: 12px;
    font-weight: 600;
    color: #2563eb;
    background-color: #ffffff;
    cursor: pointer;
    outline: none;
    &:hover {
        border-color: #2563eb;
    }
`;


const ShortcutHint = styled.span`
    font-size: 11px;
    color: #94a3b8;
    font-weight: 500;
`;

/* ---------------- Logic & Types ---------------- */

interface ClientInfo {
    id: number | null;
    client_name: string;
    client_code?: string;
}

interface MovieInfo {
    id: number | null;
    title_ko: string;
    movie_code?: string;
}

interface ScoreItem {
    id: number | null;
    fare: number | string | null;
    show_count?: string;
    visitor: number | string;
    client: ClientInfo;
    movie: MovieInfo;
    auditorium: string;
    auditorium_name: string;
    seat_count?: number | null; // S001: 극장관 정보의 좌석수
    entry_date: string;
    is_order_only?: boolean;
    ids?: number[];
}

interface TheaterItem {
    id: number;
    auditorium: string;
    auditorium_name: string;
    seat_count: number;
    created_date?: string | null;
}

interface Props {
    selectedScore: ScoreItem | null;
    allScores: ScoreItem[];
    setScores: (preserveId?: number) => void;
    setSelectedScore: (score: ScoreItem | null) => void;
}

// dirtyMatrix: fare → show → newValue (로컬에서 편집한 값만 추적)
// null = 빈칸(기존 스코어 삭제), 0 = 명시적 0명 스코어 저장 (A001)
type DirtyMatrix = Record<number, Record<number, number | null>>;

export function ScoreDetailMatrix({ selectedScore, allScores, setScores, setSelectedScore }: Props) {
    const { openModal } = useGlobalModal();
    const toast = useToast();
    // 스코어관리 탭(/manage/manage_score)이 활성(화면에 보이는) 탭인지 판단하기 위한 기준.
    // TabContentArea가 바로 이 값으로 각 탭의 display 여부를 결정하므로 가장 신뢰할 수 있다.
    const activeTabId = useRecoilValue(ActiveTabIdState);

    const [selectedCell, setSelectedCell] = useState<{ fare: number; show: number } | null>(null);
    const [editingCell, setEditingCell] = useState<{ fare: number; show: number } | null>(null);
    const [editValue, setEditValue] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [dynamicFareList, setDynamicFareList] = useState<number[]>([]);
    const [theaterList, setTheaterList] = useState<TheaterItem[]>([]);
    const [dirtyMatrix, setDirtyMatrix] = useState<DirtyMatrix>({});
    const tableContainerRef = useRef<HTMLDivElement>(null);
    // 셀 편집 중 F5/Ctrl+S로 저장 요청 시, 입력값이 dirtyMatrix에 반영(비동기 setState)된
    // 다음 저장하기 위한 플래그. (편집값을 먼저 커밋 → dirtyMatrix 변경 → effect에서 저장)
    const pendingSaveRef = useRef(false);

    const getID = (val: ClientInfo | MovieInfo | null | undefined) => val?.id ?? null;
    const showCounts = useMemo(() => Array.from({ length: 13 }, (_, i) => i), []);

    // selectedScore가 바뀌면 dirty 초기화
    const prevScoreKeyRef = useRef<string>("");
    useEffect(() => {
        const key = selectedScore
            ? `${getID(selectedScore.client)}_${getID(selectedScore.movie)}_${selectedScore.entry_date}_${selectedScore.auditorium}`
            : "";
        if (key !== prevScoreKeyRef.current) {
            prevScoreKeyRef.current = key;
            setDirtyMatrix({});
            setEditingCell(null);
        }
    }, [selectedScore]);

    // 서버 매트릭스 계산
    const { serverMatrix, serverHasRow, filteredScores } = useMemo(() => {
        if (!selectedScore)
            return {
                serverMatrix: {} as Record<number, Record<number, number>>,
                serverHasRow: {} as Record<number, Record<number, boolean>>,
                filteredScores: [] as ScoreItem[],
            };
        const targetClientId = getID(selectedScore.client);
        const targetMovieId = getID(selectedScore.movie);

        const filtered = allScores.filter(
            (s) =>
                getID(s.client) === targetClientId &&
                getID(s.movie) === targetMovieId &&
                s.entry_date === selectedScore.entry_date &&
                s.auditorium === selectedScore.auditorium &&
                s.id !== null
        );

        const m: Record<number, Record<number, number>> = {};
        // 0명 스코어 행도 '값이 있는 칸'으로 표시하기 위한 존재 여부 맵 (A001)
        const has: Record<number, Record<number, boolean>> = {};
        filtered.forEach((score) => {
            const f = Number(score.fare);
            const s = String(score.show_count) === "특회" ? 0 : Number(score.show_count) || 0;
            if (!m[f]) m[f] = {};
            m[f][s] = (m[f][s] || 0) + Number(score.visitor || 0);
            if (!has[f]) has[f] = {};
            has[f][s] = true;
        });
        return { serverMatrix: m, serverHasRow: has, filteredScores: filtered };
    }, [selectedScore, allScores]);

    // 표시용 매트릭스: 서버 + dirty 오버레이
    const displayMatrix = useMemo(() => {
        const result: Record<number, Record<number, number | null>> = {};
        // 서버 데이터 복사
        for (const fare of Object.keys(serverMatrix)) {
            result[Number(fare)] = { ...serverMatrix[Number(fare)] };
        }
        // dirty 오버레이 (null = 빈칸/삭제)
        for (const fare of Object.keys(dirtyMatrix)) {
            if (!result[Number(fare)]) result[Number(fare)] = {};
            for (const show of Object.keys(dirtyMatrix[Number(fare)])) {
                result[Number(fare)][Number(show)] = dirtyMatrix[Number(fare)][Number(show)];
            }
        }
        return result;
    }, [serverMatrix, dirtyMatrix]);

    const isDirty = Object.keys(dirtyMatrix).length > 0;
    const dirtyCount = useMemo(() => {
        let count = 0;
        for (const fare of Object.keys(dirtyMatrix)) {
            count += Object.keys(dirtyMatrix[Number(fare)]).length;
        }
        return count;
    }, [dirtyMatrix]);

    // 극장 정보(관 리스트, 요금 리스트) 페칭
    const clientId = getID(selectedScore?.client);
    const fetchTheatersAndFares = useCallback(async () => {
        if (!clientId) return;
        try {
            const [tRes, fRes] = await Promise.all([
                AxiosGet(`theaters/?client_id=${clientId}`),
                AxiosGet(`fares/?client_id=${clientId}`),
            ]);
            setTheaterList(tRes.data.results || []);
            const fares = Array.from(new Set<number>(
                fRes.data.results
                    .map((f: { fare: string }) => parseInt(f.fare))
                    .filter((v: number) => !isNaN(v))
            )).sort((a, b) => a - b);
            setDynamicFareList(fares);
        } catch (error) {
            toast.error(handleBackendErrors(error));
        }
    }, [clientId]);
    useEffect(() => {
        fetchTheatersAndFares();
    }, [fetchTheatersAndFares]);

    // S001 2-1: 같은 관이 중복 등록돼 있으면 가장 최근에 추가된 관 정보만 쓴다
    const auditoriumOptions = useMemo(() => dedupeLatestAuditoriums(theaterList), [theaterList]);

    // Matrix 행 = 등록된 요금 ∪ 스코어에 실제 존재하는 요금.
    // 요금 목록에서 빠진 요금(예: 요금 삭제 후 남은 스코어)도 행으로 보여야 값이 숨지 않는다 (S001)
    const fareRows = useMemo(() => {
        const set = new Set<number>(dynamicFareList);
        for (const f of Object.keys(serverMatrix)) set.add(Number(f));
        return Array.from(set).sort((a, b) => a - b);
    }, [dynamicFareList, serverMatrix]);

    // 관 변경/추가 드롭다운
    const handleAuditoriumSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const code = e.target.value;
        if (!code || !selectedScore) return;
        const theater = auditoriumOptions.find((t) => t.auditorium === code);
        if (!theater) return;

        setSelectedScore({
            ...selectedScore,
            auditorium: theater.auditorium,
            auditorium_name: theater.auditorium_name,
            seat_count: theater.seat_count,
        });

        if (selectedScore.id) {
            try {
                await AxiosPatch("scores", { auditorium: theater.auditorium }, selectedScore.id);
                setScores(selectedScore.id);
                toast.success("관 정보가 업데이트되었습니다.");
            } catch (err) {
                toast.error(handleBackendErrors(err));
            }
        }
    };

    // 로컬 셀 값 변경 (API 호출 없음)
    const applyLocalEdit = useCallback((cell: { fare: number; show: number }, valueStr: string) => {
        const trimmed = valueStr.trim();
        // 빈칸 = 기존 스코어 삭제(null), "0" = 명시적 0명 스코어 저장 (A001)
        const newVal: number | null = trimmed === "" ? null : Number(trimmed);
        const serverVal = serverMatrix[cell.fare]?.[cell.show] ?? 0;
        const hasRow = !!serverHasRow[cell.fare]?.[cell.show];

        setEditingCell(null);

        const unchanged =
            newVal === null
                ? !hasRow
                : newVal === serverVal && (hasRow || newVal !== 0);

        if (unchanged) {
            // 서버 값과 같으면 dirty에서 제거
            setDirtyMatrix((prev) => {
                const next = { ...prev };
                if (next[cell.fare]) {
                    const { [cell.show]: _, ...rest } = next[cell.fare];
                    if (Object.keys(rest).length === 0) {
                        const { [cell.fare]: __, ...fareRest } = next;
                        return fareRest;
                    }
                    next[cell.fare] = rest;
                }
                return next;
            });
        } else {
            // dirty에 추가
            setDirtyMatrix((prev) => ({
                ...prev,
                [cell.fare]: { ...(prev[cell.fare] || {}), [cell.show]: newVal },
            }));
        }
    }, [serverMatrix, serverHasRow]);

    // 방향키 이동
    const moveSelection = useCallback((direction: string) => {
        if (!selectedCell) return;
        const currentFareIdx = fareRows.indexOf(selectedCell.fare);
        const currentShowIdx = showCounts.indexOf(selectedCell.show);
        let nextFareIdx = currentFareIdx;
        let nextShowIdx = currentShowIdx;

        switch (direction) {
            case "ArrowUp":
                nextFareIdx = Math.max(0, currentFareIdx - 1);
                break;
            case "ArrowDown":
                nextFareIdx = Math.min(fareRows.length - 1, currentFareIdx + 1);
                break;
            case "ArrowLeft":
                nextShowIdx = Math.max(0, currentShowIdx - 1);
                break;
            case "ArrowRight":
                nextShowIdx = Math.min(showCounts.length - 1, currentShowIdx + 1);
                break;
        }
        setSelectedCell({ fare: fareRows[nextFareIdx], show: showCounts[nextShowIdx] });
    }, [fareRows, showCounts, selectedCell]);

    // 일괄 저장 (Ctrl+S / F5)
    const handleBulkSave = useCallback(async () => {
        if (!isDirty || !selectedScore || saving) return;

        const items: any[] = [];
        const deleteIds: number[] = [];

        for (const fareStr of Object.keys(dirtyMatrix)) {
            const fare = Number(fareStr);
            for (const showStr of Object.keys(dirtyMatrix[fare])) {
                const show = Number(showStr);
                const newVal = dirtyMatrix[fare][show];
                const searchShow = show === 0 ? "특회" : String(show).padStart(2, "0");

                // 기존 스코어 찾기
                const existing = filteredScores.find(
                    (s) => Number(s.fare) === fare && (String(s.show_count) === searchShow || Number(s.show_count) === show)
                );

                if (newVal === null) {
                    // 빈칸으로 지운 셀 → 기존 스코어 삭제
                    if (existing?.id) deleteIds.push(existing.id);
                } else {
                    // 0명 포함 저장 — 마지막 상영일 표기용 0명 스코어 반영 (A001)
                    items.push({
                        client: getID(selectedScore.client),
                        movie: getID(selectedScore.movie),
                        auditorium: selectedScore.auditorium,
                        entry_date: selectedScore.entry_date,
                        fare,
                        show_count: searchShow,
                        visitor: newVal,
                    });
                }
            }
        }

        if (items.length === 0 && deleteIds.length === 0) return;

        setSaving(true);
        try {
            const res = await AxiosPost("scores/bulk-save", { items, delete_ids: deleteIds });
            toast.success(res.data.message || "저장되었습니다.");
            setDirtyMatrix({});
            await setScores();
        } catch (err) {
            toast.error(handleBackendErrors(err));
        } finally {
            setSaving(false);
            tableContainerRef.current?.focus();
        }
    }, [isDirty, selectedScore, saving, dirtyMatrix, filteredScores, setScores, toast]);

    // 셀 편집 중 F5/Ctrl+S 저장 요청 처리:
    // applyLocalEdit로 편집값을 dirtyMatrix에 커밋한 뒤(비동기) 이 effect에서 최신값으로 저장.
    useEffect(() => {
        if (pendingSaveRef.current) {
            pendingSaveRef.current = false;
            handleBulkSave();
        }
    }, [dirtyMatrix, handleBulkSave]);

    // 전역 키보드 이벤트
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 비활성 탭에서는 무시: keep-alive로 컴포넌트가 마운트된 채 유지되므로
            // (TabContentArea가 display:none 처리) 다른 탭에서도 이 리스너가 살아있다.
            // 활성 탭 id가 스코어관리 경로일 때만 동작 → 그 탭이 화면에 보일 때만 Ctrl+S / F5 저장.
            if (activeTabId !== "/manage/manage_score") return;

            // Ctrl+S / F5 → 일괄 저장 (셀 인라인 편집 중에도 동작해야 하므로 먼저 처리)
            if ((e.ctrlKey && e.key === "s") || e.key === "F5") {
                e.preventDefault();
                handleBulkSave();
                return;
            }

            // 입력 요소(요금체계 모달의 금액 입력칸 등)에 포커스가 있으면
            // 매트릭스 셀 편집(숫자/방향키 등)이 가로채지 않도록 무시한다.
            const target = e.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.tagName === "SELECT" ||
                    target.isContentEditable)
            ) {
                return;
            }

            if (!selectedCell || editingCell) return;
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                e.preventDefault();
                moveSelection(e.key);
            } else if (/^[0-9\-]$/.test(e.key)) {
                setEditingCell(selectedCell);
                setEditValue(e.key);
            } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                // displayMatrix에 값이 있는 칸만 프리필 (0명 스코어는 "0"으로 — A001)
                const cur = displayMatrix[selectedCell.fare]?.[selectedCell.show];
                setEditingCell(selectedCell);
                setEditValue(cur === undefined || cur === null ? "" : String(cur));
            } else if (e.key === "Backspace" || e.key === "Delete") {
                e.preventDefault();
                // 빈칸 = 기존 스코어 삭제 (0 입력과 구분 — A001)
                applyLocalEdit(selectedCell, "");
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [activeTabId, selectedCell, editingCell, moveSelection, applyLocalEdit, handleBulkSave, displayMatrix]);

    const handleEditFares = () => {
        if (!clientId || !selectedScore) return;
        openModal(
            <FareManagerModal
                clientId={clientId}
                onRefresh={() => {
                    // 요금 추가/삭제 즉시 Matrix 행에 반영 (S001)
                    fetchTheatersAndFares();
                    setScores(selectedScore.id ?? undefined);
                }}
            />, {
            title: "요금 체계 관리",
            width: "600px",
        });
    };

    if (!selectedScore) return <EmptyState>상단 목록에서 스코어를 선택하세요.</EmptyState>;

    return (
        <CommonSectionCard style={{ marginTop: '4px' }}>
            <CommonListHeader
                title="관객수 집계 Matrix"
                actions={
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#475569" }}>
                        {isDirty && (
                            <>
                                <span style={{ color: "#2563eb", fontWeight: 700 }}>
                                    {dirtyCount}건 미저장
                                </span>
                                <CustomIconButton color="blue" onClick={handleBulkSave} disabled={saving} title="일괄 저장">
                                    <FloppyDisk size={16} weight="bold" />
                                </CustomIconButton>
                                <ShortcutHint>Ctrl+S / F5</ShortcutHint>
                            </>
                        )}
                        <PlusIcon size={14} weight="bold" color="#2563eb" />
                        <span>관 추가(선택):</span>
                        <AuditoriumSelect value="" onChange={handleAuditoriumSelect}>
                            <option value="" disabled>
                                관을 선택하세요
                            </option>
                            {auditoriumOptions.map((t) => (
                                <option key={t.id} value={t.auditorium}>
                                    {formatAuditoriumLabel(t.auditorium_name, t.seat_count)}
                                </option>
                            ))}
                        </AuditoriumSelect>
                    </div>
                }
            />

            <InfoSection>
                <InfoBadge $type="theater">
                    <strong>극장</strong> {selectedScore.client?.client_name}
                </InfoBadge>
                <InfoBadge $type="movie">
                    <strong>영화</strong> {selectedScore.movie?.title_ko}
                </InfoBadge>
                {selectedScore.auditorium && (
                    /* S001: 관 표기는 항상 좌석수를 함께 (예: 1관(144석)) */
                    <InfoBadge $type="room">
                        <strong>관</strong>{" "}
                        {formatAuditoriumLabel(
                            selectedScore.auditorium_name || selectedScore.auditorium,
                            selectedScore.seat_count ??
                                auditoriumOptions.find((t) => t.auditorium === selectedScore.auditorium)
                                    ?.seat_count,
                        )}
                    </InfoBadge>
                )}
            </InfoSection>

            <TableContainer ref={tableContainerRef} tabIndex={0}>
                {selectedScore.auditorium ? (
                    <StyledTable>
                        <thead>
                            <tr>
                                <th>
                                    요금
                                    <button
                                        onClick={handleEditFares}
                                        style={{ border: "none", background: "none", cursor: "pointer" }}>
                                        <PencilSimple size={12} />
                                    </button>
                                </th>
                                {showCounts.map((n) => (
                                    <th key={n}>{n === 0 ? "특회" : `${n}회`}</th>
                                ))}
                                <th className="total-cell">합계</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fareRows.map((fare) => {
                                const showMap = displayMatrix[fare] || {};
                                const rowTotal = showCounts.reduce((sum, n) => sum + (showMap[n] || 0), 0);
                                return (
                                    <tr key={fare}>
                                        <td>{fare.toLocaleString()}</td>
                                        {showCounts.map((n) => {
                                            const dirtyVal = dirtyMatrix[fare]?.[n];
                                            const cellIsDirty = dirtyVal !== undefined;
                                            const hasRow = !!serverHasRow[fare]?.[n];
                                            // null = 빈 칸. 0명 스코어(행 존재)는 0으로 표시 (A001)
                                            const cellVal: number | null = cellIsDirty
                                                ? dirtyVal
                                                : hasRow
                                                ? serverMatrix[fare]?.[n] ?? 0
                                                : null;
                                            const val = cellVal ?? 0;
                                            const isEditing = editingCell?.fare === fare && editingCell.show === n;
                                            const isSelected = selectedCell?.fare === fare && selectedCell?.show === n;
                                            return (
                                                <EditableCell
                                                    key={n}
                                                    $isSelected={isSelected}
                                                    $isHighlight={
                                                        selectedCell?.fare === fare || selectedCell?.show === n
                                                    }
                                                    $hasValue={cellVal !== null}
                                                    $isNegative={val < 0}
                                                    $isDirty={cellIsDirty}
                                                    onClick={() => setSelectedCell({ fare, show: n })}
                                                    onDoubleClick={() => {
                                                        setSelectedCell({ fare, show: n });
                                                        setEditingCell({ fare, show: n });
                                                        setEditValue(cellVal !== null ? String(cellVal) : "");
                                                    }}>
                                                    {isEditing ? (
                                                        <InlineInput
                                                            type="text"
                                                            inputMode="numeric"
                                                            value={editValue}
                                                            autoFocus
                                                            onChange={(e) =>
                                                                setEditValue(e.target.value.replace(/[^0-9-]/g, ""))
                                                            }
                                                            onFocus={(e) => e.target.select()}
                                                            onBlur={(e) => {
                                                                applyLocalEdit({ fare, show: n }, e.target.value);
                                                            }}
                                                            onKeyDown={(e) => {
                                                                // window 전역 핸들러로 이벤트 전파 차단 (두 칸 이동 방지)
                                                                e.nativeEvent.stopImmediatePropagation();
                                                                // Ctrl+S / F5 → 현재 입력값을 커밋한 뒤 일괄 저장
                                                                // (전파를 막았으므로 window 핸들러 대신 여기서 직접 처리)
                                                                if ((e.ctrlKey && e.key === "s") || e.key === "F5") {
                                                                    e.preventDefault();
                                                                    applyLocalEdit({ fare, show: n }, editValue);
                                                                    pendingSaveRef.current = true;
                                                                    return;
                                                                }
                                                                if (e.key === "Enter") {
                                                                    e.preventDefault();
                                                                    applyLocalEdit({ fare, show: n }, editValue);
                                                                    setSelectedCell({ fare, show: n });
                                                                    tableContainerRef.current?.focus();
                                                                }
                                                                if (e.key === "Escape") {
                                                                    setEditingCell(null);
                                                                    setSelectedCell({ fare, show: n });
                                                                    tableContainerRef.current?.focus();
                                                                }
                                                                if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                                                                    e.preventDefault();
                                                                    applyLocalEdit({ fare, show: n }, editValue);
                                                                    moveSelection(e.key);
                                                                    tableContainerRef.current?.focus();
                                                                }
                                                                if (e.key === "Tab") {
                                                                    e.preventDefault();
                                                                    applyLocalEdit({ fare, show: n }, editValue);
                                                                    moveSelection(e.shiftKey ? "ArrowLeft" : "ArrowRight");
                                                                    tableContainerRef.current?.focus();
                                                                }
                                                            }}
                                                        />
                                                    ) : cellVal !== null ? (
                                                        val.toLocaleString()
                                                    ) : (
                                                        ""
                                                    )}
                                                </EditableCell>
                                            );
                                        })}
                                        <td className="total-cell">{rowTotal.toLocaleString()}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </StyledTable>
                ) : (
                    <EmptyState>관을 선택하여 스코어 입력을 시작하세요.</EmptyState>
                )}
            </TableContainer>
        </CommonSectionCard>
    );
}
