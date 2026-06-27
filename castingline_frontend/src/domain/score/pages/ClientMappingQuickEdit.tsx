import React, { useState } from "react";
import styled from "styled-components";
import { AxiosPatch } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { AutocompleteInputClient } from "../../../components/common/AutocompleteInputClient";
import { X, FloppyDisk, WarningCircle } from "@phosphor-icons/react";

/* ---------------- Types ---------------- */
interface SelectedClient {
    id?: string;
    client_name: string;
    client_type?: string;
    kofic_theater_name?: string;
}

interface Props {
    rawClientName: string; // 영진위 파일에 들어있는 극장명 (매핑 대상)
    onClose: (changed: boolean) => void;
}

/* ---------------- Styled ---------------- */
const Overlay = styled.div`
    position: absolute;
    inset: 0;
    background: #ffffff;
    z-index: 50;
    display: flex;
    flex-direction: column;
    border-radius: 6px;
`;

const Head = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #e2e8f0;

    .title {
        font-size: 14px;
        font-weight: 800;
        color: #0f172a;
    }
    .sub {
        font-size: 12px;
        color: #64748b;
        margin-top: 4px;
    }
    .hint {
        margin-top: 4px;
        font-size: 11px;
        color: #2563eb;
    }
    .raw {
        background: #eff6ff;
        color: #1d4ed8;
        border: 1px solid #bfdbfe;
        border-radius: 4px;
        padding: 1px 6px;
        font-weight: 800;
    }
`;

const Body = styled.div`
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
`;

const SectionLabel = styled.div`
    font-size: 12px;
    font-weight: 800;
    color: #334155;
    margin-bottom: 6px;
`;

const SelectedBox = styled.div`
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px 14px;
    background: #f8fafc;
    font-size: 13px;
    color: #0f172a;

    .row {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-top: 6px;
        &:first-child { margin-top: 0; }
    }
    .label {
        color: #64748b;
        font-weight: 700;
        width: 92px;
        flex-shrink: 0;
    }
    .value {
        font-weight: 800;
    }
    .arrow {
        color: #2563eb;
        font-weight: 800;
    }
`;

const Warn = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 700;
    color: #d97706;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 4px;
    padding: 6px 10px;
`;

const MiniBtn = styled.button<{ $primary?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
    border: 1px solid ${({ $primary }) => ($primary ? "transparent" : "#cbd5e1")};
    background: ${({ $primary }) => ($primary ? "#2563eb" : "#ffffff")};
    color: ${({ $primary }) => ($primary ? "#ffffff" : "#475569")};
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const Foot = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #e2e8f0;
`;

/* ---------------- Component ---------------- */
export function ClientMappingQuickEdit({ rawClientName, onClose }: Props) {
    const toast = useToast();
    const [form, setForm] = useState<{ theater: SelectedClient }>({
        theater: { client_name: "" },
    });
    const [input, setInput] = useState("");
    const [saving, setSaving] = useState(false);

    const selected = form.theater;
    const hasSelection = !!selected?.id;
    // 선택한 극장에 이미 다른 영진위 극장명이 등록돼 있으면 덮어쓰기 경고
    const existingKofic = (selected?.kofic_theater_name || "").trim();
    const willOverwrite = hasSelection && existingKofic && existingKofic !== rawClientName;

    const save = async () => {
        if (!hasSelection) {
            toast.warning("매핑할 극장을 검색해 선택하세요.");
            return;
        }
        setSaving(true);
        try {
            await AxiosPatch(`clients/${selected.id}`, {
                kofic_theater_name: rawClientName,
            });
            toast.success(`'${selected.client_name}'의 영진위 극장명에 '${rawClientName}'을(를) 저장했습니다.`);
            onClose(true);
        } catch (e) {
            toast.error(handleBackendErrors(e));
            setSaving(false);
        }
    };

    return (
        <Overlay>
            <Head>
                <div>
                    <div className="title">극장 매핑 — 등록 안 된 극장</div>
                    <div className="sub">
                        파일의 극장명: <span className="raw">{rawClientName}</span>
                    </div>
                    <div className="hint">
                        ※ 이 극장명에 해당하는 실제 극장을 검색해 선택하면, 그 극장의 "영진위 극장명"에 위 표기가 저장되어 다음 검사부터 매칭됩니다.
                    </div>
                </div>
                <MiniBtn onClick={() => onClose(false)}>
                    <X size={14} weight="bold" /> 닫기
                </MiniBtn>
            </Head>

            <Body>
                <div>
                    <SectionLabel>매핑할 극장 검색</SectionLabel>
                    <AutocompleteInputClient
                        type="theater"
                        formData={form}
                        setFormData={setForm}
                        inputValue={input}
                        setInputValue={setInput}
                        placeholder="극장명을 검색해 선택하세요"
                    />
                </div>

                {hasSelection && (
                    <div>
                        <SectionLabel>저장 내용 확인</SectionLabel>
                        <SelectedBox>
                            <div className="row">
                                <span className="label">선택한 극장</span>
                                <span className="value">{selected.client_name}</span>
                            </div>
                            <div className="row">
                                <span className="label">영진위 극장명</span>
                                {existingKofic && <span style={{ color: "#94a3b8", textDecoration: willOverwrite ? "line-through" : "none" }}>{existingKofic}</span>}
                                {existingKofic && <span className="arrow">→</span>}
                                <span className="value" style={{ color: "#2563eb" }}>{rawClientName}</span>
                            </div>
                        </SelectedBox>
                        {willOverwrite && (
                            <Warn style={{ marginTop: 8 }}>
                                <WarningCircle size={15} weight="fill" />
                                이미 등록된 영진위 극장명("{existingKofic}")을 덮어씁니다.
                            </Warn>
                        )}
                    </div>
                )}
            </Body>

            <Foot>
                <MiniBtn onClick={() => onClose(false)}>취소</MiniBtn>
                <MiniBtn $primary disabled={saving || !hasSelection} onClick={save}>
                    <FloppyDisk size={13} weight="bold" /> {saving ? "저장 중..." : "저장하고 다시 검사"}
                </MiniBtn>
            </Foot>
        </Overlay>
    );
}
