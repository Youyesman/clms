import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { AxiosGet, AxiosPost, AxiosPatch, AxiosDelete } from "../../../axios/Axios"; // ✅ Patch, Delete 추가
import { GenericTable } from "../../../components/GenericTable";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomSelect } from "../../../components/common/CustomSelect";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { Plus, Check, X, Trash, PencilSimpleLine } from "@phosphor-icons/react"; // ✅ 아이콘 추가
import { THEATER_KINDS, MANAGEMENT_TYPES, REGION_CODES } from "../../../constant/Constants";
import { useToast } from "../../../components/common/CustomToast";
import { useAppAlert } from "../../../atom/alertUtils";

const TableSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 20px;
`;

const TitleWrap = styled.div`
display: flex;
flex-direction: row;
justify-content: space-between;
`
const SectionTitle = styled.div`
    font-size: 13px;
    font-weight: 700;
    color: #475569; /* Slate 600 */
    margin-top: 10px;
    padding-bottom: 5px;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    align-items: center;
    
    &::before {
        content: "";
        width: 4px;
        height: 12px;
        background-color: #3b82f6; /* Blue 500 */
        margin-right: 8px;
        border-radius: 2px;
    }
`;

const Title = styled.div`
        &::before {
        content: "";
        width: 4px;
        height: 12px;
        background-color: #3b82f6; /* Blue 500 */
        margin-right: 8px;
        border-radius: 2px;
    }
`
const TableInputWrapper = styled.div`
    width: 100%;
    .custom-input, .custom-select {
        height: 28px;
        font-size: 11px;
    }
`;
const TR = styled.tr`
    height: 30px;
    background-color: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    &:nth-child(even) {
        background-color: #f8fafc;
    }
    &:hover {
        background-color: #f1f5f9 !important;
        cursor: pointer;
    }
    &.selected {
        background-color: #1e293b !important;
        &,
        td {
            color: #ffffff !important;
            border-right-color: #334155 !important;
        }
    }
`;

const TD = styled.td`
    border-right: 1px solid #e2e8f0;
    padding: 6px 12px;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    color: #1e293b;
    font-weight: 500;
    &.read-only {
        color: #64748b;
    }
`;

export function DefaultRateDetail({ selectedClient }: { selectedClient: any }) {
    const toast = useToast();
    const { showAlert } = useAppAlert();
    const [loading, setLoading] = useState(false);
    const [rateData, setRateData] = useState<any[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [pageSize] = useState(20);
    const [isAdding, setIsAdding] = useState(false);

    // ✅ 수정 모드를 위한 상태 추가
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<any>(null);

    const [newRate, setNewRate] = useState({
        is_domestic: true,
        theater_kind: "CGV",
        classification: "직영",
        region_code: "서울",
        share_rate: "50"
    });

    // --- 수정용 셀 렌더러 ---
    const renderEditableCell = (key: string, value: any, row: any, type: "select" | "input", options?: any) => {
        if (editingId === row.id) {
            return (
                <TableInputWrapper>
                    {type === "select" ? (
                        <CustomSelect
                            value={key === "is_domestic" ? (editForm[key] ? "Y" : "N") : editForm[key]}
                            options={options}
                            onChange={(v) => setEditForm({ ...editForm, [key]: key === "is_domestic" ? v === "Y" : v })}

                        />
                    ) : (
                        <CustomInput
                            style={{ width: '100px' }}
                            value={editForm[key]}
                            setValue={(v) => setEditForm({ ...editForm, [key]: v })}
                        />
                    )}
                </TableInputWrapper>
            );
        }
        if (key === "is_domestic") return value ? "한국영화" : "외화";
        if (key === "share_rate") return <b style={{ color: "#2563eb" }}>{value}</b>;
        return value ?? "";
    };

    const headers = [
        { key: "is_domestic", label: "구분", render: (v, row) => renderEditableCell("is_domestic", v, row, "select", [{ label: "한국영화", value: "Y" }, { label: "외화", value: "N" }]) },
        { key: "theater_kind", label: "멀티분류", render: (v, row) => renderEditableCell("theater_kind", v, row, "select", THEATER_KINDS) },
        { key: "classification", label: "직영/위탁", render: (v, row) => renderEditableCell("classification", v, row, "select", MANAGEMENT_TYPES) },
        { key: "region_code", label: "지역", render: (v, row) => renderEditableCell("region_code", v, row, "select", REGION_CODES) },
        { key: "share_rate", label: "부율(%)", render: (v, row) => renderEditableCell("share_rate", v, row, "input") },
        {
            key: "actions",
            label: "관리",
            render: (_, row) => (
                <div style={{ display: 'flex', gap: '4px' }}>
                    {editingId === row.id ? (
                        <>
                            <CustomIconButton size={11} onClick={handleUpdate} style={{ color: '#2563eb' }}><Check weight="bold" /></CustomIconButton>
                            <CustomIconButton size={11} onClick={() => setEditingId(null)} ><X /></CustomIconButton>
                        </>
                    ) : (
                        <>
                            <CustomIconButton size={11} onClick={() => { setEditingId(row.id); setEditForm({ ...row }); setIsAdding(false); }} style={{ color: '#64748b' }}><PencilSimpleLine /></CustomIconButton>
                            <CustomIconButton size={11} onClick={() => handleDelete(row.id)} style={{ color: '#ef4444' }}><Trash /></CustomIconButton>
                        </>
                    )}
                </div>
            )
        }
    ];

    const fetchRates = async (p: number) => {
        if (!selectedClient?.id) return;
        setLoading(true);
        try {
            const res = await AxiosGet(`default-rates/?client=${selectedClient.id}&page=${p}`);
            const incomingData = res.data.results ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            const incomingCount = res.data.count ? res.data.count : (Array.isArray(res.data) ? res.data.length : 0);
            setRateData(incomingData);
            setTotalCount(incomingCount);
        } catch (error) { console.error("데이터 로드 실패:", error); } finally { setLoading(false); }
    };

    const handleSave = async () => {
        if (!selectedClient?.id) { toast.error("클라이언트 정보가 없습니다."); return; }
        try {
            await AxiosPost("default-rates", { ...newRate, client: selectedClient.id }); // ✅ 슬래시 추가
            toast.success("추가되었습니다.");
            setIsAdding(false);
            fetchRates(1);
        } catch (e) { toast.error("저장 실패"); }
    };

    const handleUpdate = async () => {
        try {
            // editForm에서 client 필드를 제외하고 나머지 필드만 추출
            const { client, ...updatePayload } = editForm;

            // URL 끝에 슬래시(/) 포함 권장
            await AxiosPatch(`default-rates/${editingId}`, updatePayload);

            toast.success("수정되었습니다.");
            setEditingId(null);
            fetchRates(page);
        } catch (e) {
            console.error("업데이트 에러:", e);
            toast.error("수정 실패");
        }
    };
    // --- 핸들러: 삭제 (useAppAlert의 showAlert 사양 적용) ---
    const handleDelete = (id: number) => {
        showAlert(
            "정말 삭제하시겠습니까?",      // title: 제목
            "삭제된 기본 부율 정보는 복구할 수 없습니다.", // subTitle: 부제목 (선택사항)
            "danger",                    // type: 경고 스타일 (danger, warning 등)
            async () => {                // onConfirmCallback: 확인 클릭 시 실행될 함수
                try {
                    // 제공해주신 AxiosDelete(url, id) 호출
                    await AxiosDelete("default-rates", id);

                    toast.success("삭제되었습니다.");
                    fetchRates(page); // 리스트 새로고침
                } catch (e) {
                    console.error("삭제 에러:", e);
                    toast.error("삭제 실패");
                }
            },
            true // showCancelBtn: 취소 버튼 표시 여부
        );
    };
    const renderTopRow = isAdding ? (
        <TR >
            <TD><TableInputWrapper><CustomSelect value={newRate.is_domestic ? "Y" : "N"} options={[{ label: "한국영화", value: "Y" }, { label: "외화", value: "N" }]} onChange={(v) => setNewRate(p => ({ ...p, is_domestic: v === "Y" }))} /></TableInputWrapper></TD>
            <TD><TableInputWrapper><CustomSelect value={newRate.theater_kind} options={THEATER_KINDS} onChange={(v) => setNewRate(p => ({ ...p, theater_kind: v }))} /></TableInputWrapper></TD>
            <TD><TableInputWrapper><CustomSelect value={newRate.classification} options={MANAGEMENT_TYPES} onChange={(v) => setNewRate(p => ({ ...p, classification: v }))} /></TableInputWrapper></TD>
            <TD><TableInputWrapper><CustomSelect value={newRate.region_code} options={REGION_CODES} onChange={(v) => setNewRate(p => ({ ...p, region_code: v }))} /></TableInputWrapper></TD>
            <TD><TableInputWrapper><CustomInput style={{ width: '100px' }} value={newRate.share_rate} setValue={(v) => setNewRate(p => ({ ...p, share_rate: v }))} /></TableInputWrapper></TD>
            <TD><div style={{ display: 'flex', gap: '4px' }}><CustomIconButton onClick={handleSave} style={{ color: '#2563eb' }} size={11}><Check weight="bold" /></CustomIconButton><CustomIconButton size={11} onClick={() => setIsAdding(false)} ><X size={9} /></CustomIconButton></div></TD>
        </TR>
    ) : null;

    useEffect(() => { fetchRates(1); }, [selectedClient]);

    return (
        <TableSection>
            <TitleWrap>
                <SectionTitle>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#475569' }}>기본 부율 설정</div>
                </SectionTitle>
                <CustomIconButton onClick={() => { setIsAdding(true); setEditingId(null); }} size={11} disabled={isAdding}>
                    <Plus weight="bold" />
                </CustomIconButton>
            </TitleWrap>

            <GenericTable
                headers={headers}
                data={rateData}
                loading={loading}
                totalCount={totalCount}
                page={page}
                onPageChange={(p) => { setPage(p); fetchRates(p); }}
                getRowKey={(row) => row.id}
                topRow={renderTopRow}
                sortKey={sortKey}
                sortOrder={sortOrder}
                pageSize={pageSize}
            />
        </TableSection>
    );
}