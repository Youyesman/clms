import React, { useEffect, useRef, useState } from "react";
import styled, { keyframes, css } from "styled-components";
import { CaretDown } from "@phosphor-icons/react";
import { createPortal } from "react-dom";

/* ---------------- Animation ---------------- */
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
`;

/* ---------------- Layout Components ---------------- */

const SelectContainer = styled.div<{ $placement: "left" | "top" }>`
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
`;

/** 1. 외부 라벨 영역: labelPlacement가 "top"일 때만 사용 **/
const LabelRow = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
`;

const LabelText = styled.label`
    color: #64748b;
    font-size: 12px;
    font-family: SUIT;
    font-weight: 700;
    white-space: nowrap;
`;

const RequiredMark = styled.span`
    color: #ef4444;
`;

const InnerWrapper = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const SelectWrapper = styled.div<{ $h: number }>`
    position: relative;
    height: ${({ $h }) => $h}px;
    display: flex;
    flex-direction: column;
`;

/** 2. 셀렉트 버튼: 내부 라벨 유무($hasLeft)에 따라 패딩 조절 **/
const SelectButton = styled.div<{
    open?: boolean;
    $hasError?: boolean;
    $h: number;
    $pv: number;
    $ph: number;
    $gap: number;
    $borderless?: boolean;
    $disabled?: boolean;
    $hasLeft?: boolean;
}>`
    display: inline-flex;
    width: 100%;
    height: ${({ $h }) => $h}px;
    /* 내부 라벨이 있으면 왼쪽 패딩 제거 */
    padding: ${({ $borderless, $pv, $ph, $hasLeft }) =>
        $borderless ? "0px" : `${$pv}px ${$ph}px ${$pv}px ${$hasLeft ? "0px" : `${$ph}px`}`};
    background: ${({ $disabled }) => ($disabled ? "#f1f5f9" : "white")};
    border-radius: 4px;

    border: ${({ $borderless, $hasError, open }) =>
        $borderless ? "none" : $hasError ? "1px solid #ef4444" : open ? "1px solid #0f172a" : "1px solid #cbd5e1"};

    align-items: center;
    gap: ${({ $gap }) => $gap}px;
    cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
        border-color: ${({ open }) => (open ? "#0f172a" : "#94a3b8")};
    }
`;

/** 3. 내부 라벨 박스: 셀렉트 박스 안쪽 왼쪽 회색 영역 **/
const InternalLabelBox = styled.div<{ $width?: string }>`
    height: 100%;
    width: ${({ $width }) => $width || "auto"};
    min-width: fit-content;
    padding: 0 12px;
    background: #f1f5f9; /* Slate 100 */
    border-right: 1px solid #cbd5e1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: #475569; /* Slate 600 */
    border-radius: 3px 0 0 3px;
    white-space: nowrap;
    flex-shrink: 0;
`;

const LabelValue = styled.div<{ $fs: number; $hasLeft?: boolean; $isPlaceholder?: boolean }>`
    flex: 1;
    color: ${({ $isPlaceholder }) => ($isPlaceholder ? "#94a3b8" : "#1e293b")};
    font-size: ${({ $fs }) => $fs}px;
    font-family: SUIT;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-left: ${({ $hasLeft }) => ($hasLeft ? "10px" : "0")};
`;

const Option = styled.div<{ selected?: boolean }>`
    height: 40px;
    padding: 0 16px;
    border-radius: 6px;
    background: ${({ selected }) => (selected ? "#f1f5f9" : "white")};
    display: flex;
    align-items: center;
    cursor: pointer;
    margin-bottom: 4px;

    &:last-child {
        margin-bottom: 0;
    }

    &:hover {
        background: #f8fafc;
    }
    div {
        flex: 1;
        font-size: 14px;
        color: #1e293b;
        text-align: left;
    }
`;

export const CustomCaretIcon = styled(CaretDown)<{ open?: boolean }>`
    color: #64748b;
    transition: transform 0.2s ease;
    ${({ open }) => open && `transform: rotate(180deg);`}
`;

const Dropdown = styled.div<{ $hasError?: boolean; $borderless?: boolean }>`
    position: absolute;
    white-space: nowrap;
    padding: 6px;
    background: white;
    box-shadow: 0px 8px 24px rgba(0, 0, 0, 0.12);
    border-radius: 8px;
    border: 1px solid #cbd5e1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 10000;
    max-height: 300px;
    overflow-y: auto;
    animation: ${fadeIn} 0.15s ease;
`;

const ErrorMessage = styled.div`
    color: #ef4444;
    font-size: 11px;
    margin-top: 4px;
`;

/* ---------------- Component ---------------- */
export function CustomSelect({
    options,
    value,
    hasError,
    errorMessage,
    onChange,
    placeholder,
    size = "sm",
    borderless,
    disabled = false,
    label,
    required,
    className,
    style,
    labelStyle,
    labelPlacement = "left",
    labelWidth,
    allowClear = true,
}: {
    options: any[];
    value?: string;
    hasError?: boolean;
    errorMessage?: string;
    onChange?: (v: string) => void;
    placeholder?: string;
    size?: "xs" | "sm" | "md";
    borderless?: boolean;
    disabled?: boolean;
    label?: string;
    required?: boolean;
    className?: string;
    style?: React.CSSProperties;
    labelStyle?: React.CSSProperties;
    transparent?: boolean;
    labelPlacement?: "left" | "top";
    labelWidth?: string;
    allowClear?: boolean;
}) {
    const rawOptions = options.map((opt) => (typeof opt === "string" ? { label: opt, value: opt } : opt));
    const normalizedOptions = allowClear ? [{ label: "선택", value: "" }, ...rawOptions] : rawOptions;

    const sizeMap = {
        xs: { h: 26, pv: 0, ph: 8, fs: 12, gap: 4, icon: 14 },
        sm: { h: 32, pv: 0, ph: 10, fs: 13, gap: 6, icon: 16 },
        md: { h: 40, pv: 0, ph: 12, fs: 14, gap: 8, icon: 18 },
    };

    const s = sizeMap[size];
    const wrapperRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [isOpen, setIsOpen] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    const showInternalLabel = label && labelPlacement === "left";
    const selected = normalizedOptions.find((opt) => opt.value === value);
    const isPlaceholder = !value || value === "";
    const displayLabel = selected?.label || (isPlaceholder ? "선택" : placeholder || "");

    const toggle = () => !disabled && setIsOpen((prev) => !prev);

    const handleSelect = (opt: any) => {
        onChange?.(opt.value);
        setIsOpen(false);
    };

    useEffect(() => {
        const handleOutside = (e: MouseEvent) => {
            if (
                wrapperRef.current &&
                !wrapperRef.current.contains(e.target as Node) &&
                !dropdownRef.current?.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleOutside);
        return () => document.removeEventListener("mousedown", handleOutside);
    }, []);

    useEffect(() => {
        if (isOpen && wrapperRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const DROPDOWN_MAX_HEIGHT = 240;
            const DROPDOWN_MARGIN = 4;
            const openUpward =
                viewportHeight - rect.bottom < DROPDOWN_MAX_HEIGHT && rect.top > viewportHeight - rect.bottom;

            setDropdownStyle({
                position: "fixed",
                [openUpward ? "bottom" : "top"]: openUpward
                    ? viewportHeight - rect.top + DROPDOWN_MARGIN
                    : rect.bottom + DROPDOWN_MARGIN,
                left: rect.left,
                width: rect.width,
                maxHeight: DROPDOWN_MAX_HEIGHT,
                zIndex: 9999,
            });
        }
    }, [isOpen]);

    return (
        <SelectContainer className={className} style={style} $placement={labelPlacement}>
            {/* 외부 상단 라벨 (Top 배치일 때만) */}
            {label && labelPlacement === "top" && (
                <LabelRow>
                    <LabelText>
                        {label} {required && <RequiredMark>*</RequiredMark>}
                    </LabelText>
                </LabelRow>
            )}

            <InnerWrapper>
                <SelectWrapper ref={wrapperRef} $h={s.h}>
                    <SelectButton
                        onClick={toggle}
                        open={isOpen}
                        $hasError={hasError}
                        $h={s.h}
                        $pv={s.pv}
                        $ph={s.ph}
                        $gap={s.gap}
                        $borderless={borderless}
                        $disabled={disabled}
                        $hasLeft={Boolean(showInternalLabel)}>
                        {/* 내부 라벨 (Left 배치일 때만) */}
                        {showInternalLabel && (
                            <InternalLabelBox $width={labelWidth}>
                                {label}
                                {required && <RequiredMark style={{ marginLeft: "2px" }}>*</RequiredMark>}
                            </InternalLabelBox>
                        )}

                        <LabelValue $fs={s.fs} $hasLeft={Boolean(showInternalLabel)} $isPlaceholder={isPlaceholder}>
                            {displayLabel}
                        </LabelValue>

                        {!disabled && (
                            <div style={{ paddingRight: s.ph }}>
                                <CustomCaretIcon size={s.icon} open={isOpen} weight="bold" />
                            </div>
                        )}
                    </SelectButton>

                    {isOpen &&
                        createPortal(
                            <Dropdown
                                ref={dropdownRef}
                                style={dropdownStyle}
                                $hasError={hasError}
                                $borderless={borderless}>
                                {normalizedOptions.map((opt) => (
                                    <Option
                                        key={opt.value}
                                        selected={opt.value === value}
                                        onClick={() => handleSelect(opt)}>
                                        <div>{opt.label}</div>
                                    </Option>
                                ))}
                            </Dropdown>,
                            document.body,
                        )}
                </SelectWrapper>
                {hasError && errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
            </InnerWrapper>
        </SelectContainer>
    );
}
