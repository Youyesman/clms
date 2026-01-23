import { PencilSimple, Plus, Trash, WarningCircle, Coins, Money } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import styled from "styled-components";
import { useToast } from "../../../components/common/CustomToast";
import { AxiosDelete, AxiosGet, AxiosPost } from "../../../axios/Axios";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomIconButton } from "../../../components/common/CustomIconButton";

/* --- 스타일 정의 개선 --- */

const FareModalContainer = styled.div`
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 28px;
    background-color: #ffffff;
`;

const SectionContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const SectionHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    
    .icon-box {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        background-color: #eff6ff;
        color: #2563eb;
        border-radius: 6px;
    }

    .title {
        font-size: 14px;
        font-weight: 800;
        color: #1e293b;
    }
`;

const FareInputCard = styled.div`
    background-color: #f8fafc;
    padding: 20px;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.02);
`;

const FareInputGroup = styled.div`
    display: flex;
    gap: 12px;
    align-items: flex-end;
`;

const FareList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 350px;
    overflow-y: auto;
    padding-right: 8px;

    /* 스크롤바 커스텀 */
    &::-webkit-scrollbar { width: 6px; }
    &::-webkit-scrollbar-track { background: #f1f5f9; }
    &::-webkit-scrollbar-thumb { 
        background: #cbd5e1; 
        border-radius: 10px;
        &:hover { background: #94a3b8; }
    }
`;

const FareItem = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background-color: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
        border-color: #3b82f6;
        background-color: #f0f7ff;
        transform: translateX(4px);
    }
`;

const PriceWrapper = styled.div`
    display: flex;
    align-items: baseline;
    gap: 4px;
    
    .amount {
        font-size: 18px;
        font-weight: 800;
        color: #0f172a;
        letter-spacing: -0.02em;
    }
    .unit {
        font-size: 12px;
        font-weight: 600;
        color: #64748b;
    }
`;

const EmptyWrapper = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 0;
    color: #94a3b8;
    background-color: #f8fafc;
    border: 1px dashed #cbd5e1;
    border-radius: 12px;
    gap: 10px;
    
    .text {
        font-size: 13px;
        font-weight: 500;
    }
`;

/* --- 요금 관리 모달 본문 --- */
export function FareManagerModal({ clientId, onRefresh }: { clientId: number, onRefresh: () => void }) {
    const [fares, setFares] = useState<any[]>([]);
    const [newFare, setNewFare] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const toast = useToast();

    const fetchFares = async () => {
        try {
            const res = await AxiosGet(`fares/?client_id=${clientId}`);
            setFares(res.data.results.sort((a: any, b: any) => a.fare - b.fare));
        } catch (e) { toast.error("요금 목록 로드 실패"); }
    };

    useEffect(() => { fetchFares(); }, [clientId]);

    const handleAdd = async () => {
        if (!newFare || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await AxiosPost("fares", { client: clientId, fare: newFare });
            setNewFare("");
            await fetchFares();
            onRefresh();
            toast.success("요금이 추가되었습니다.");
        } catch (e: any) {
            toast.error(handleBackendErrors(e));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm("이 요금을 삭제하시겠습니까?\n요금을 삭제해도 스코어는 삭제되지 않습니다.")) return;
        try {
            await AxiosDelete("fares", id);
            await fetchFares();
            onRefresh();
            toast.success("요금이 삭제되었습니다.");
        } catch (e) {
            toast.error("삭제 실패 (사용 중인 요금일 수 있습니다)");
        }
    };

    return (
        <FareModalContainer>
            {/* 요금 추가 섹션 */}
            <SectionContainer>
                <SectionHeader>
                    <div className="icon-box"><Plus size={18} weight="bold" /></div>
                    <div className="title">새로운 요금 체계 등록</div>
                </SectionHeader>
                <FareInputCard>
                    <FareInputGroup>
                        <div style={{ flex: 1 }}>
                            <CustomInput
                                label="금액 (원)"
                                value={newFare}
                                setValue={setNewFare}
                                inputType="number"
                                placeholder="숫자만 입력하세요"
                            />
                        </div>
                        <CustomIconButton
                            color="blue"
                            onClick={handleAdd}
                            disabled={!newFare || isSubmitting}
                            title="등록"
                        >
                            <Plus weight="bold" size={20} />
                        </CustomIconButton>
                    </FareInputGroup>
                </FareInputCard>
            </SectionContainer>

            {/* 요금 리스트 섹션 */}
            <SectionContainer>
                <SectionHeader>
                    <div className="icon-box"><Coins size={18} weight="bold" /></div>
                    <div className="title">현재 적용 중인 요금 ({fares.length})</div>
                </SectionHeader>
                <FareList>
                    {fares.length > 0 ? (
                        fares.map((f) => (
                            <FareItem key={f.id}>
                                <PriceWrapper>
                                    <span className="amount">{Number(f.fare).toLocaleString()}</span>
                                    <span className="unit">원</span>
                                </PriceWrapper>
                                <CustomIconButton
                                    color="red"
                                    onClick={() => handleDelete(f.id)}
                                    title="삭제"
                                >
                                    <Trash size={16} weight="bold" />
                                </CustomIconButton>
                            </FareItem>
                        ))
                    ) : (
                        <EmptyWrapper>
                            <WarningCircle size={32} weight="light" />
                            <div className="text">등록된 요금이 없습니다.</div>
                        </EmptyWrapper>
                    )}
                </FareList>
            </SectionContainer>
        </FareModalContainer>
    );
}