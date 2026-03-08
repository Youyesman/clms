import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import styled from "styled-components";
import { AxiosGet, AxiosPatch, AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { PencilSimple, PlusIcon, FloppyDisk } from "@phosphor-icons/react";
import { FareManagerModal } from "./FareManagerModal";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";
import { CustomIconButton } from "../../../components/common/CustomIconButton";

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
        border-radius: 10px;
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
        $isNegative ? "#ef4444" : $isDirty ? "#b45309" : $hasValue ? "#1e293b" : "#e2e8f0"};
    font-weight: ${({ $hasValue }) => ($hasValue ? "800" : "400")};
    background-color: ${({ $isSelected, $isHighlight, $isNegative, $isDirty }) =>
        $isSelected ? "#dbeafe" : $isDirty ? "#fef9c3" : $isNegative ? "#fef2f2" : $isHighlight ? "#f1f5f9" : "transparent"};
    border: ${({ $isSelected, $isDirty }) =>
        $isSelected ? "2px solid #2563eb !important" : $isDirty ? "1px solid #f59e0b" : "1px solid #e2e8f0"};
    &:hover {
        background-color: #dbeafe;
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
    background-color: #fff;
    cursor: pointer;
    outline: none;
    &:hover {
        border-color: #2563eb;
    }
`;

const EmptyState = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100px;
    color: #94a3b8;
    font-size: 13px;
    background-color: #f8fafc;
    border: 1px dashed #cbd5e1;
    border-radius: 4px;
`;

const ShortcutHint = styled.span`
    font-size: 10px;
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
    entry_date: string;
    is_order_only?: boolean;
    ids?: number[];
}

interface TheaterItem {
    id: number;
    auditorium: string;
    auditorium_name: string;
    seat_count: number;
}

interface Props {
    selectedScore: ScoreItem | null;
    allScores: ScoreItem[];
    setScores: (preserveId?: number) => void;
    setSelectedScore: (score: ScoreItem | null) => void;
}

// dirtyMatrix: fare → show → newValue (로컬에서 편집한 값만 추적)
type DirtyMatrix = Record<number, Record<number, number>>;

export function ScoreDetailMatrix({ selectedScore, allScores, setScores, setSelectedScore }: Props) {
    const { openModal } = useGlobalModal();
    const toast = useToast();

    const [selectedCell, setSelectedCell] = useState<{ fare: number; show: number } | null>(null);
    const [editingCell, setEditingCell] = useState<{ fare: number; show: number } | null>(null);
    const [editValue, setEditValue] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [dynamicFareList, setDynamicFareList] = useState<number[]>([]);
    const [theaterList, setTheaterList] = useState<TheaterItem[]>([]);
    const [dirtyMatrix, setDirtyMatrix] = useState<DirtyMatrix>({});
    const tableContainerRef = useRef<HTMLDivElement>(null);

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
    const { serverMatrix, filteredScores } = useMemo(() => {
        if (!selectedScore) return { serverMatrix: {} as Record<number, Record<number, number>>, filteredScores: [] as ScoreItem[] };
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
        filtered.forEach((score) => {
            const f = Number(score.fare);
            const s = String(score.show_count) === "특회" ? 0 : Number(score.show_count) || 0;
            if (!m[f]) m[f] = {};
            m[f][s] = (m[f][s] || 0) + Number(score.visitor || 0);
        });
        return { serverMatrix: m, filteredScores: filtered };
    }, [selectedScore, allScores]);

    // 표시용 매트릭스: 서버 + dirty 오버레이
    const displayMatrix = useMemo(() => {
        const result: Record<number, Record<number, number>> = {};
        // 서버 데이터 복사
        for (const fare of Object.keys(serverMatrix)) {
            result[Number(fare)] = { ...serverMatrix[Number(fare)] };
        }
        // dirty 오버레이
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
    useEffect(() => {
        if (!clientId) return;
        const fetchData = async () => {
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
        };
        fetchData();
    }, [clientId]);

    // 관 변경/추가 드롭다운
    const handleAuditoriumSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const code = e.target.value;
        if (!code || !selectedScore) return;
        const theater = theaterList.find((t) => t.auditorium === code);
        if (!theater) return;

        setSelectedScore({
            ...selectedScore,
            auditorium: theater.auditorium,
            auditorium_name: theater.auditorium_name,
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
        const newVal = trimmed === "" ? 0 : Number(trimmed);
        const serverVal = serverMatrix[cell.fare]?.[cell.show] ?? 0;

        setEditingCell(null);

        if (newVal === serverVal) {
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
    }, [serverMatrix]);

    // 방향키 이동
    const moveSelection = useCallback((direction: string) => {
        if (!selectedCell) return;
        const currentFareIdx = dynamicFareList.indexOf(selectedCell.fare);
        const currentShowIdx = showCounts.indexOf(selectedCell.show);
        let nextFareIdx = currentFareIdx;
        let nextShowIdx = currentShowIdx;

        switch (direction) {
            case "ArrowUp":
                nextFareIdx = Math.max(0, currentFareIdx - 1);
                break;
            case "ArrowDown":
                nextFareIdx = Math.min(dynamicFareList.length - 1, currentFareIdx + 1);
                break;
            case "ArrowLeft":
                nextShowIdx = Math.max(0, currentShowIdx - 1);
                break;
            case "ArrowRight":
                nextShowIdx = Math.min(showCounts.length - 1, currentShowIdx + 1);
                break;
        }
        setSelectedCell({ fare: dynamicFareList[nextFareIdx], show: showCounts[nextShowIdx] });
    }, [dynamicFareList, showCounts, selectedCell]);

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

                if (newVal === 0 && existing?.id) {
                    deleteIds.push(existing.id);
                } else if (newVal !== 0) {
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

    // 전역 키보드 이벤트
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+S / F5 → 일괄 저장
            if ((e.ctrlKey && e.key === "s") || e.key === "F5") {
                e.preventDefault();
                handleBulkSave();
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
                const val = displayMatrix[selectedCell.fare]?.[selectedCell.show] ?? 0;
                setEditingCell(selectedCell);
                setEditValue(val !== 0 ? String(val) : "");
            } else if (e.key === "Backspace" || e.key === "Delete") {
                e.preventDefault();
                applyLocalEdit(selectedCell, "0");
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedCell, editingCell, moveSelection, applyLocalEdit, handleBulkSave, displayMatrix]);

    const handleEditFares = () => {
        if (!clientId || !selectedScore) return;
        openModal(<FareManagerModal clientId={clientId} onRefresh={() => setScores(selectedScore.id ?? undefined)} />, {
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
                            {theaterList.map((t) => (
                                <option key={t.id} value={t.auditorium}>
                                    {t.auditorium_name}
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
                            {dynamicFareList.map((fare) => {
                                const showMap = displayMatrix[fare] || {};
                                const rowTotal = showCounts.reduce((sum, n) => sum + (showMap[n] || 0), 0);
                                return (
                                    <tr key={fare}>
                                        <td>{fare.toLocaleString()}</td>
                                        {showCounts.map((n) => {
                                            const val = showMap[n] ?? 0;
                                            const isEditing = editingCell?.fare === fare && editingCell.show === n;
                                            const isSelected = selectedCell?.fare === fare && selectedCell?.show === n;
                                            const cellIsDirty = dirtyMatrix[fare]?.[n] !== undefined;
                                            return (
                                                <EditableCell
                                                    key={n}
                                                    $isSelected={isSelected}
                                                    $isHighlight={
                                                        selectedCell?.fare === fare || selectedCell?.show === n
                                                    }
                                                    $hasValue={val !== 0}
                                                    $isNegative={val < 0}
                                                    $isDirty={cellIsDirty}
                                                    onClick={() => setSelectedCell({ fare, show: n })}
                                                    onDoubleClick={() => {
                                                        setSelectedCell({ fare, show: n });
                                                        setEditingCell({ fare, show: n });
                                                        setEditValue(val !== 0 ? String(val) : "");
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
                                                    ) : val !== 0 ? (
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
