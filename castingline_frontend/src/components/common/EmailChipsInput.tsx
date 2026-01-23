// EmailChipsInput.tsx
import { XCircleIcon, XIcon } from "@phosphor-icons/react";
import { useState, KeyboardEvent, useRef, useEffect } from "react";
import styled from "styled-components";
import { AxiosGet } from "../../axios/Axios";
import { useTranslation } from "react-i18next";

interface Props {
    values: string[];
    setValues: (emails: string[]) => void;
    placeholder?: string;
    rightElement?: React.ReactNode;
}

export const EmailChipsInput = ({ values, setValues, placeholder, rightElement }: Props) => {
    const { t } = useTranslation();
    const [inputValue, setInputValue] = useState("");
    const [hasError, setHasError] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [highlightIndex, setHighlightIndex] = useState(-1); // 🔥 강조된 자동완성 index
    const inputRef = useRef<HTMLInputElement>(null);

    /** 이메일 유효성 검사 */
    const isValidEmail = (email: string) => /\S+@\S+\.\S+/.test(email);

    /** 이메일 추가 */
    const addEmail = (raw: string) => {
        const email = raw.trim().replace(/,$/, "");
        if (!email) return;

        if (!isValidEmail(email)) {
            setHasError(true);
            setErrorMessage(t("Invalid email format."));
            return;
        }

        if (values.includes(email)) {
            setHasError(true);
            setErrorMessage(t("This email is already added."));
            return;
        }

        setValues([...values, email]);
        setInputValue("");
        setSuggestions([]);
        setHighlightIndex(-1);
        setHasError(false);
        setErrorMessage("");
    };

    /** 🔥 자동완성 API 요청 */
    const fetchEmails = async (keyword: string) => {
        if (!keyword) {
            setSuggestions([]);
            return;
        }
        try {
            const res = await AxiosGet(`email-autocomplete/?q=${keyword}`);
            setSuggestions(res.data.results || []);
            setHighlightIndex(-1); // 검색할 때 index 초기화
        } catch {
            setSuggestions([]);
        }
    };

    /** 입력 디바운스 */
    useEffect(() => {
        const t = setTimeout(() => fetchEmails(inputValue), 120);
        return () => clearTimeout(t);
    }, [inputValue]);

    /** 🔥 키 입력 처리 */
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        // ↑↓ 존재 시 드롭다운에서 이동
        if (suggestions.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
                return;
            }

            if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
                return;
            }

            if (e.key === "Enter" && highlightIndex >= 0) {
                e.preventDefault();
                addEmail(suggestions[highlightIndex]);
                return;
            }

            if (e.key === "Escape") {
                setSuggestions([]);
                setHighlightIndex(-1);
                return;
            }
        }

        // 기존 칩 추가 기능
        if (["Enter", ",", " ", ";"].includes(e.key)) {
            e.preventDefault();
            addEmail(inputValue);
        }

        // Tab → 칩 생성 후 다음 input 이동
        if (e.key === "Tab") {
            addEmail(inputValue);
            return;
        }

        // Backspace → 마지막 칩 삭제
        if (e.key === "Backspace" && !inputValue && values.length > 0) {
            const newValues = values.slice(0, values.length - 1);
            setValues(newValues);
            setHasError(false);
            setErrorMessage("");
        }
    };

    /** 자동완성 항목 클릭 */
    const selectSuggestion = (email: string) => {
        addEmail(email);
    };

    /** input focus */
    const focusInput = () => inputRef.current?.focus();

    /** 단일 칩 삭제 */
    const removeChip = (email: string) => {
        setValues(values.filter((v) => v !== email));
        setHasError(false);
        setErrorMessage("");
    };

    /** 전체 삭제 */
    const clearAll = () => {
        setValues([]);
        setInputValue("");
        setSuggestions([]);
        setHighlightIndex(-1);
        setHasError(false);
        setErrorMessage("");
        inputRef.current?.focus();
    };

    return (
        <Wrapper>
            <InputWrapper hasError={hasError} onClick={focusInput}>
                {values.map((email) => (
                    <Chip key={email}>
                        <span>{email}</span>
                        <XCircleIcon
                            onClick={() => removeChip(email)}
                            weight="fill"
                            size={18}
                            style={{ cursor: "pointer" }}
                        />
                    </Chip>
                ))}

                <StyledInput
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => {
                        setInputValue(e.target.value);
                        if (hasError) {
                            setHasError(false);
                            setErrorMessage("");
                        }
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                />

                <RightWrapper>
                    {rightElement && <RightSlot>{rightElement}</RightSlot>}
                    {values.length > 0 && <XIcon onClick={clearAll} size={20} style={{ cursor: "pointer" }} />}
                </RightWrapper>
            </InputWrapper>

            {/* 🔥 자동완성 드롭다운 */}
            {suggestions.length > 0 && (
                <Dropdown>
                    {suggestions.map((email, idx) => (
                        <DropdownItem
                            key={email}
                            highlighted={idx === highlightIndex}
                            onMouseEnter={() => setHighlightIndex(idx)}
                            onClick={() => selectSuggestion(email)}>
                            {email}
                        </DropdownItem>
                    ))}
                </Dropdown>
            )}

            {hasError && <ErrorText>{errorMessage}</ErrorText>}
        </Wrapper>
    );
};

/* ---------------------- Styled ---------------------- */

const Wrapper = styled.div`
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    position: relative;
`;

const InputWrapper = styled.div<{ hasError?: boolean }>`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 8px 36px 8px 12px;
    background: white;

    outline: 1px solid ${({ hasError }) => (hasError ? "var(--Red-600)" : "var(--Gray-300)")};
    border-radius: 4px;
    cursor: text;

    &:focus-within {
        outline: 1px solid ${({ hasError }) => (hasError ? "var(--Red-600)" : "var(--Gray-800)")};
    }
`;

const Chip = styled.div`
    display: inline-flex;
    align-items: center;
    padding: 5px 10px;
    background: var(--Gray-200);
    border-radius: 100px;
    font-size: 14px;
    color: var(--Gray-800);
    gap: 6px;
`;

const StyledInput = styled.input`
    flex: 1;
    min-width: 120px;
    border: none;
    outline: none;
    font-size: 15px;
    font-family: SUIT;
    color: var(--Gray-800);
    background: transparent;
`;

const Dropdown = styled.div`
    position: absolute;
    top: 100%;
    width: 100%;
    background: white;
    border: 1px solid var(--Gray-300);
    border-radius: 4px;
    margin-top: 4px;
    max-height: 180px;
    overflow-y: auto;
    z-index: 100;
`;

const DropdownItem = styled.div<{ highlighted: boolean }>`
    padding: 10px 12px;
    font-size: 15px;
    color: var(--Gray-800);
    cursor: pointer;
    background: ${({ highlighted }) => (highlighted ? "var(--Gray-200)" : "transparent")};

    &:hover {
        background: var(--Gray-200);
    }
`;

const ErrorText = styled.div`
    font-size: 13px;
    color: var(--Red-600);
    font-weight: 500;
`;
const RightWrapper = styled.div`
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 12px; // ← 아이콘과 CC/BCC 간격 확보
`;
const RightSlot = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;

    span {
        font-size: 14px;
        color: var(--Gray-700);
        cursor: pointer;
        text-decoration: underline;
    }
`;
