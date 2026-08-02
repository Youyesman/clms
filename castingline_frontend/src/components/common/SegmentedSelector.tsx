import React, { useState } from "react";
import styled from "styled-components";
type SegmentedSelectorProps = {
    options: any[];
    value?: any;
    defaultValue?: any; // ✅ optional
    onChange?: (v: any) => void;
};
export function SegmentedSelector({ options, value, defaultValue, onChange }: SegmentedSelectorProps) {
    const [internalValue, setInternalValue] = useState(defaultValue);
    const selected = value ?? internalValue;

    const handleSelect = (val) => {
        if (value === undefined) setInternalValue(val);
        onChange?.(val);
    };

    return (
        <Container>
            {options.map((opt, idx) => {
                const active = selected === opt.value;

                return (
                    <React.Fragment key={opt.value}>
                        <Option onClick={() => handleSelect(opt.value)}>
                            <input type="radio" checked={active} readOnly />
                            <Label $active={active}>{opt.label}</Label>
                        </Option>
                        {idx < options.length - 1 && <Divider />}
                    </React.Fragment>
                );
            })}
        </Container>
    );
}

const Container = styled.div`
    width: 100%;
    height: 44px;
    padding: 0 16px;
    background: #ffffff;
    border-radius: 4px;
    outline: 1px solid #cbd5e1;
    display: flex;
    align-items: center;
`;

const Option = styled.button`
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 0;

    input {
        accent-color: #1e293b;
        margin: 0;
    }
`;

const Divider = styled.div`
    width: 1px;
    height: 24px;
    background: #cbd5e1;
`;

const Label = styled.span<{ $active?: boolean }>`
    color: ${({ $active }) => ($active ? "#0f172a" : "#1e293b")};
    font-size: 16px;
    font-weight: 500;
`;
