import React, { useState } from "react";
import styled from "styled-components";
import { AxiosPost } from "../../../axios/Axios";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomButton } from "../../../components/common/CustomButton";
import { useToast } from "../../../components/common/CustomToast";
import { AutocompleteInputClient } from "../../../components/common/AutocompleteInputClient";
import { useGlobalModal } from "../../../hooks/useGlobalModal";

const ModalContent = styled.div` display: flex; flex-direction: column; gap: 16px; `;
const FormRow = styled.div` display: flex; flex-direction: column; gap: 8px; `;
const Label = styled.div` font-size: 13px; font-weight: 700; color: #475569; `;

interface Props {
    distributorId: number;
    distributorName: string;
    onSuccess: () => void;
}

export function TheaterMapAddModal({ distributorId, distributorName, onSuccess }: Props) {
    const toast = useToast();
    const { closeModal } = useGlobalModal();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [theaterInputValue, setTheaterInputValue] = useState("");
    const [newMapping, setNewMapping] = useState<any>({
        theater: null,
        distributor_theater_name: "",
        apply_date: new Date().toISOString().split('T')[0]
    });

    const handleCreateMapping = async () => {
        if (!newMapping.theater?.id || !newMapping.distributor_theater_name) {
            toast.warning("모든 정보를 입력해주세요.");
            return;
        }
        setIsSubmitting(true);
        try {
            const payload = {
                distributor: distributorId, // 무조건 ID 사용
                theater: newMapping.theater.id,
                distributor_theater_name: newMapping.distributor_theater_name,
                apply_date: newMapping.apply_date
            };
            await AxiosPost("theater-maps", payload);
            toast.success("신규 매핑이 등록되었습니다.");
            onSuccess();
            closeModal();
        } catch (e: any) {
            toast.error("등록 실패: 날짜 중복 또는 데이터 오류");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ModalContent>
            <div style={{ fontSize: '12px', color: '#64748b' }}>배급사: {distributorName}</div>
            <FormRow>
                <Label>대상 극장 선택</Label>
                <AutocompleteInputClient
                    type="theater"
                    placeholder="극장명 또는 코드 검색"
                    formData={newMapping} setFormData={setNewMapping}
                    inputValue={theaterInputValue} setInputValue={setTheaterInputValue}
                    labelPlacement="left"
                />
            </FormRow>
            <FormRow>
                <Label>배급사측 지정명</Label>
                <CustomInput
                    value={newMapping.distributor_theater_name}
                    setValue={(v) => setNewMapping({ ...newMapping, distributor_theater_name: v })}
                    placeholder="배급사에서 사용하는 극장명 입력"
                />
            </FormRow>
            <FormRow>
                <Label>적용 시작일</Label>
                <CustomInput
                    inputType="date"
                    value={newMapping.apply_date}
                    setValue={(v) => setNewMapping({ ...newMapping, apply_date: v })}
                />
            </FormRow>
            <CustomButton onClick={handleCreateMapping} disabled={isSubmitting}>
                {isSubmitting ? "등록 중..." : "확인"}
            </CustomButton>
        </ModalContent>
    );
}