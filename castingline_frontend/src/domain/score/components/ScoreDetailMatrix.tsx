import React, { useState, useMemo, useEffect } from "react";
import styled from "styled-components";
import { AxiosDelete, AxiosGet, AxiosPatch, AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { PencilSimple, PlusIcon } from "@phosphor-icons/react";
import { FareManagerModal } from "./FareManagerModal";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";

/* ---------------- Styled Components ---------------- */

/** 스타일 정의 **/



const TableContainer = styled.div`
    overflow-x: auto;
    background-color: #ffffff;
    min-height: 120px;
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
}>`
    cursor: pointer;
    transition: all 0.2s;
    color: ${({ $isNegative, $hasValue }) => ($isNegative ? "#ef4444" : $hasValue ? "#1e293b" : "#e2e8f0")};
    font-weight: ${({ $hasValue }) => ($hasValue ? "800" : "400")};
    background-color: ${({ $isSelected, $isHighlight, $isNegative }) =>
        $isSelected ? "#dbeafe" : $isNegative ? "#fef2f2" : $isHighlight ? "#f1f5f9" : "transparent"};
    border: ${({ $isSelected }) => ($isSelected ? "2px solid #2563eb !important" : "1px solid #e2e8f0")};
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

/* ---------------- Logic & Types ---------------- */

type Score = {
    id: number;
    fare: number;
    show_count: any;
    visitor: number;
    client: { id: any; client_name: any };
    movie: { id: any; title_ko: any };
    auditorium: string;
    entry_date: string;
};

type Props = {
    selectedScore: any;
    allScores: Score[];
    setScores: (preserveId?: number) => void;
    setSelectedScore: any;
};

export function ScoreDetailMatrix({ selectedScore, allScores, setScores, setSelectedScore }: Props) {
    const { openModal } = useGlobalModal();
    const toast = useToast();

    const [selectedCell, setSelectedCell] = useState<{ fare: number; show: number } | null>(null);
    const [editingCell, setEditingCell] = useState<{ fare: number; show: number } | null>(null);
    const [editValue, setEditValue] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [dynamicFareList, setDynamicFareList] = useState<number[]>([]);
    const [theaterList, setTheaterList] = useState<any[]>([]);

    const getID = (val: any) => (val && typeof val === "object" ? val.id : val);
    const showCounts = useMemo(() => Array.from({ length: 13 }, (_, i) => i), []);

    // ✅ 매트릭스 데이터 계산 로직
    const { matrix, filteredScores } = useMemo(() => {
        if (!selectedScore) return { matrix: {} as any, filteredScores: [] };
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
            let s = String(score.show_count) === "특회" ? 0 : Number(score.show_count) || 0;
            if (!m[f]) m[f] = {};
            m[f][s] = (m[f][s] || 0) + Number(score.visitor || 0);
        });
        return { matrix: m, filteredScores: filtered };
    }, [selectedScore, allScores]);

    // ✅ 극장 정보(관 리스트, 요금 리스트) 페칭
    useEffect(() => {
        const clientId = getID(selectedScore?.client);
        if (!clientId) return;
        const fetchData = async () => {
            try {
                const [tRes, fRes] = await Promise.all([
                    AxiosGet(`theaters/?client_id=${clientId}`),
                    AxiosGet(`fares/?client_id=${clientId}`),
                ]);
                setTheaterList(tRes.data.results || []);
                const fares = fRes.data.results
                    .map((f: any) => parseInt(f.fare))
                    .filter((v: number) => !isNaN(v))
                    .sort((a: number, b: number) => a - b);
                setDynamicFareList(fares);
            } catch (error) {
                console.error(error);
            }
        };
        fetchData();
    }, [getID(selectedScore?.client)]);

    // ✅ 관 변경/추가 드롭다운 선택 시 로직
    const handleAuditoriumSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const code = e.target.value;
        if (!code) return;

        const theater = theaterList.find((t) => t.auditorium === code);
        if (!theater) return;

        // 1. 상태 업데이트하여 즉시 테이블 노출
        setSelectedScore({
            ...selectedScore,
            auditorium: theater.auditorium,
            auditorium_name: theater.auditorium_name,
        });

        // 2. 이미 ID가 있는 기존 스코어라면 DB의 관 정보 업데이트 (Patch)
        if (selectedScore.id) {
            try {
                await AxiosPatch("scores", { auditorium: theater.auditorium }, selectedScore.id);
                setScores(selectedScore.id);
                toast.success("관 정보가 업데이트되었습니다.");
            } catch (err) {
                toast.error("관 설정 실패");
            }
        }
    };

    // 방향키 이동
    const moveSelection = (direction: string) => {
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
    };

    // 데이터 저장 (POST/PATCH)
    const handleSave = async (cellToSave: { fare: number; show: number }, valueToSave: string) => {
        const { fare, show } = cellToSave;
        const trimmedValue = valueToSave.trim();
        const originalVal = matrix[fare]?.[show] ?? 0;
        const newVal = trimmedValue === "" ? 0 : Number(trimmedValue);

        if (originalVal === newVal || saving) {
            setEditingCell(null);
            return;
        }

        const searchShow = show === 0 ? "특회" : String(show).padStart(2, "0");
        let target = filteredScores.find(
            (s) => Number(s.fare) === fare && (String(s.show_count) === searchShow || Number(s.show_count) === show)
        );

        try {
            setSaving(true);
            if (newVal === 0) {
                // 삭제
                if (target?.id) {
                    await AxiosDelete("scores", target.id);
                    await setScores();
                }
            } else if (target?.id) {
                // 수정
                await AxiosPatch(
                    "scores",
                    { visitor: newVal, fare, show_count: searchShow, auditorium: selectedScore.auditorium },
                    target.id
                );
                await setScores(target.id);
            } else {
                // 신규 생성
                const res = await AxiosPost("scores", {
                    client: getID(selectedScore.client),
                    movie: getID(selectedScore.movie),
                    auditorium: selectedScore.auditorium,
                    entry_date: selectedScore.entry_date,
                    fare,
                    show_count: searchShow,
                    visitor: newVal,
                });
                await setScores(res.data.id);
            }
            toast.success("저장되었습니다.");
        } catch (err: any) {
            toast.error(handleBackendErrors(err));
        } finally {
            setSaving(false);
            setEditingCell(null);
        }
    };

    // 전역 키보드 이벤트
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!selectedCell || editingCell) return;
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                e.preventDefault();
                moveSelection(e.key);
            } else if (/^[0-9\-]$/.test(e.key)) {
                setEditingCell(selectedCell);
                setEditValue(e.key);
            } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const val = matrix[selectedCell.fare]?.[selectedCell.show] ?? 0;
                setEditingCell(selectedCell);
                setEditValue(val !== 0 ? String(val) : "");
            } else if (e.key === "Backspace" || e.key === "Delete") {
                e.preventDefault();
                handleSave(selectedCell, "0");
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedCell, editingCell, dynamicFareList, showCounts, matrix]);

    const handleEditFares = () => {
        const clientId = getID(selectedScore?.client);
        if (!clientId) return;
        openModal(<FareManagerModal clientId={clientId} onRefresh={() => setScores(selectedScore.id)} />, {
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
                {/* <InfoBadge $type="room">
                    <strong>관명</strong>
                    {!selectedScore.auditorium ? (
                        <AuditoriumSelect value="" onChange={handleAuditoriumSelect}>
                            <option value="" disabled>
                                선택
                            </option>
                            {theaterList.map((t) => (
                                <option key={t.id} value={t.auditorium}>
                                    {t.auditorium_name}
                                </option>
                            ))}
                        </AuditoriumSelect>
                    ) : (
                        <span>{selectedScore.auditorium_name || selectedScore.auditorium}</span>
                    )}
                </InfoBadge> */}
            </InfoSection>

            <TableContainer>
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
                                const showMap = matrix[fare] || {};
                                const rowTotal = showCounts.reduce((sum, n) => sum + (showMap[n] || 0), 0);
                                return (
                                    <tr key={fare}>
                                        <td>{fare.toLocaleString()}</td>
                                        {showCounts.map((n) => {
                                            const val = showMap[n] ?? 0;
                                            const isEditing = editingCell?.fare === fare && editingCell.show === n;
                                            const isSelected = selectedCell?.fare === fare && selectedCell?.show === n;
                                            return (
                                                <EditableCell
                                                    key={n}
                                                    $isSelected={isSelected}
                                                    $isHighlight={
                                                        selectedCell?.fare === fare || selectedCell?.show === n
                                                    }
                                                    $hasValue={val !== 0}
                                                    $isNegative={val < 0}
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
                                                            onBlur={(e) =>
                                                                handleSave({ fare, show: n }, e.target.value)
                                                            }
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter")
                                                                    handleSave({ fare, show: n }, editValue);
                                                                if (e.key === "Escape") setEditingCell(null);
                                                                if (
                                                                    [
                                                                        "ArrowUp",
                                                                        "ArrowDown",
                                                                        "ArrowLeft",
                                                                        "ArrowRight",
                                                                    ].includes(e.key)
                                                                ) {
                                                                    e.preventDefault();
                                                                    handleSave({ fare, show: n }, editValue);
                                                                    setTimeout(() => moveSelection(e.key), 10);
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
