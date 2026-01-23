import React, { useEffect, useRef, useState, useCallback } from "react";
import styled, { css, keyframes } from "styled-components";
import { createPortal } from "react-dom";
import { debounce } from "lodash";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { AxiosGet } from "../../axios/Axios";
import { useToast } from "../common/CustomToast";

/* ---------------- Animation ---------------- */
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
`;

/* ---------------- Types ---------------- */
interface Client {
    id?: string;
    client_name: string;
    client_type: string;
}

interface AutocompleteInputProps {
    type: "distributor" | "production_company" | "client" | "theater";
    formData: any;
    setFormData: React.Dispatch<React.SetStateAction<any>>;
    placeholder?: string;
    inputValue: string;
    setInputValue: (value: string) => void;
    label?: string;
    required?: boolean;
    labelPlacement?: "left" | "top";
    labelWidth?: string;
    disabled?: boolean;
}

/* ---------------- Styled Components ---------------- */

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    position: relative;
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
`;

const RequiredMark = styled.span`
    color: #ef4444;
`;

const InputWrapper = styled.div`
    flex: 1;
    position: relative;
    display: flex;
    flex-direction: column;
`;

/** 2. 인풋 박스: 내부 라벨 유무($hasLeft)에 따라 패딩 조절 **/
const InputBox = styled.div<{ $disabled?: boolean; $hasLeft?: boolean }>`
    height: 32px;
    background: ${({ $disabled }) => ($disabled ? "#f1f5f9" : "white")};
    border-radius: 4px;
    border: 1px solid #cbd5e1;
    display: flex;
    align-items: center;
    /* 내부 라벨이 있으면 왼쪽 패딩 제거 */
    padding: ${({ $hasLeft }) => ($hasLeft ? "0 10px 0 0" : "0 10px")};
    gap: 8px;
    transition: all 0.2s ease;

    &:focus-within {
        border-color: #0f172a;
    }
`;

/** 3. 내부 라벨 박스: 인풋 박스 안쪽 왼쪽 회색 영역 **/
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

const InputField = styled.input<{ $hasLeft?: boolean }>`
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    padding-left: ${({ $hasLeft }) => ($hasLeft ? "2px" : "0")};
    font-size: 13px;
    font-family: SUIT;
    font-weight: 500;
    color: #1e293b;
    min-width: 0;
    &::placeholder {
        color: #94a3b8;
    }
`;

/** ✅ 유형 뱃지 스타일 (선택 시 나타나는 구분 뱃지) **/
const TypeBadge = styled.span<{ $type: string }>`
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 800;
    white-space: nowrap;
    background-color: ${({ $type }) => ($type === "distributor" ? "#eff6ff" : "#f5f3ff")};
    color: ${({ $type }) => ($type === "distributor" ? "#2563eb" : "#7c3aed")};
    border: 1px solid ${({ $type }) => ($type === "distributor" ? "#dbeafe" : "#ede9fe")};
`;

const IconBox = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    flex-shrink: 0;
`;

const Dropdown = styled.ul`
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.1);
    list-style: none;
    padding: 4px;
    margin: 0;
    max-height: 200px;
    overflow-y: auto;
    z-index: 10000;
    animation: ${fadeIn} 0.15s ease;

    &::-webkit-scrollbar {
        width: 4px;
    }
    &::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 10px;
    }
`;

const SuggestionItem = styled.li<{ $isSelected: boolean }>`
    padding: 0 10px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    font-family: SUIT;
    color: #1e293b;
    cursor: pointer;
    border-radius: 2px;
    background: ${({ $isSelected }) => ($isSelected ? "#f1f5f9" : "transparent")};

    &:hover {
        background: #f8fafc;
    }
`;

/* ---------------- Main Component ---------------- */
const TYPE_MAP: Record<string, string> = {
    distributor: "배급사",
    production_company: "제작사",
    client: "극장",
    theater: "극장", // theater와 client 모두 '극장' 타입으로 조회한다고 가정
};

export function AutocompleteInputClient({
    type,
    formData,
    setFormData,
    placeholder,
    inputValue,
    setInputValue,
    label,
    required,
    labelPlacement = "left",
    labelWidth,
    disabled,
}: AutocompleteInputProps) {
    const toast = useToast();
    const [suggestions, setSuggestions] = useState<Client[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const showInternalLabel = label && labelPlacement === "left";

    // ✅ 드롭다운 위치 계산 로직 (Portal 사용 위함)
    useEffect(() => {
        if (isDropdownOpen && dropdownRef.current) {
            const rect = dropdownRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const DROPDOWN_MAX_HEIGHT = 200;
            const DROPDOWN_MARGIN = 4;
            // 화면 아래쪽 공간이 부족하면 위로 띄움
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
                zIndex: 10000,
            });
        }
    }, [isDropdownOpen, suggestions]);

    const fetchSuggestions = async (name: string) => {
        if (!name) {
            setSuggestions([]);
            setIsDropdownOpen(false);
            return;
        }

        try {
            // 2. 요청 URL에 client_type 파라미터 추가
            const targetType = TYPE_MAP[type] || type;
            const res = await AxiosGet(
                `clients/?ordering=client_name&search=${encodeURIComponent(name)}&client_type=${encodeURIComponent(targetType)}`
            );

            setSuggestions(res.data.results || []);
            setIsDropdownOpen(true);
            setSelectedIndex(-1);
        } catch (error) {
            toast.error("서버 통신 중 오류가 발생했습니다.");
        }
    };

    const debouncedFetchSuggestions = useCallback(
        debounce((name: string) => fetchSuggestions(name), 300),
        []
    );

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setFormData((prev: any) => ({
            ...prev,
            [type]: { client_name: value } as Client,
        }));
        setInputValue(value);
        debouncedFetchSuggestions(value);
    };

    const handleSelectSuggestion = (client: Client) => {
        setFormData((prev: any) => ({
            ...prev,
            [type]: client,
        }));
        setInputValue(client.client_name);
        setIsDropdownOpen(false);
        setSuggestions([]);
        setSelectedIndex(-1);
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isDropdownOpen || suggestions.length === 0) return;

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
                break;
            case "ArrowUp":
                e.preventDefault();
                setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
                break;
            case "Enter":
                e.preventDefault();
                e.stopPropagation(); // 부모 FilterBar의 검색 트리거 방지
                const target = selectedIndex >= 0 ? suggestions[selectedIndex] : suggestions[0];
                if (target) handleSelectSuggestion(target);
                break;
            case "Escape":
                setIsDropdownOpen(false);
                break;
        }
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const isSelected = !!formData[type]?.id;

    return (
        <Container ref={dropdownRef}>
            {/* 외부 상단 라벨 (Top 배치일 때만) */}
            {label && labelPlacement === "top" && (
                <LabelRow>
                    <LabelText>
                        {label} {required && <RequiredMark>*</RequiredMark>}
                    </LabelText>
                </LabelRow>
            )}

            <InputWrapper>
                <InputBox $disabled={disabled} $hasLeft={Boolean(showInternalLabel)}>
                    {/* 내부 라벨 (Left 배치일 때만) */}
                    {showInternalLabel && (
                        <InternalLabelBox $width={labelWidth}>
                            {label}
                            {required && <RequiredMark style={{ marginLeft: "2px" }}>*</RequiredMark>}
                        </InternalLabelBox>
                    )}

                    <InputField
                        ref={inputRef}
                        type="text"
                        value={formData[type]?.client_name || ""}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        disabled={disabled}
                        autoComplete="off"
                        $hasLeft={Boolean(showInternalLabel)}
                    />

                    {/* 선택 완료 시 나타나는 유형 뱃지 (예: 배급사, 제작사) */}
                    {isSelected && <TypeBadge $type={type}>{formData[type]?.client_type}</TypeBadge>}

                    <IconBox>
                        <MagnifyingGlass size={16} weight="bold" />
                    </IconBox>
                </InputBox>

                {isDropdownOpen &&
                    suggestions.length > 0 &&
                    createPortal(
                        <Dropdown style={dropdownStyle}>
                            {suggestions.map((client, index) => (
                                <SuggestionItem
                                    key={client.id || index}
                                    onClick={() => handleSelectSuggestion(client)}
                                    $isSelected={index === selectedIndex}>
                                    <span>{client.client_name}</span>
                                    <TypeBadge $type={type}>{client.client_type}</TypeBadge>
                                </SuggestionItem>
                            ))}
                        </Dropdown>,
                        document.body
                    )}
            </InputWrapper>
        </Container>
    );
}
