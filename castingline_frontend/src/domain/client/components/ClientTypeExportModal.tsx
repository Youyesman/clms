import React, { useState } from "react";
import styled from "styled-components";
import { CLIENT_TYPES } from "../../../constant/Constants"; // ["극장", "배급사", "제작사"]
import { CustomFilledButton } from "../../../components/common/CustomFilledButton";
import { CustomCheckbox } from "../../../components/common/CustomCheckbox";

const ModalContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const CheckboxList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const CheckboxItem = styled.label`
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
`;

const Footer = styled.div`
    display: flex;
    justify-content: center;
    margin-top: 10px;
`;

export function ClientTypeExportModal({ onExport, onClose }: any) {
    const [selected, setSelected] = useState<string[]>(CLIENT_TYPES); // 기본 전체 선택

    const toggleType = (type: string) => {
        setSelected((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
    };

    return (
        <ModalContent>
            <div style={{ fontSize: "13px", color: "#64748b", textAlign: "center" }}>
                출력할 거래처 구분을 선택해주세요. <br />
                (복수 선택 가능)
            </div>
            <CheckboxList>
                {CLIENT_TYPES.map((type) => (
                    <CheckboxItem key={type}>
                        <CustomCheckbox checked={selected.includes(type)} onChange={() => toggleType(type)} />
                        {type}
                    </CheckboxItem>
                ))}
            </CheckboxList>
            <Footer>
                <CustomFilledButton disabled={selected.length === 0} onClick={() => onExport(selected)}>
                    엑셀 생성
                </CustomFilledButton>
            </Footer>
        </ModalContent>
    );
}
