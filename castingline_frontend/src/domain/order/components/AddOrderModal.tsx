import React, { useState } from "react";
import styled from "styled-components";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomButton } from "../../../components/common/CustomButton";
import { AutocompleteInputMovie } from "../../../components/common/AutocompleteInputMovie";
import { useToast } from "../../../components/common/CustomToast";
import { FloppyDisk } from "@phosphor-icons/react";
import { CustomFilledButton } from "../../../components/common/CustomFilledButton";

const FormContainer = styled.div`
    display: flex;
    flex-direction: column;
`;

const ModalTitle = styled.div`
    font-size: 18px;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 1px solid #f1f5f9;
`;

const FieldWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const Footer = styled.div`
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid #f1f5f9;
`;

interface AddOrderModalProps {
    onSave: (data: any) => void;
    onClose?: () => void; // useGlobalModal에서 주입될 수 있음
}

export function AddOrderModal({ onSave, onClose }: AddOrderModalProps) {
    const toast = useToast();
    const LABEL_WIDTH = "90px";

    // ✅ 모달 내부에서 직접 상태 관리
    const [localFormData, setLocalFormData] = useState({
        start_date: "",
        movie: null as any,
    });
    const [localMovieInput, setLocalMovieInput] = useState("");

    const handleSave = () => {
        if (!localFormData.start_date || !localFormData.movie?.id) {
            toast.error("기준일자와 영화명을 모두 선택해주세요.");
            return;
        }
        onSave(localFormData);
    };

    return (
        <FormContainer>

            <FieldWrapper>
                <CustomInput
                    inputType="date"
                    label="기준일자"
                    placeholder="YYYY-MM-DD"
                    value={localFormData.start_date}
                    setValue={(v) => setLocalFormData((prev) => ({ ...prev, start_date: v }))}
                    labelWidth={LABEL_WIDTH}
                    required
                />

                <AutocompleteInputMovie
                    label="영화 선택"
                    formData={localFormData}
                    setFormData={setLocalFormData}
                    placeholder="영화명을 검색하세요"
                    inputValue={localMovieInput}
                    setInputValue={setLocalMovieInput}
                    labelWidth={LABEL_WIDTH}
                    required
                />
            </FieldWrapper>

            <Footer>
                <CustomFilledButton onClick={handleSave} width={110}>
                    오더 저장
                </CustomFilledButton>
            </Footer>
        </FormContainer>
    );
}
