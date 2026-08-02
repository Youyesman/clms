import React, { useRef } from "react";
import styled, { css } from "styled-components";
import { CalendarBlank, Clock } from "@phosphor-icons/react";
import { ui } from "../../styles/uiTokens";
import { filterChipBox, filterChipInput, filterChipLabel } from "../../styles/chipStyles";

type CustomInputProps = {
    value: string;
    setValue: (v: string) => void;
    size?: "sm" | "md"; // ✅ 사이즈 프로퍼티 추가
    placeholder?: string;
    inputType?: string;
    hasError?: boolean;
    errorMessage?: string;
    disabled?: boolean;
    label?: string;
    required?: boolean;
    rightLabel?: string;
    name?: string;
    autoComplete?: string;
    borderless?: boolean;
    align?: "left" | "center" | "right";
    dateIcon?: React.ReactNode;
    leftLabel?: string | React.ReactNode;
    rightIcon?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onBlur?: () => void;
    labelPlacement?: "left" | "top";
    labelWidth?: string;
    /** "chip" — 필터바용 노션식 칩 (테두리 없음, hover 시에만 배경) */
    variant?: "default" | "chip";
    /** date/month/number 입력의 허용 범위 */
    min?: string | number;
    max?: string | number;
    readOnly?: boolean;
};

/** 1. 컨테이너 **/
const InputContainer = styled.div<{ $placement: "left" | "top"; $chip?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 4px;
    /* 칩은 내용만큼만 차지합니다 (필터바에서 나란히 붙이기 위함) */
    width: ${({ $chip }) => ($chip ? "auto" : "100%")};
`;

/** 2. 외부 라벨 **/
const LabelRow = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
`;

const LabelText = styled.label<{ $size: "sm" | "md" }>`
    color: ${ui.color.textMuted};
    font-size: ${({ $size }) => ($size === "sm" ? ui.font.size.xs : ui.font.size.sm)};
    font-family: ${ui.font.family};
    font-weight: ${ui.font.weight.semibold};
    line-height: 16px;
    white-space: nowrap;
`;

const RequiredMark = styled.span`
    color: ${ui.color.danger};
`;

const InputWrapper = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

/** 3. 인풋 박스 **/
const InputBox = styled.div<InputBoxProps>`
    height: ${({ $size }) => ($size === "sm" ? `${ui.control.xs - 2}px` : `${ui.control.sm}px`)};
    background: ${({ $disabled }) => ($disabled ? ui.color.surfaceSunken : ui.color.surface)};
    border-radius: ${ui.radius.md};
    display: flex;
    align-items: center;
    position: relative;
    transition: all 0.15s ease;

    ${({ $borderless, $hasLeft, $hasError, $size }) =>
        $borderless
            ? css`
                  padding: 0;
                  border: none !important;
                  background: transparent;
              `
            : css`
                  padding: ${$hasLeft ? ($size === "sm" ? "0 6px 0 0" : "0 10px 0 0") : ($size === "sm" ? "0 6px" : "0 10px")};
                  outline: 1px solid ${$hasError ? ui.color.danger : ui.color.borderStrong};
                  outline-offset: -1px;

                  &:hover {
                      outline-color: ${$hasError ? ui.color.danger : ui.color.textSubtle};
                  }
                  &:focus-within {
                      outline: 1px solid ${ui.color.primary};
                      box-shadow: 0 0 0 3px ${ui.color.primarySoft};
                  }
              `}

    /* 칩 모드: 모양은 styles/chipStyles.ts에서 공통 관리. 입력 중에는 파란 링 */
    ${({ $chip }) =>
        $chip &&
        css`
            /* 기본 모드가 outline으로 테두리를 그리므로 칩에서는 꺼줍니다 */
            outline: none !important;
            ${filterChipBox}

            &:focus-within {
                outline: none !important;
                border-color: ${ui.color.primary};
                background: ${ui.color.surface};
                box-shadow: 0 0 0 3px ${ui.color.primarySoft};
            }
        `}
`;

/** 4. 내부 라벨: 회색 배경 없이 옅은 구분선만 **/
const InternalLabelBox = styled.div<{ $width?: string; $size: "sm" | "md"; $chip?: boolean; $applied?: boolean }>`
    height: 100%;
    width: ${({ $width }) => $width || "auto"};
    min-width: fit-content;
    padding: ${({ $size }) => ($size === "sm" ? "0 8px" : "0 10px")};
    background: transparent;
    border-right: 1px solid ${ui.color.border};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${({ $size }) => ($size === "sm" ? ui.font.size.xs : ui.font.size.sm)};
    font-weight: ${ui.font.weight.medium};
    color: ${ui.color.textMuted};
    white-space: nowrap;

    /* 칩 모드: 구분선 없이 라벨과 값이 한 덩어리로 읽히게 */
    ${({ $chip }) => $chip && filterChipLabel}
`;

const InputField = styled.input<{
    align?: string;
    $hasLeft?: boolean;
    disabled?: boolean;
    $size: "sm" | "md";
    $chip?: boolean;
    $chipAuto?: boolean;
    $applied?: boolean;
}>`
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    padding-left: ${({ $hasLeft, $size }) => ($hasLeft ? ($size === "sm" ? "6px" : "10px") : "0")};
    font-size: ${({ $size }) => ($size === "sm" ? ui.font.size.sm : ui.font.size.base)};
    font-family: ${ui.font.family};
    font-weight: ${ui.font.weight.regular};
    color: ${({ disabled }) => (disabled ? ui.color.textSubtle : ui.color.text)};
    text-align: ${({ align }) => align || "left"};

    &::placeholder {
        color: ${ui.color.textSubtle};
        font-style: normal;
    }

    &[type="number"]::-webkit-outer-spin-button,
    &[type="number"]::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    &[type="date"]::-webkit-calendar-picker-indicator,
    &[type="date"]::-webkit-inner-spin-button,
    &[type="date"]::-webkit-clear-button,
    &[type="time"]::-webkit-calendar-picker-indicator,
    &[type="time"]::-webkit-inner-spin-button,
    &[type="time"]::-webkit-clear-button {
        display: none;
        -webkit-appearance: none;
        appearance: none;
    }

    -moz-appearance: textfield;

    /* 칩 모드에서는 부모 폭이 내용에 맞춰지므로 input이 0으로 찌그러집니다.
       날짜/시간처럼 브라우저가 고유 폭을 갖는 타입은 auto로 둡니다. */
    ${({ $chip }) => $chip && filterChipInput}
`;

const RightIconBox = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: ${ui.color.textSubtle};
`;

const ErrorText = styled.span`
    font-size: ${ui.font.size.xs};
    color: ${ui.color.danger};
    font-weight: ${ui.font.weight.medium};
    margin-left: 4px;
`;

interface InputBoxProps {
    $hasError?: boolean;
    $disabled?: boolean;
    $borderless?: boolean;
    $hasLeft?: boolean;
    $size: "sm" | "md"; // ✅ 스타일드 컴포넌트용 사이즈
    $chip?: boolean;
    $applied?: boolean;
}

export const CustomInput: React.FC<CustomInputProps> = ({
    value,
    setValue,
    size = "md", // ✅ 기본값 md
    placeholder,
    inputType = "text",
    hasError,
    errorMessage,
    disabled,
    label,
    required,
    rightLabel,
    leftLabel,
    name,
    autoComplete,
    borderless,
    align = "left",
    dateIcon,
    rightIcon,
    className,
    style,
    onKeyDown,
    onBlur,
    labelPlacement = "left",
    labelWidth,
    variant = "default",
    min,
    max,
    readOnly,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const isChip = variant === "chip";
    const showInternalLabel = label && labelPlacement === "left";
    const internalLabelContent = leftLabel || label;
    /* 날짜·시간 입력은 브라우저가 고유 폭을 잡으므로 칩에서도 고정폭을 주지 않습니다 */
    const chipAutoWidth = inputType === "date" || inputType === "time";
    /* 입력값이 있으면 실제로 걸러내고 있는 필터 */
    const isApplied = isChip && Boolean(String(value ?? "").trim());

    // 아이콘 사이즈도 사이즈에 따라 조절
    const iconSize = isChip ? 13 : size === "sm" ? 14 : 16;

    const autoIcon =
        inputType === "date" ? (
            dateIcon || <CalendarBlank size={iconSize} />
        ) : inputType === "time" ? (
            <Clock size={iconSize} />
        ) : null;

    const openPicker = () => {
        const el = inputRef.current;
        if (el && typeof (el as any).showPicker === "function") (el as any).showPicker();
    };

    return (
        <InputContainer className={className} style={style} $placement={labelPlacement} $chip={isChip}>
            {label && labelPlacement === "top" && (
                <LabelRow>
                    <LabelText $size={size}>
                        {label} {required && <RequiredMark>*</RequiredMark>}
                    </LabelText>
                </LabelRow>
            )}

            <InputWrapper>
                <InputBox
                    $hasError={hasError}
                    $disabled={disabled}
                    $borderless={borderless}
                    $size={size}
                    $chip={isChip}
                    $applied={isApplied}
                    $hasLeft={Boolean(showInternalLabel || leftLabel)}>
                    {(showInternalLabel || leftLabel) && (
                        <InternalLabelBox $width={labelWidth} $size={size} $chip={isChip} $applied={isApplied}>
                            {internalLabelContent}
                            {required && labelPlacement === "left" && (
                                <RequiredMark style={{ marginLeft: "2px" }}>*</RequiredMark>
                            )}
                        </InternalLabelBox>
                    )}

                    <InputField
                        ref={inputRef}
                        type={inputType}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={placeholder}
                        disabled={disabled}
                        name={name}
                        autoComplete={autoComplete}
                        align={align}
                        $size={size}
                        $chip={isChip}
                        $chipAuto={chipAutoWidth}
                        $applied={isApplied}
                        $hasLeft={Boolean(showInternalLabel || leftLabel)}
                        onKeyDown={onKeyDown}
                        onBlur={onBlur}
                        min={min}
                        max={max}
                        readOnly={readOnly}
                    />

                    {rightLabel && (
                        <span style={{ fontSize: size === "sm" ? "11px" : "12px", color: "#94a3b8", marginLeft: "4px" }}>
                            {rightLabel}
                        </span>
                    )}
                    {rightIcon && <RightIconBox>{rightIcon}</RightIconBox>}
                    {!rightIcon && autoIcon && (
                        <RightIconBox onClick={inputType === "date" || inputType === "time" ? openPicker : undefined}>
                            {autoIcon}
                        </RightIconBox>
                    )}
                </InputBox>

                {hasError && errorMessage && <ErrorText>{errorMessage}</ErrorText>}
            </InputWrapper>
        </InputContainer>
    );
};