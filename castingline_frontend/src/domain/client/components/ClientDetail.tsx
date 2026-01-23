import React from "react";
import styled from "styled-components";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomSelect } from "../../../components/common/CustomSelect";
import { DiscIcon, FloppyDisk, FloppyDiskIcon } from "@phosphor-icons/react";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { CLIENT_TYPES, DISTRIBUTER_THEATER_NAME, LEGAL_ENTITY_TYPES, MANAGEMENT_TYPES, REGION_CODES, SETTLEMENT_DEPARTMENTS, THEATER_KINDS } from "../../../constant/Constants";
import { useToast } from "../../../components/common/CustomToast";
import { AxiosPatch } from "../../../axios/Axios";
import { useAppAlert } from "../../../atom/alertUtils";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";
import { DefaultRateDetail } from "./DefaultRateDetail";

/** 스타일 정의 **/



const ScrollBody = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;

    &::-webkit-scrollbar { width: 6px; }
    &::-webkit-scrollbar-track { background: #f8fafc; }
    &::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 10px; }
`;

const FormGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
`;

const FullWidthGrid = styled.div`
    grid-column: span 2;
`;

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

const EmptyState = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #94a3b8;
    font-weight: 600;
    font-size: 14px;
`;
const InlineRow = styled.div`
    display: flex;
    align-items: flex-end;
    gap: 8px;
    grid-column: span 1; /* 또는 레이아웃에 맞춰 조정 */
`;
export function ClientDetail({ selectedClient, formData, setFormData, handleInputChange, handleUpdateClient, handleBulkUpdateSettlement }) {
    const toast = useToast()
    const { showAlert } = useAppAlert()
    const updateField = (name: string, value: any) => {
        handleInputChange({ target: { name, value } });
    };

    if (!selectedClient) {
        return (
            <CommonSectionCard>
                <EmptyState>목록에서 거래처를 선택하면 상세 정보가 표시됩니다.</EmptyState>
            </CommonSectionCard>
        );
    }

    const isTheater = formData.client_type === "극장";
    const isDistributorOrProducer = ["배급사", "제작사"].includes(formData.client_type);


    return (
        <CommonSectionCard>
            <CommonListHeader
                title={`${formData.client_type} 상세 정보`}
                subtitle={`(${formData.client_name || "미입력"})`}
                actions={
                    <CustomIconButton onClick={handleUpdateClient} title="저장">
                        <FloppyDisk />
                    </CustomIconButton>
                }
            />

            <ScrollBody>
                {/* 상단 공통 정보 */}
                <FormGrid>
                    <CustomInput
                        label="거래처 코드"
                        value={formData.client_code || ""}
                        setValue={(v) => updateField("client_code", v)}
                    />
                    <CustomSelect
                        label="거래처 구분"
                        value={formData.client_type || ""}
                        onChange={(v) => updateField("client_type", v)}
                        options={CLIENT_TYPES}
                        size="sm"
                    />
                </FormGrid>

                {/* 1. 극장 전용 레이아웃 */}
                {isTheater && (
                    <>
                        <SectionTitle>극장 기본 정보</SectionTitle>
                        <FormGrid>
                            <CustomInput label="거래처명" value={formData.client_name || ""} setValue={(v) => updateField("client_name", v)} />

                            <CustomSelect
                                label="법인/개인"
                                value={formData.legal_entity_type || ""}
                                onChange={(v) => updateField("legal_entity_type", v)}
                                options={LEGAL_ENTITY_TYPES}
                                size="sm"
                            />
                            <CustomInput label="바이포엠 극장코드" value={formData.by4m_theater_code || ""} setValue={(v) => updateField("by4m_theater_code", v)} />
                            <CustomInput label="엑셀 극장명" value={formData.excel_theater_name || ""} setValue={(v) => updateField("excel_theater_name", v)} />
                            <CustomInput label="전화번호(대표)" value={formData.representative_phone_number || ""} setValue={(v) => updateField("representative_phone_number", v)} />
                            <CustomInput label="팩스번호" value={formData.fax_number || ""} setValue={(v) => updateField("fax_number", v)} />
                        </FormGrid>

                        <SectionTitle>부금 정보</SectionTitle>
                        <FormGrid>
                            <InlineRow>
                                <div style={{ flex: 1 }}>
                                    <CustomSelect
                                        label="부금처"
                                        value={formData.settlement_department || ""}
                                        onChange={(v) => updateField("settlement_department", v)}
                                        options={SETTLEMENT_DEPARTMENTS}
                                        size="sm"
                                    />
                                </div>
                                <CustomIconButton
                                    onClick={handleBulkUpdateSettlement}
                                >
                                    <FloppyDiskIcon ></FloppyDiskIcon >
                                </CustomIconButton>
                            </InlineRow>
                            <CustomInput label="담당자명" value={formData.settlement_contact || ""} setValue={(v) => updateField("settlement_contact", v)} />
                            <CustomInput label="유선전화" value={formData.settlement_phone_number || ""} setValue={(v) => updateField("settlement_phone_number", v)} />
                            <CustomInput label="휴대전화" value={formData.settlement_mobile_number || ""} setValue={(v) => updateField("settlement_mobile_number", v)} />
                            <CustomInput label="담당자 메일" value={formData.settlement_email || ""} setValue={(v) => updateField("settlement_email", v)} />
                            <CustomInput label="세금계산서 메일 1" value={formData.invoice_email_address || ""} setValue={(v) => updateField("invoice_email_address", v)} />
                            <CustomInput label="세금계산서 메일 2" value={formData.invoice_email_address2 || ""} setValue={(v) => updateField("invoice_email_address2", v)} />
                            <CustomInput
                                label="부금 특이사항"
                                value={formData.settlement_remarks || ""}
                                setValue={(v) => updateField("settlement_remarks", v)}
                            />
                        </FormGrid>
                    </>
                )}

                {/* 2. 배급사/제작사 전용 레이아웃 */}
                {isDistributorOrProducer && (
                    <>
                        <SectionTitle>기본 정보</SectionTitle>
                        <FormGrid>
                            <CustomInput label="거래처명" value={formData.client_name || ""} setValue={(v) => updateField("client_name", v)} />
                            <CustomSelect
                                label="법인/개인"
                                value={formData.legal_entity_type || ""}
                                onChange={(v) => updateField("legal_entity_type", v)}
                                options={LEGAL_ENTITY_TYPES}
                                size="sm"
                            />
                            <CustomInput label="세금계산서 메일 1" value={formData.invoice_email_address || ""} setValue={(v) => updateField("invoice_email_address", v)} />
                            <CustomInput label="세금계산서 메일 2" value={formData.invoice_email_address2 || ""} setValue={(v) => updateField("invoice_email_address2", v)} />
                        </FormGrid>
                        <DefaultRateDetail selectedClient={selectedClient} />
                    </>
                )}

                {/* 공통 정보 섹션 (사업자 정보) */}
                <SectionTitle>사업자 정보</SectionTitle>
                <FormGrid>
                    <CustomInput label="사업자등록번호" value={formData.business_registration_number || ""} setValue={(v) => updateField("business_registration_number", v)} />
                    <CustomInput label="사업자명" value={formData.business_name || ""} setValue={(v) => updateField("business_name", v)} />
                    <CustomInput label="대표자명" value={formData.representative_name || ""} setValue={(v) => updateField("representative_name", v)} />
                    <CustomInput label="종사업자" value={formData.business_operator || ""} setValue={(v) => updateField("business_operator", v)} />
                    <CustomInput label="업태" value={formData.business_category || ""} setValue={(v) => updateField("business_category", v)} />
                    <CustomInput label="업종" value={formData.business_industry || ""} setValue={(v) => updateField("business_industry", v)} />
                </FormGrid>
                <FullWidthGrid>
                    <CustomInput label="사업장 소재지" value={formData.business_address || ""} setValue={(v) => updateField("business_address", v)} />
                </FullWidthGrid>

                {/* 극장일 때만 추가되는 하단 분류 정보 */}
                {isTheater && (
                    <>
                        <SectionTitle>분류 및 운영 정보</SectionTitle>
                        <FormGrid>
                            <CustomSelect
                                label="지역구분"
                                value={formData.region_code || ""}
                                onChange={(v) => updateField("region_code", v)}
                                options={REGION_CODES}
                                size="sm"
                            />
                            <CustomSelect
                                label="멀티분류"
                                value={formData.theater_kind || ""}
                                onChange={(v) => updateField("theater_kind", v)}
                                options={THEATER_KINDS}
                                size="sm"
                            />
                            <CustomSelect
                                label="직영/위탁"
                                value={formData.classification || ""}
                                onChange={(v) => updateField("classification", v)}
                                options={MANAGEMENT_TYPES}
                                size="sm"
                            />
                            <CustomSelect
                                label="자동차극장 여부"
                                value={formData.is_car_theater ? "Y" : "N"}
                                onChange={(v) => updateField("is_car_theater", v === "Y")}
                                options={["Y", "N"]}
                                size="sm"
                            />
                        </FormGrid>
                    </>
                )}

                {/* 배급사/제작사 전용 추가 필드 */}
                {isDistributorOrProducer && (
                    <FormGrid>
                        <CustomSelect
                            label="배급사별 극장명"
                            value={formData.distributor_theater_name || ""}
                            onChange={(v) => updateField("distributor_theater_name", v)}
                            options={DISTRIBUTER_THEATER_NAME}
                            size="sm"
                        />
                    </FormGrid>
                )}

                {/* 공통 상태 정보 */}
                <SectionTitle>관리 정보</SectionTitle>
                <FormGrid>
                    <CustomSelect
                        label="삭제(폐관) 여부"
                        value={formData.operational_status ? "Y" : "N"}
                        onChange={(v) => updateField("operational_status", v === "Y")}
                        options={[{ label: "사용", value: "N" }, { label: "폐관", value: "Y" }]}
                        size="sm"
                    />
                </FormGrid>
            </ScrollBody>
        </CommonSectionCard>
    );
}