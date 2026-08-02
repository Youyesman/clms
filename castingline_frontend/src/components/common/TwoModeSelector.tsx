// TwoModeSelector.tsx
import React, { useState } from "react";
import styled from "styled-components";
import { RadioButton, Circle } from "@phosphor-icons/react";

const ModeContainer = styled.div`
    flex: 1;
    width: 100%;
    height: 44px;
    padding: 0 16px;
    background: #ffffff;
    border-radius: 4px;
    outline: 1px #cbd5e1 solid;
    outline-offset: -1px;
    display: inline-flex;
    align-items: center;
    gap: 16px;
`;

const ModeOption = styled.button`
    flex: 1 1 0;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
`;

const ModeDivider = styled.div`
    width: 1px;
    height: 24px;
    background: #cbd5e1;
`;

const ModeLabel = styled.span<{ $active?: boolean }>`
    color: ${({ $active }) => ($active ? "black" : "#1e293b")};
    font-size: 16px;
    font-family: SUIT;
    font-weight: 500;
    line-height: 25.28px;
    letter-spacing: 0.16px;
`;

interface TwoModeSelectorProps {
    value?: string;
    onChange?: (value: string) => void;
    defaultValue?: string;
    options: { label: string; value: string }[]; // 반드시 2개
}

export function TwoModeSelector({ value, onChange, defaultValue, options }: TwoModeSelectorProps) {
    const [internalValue, setInternalValue] = useState(defaultValue ?? options[0].value);

    const selected = value ?? internalValue;

    const handleSelect = (mode: string) => {
        if (!value) setInternalValue(mode);
        onChange?.(mode);
    };

    return (
        <ModeContainer>
            {options.map((opt, idx) => {
                const isActive = selected === opt.value;

                return (
                    <React.Fragment key={opt.value}>
                        <ModeOption type="button" onClick={() => handleSelect(opt.value)}>
                            {isActive ? (
                                <RadioButton size={24} weight="fill" color="#1e293b" />
                            ) : (
                                <Circle size={24} color="#94a3b8" />
                            )}
                            <ModeLabel $active={isActive}>{opt.label}</ModeLabel>
                        </ModeOption>

                        {idx === 0 && <ModeDivider />}
                    </React.Fragment>
                );
            })}
        </ModeContainer>
    );
}
