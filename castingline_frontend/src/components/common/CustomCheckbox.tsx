import React from "react";
import styled from "styled-components";
import { CheckSquare, Square } from "@phosphor-icons/react";

interface CustomCheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    disabled?: boolean;
    labelStyle?: React.CSSProperties; // ✅ 추가
}

const CheckboxWrapper = styled.div<{ disabled?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
    opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
`;

const LabelText = styled.label`
    color: #64748b;
    font-size: 14px;
    font-family: SUIT;
    font-weight: 700;
`;

export const CustomCheckbox: React.FC<CustomCheckboxProps> = ({ checked, onChange, label, disabled, labelStyle }) => {
    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (disabled) return;
        onChange(!checked);
    };

    return (
        <CheckboxWrapper disabled={disabled} onClick={handleClick}>
            {checked ? (
                <CheckSquare size={24} weight="fill" color="#1e293b" />
            ) : (
                <Square size={24} color="#94a3b8" />
            )}
            {label && <LabelText style={labelStyle}>{label}</LabelText>}
        </CheckboxWrapper>
    );
};
