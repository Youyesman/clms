import React, { useRef } from "react";
import styled, { css } from "styled-components";
import { CalendarBlank, Clock } from "@phosphor-icons/react";

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
    labelPlacement?: "left" | "top";
    labelWidth?: string;
};

/** 1. 컨테이너 **/
const InputContainer = styled.div<{ $placement: "left" | "top" }>`
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
`;

/** 2. 외부 라벨 **/
const LabelRow = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
`;

const LabelText = styled.label<{ $size: "sm" | "md" }>`
    color: #64748b;
    font-size: ${({ $size }) => ($size === "sm" ? "11px" : "12px")}; // ✅ 사이즈 대응
    font-family: SUIT;
    font-weight: 700;
    white-space: nowrap;
`;

const RequiredMark = styled.span`
    color: #ef4444;
`;

const InputWrapper = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

/** 3. 인풋 박스 **/
const InputBox = styled.div<InputBoxProps>`
    height: ${({ $size }) => ($size === "sm" ? "24px" : "32px")}; // ✅ 높이 조절
    background: ${({ disabled }) => (disabled ? "#f1f5f9" : "white")};
    border-radius: 4px;
    display: flex;
    align-items: center;
    position: relative;
    transition: all 0.2s ease;

    ${({ borderless, $hasLeft, hasError, $size }) =>
        borderless
            ? css`
                  padding: 0;
                  border: none !important;
                  background: transparent;
              `
            : css`
                  padding: ${$hasLeft ? ($size === "sm" ? "0 6px 0 0" : "0 10px 0 0") : ($size === "sm" ? "0 6px" : "0 10px")};
                  outline: 1px solid ${hasError ? "#ef4444" : "#cbd5e1"};
                  outline-offset: -1px;

                  &:focus-within {
                      outline: 1px solid #0f172a;
                  }
              `}
`;

/** 4. 내부 라벨 박스 **/
const InternalLabelBox = styled.div<{ $width?: string; $size: "sm" | "md" }>`
    height: 100%;
    width: ${({ $width }) => $width || "auto"};
    min-width: fit-content;
    padding: ${({ $size }) => ($size === "sm" ? "0 8px" : "0 12px")}; // ✅ 패딩 조절
    background: #f1f5f9;
    border-right: 1px solid #cbd5e1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${({ $size }) => ($size === "sm" ? "11px" : "12px")}; // ✅ 폰트 조절
    font-weight: 700;
    color: #475569;
    border-radius: 3px 0 0 3px;
    white-space: nowrap;
`;

const InputField = styled.input<{ align?: string; $hasLeft?: boolean; disabled?: boolean; $size: "sm" | "md" }>`
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    padding-left: ${({ $hasLeft, $size }) => ($hasLeft ? ($size === "sm" ? "6px" : "10px") : "0")};
    font-size: ${({ $size }) => ($size === "sm" ? "12px" : "13px")}; // ✅ 폰트 조절
    font-family: SUIT;
    font-weight: 500;
    color: ${({ disabled }) => (disabled ? "#94a3b8" : "#1e293b")};
    text-align: ${({ align }) => align || "left"};

    &::placeholder {
        color: #94a3b8;
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
`;

const RightIconBox = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #64748b;
`;

const ErrorText = styled.span`
    font-size: 11px;
    color: #ef4444;
    font-weight: 500;
    margin-left: 4px;
`;

interface InputBoxProps {
    hasError?: boolean;
    disabled?: boolean;
    borderless?: boolean;
    $hasLeft?: boolean;
    $size: "sm" | "md"; // ✅ 스타일드 컴포넌트용 사이즈
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
    labelPlacement = "left",
    labelWidth,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const showInternalLabel = label && labelPlacement === "left";
    const internalLabelContent = leftLabel || label;

    // 아이콘 사이즈도 사이즈에 따라 조절
    const iconSize = size === "sm" ? 14 : 16;

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
        <InputContainer className={className} style={style} $placement={labelPlacement}>
            {label && labelPlacement === "top" && (
                <LabelRow>
                    <LabelText $size={size}>
                        {label} {required && <RequiredMark>*</RequiredMark>}
                    </LabelText>
                </LabelRow>
            )}

            <InputWrapper>
                <InputBox
                    hasError={hasError}
                    disabled={disabled}
                    borderless={borderless}
                    $size={size}
                    $hasLeft={Boolean(showInternalLabel || leftLabel)}>
                    {(showInternalLabel || leftLabel) && (
                        <InternalLabelBox $width={labelWidth} $size={size}>
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
                        $hasLeft={Boolean(showInternalLabel || leftLabel)}
                        onKeyDown={onKeyDown}
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