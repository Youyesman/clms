import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { PaperPlaneTilt, FilmStrip } from "@phosphor-icons/react";

import { AxiosPost } from "../../../axios/Axios";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { useToast } from "../../../components/common/CustomToast";

import { AutocompleteInputClient } from "../../../components/common/AutocompleteInputClient";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomButton } from "../../../components/common/CustomButton";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { CustomFilledButton } from "../../../components/common/CustomFilledButton";

/* ---------------- Styled Components ---------------- */

const ModalContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 8px;
`;

const InfoBanner = styled.div`
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 8px;

    .icon-box {
        background: #0f172a;
        color: white;
        width: 40px;
        height: 40px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .movie-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        .label { font-size: 11px; color: #64748b; font-weight: 700; }
        .title { font-size: 15px; color: #0f172a; font-weight: 800; }
    }
`;

const FormSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const SectionHeader = styled.div`
    font-size: 13px;
    font-weight: 800;
    color: #1e293b;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    &::before {
        content: ''; width: 3px; height: 13px; background: #3b82f6; border-radius: 2px;
    }
`;

const FullWidth = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
`;

const StyledTextArea = styled.textarea`
    width: 100%;
    height: 100px;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid #cbd5e1;
    font-size: 13px;
    font-family: inherit;
    resize: none;
    transition: border 0.2s;
    &:focus {
        outline: none;
        border-color: #0f172a;
    }
    &::placeholder { color: #94a3b8; }
`;

const Footer = styled.div`
    display: flex;
    justify-content: center;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
`;

/* ---------------- Main Component ---------------- */

export function AddOrderDetailModal({ selectedOrderList, onClose, onSuccess }: any) {
    const { closeModal } = useGlobalModal()
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [clientSearch, setClientSearch] = useState("");

    const [formData, setFormData] = useState({
        client: null as any,
        movie: selectedOrderList?.movie || null,
        remark: "",
        release_date: selectedOrderList?.movie?.release_date || "",
    });

    const handleSave = async () => {
        if (!formData.client?.id) {
            toast.error("대상 극장을 선택해주세요.");
            return;
        }

        setLoading(true);
        try {
            const payload = {
                ...formData,
                movie: formData.movie.id,
                client: formData.client.id,
            };

            await AxiosPost("order", payload);
            toast.success("오더 상세 내역이 추가되었습니다.");
            if (onSuccess) onSuccess();
            if (onClose) onClose();
            closeModal()
        } catch (err: any) {
            toast.error(handleBackendErrors(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <ModalContainer>
            {/* ✅ 상단 영화 정보 (읽기 전용) */}
            <InfoBanner>
                <div className="icon-box">
                    <FilmStrip size={22} weight="duotone" />
                </div>
                <div className="movie-info">
                    <div className="label">대상 영화 (자동 고정)</div>
                    <div className="title">
                        {formData.movie?.title_ko || "영화 정보 없음"}
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginLeft: '8px' }}>
                            ({formData.movie?.movie_code})
                        </span>
                    </div>
                </div>
            </InfoBanner>

            {/* ✅ 대상 극장 설정 (Full Width) */}
            <FormSection>
                <SectionHeader>대상 극장 설정</SectionHeader>
                <FullWidth>
                    <AutocompleteInputClient
                        type="client"
                        label="극장 선택"
                        required
                        labelPlacement="left"
                        labelWidth="90px"
                        formData={formData}
                        setFormData={setFormData}
                        inputValue={clientSearch}
                        setInputValue={setClientSearch}
                        placeholder="극장명 검색 및 리스트 선택"
                    />
                </FullWidth>
            </FormSection>

            {/* ✅ 상영 일정 (Full Width) */}
            <FormSection>
                <SectionHeader>상영 일정</SectionHeader>
                <FullWidth>
                    <CustomInput
                        required
                        label="개봉일자"
                        inputType="date"
                        labelPlacement="left"
                        labelWidth="90px"
                        value={formData.release_date}
                        setValue={(val: string) => setFormData(p => ({ ...p, release_date: val }))}
                    />
                </FullWidth>
            </FormSection>

            {/* ✅ 기타 메모 (Full Width) */}
            <FormSection>
                <SectionHeader>기타 메모</SectionHeader>
                <FullWidth>
                    <StyledTextArea
                        name="remark"
                        value={formData.remark}
                        onChange={(e) => setFormData(p => ({ ...p, remark: e.target.value }))}
                        placeholder="특이사항 및 비고 내용을 입력하세요."
                    />
                </FullWidth>
            </FormSection>

            <Footer>
                <CustomFilledButton
                    onClick={handleSave}
                    disabled={loading}
                >저장</CustomFilledButton>
            </Footer>
        </ModalContainer>
    );
}