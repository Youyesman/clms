import React from "react";
import styled from "styled-components";

type Option<T extends string> = {
    label: string;
    value: T;
};

interface SwitchTabsProps<T extends string> {
    options: Option<T>[];
    value: T;
    onChange: (value: T) => void;
}

export function SwitchTabs<T extends string>({ options, value, onChange }: SwitchTabsProps<T>) {
    const activeIndex = options.findIndex((o) => o.value === value);

    return (
        <Container $count={options.length}>
            <Indicator $index={activeIndex} $count={options.length} />
            {options.map((option) => (
                <TabButton key={option.value} $active={option.value === value} onClick={() => onChange(option.value)}>
                    {option.label}
                </TabButton>
            ))}
        </Container>
    );
}

const Container = styled.div<{ $count: number }>`
    position: relative;
    display: inline-grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;

    padding: 4px;
    background-color: #f2f2f2;
    border-radius: 8px;
`;

const Indicator = styled.div<{ $index: number; $count: number }>`
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 4px;

    width: calc((100% - 8px) / ${({ $count }) => $count});

    background-color: #ffffff;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);

    transform: translateX(${({ $index }) => $index * 100}%);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);

    pointer-events: none;
    z-index: 0;
`;

const TabButton = styled.button<{ $active: boolean }>`
    position: relative;
    z-index: 1;

    width: 100%; /* ⭐ 핵심 */
    padding: 6px 14px;

    border: none;
    border-radius: 6px;
    background: transparent;

    font-size: 14px;
    font-weight: ${({ $active }) => ($active ? 600 : 400)};
    color: ${({ $active }) => ($active ? "#222" : "#777")};

    cursor: pointer;
    white-space: nowrap;

    transition: color 0.15s ease, transform 0.1s ease;

    &:hover {
        color: #333;
    }

    &:active {
        transform: scale(0.96);
    }
`;
