import React from "react";
import styled, { css } from "styled-components";
import { useDaumPostcodePopup } from "react-daum-postcode";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

/* ---------------- Label 구조 ---------------- */

const InputContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const LabelRow = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
`;

const LabelText = styled.label`
    color: var(--Gray-500);
    font-size: 14px;
    font-family: SUIT;
    font-weight: 700;
`;
const RequiredMark = styled.span`
    color: var(--Red-600);
`;

const ErrorMessage = styled.div`
    color: var(--Red-600);
    font-size: 13px;
    font-weight: 500;
    margin-left: 4px;
`;

/* ---------------- Input 구조 ---------------- */

const Wrapper = styled.div`
    flex: 1;
    position: relative;
`;

const InputWrapper = styled.div<{ $hasError?: boolean; $color?: string }>`
    position: relative;
    width: 100%;
    height: 44px;
    display: flex;
    align-items: center;
    background: var(--White-white);
    border: 1px solid var(--Gray-300);
    border-radius: 4px;
    overflow: hidden;

    ${({ $hasError }) =>
        $hasError &&
        css`
            border-color: var(--Red-600);
        `}

    &:focus-within {
        ${({ $hasError, $color }) =>
            !$hasError &&
            css`
                border-color: ${$color === "gray" ? "var(--Gray-800)" : "var(--FEG-Dark-50)"};
            `}
    }
`;

const LeftBar = styled.div`
    position: absolute;
    left: 0;
    top: 0;
    width: 4px;
    height: 100%;
    background-color: var(--FEG-Dark-50);
    border-radius: 4px 0 0 4px;
    z-index: 1;
`;

const StyledInput = styled.input`
    flex: 1;
    border: none;
    outline: none;
    font-size: 16px;
    font-family: SUIT;
    background: transparent;
    text-indent: 10px;
    cursor: pointer;
    padding-right: 36px;

    &::placeholder {
        color: var(--Gray-400);
    }
`;

const IconButton = styled.button`
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;

    &:focus-visible {
        outline: 2px solid var(--FEG-Dark-50);
        outline-offset: 2px;
    }
`;

type Props = {
    value: string;
    setValue: (v: string, data?: any) => void;
    placeholder?: string;
    required?: boolean;
    hasError?: boolean;
    errorMessage?: string;
    iconColor?: string;
    label?: string;
    color?: "gray" | "dark" | "default";
    style?: React.CSSProperties; // ← 추가됨
};

export function ZipCodeSearchInput({
    value,
    setValue,
    placeholder = "Zip Code",
    required = false,
    hasError,
    errorMessage,
    iconColor = "dark",
    label,
    color = "default",
    style, // ← 추가됨
}: Props) {
    const { t } = useTranslation();
    const translatedPlaceholder = t(placeholder);
    const open = useDaumPostcodePopup("https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js");

    const openPopup = () => {
        open({
            onComplete: (data) => {
                setValue(data.zonecode, data);
            },
            alwaysShowEngAddr: true,
        });
    };

    const resolveIconColor = (color?: string) => {
        if (!color) return undefined;
        const lower = color.toLowerCase();
        if (lower === "gray") return "var(--Gray-800)";
        if (lower === "dark") return "var(--FEG-Dark-50)";
        if (lower === "light") return "var(--Gray-400)";
        return color;
    };

    return (
        <InputContainer style={style}>
            {label && (
                <LabelRow>
                    <LabelText>{label}</LabelText>
                    {required && <RequiredMark>*</RequiredMark>}
                </LabelRow>
            )}

            <Wrapper>
                <InputWrapper $hasError={hasError} $color={color}>
                    {required && <LeftBar />}
                    <StyledInput type="text" placeholder={translatedPlaceholder} value={value} onClick={openPopup} readOnly />
                    <IconButton onClick={openPopup}>
                        <MagnifyingGlassIcon size={24} weight="bold" color={resolveIconColor(iconColor)} />
                    </IconButton>
                </InputWrapper>

                {hasError && errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
            </Wrapper>
        </InputContainer>
    );
}
