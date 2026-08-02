import React, { useEffect, useRef, useState } from "react";
import styled, { keyframes, css } from "styled-components";
import { CaretDown } from "@phosphor-icons/react";
import { createPortal } from "react-dom";
import { ui } from "../../styles/uiTokens";
import {
    NEUTRAL_FILTER_VALUES,
    filterChipBox,
    filterChipCaret,
    filterChipLabel,
    filterChipValue,
} from "../../styles/chipStyles";

/* ---------------- Animation ---------------- */
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
`;

/* ---------------- Layout Components ---------------- */

const SelectContainer = styled.div<{ $placement: "left" | "top"; $chip?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 4px;
    /* 칩은 내용만큼만 차지합니다 (필터바에서 나란히 붙이기 위함) */
    width: ${({ $chip }) => ($chip ? "auto" : "100%")};
`;

/** 1. 외부 라벨 영역: labelPlacement가 "top"일 때만 사용 **/
const LabelRow = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
`;

const LabelText = styled.label`
    color: ${ui.color.textMuted};
    font-size: ${ui.font.size.sm};
    font-family: ${ui.font.family};
    font-weight: ${ui.font.weight.semibold};
    line-height: 16px;
    white-space: nowrap;
`;

const RequiredMark = styled.span`
    color: ${ui.color.danger};
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

/** 칩(노션 필터) 모드 — 모양은 styles/chipStyles.ts에서 공통 관리 */
const chipButtonStyle = css<{ open?: boolean; $applied?: boolean }>`
    ${filterChipBox}

    /* 열려 있는 동안은 눌린 상태가 보이도록 */
    ${({ open, $applied }) =>
        open &&
        css`
            border-color: ${$applied ? ui.color.primary : ui.color.borderStrong};
            background: ${$applied ? ui.color.primarySoft : ui.color.surfaceMuted};
        `}
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
    $chip?: boolean;
    $applied?: boolean;
}>`
    display: inline-flex;
    width: 100%;
    height: ${({ $h }) => $h}px;
    /* 내부 라벨이 있으면 왼쪽 패딩 제거 */
    padding: ${({ $borderless, $pv, $ph, $hasLeft }) =>
        $borderless ? "0px" : `${$pv}px ${$ph}px ${$pv}px ${$hasLeft ? "0px" : `${$ph}px`}`};
    background: ${({ $disabled }) => ($disabled ? ui.color.surfaceSunken : ui.color.surface)};
    border-radius: ${ui.radius.md};

    border: ${({ $borderless, $hasError, open }) =>
        $borderless
            ? "none"
            : $hasError
              ? `1px solid ${ui.color.danger}`
              : open
                ? `1px solid ${ui.color.primary}`
                : `1px solid ${ui.color.borderStrong}`};
    box-shadow: ${({ open, $borderless }) => (open && !$borderless ? `0 0 0 3px ${ui.color.primarySoft}` : "none")};

    align-items: center;
    gap: ${({ $gap }) => $gap}px;
    cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
        border-color: ${({ open }) => (open ? ui.color.primary : ui.color.textSubtle)};
    }

    ${({ $chip }) => $chip && chipButtonStyle}
`;

/** 3. 내부 라벨: 회색 배경 없이 옅은 구분선만 — 라벨이 값보다 무거워 보이지 않게 **/
const InternalLabelBox = styled.div<{ $width?: string; $chip?: boolean; $applied?: boolean }>`
    height: 100%;
    width: ${({ $width }) => $width || "auto"};
    min-width: fit-content;
    padding: 0 10px;
    background: transparent;
    border-right: 1px solid ${ui.color.border};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${ui.font.size.sm};
    font-weight: ${ui.font.weight.medium};
    color: ${ui.color.textMuted};
    white-space: nowrap;
    flex-shrink: 0;

    /* 칩 모드: 구분선 없이 라벨과 값이 한 덩어리로 읽히게 */
    ${({ $chip }) => $chip && filterChipLabel}
`;

const LabelValue = styled.div<{
    $fs: number;
    $hasLeft?: boolean;
    $isPlaceholder?: boolean;
    $chip?: boolean;
    $applied?: boolean;
}>`
    flex: 1;
    color: ${({ $isPlaceholder }) => ($isPlaceholder ? ui.color.textSubtle : ui.color.text)};
    font-size: ${({ $fs }) => $fs}px;
    font-family: SUIT;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-left: ${({ $hasLeft }) => ($hasLeft ? "10px" : "0")};

    /* 칩 모드: 선택된 값은 진하게 */
    ${({ $chip }) => $chip && filterChipValue}
    /* 칩 모드 placeholder("선택")는 옅게 — 라벨과 구분되면서 빈 상태임이 보이게 */
    ${({ $chip, $isPlaceholder }) =>
        $chip &&
        $isPlaceholder &&
        css`
            color: ${ui.color.textSubtle};
            font-weight: ${ui.font.weight.regular};
        `}
`;

const Option = styled.div<{ selected?: boolean }>`
    min-height: 34px;
    padding: 0 12px;
    border-radius: ${ui.radius.sm};
    background: ${({ selected }) => (selected ? ui.color.primarySoft : "transparent")};
    display: flex;
    align-items: center;
    cursor: pointer;
    margin-bottom: 2px;
    flex-shrink: 0;

    &:last-child {
        margin-bottom: 0;
    }

    &:hover {
        background: ${({ selected }) => (selected ? ui.color.primarySoft : ui.color.surfaceHover)};
    }
    div {
        flex: 1;
        font-size: ${ui.font.size.base};
        font-weight: ${({ selected }) => (selected ? ui.font.weight.semibold : ui.font.weight.regular)};
        color: ${({ selected }) => (selected ? ui.color.primary : ui.color.text)};
        text-align: left;
    }
`;

export const CustomCaretIcon = styled(CaretDown) <{ open?: boolean; $applied?: boolean }>`
    color: ${ui.color.textSubtle};
    transition: transform 0.2s ease;
    ${({ open }) => open && `transform: rotate(180deg);`}
    ${({ $applied }) => $applied && filterChipCaret}
`;

const Dropdown = styled.div<{ $hasError?: boolean; $borderless?: boolean }>`
    position: absolute;
    white-space: nowrap;
    padding: 4px;
    background: ${ui.color.surface};
    box-shadow: ${ui.shadow.lg};
    border-radius: ${ui.radius.lg};
    border: 1px solid ${ui.color.border};
    display: flex;
    flex-direction: column;
    gap: 0;
    z-index: 10000;
    max-height: 300px;
    overflow-y: auto;
    animation: ${fadeIn} 0.15s ease;
`;

const ErrorMessage = styled.div`
    color: ${ui.color.danger};
    font-size: ${ui.font.size.xs};
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
    variant = "default",
    neutralValues = NEUTRAL_FILTER_VALUES,
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
    /** "chip" — 필터바용 노션식 칩 */
    variant?: "default" | "chip";
    /**
     * 칩 모드에서 "필터가 걸리지 않은 것"으로 볼 값들.
     * 기본은 빈 값과 "전체" — 전 페이지 쿼리 빌더가 쓰는 규칙과 같습니다.
     * 화면에 따라 다르면 이 prop으로 재정의하세요. 예) neutralValues={["", "미지정"]}
     */
    neutralValues?: string[];
}) {
    const rawOptions = options.map((opt) => (typeof opt === "string" ? { label: opt, value: opt } : opt));
    const normalizedOptions = allowClear ? [{ label: "선택", value: "" }, ...rawOptions] : rawOptions;

    const sizeMap = {
        xs: { h: 26, pv: 0, ph: 8, fs: 12, gap: 4, icon: 14 },
        sm: { h: 32, pv: 0, ph: 10, fs: 13, gap: 6, icon: 16 },
        md: { h: 40, pv: 0, ph: 12, fs: 14, gap: 8, icon: 18 },
    };

    const isChip = variant === "chip";
    const s = isChip ? { ...sizeMap[size], h: 30, ph: 10, icon: 12 } : sizeMap[size];
    const wrapperRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [isOpen, setIsOpen] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    const showInternalLabel = label && labelPlacement === "left";
    const selected = normalizedOptions.find((opt) => opt.value === value);
    const isPlaceholder = !value || value === "";
    /* 칩 모드에서도 값 영역을 항상 유지 — 비어 있으면 옅은 "선택" placeholder.
       (값이 비면 라벨만 남아 칩이 너무 좁아져 누르기 어렵다는 요청) */
    const displayLabel = isChip
        ? isPlaceholder
            ? placeholder || "선택"
            : selected?.label || ""
        : selected?.label || (isPlaceholder ? "선택" : placeholder || "");

    /* 실제로 목록을 걸러내고 있는 필터인지 — 값과 표시 라벨 양쪽 다 확인 */
    const isApplied =
        isChip &&
        !isPlaceholder &&
        !neutralValues.includes(value ?? "") &&
        !neutralValues.includes(selected?.label ?? "");

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

    // 스크롤 시 드롭다운 닫기 (드롭다운 내부 스크롤은 제외)
    useEffect(() => {
        if (!isOpen) return;
        const close = (e: Event) => {
            // 드롭다운 내부에서 발생한 스크롤은 무시
            if (dropdownRef.current?.contains(e.target as Node)) return;
            setIsOpen(false);
        };
        window.addEventListener("scroll", close, true);
        return () => window.removeEventListener("scroll", close, true);
    }, [isOpen]);

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
                /* 칩은 폭이 좁아 드롭다운까지 좁아지면 옵션이 잘립니다 → 최소폭만 주고 내용에 맞춥니다 */
                ...(isChip
                    ? { minWidth: Math.max(rect.width, 160) }
                    : { width: rect.width }),
                maxHeight: DROPDOWN_MAX_HEIGHT,
                zIndex: 9999,
            });
        }
    }, [isOpen, isChip]);

    return (
        <SelectContainer className={className} style={style} $placement={labelPlacement} $chip={isChip}>
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
                        $chip={isChip}
                        $applied={isApplied}
                        $hasLeft={Boolean(showInternalLabel)}>
                        {/* 내부 라벨 (Left 배치일 때만) */}
                        {showInternalLabel && (
                            <InternalLabelBox $width={labelWidth} $chip={isChip} $applied={isApplied}>
                                {label}
                                {required && <RequiredMark style={{ marginLeft: "2px" }}>*</RequiredMark>}
                            </InternalLabelBox>
                        )}

                        {(!isChip || displayLabel !== "") && (
                            <LabelValue
                                $fs={s.fs}
                                $hasLeft={Boolean(showInternalLabel)}
                                $isPlaceholder={isPlaceholder}
                                $chip={isChip}
                                $applied={isApplied}>
                                {displayLabel}
                            </LabelValue>
                        )}

                        {!disabled && (
                            <div
                                style={{
                                    paddingLeft: isChip ? 5 : 0,
                                    paddingRight: isChip ? 0 : s.ph,
                                    display: "flex",
                                    alignItems: "center",
                                }}>
                                <CustomCaretIcon size={s.icon} open={isOpen} $applied={isApplied} weight="bold" />
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
