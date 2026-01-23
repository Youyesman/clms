import React, { useState, useCallback, useMemo } from "react";
import styled from "styled-components";
import { AxiosGet, AxiosPost } from "../../../axios/Axios";

// 공통 컴포넌트
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { AutocompleteInputClient } from "../../../components/common/AutocompleteInputClient";
import { AutocompleteInputMovie } from "../../../components/common/AutocompleteInputMovie";
import { MagnifyingGlass, Trash, UploadIcon, CheckSquare, Square, PlusIcon } from "@phosphor-icons/react";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { ScoreExcelUploader } from "./ScoreExcelUploader";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";
import { CommonListHeader } from "../../../components/common/CommonListHeader";

// 도메인 컴포넌트
import { ScoreDetailMatrix } from "../components/ScoreDetailMatrix";

/* ---------------- Styled Components ---------------- */

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background-color: #f8fafc;
    min-height: 100vh;
    font-family: "SUIT", sans-serif;
`;


const MainGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
`;

const ListSection = styled.div`
    width: 100%;
    background-color: #ffffff;
    border: 1px solid #94a3b8;
    border-radius: 4px;
    overflow: hidden;
`;


const TableWrapper = styled.div`
    overflow-x: auto;
    max-height: 600px;
`;

const ScoreTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    thead {
        position: sticky;
        top: 0;
        background: #f8fafc;
        z-index: 10;
        th {
            padding: 10px;
            border-bottom: 2px solid #cbd5e1;
            border-right: 1px solid #e2e8f0;
            color: #475569;
        }
    }
    tbody td {
        padding: 8px 10px;
        border-bottom: 1px solid #e2e8f0;
        border-right: 1px solid #f1f5f9;
    }
    tr.selected-row {
        background-color: #eff6ff;
    }
    .check-col {
        width: 45px;
        text-align: center;
        cursor: pointer;
    }
`;

const ClientTotalRow = styled.tr`
    background-color: #f0fdf4;
    font-weight: 800;
    color: #166534;
    td {
        border-bottom: 1px solid #bbf7d0 !important;
    }
`;

const AudiSubTotalRow = styled.tr`
    background-color: #f1f5f9;
    font-weight: 700;
    color: #1e293b;
    td {
        border-bottom: 1px solid #cbd5e1 !important;
    }
`;

const MovieTotalRow = styled.tr`
    background-color: #f8fafc;
    font-weight: 900;
    color: #1e293b;
    td {
        border-bottom: 2px solid #64748b !important;
    }
`;

/* ---------------- Main Component ---------------- */

export function ManageScore() {
    const toast = useToast();
    const { openModal } = useGlobalModal();

    const [groupedScores, setGroupedScores] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedScore, setSelectedScore] = useState<any>(null);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    const [searchParams, setSearchParams] = useState({
        entry_date: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split("T")[0],
        client: { id: null, client_name: "" },
        movie: { id: null, title_ko: "" },
    });
    const [clientInput, setClientInput] = useState("");
    const [movieInput, setMovieInput] = useState("");

    const flatScores = useMemo(() => groupedScores.flatMap((group) => group.items), [groupedScores]);

    const handleSearch = async (preserveId?: number) => {
        if (!searchParams.entry_date) {
            toast.warning("입회일자를 선택해주세요.");
            return;
        }
        setLoading(true);
        const params = new URLSearchParams({
            entry_date: searchParams.entry_date,
            client_name: clientInput,
            movie_title: movieInput,
        });

        try {
            const res = await AxiosGet(`scores/?${params.toString()}`);
            const newData = res.data.grouped_data || [];
            setGroupedScores(newData);

            if (preserveId) {
                const found = newData.flatMap((g: any) => g.items).find((i: any) => i.id === preserveId);
                if (found) setSelectedScore(found);
            }
        } catch (error) {
            toast.error("조회 중 오류 발생");
        } finally {
            setLoading(false);
            setSelectedIds([]);
        }
    };

    // ✅ [수정] 다수 ID를 동시에 선택/해제하도록 유틸리티 개선
    const toggleSelectIds = (ids: number[]) => {
        if (!ids || ids.length === 0) return;

        const allIncluded = ids.every((id) => selectedIds.includes(id));
        if (allIncluded) {
            // 모두 포함되어 있으면 전체 해제
            setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
        } else {
            // 하나라도 없으면 모두 추가 (중복 방지)
            setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) {
            toast.warning("삭제할 항목을 선택해주세요.");
            return;
        }

        if (window.confirm(`선택한 ${selectedIds.length}건의 데이터를 삭제하시겠습니까?`)) {
            try {
                await AxiosPost("scores/bulk-delete", { ids: selectedIds });
                toast.success("성공적으로 삭제되었습니다.");
                handleSearch();
            } catch (error: any) {
                toast.error(handleBackendErrors(error));
            }
        }
    };

    const handleAddScore = async () => {
        const { entry_date, client, movie } = searchParams;
        if (!entry_date || !client?.id || !movie?.id) {
            toast.warning("필터에서 극장, 영화, 날짜를 모두 선택해주세요.");
            return;
        }
        try {
            const payload = {
                client: client.id,
                movie: movie.id,
                entry_date,
                auditorium: "",
                fare: null,
                visitor: null,
            };
            const res = await AxiosPost("scores", payload);
            toast.success("새 스코어가 생성되었습니다.");
            await handleSearch(res.data.id);
        } catch (error: any) {
            toast.error(handleBackendErrors(error));
        }
    };

    return (
        <PageContainer>
            <CommonFilterBar
                onSearch={() => handleSearch()}
                actions={
                    <CustomIconButton
                        onClick={() =>
                            openModal(<ScoreExcelUploader onUploadSuccess={() => handleSearch()} />, {
                                title: "스코어 엑셀 업로드",
                                width: "1600px",
                            })
                        }>
                        <UploadIcon />
                    </CustomIconButton>
                }
            >
                {/* 왼쪽 영역: 검색 필터들 */}
                <CustomInput
                    style={{ width: "200px" }}
                    label="입회일자"
                    inputType="date"
                    value={searchParams.entry_date}
                    setValue={(v) => setSearchParams((p: any) => ({ ...p, entry_date: v }))}
                    labelWidth="60px"
                />
                <div style={{ width: "300px" }}>
                    <AutocompleteInputClient
                        type="client"
                        label="극장명"
                        formData={searchParams}
                        setFormData={setSearchParams}
                        inputValue={clientInput}
                        setInputValue={setClientInput}
                        placeholder="극장 검색"
                        labelWidth="50px"
                    />
                </div>
                <div style={{ width: "300px" }}>
                    <AutocompleteInputMovie
                        label="영화명"
                        formData={searchParams}
                        setFormData={setSearchParams}
                        inputValue={movieInput}
                        setInputValue={setMovieInput}
                        placeholder="영화 검색"
                        labelWidth="50px"
                    />
                </div>
            </CommonFilterBar>

            <MainGrid>
                <ListSection>
                    <CommonListHeader
                        title="스코어 내역 (극장별 → 관별 계층형)"
                        actions={
                            <>
                                <span style={{ fontSize: "11px", color: "#64748b" }}>
                                    {selectedIds.length}건 선택됨
                                </span>
                                <CustomIconButton color="blue" onClick={handleAddScore} title="스코어 추가">
                                    <PlusIcon weight="bold" />
                                </CustomIconButton>
                                <CustomIconButton
                                    color="red"
                                    disabled={selectedIds.length === 0}
                                    onClick={handleBulkDelete}
                                    title="선택 삭제">
                                    <Trash weight="bold" />
                                </CustomIconButton>
                            </>
                        }
                    />
                    <TableWrapper>
                        <ScoreTable>
                            <thead>
                                <tr>
                                    <th className="check-col">선택</th>
                                    <th>극장명</th>
                                    <th>영화명</th>
                                    <th>관명</th>
                                    <th style={{ textAlign: "right" }}>요금</th>
                                    <th style={{ textAlign: "right" }}>관객수</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupedScores.map((movieGroup) => {
                                    const clientGroups = movieGroup.items.reduce((acc: any, item: any) => {
                                        const cId = item.client?.id || "unknown";
                                        if (!acc[cId])
                                            acc[cId] = { name: item.client?.client_name, items: [], total: 0, ids: [] };
                                        acc[cId].items.push(item);
                                        // 극장 레벨에서도 모든 ID를 수집해야 함
                                        if (item.id) acc[cId].ids.push(item.id);
                                        acc[cId].total += Number(item.visitor) || 0;
                                        return acc;
                                    }, {});

                                    return (
                                        <React.Fragment key={movieGroup.movie_code}>
                                            {Object.keys(clientGroups).map((cId) => {
                                                const clientData = clientGroups[cId];

                                                // 2. 관별 그룹화
                                                const audiGroups = clientData.items.reduce(
                                                    (acc: Record<string, any>, item: any) => {
                                                        const aKey = item.auditorium || "none";
                                                        if (!acc[aKey]) {
                                                            acc[aKey] = {
                                                                name: item.auditorium_name,
                                                                items: [],
                                                                total: 0,
                                                                ids: [] as number[], // ✅ number 배열로 강제
                                                            };
                                                        }

                                                        const fareKey = `${item.auditorium}-${item.fare}`;
                                                        const existing = acc[aKey].items.find(
                                                            (ex: any) => `${ex.auditorium}-${ex.fare}` === fareKey,
                                                        );

                                                        if (existing && item.id) {
                                                            existing.visitor =
                                                                (Number(existing.visitor) || 0) +
                                                                (Number(item.visitor) || 0);
                                                            existing.ids = Array.from(
                                                                new Set([...(existing.ids || []), item.id]),
                                                            );
                                                        } else {
                                                            acc[aKey].items.push({
                                                                ...item,
                                                                ids: item.id
                                                                    ? ([item.id] as number[])
                                                                    : ([] as number[]),
                                                            });
                                                        }

                                                        if (item.id) acc[aKey].ids.push(item.id);
                                                        acc[aKey].total += Number(item.visitor) || 0;
                                                        return acc;
                                                    },
                                                    {} as Record<string, any>,
                                                );

                                                // ✅ 타입 단언을 통해 unknown 에러 해결
                                                const clientIds = clientData.ids as number[];
                                                const isClientAllSelected =
                                                    clientIds.length > 0 &&
                                                    clientIds.every((id) => selectedIds.includes(id));

                                                return (
                                                    <React.Fragment key={cId}>
                                                        {Object.keys(audiGroups).map((aKey) => {
                                                            const audi = audiGroups[aKey];
                                                            const audiIds = audi.ids as number[]; // ✅ 타입 단언
                                                            const isAudiAllSelected =
                                                                audiIds.length > 0 &&
                                                                audiIds.every((id) => selectedIds.includes(id));
                                                            return (
                                                                <React.Fragment key={aKey}>
                                                                    {audi.items.map((item: any, idx: number) => {
                                                                        const virtualKey = `virtual-${cId}-${aKey}-${idx}`;
                                                                        // [수정] 병합된 행의 모든 ID가 선택되어 있는지 확인
                                                                        const isItemAllSelected =
                                                                            item.ids &&
                                                                            item.ids.length > 0 &&
                                                                            item.ids.every((id: number) =>
                                                                                selectedIds.includes(id),
                                                                            );

                                                                        const isSelectedInMatrix = selectedScore?.id
                                                                            ? selectedScore.id === item.id
                                                                            : selectedScore?.auditorium ===
                                                                                  item.auditorium &&
                                                                              selectedScore?.client?.id ===
                                                                                  item.client?.id;

                                                                        return (
                                                                            <tr
                                                                                key={item.id || virtualKey}
                                                                                className={
                                                                                    isSelectedInMatrix
                                                                                        ? "selected-row"
                                                                                        : ""
                                                                                }
                                                                                onClick={() => setSelectedScore(item)}
                                                                                style={{
                                                                                    cursor: "pointer",
                                                                                    backgroundColor: item.id
                                                                                        ? "inherit"
                                                                                        : "#fffbeb",
                                                                                }}>
                                                                                <td
                                                                                    className="check-col"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        // ✅ [핵심수정] 단일 ID가 아니라 병합된 ids 전체를 토글
                                                                                        if (
                                                                                            item.ids &&
                                                                                            item.ids.length > 0
                                                                                        )
                                                                                            toggleSelectIds(item.ids);
                                                                                    }}>
                                                                                    {item.ids && item.ids.length > 0 ? (
                                                                                        isItemAllSelected ? (
                                                                                            <CheckSquare
                                                                                                size={18}
                                                                                                weight="fill"
                                                                                                color="#2563eb"
                                                                                            />
                                                                                        ) : (
                                                                                            <Square
                                                                                                size={18}
                                                                                                color="#cbd5e1"
                                                                                            />
                                                                                        )
                                                                                    ) : null}
                                                                                </td>
                                                                                <td>{clientData.name}</td>
                                                                                <td>{movieGroup.movie_name}</td>
                                                                                <td>
                                                                                    {item.auditorium_name ||
                                                                                        item.auditorium}
                                                                                </td>
                                                                                <td style={{ textAlign: "right" }}>
                                                                                    {item.fare
                                                                                        ? Number(
                                                                                              item.fare,
                                                                                          ).toLocaleString()
                                                                                        : ""}
                                                                                </td>
                                                                                <td style={{ textAlign: "right" }}>
                                                                                    {Number(
                                                                                        item.visitor || 0,
                                                                                    ).toLocaleString()}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                    <AudiSubTotalRow>
                                                                        <td
                                                                            className="check-col"
                                                                            onClick={() => toggleSelectIds(audiIds)}>
                                                                            {audiIds.length > 0 &&
                                                                                (isAudiAllSelected ? (
                                                                                    <CheckSquare
                                                                                        size={18}
                                                                                        weight="fill"
                                                                                        color="#1e293b"
                                                                                    />
                                                                                ) : (
                                                                                    <Square size={18} color="#1e293b" />
                                                                                ))}
                                                                        </td>
                                                                        <td colSpan={4} style={{ textAlign: "right" }}>
                                                                            [{audi.name || aKey}] 관 소계 :
                                                                        </td>
                                                                        <td style={{ textAlign: "right" }}>
                                                                            {audi.total.toLocaleString()} 명
                                                                        </td>
                                                                    </AudiSubTotalRow>
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                        <ClientTotalRow>
                                                            <td
                                                                className="check-col"
                                                                onClick={() => toggleSelectIds(clientData.ids)}>
                                                                {clientData.ids.length > 0 &&
                                                                    (isClientAllSelected ? (
                                                                        <CheckSquare
                                                                            size={18}
                                                                            weight="fill"
                                                                            color="#166534"
                                                                        />
                                                                    ) : (
                                                                        <Square size={18} color="#166534" />
                                                                    ))}
                                                            </td>
                                                            <td colSpan={4} style={{ textAlign: "right" }}>
                                                                {clientData.name} 전체 합계 :
                                                            </td>
                                                            <td style={{ textAlign: "right" }}>
                                                                {clientData.total.toLocaleString()} 명
                                                            </td>
                                                        </ClientTotalRow>
                                                    </React.Fragment>
                                                );
                                            })}
                                            <MovieTotalRow>
                                                <td className="check-col"></td>
                                                <td colSpan={4} style={{ textAlign: "right" }}>
                                                    {movieGroup.movie_name} 총계 :
                                                </td>
                                                <td style={{ textAlign: "right" }}>
                                                    {movieGroup.subtotal_visitor?.toLocaleString()} 명
                                                </td>
                                            </MovieTotalRow>
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </ScoreTable>
                    </TableWrapper>
                </ListSection>

                <ScoreDetailMatrix
                    selectedScore={selectedScore}
                    allScores={flatScores}
                    setScores={handleSearch}
                    setSelectedScore={setSelectedScore}
                />
            </MainGrid>
        </PageContainer>
    );
}
