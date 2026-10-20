import React, { useEffect, useState } from "react";
import { AxiosGet, AxiosPatch, AxiosDelete, AxiosPost } from "../../../axios/Axios";
import { GenericTable } from "../../../components/GenericTable";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { Trash, Plus } from "@phosphor-icons/react";
import { useToast } from "../../../components/common/CustomToast";
import { useAppAlert } from "../../../atom/alertUtils";
import styled from "styled-components";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { CustomCheckbox } from "../../../components/common/CustomCheckbox";

interface Props {
    selectedPair: any;
    onCompleted: any;
    // N002: 현재 배급사의 계열사 목록 — 있으면 '계열사에도 동일 적용' 체크박스 노출
    affiliates?: { id: number; client_name: string }[];
}

export function TheaterMapHistory({ selectedPair, onCompleted, affiliates = [] }: Props) {
    const toast = useToast();
    const { showAlert } = useAppAlert();
    // N002: 이력 추가·수정을 계열사에도 같이 반영할지 (기본 해제)
    const [applyToAffiliates, setApplyToAffiliates] = useState(false);
    const applyAffiliates = applyToAffiliates && affiliates.length > 0;
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotal, setHistoryTotal] = useState(0);

    const fetchHistory = async (p: number) => {
        if (!selectedPair) return;
        setLoading(true);
        try {
            const res = await AxiosGet(`theater-maps/?distributor=${selectedPair.distributor}&theater=${selectedPair.theater}&page=${p}`);
            setHistoryData(res.data.results || []);
            setHistoryTotal(res.data.count || 0);
        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        setHistoryPage(1);
        fetchHistory(1);
    }, [selectedPair]);

    // ✅ 중복 오류를 방지하며 즉시 새 행을 추가하는 로직
    const handleAddNewRow = async () => {
        try {
            let nextDate = new Date().toISOString().split('T')[0];

            // 히스토리가 있다면 마지막 날짜의 다음날로 설정 (중복 방지)
            if (historyData.length > 0) {
                const dates = historyData.map(d => new Date(d.apply_date).getTime());
                const maxDate = new Date(Math.max(...dates));
                maxDate.setDate(maxDate.getDate() + 1);
                nextDate = maxDate.toISOString().split('T')[0];
            }

            const payload = {
                distributor: selectedPair.distributor,
                theater: selectedPair.theater,
                apply_date: nextDate,
                distributor_theater_name: "(새 매핑명 입력)",
                apply_to_affiliates: applyAffiliates,
            };

            await AxiosPost("theater-maps", payload);
            toast.success(applyAffiliates
                ? "새 이력이 추가되었습니다. (계열사에도 동일 적용) 더블 클릭하여 수정하세요."
                : "새 이력이 추가되었습니다. 더블 클릭하여 수정하세요.");

            fetchHistory(1);
            onCompleted(1);
        } catch (e: any) {
            // 만약 그래도 오류가 난다면 서버 메시지 표시
            toast.error("추가 실패: " + (e.response?.data?.non_field_errors?.[0] || "이미 해당 날짜에 데이터가 있습니다."));
        }
    };

    // ✅ 테이블 내 인라인 수정 발생 시 호출
    const handleCellUpdate = async (item: any, key: string, value: any) => {
        try {
            const payload = {
                distributor: selectedPair.distributor,
                theater: selectedPair.theater,
                [key]: value,
                apply_to_affiliates: applyAffiliates,
            };
            await AxiosPatch(`theater-maps/${item.id}`, payload);
            toast.success(applyAffiliates ? "수정되었습니다. (계열사에도 동일 적용)" : "수정되었습니다.");
            fetchHistory(historyPage);
            onCompleted(1);
        } catch (e: any) {
            const errorMsg = e.response?.data?.non_field_errors?.[0] || "수정 실패 (날짜 중복 확인)";
            toast.error(errorMsg);
            fetchHistory(historyPage); // 실패 시 원래 값으로 복구하기 위해 재조회
        }
    };

    const handleDelete = (id: number) => {
        showAlert("이력 삭제", "삭제하시겠습니까?", "danger", async () => {
            try {
                await AxiosDelete("theater-maps", id);
                toast.success("삭제되었습니다.");
                fetchHistory(historyPage);
                onCompleted(1);
            } catch (e) { toast.error("삭제 실패"); }
        }, true);
    };

    const historyHeaders = [
        {
            key: "apply_date",
            label: "적용 시작일",
            editable: true,
        },
        {
            key: "theater_code",
            label: "극장코드",
            renderCell: (_, row) => row.theater_details?.client_code || "-"
        },
        {
            key: "theater_name",
            label: "시스템상 극장명",
            renderCell: (_, row) => row.theater_details?.client_name || "-"
        },
        {
            key: "distributor_theater_name",
            label: "배급사측 지정명",
            editable: true,
            renderCell: (v) => <b style={{ color: "#2563eb" }}>{v}</b>
        },
        {
            key: "actions",
            label: "관리",
            renderCell: (_, row) => (
                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                    <CustomIconButton onClick={() => handleDelete(row.id)} size={14} color="red" title="삭제">
                        <Trash />
                    </CustomIconButton>
                </div>
            )
        }
    ];

    if (!selectedPair) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>극장을 선택하세요.</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <CommonListHeader
                title="히스토리"
                subtitle={`[${selectedPair.theater_details.client_name}]`}
                actions={
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        {affiliates.length > 0 && (
                            <CustomCheckbox
                                checked={applyToAffiliates}
                                onChange={setApplyToAffiliates}
                                label={`${affiliates.map((a) => a.client_name).join(", ")}(계열사)에도 동일 적용`}
                                labelStyle={{ fontSize: "12px" }}
                            />
                        )}
                        <CustomIconButton onClick={handleAddNewRow} title="새 이력 즉시 추가">
                            <Plus size={16} weight="bold" />
                        </CustomIconButton>
                    </div>
                }
            />
            <GenericTable
                headers={historyHeaders}
                data={historyData}
                loading={loading}
                getRowKey={(row) => row.id}
                page={historyPage}
                totalCount={historyTotal}
                pageSize={10}
                onPageChange={(p) => { setHistoryPage(p); fetchHistory(p); }}
                onUpdateCell={handleCellUpdate}
            />
            <div style={{ padding: '8px', fontSize: '11px', color: '#64748b', textAlign: 'center', background: '#ffffff' }}>
                * 수정하려면 칸을 <b>더블 클릭</b>하고 입력 후 <b>Enter</b>를 누르세요.
            </div>
        </div>
    );
}