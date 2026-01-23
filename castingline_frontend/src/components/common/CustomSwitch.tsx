// src/forwarder/common/CustomSwitch.tsx

import styled from "styled-components";

type Props = {
    checked: boolean;
    onToggle: (v: boolean) => void;
    label?: string; // optional
};

export default function CustomSwitch({ checked, onToggle, label }: Props) {
    const handleClick = (e: any) => {
        e.stopPropagation();
        onToggle(!checked);
    };

    // 🔥 label 이 없으면 ON / OFF 자동 적용
    const displayLabel = label ?? (checked ? "ON" : "OFF");

    return (
        <Wrapper $checked={checked} onClick={handleClick}>
            {checked ? (
                <>
                    <Label $checked={checked}>{displayLabel}</Label>
                    <Knob />
                </>
            ) : (
                <>
                    <Knob />
                    <Label $checked={checked}>{displayLabel}</Label>
                </>
            )}
        </Wrapper>
    );
}

const Wrapper = styled.div<{ $checked: boolean }>`
    width: 62px;
    height: 100%;

    padding: 3px;
    background: ${({ $checked }) => ($checked ? "var(--Gray-800)" : "var(--Gray-300)")};
    border-radius: 100px;

    display: inline-flex;
    align-items: center;
    justify-content: ${({ $checked }) => ($checked ? "flex-end" : "flex-start")};

    gap: 5px;
    cursor: pointer;
    transition: background 0.2s ease;
`;

const Knob = styled.div`
    width: 24px;
    height: 24px;
    background: white;
    border-radius: 9999px;
`;

const Label = styled.div<{ $checked: boolean }>`
    color: ${({ $checked }) => ($checked ? "white" : "var(--Gray-500)")};

    font-size: 11px;
    font-family: SUIT;
    font-weight: 800;
    white-space: nowrap;

    padding: 0 4px;
`;
