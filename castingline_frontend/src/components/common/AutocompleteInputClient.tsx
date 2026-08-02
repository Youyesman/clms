import React, { useEffect, useRef, useState, useCallback } from "react";
import styled, { css, keyframes } from "styled-components";
import { createPortal } from "react-dom";
import { debounce } from "lodash";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { AxiosGet } from "../../axios/Axios";
import { useToast } from "../common/CustomToast";
import { ui } from "../../styles/uiTokens";
import { filterChipBox, filterChipInput, filterChipLabel } from "../../styles/chipStyles";

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
    type: "distributor" | "distributor_2" | "distributor_3" | "production_company" | "production_company_2" | "production_company_3" | "client" | "theater";
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
    /** "chip" — 필터바용 노션식 칩 (테두리 없음, hover 시에만 배경) */
    variant?: "default" | "chip";
}

/* ---------------- Styled Components ---------------- */

const Container = styled.div<{ $chip?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 4px;
    /* 칩은 내용만큼만 차지합니다 (필터바에서 나란히 붙이기 위함) */
    width: ${({ $chip }) => ($chip ? "auto" : "100%")};
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
    color: #dc2626;
`;

const InputWrapper = styled.div`
    flex: 1;
    position: relative;
    display: flex;
    flex-direction: column;
`;

/** 2. 인풋 박스: 내부 라벨 유무($hasLeft)에 따라 패딩 조절 **/
const InputBox = styled.div<{ $disabled?: boolean; $hasLeft?: boolean; $chip?: boolean; $applied?: boolean }>`
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
    /* 칩 모드: 모양은 styles/chipStyles.ts에서 공통 관리 */
    ${({ $chip }) =>
        $chip &&
        css`
            ${filterChipBox}

            &:focus-within {
                border-color: ${ui.color.primary};
                background: ${ui.color.surface};
                box-shadow: 0 0 0 3px ${ui.color.primarySoft};
            }
        `}
`;

/** 3. 내부 라벨 박스: 인풋 박스 안쪽 왼쪽 회색 영역 **/
const InternalLabelBox = styled.div<{ $width?: string; $chip?: boolean; $applied?: boolean }>`
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
    border-radius: 4px 0 0 3px;
    white-space: nowrap;
    flex-shrink: 0;
    /* 칩 모드: 구분선 없이 라벨과 값이 한 덩어리로 읽히게 */
    ${({ $chip }) => $chip && filterChipLabel}
`;

const InputField = styled.input<{ $hasLeft?: boolean; $chip?: boolean; $applied?: boolean }>`
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
    /* 칩 모드: 부모 폭이 내용에 맞춰지므로 스스로 폭을 가져야 합니다 */
    ${({ $chip }) => $chip && filterChipInput}
`;

/** ✅ 유형 뱃지 스타일 (선택 시 나타나는 구분 뱃지) **/
const TypeBadge = styled.span<{ $type: string }>`
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 800;
    white-space: nowrap;
    background-color: ${({ $type }) => ($type === "distributor" ? "#eff6ff" : "#fffbeb")};
    color: ${({ $type }) => ($type === "distributor" ? "#2563eb" : "#d97706")};
    border: 1px solid ${({ $type }) => ($type === "distributor" ? "#bfdbfe" : "#fffbeb")};
`;

const IconBox = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    flex-shrink: 0;
`;

/* body로 portal 되어 뜨는 목록 — 위치(top|bottom/left/width)는 열 때 계산한
   인라인 스타일이 전담한다. 여기에 top 같은 offset을 두면 위로 펼치는 경우
   (인라인이 bottom만 설정) top이 살아남아 화면 밖으로 밀려난다 (O001). */
const Dropdown = styled.ul`
    position: fixed;
    background: white;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
    list-style: none;
    padding: 4px;
    margin: 0;
    max-height: 200px;
    overflow-y: auto;
    z-index: 10000;
    animation: ${fadeIn} 0.15s ease;

    &::-webkit-scrollbar {
        width: 6px;
    }
    &::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 8px;
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
    border-radius: 4px;
    background: ${({ $isSelected }) => ($isSelected ? "#f1f5f9" : "transparent")};

    &:hover {
        background: #f8fafc;
    }
`;

/* ---------------- Main Component ---------------- */
const TYPE_MAP: Record<string, string> = {
    distributor: "배급사",
    distributor_2: "배급사",
    distributor_3: "배급사",
    production_company: "제작사",
    production_company_2: "제작사",
    production_company_3: "제작사",
    client: "극장",
    theater: "극장",
};

// 뱃지 색상은 배급사/제작사 구분으로 표시
const BADGE_TYPE_MAP: Record<string, string> = {
    distributor: "distributor",
    distributor_2: "distributor",
    distributor_3: "distributor",
    production_company: "production_company",
    production_company_2: "production_company",
    production_company_3: "production_company",
    client: "client",
    theater: "theater",
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
    variant = "default",
}: AutocompleteInputProps) {
    const toast = useToast();
    const [suggestions, setSuggestions] = useState<Client[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const dropdownRef = useRef<HTMLDivElement>(null);
    const portalDropdownRef = useRef<HTMLUListElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const isChip = variant === "chip";
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
            const ordering = targetType === "극장"
                ? "-operational_status,client_name"
                : "client_name";
            const res = await AxiosGet(
                `clients/?ordering=${ordering}&search=${encodeURIComponent(name)}&client_type=${encodeURIComponent(targetType)}`
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
            const target = e.target as Node;
            if (
                dropdownRef.current && !dropdownRef.current.contains(target) &&
                (!portalDropdownRef.current || !portalDropdownRef.current.contains(target))
            ) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const isSelected = !!formData[type]?.id;
    /* 거래처/영화가 실제로 선택되면 걸러내고 있는 필터 */
    const isApplied = isChip && isSelected;

    return (
        <Container ref={dropdownRef} $chip={isChip}>
            {/* 외부 상단 라벨 (Top 배치일 때만) */}
            {label && labelPlacement === "top" && (
                <LabelRow>
                    <LabelText>
                        {label} {required && <RequiredMark>*</RequiredMark>}
                    </LabelText>
                </LabelRow>
            )}

            <InputWrapper>
                <InputBox $disabled={disabled} $chip={isChip} $applied={isApplied} $hasLeft={Boolean(showInternalLabel)}>
                    {/* 내부 라벨 (Left 배치일 때만) */}
                    {showInternalLabel && (
                        <InternalLabelBox $width={labelWidth} $chip={isChip} $applied={isApplied}>
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
                        $chip={isChip}
                        $applied={isApplied}
                    />

                    {/* 선택 완료 시 나타나는 유형 뱃지 (예: 배급사, 제작사) */}
                    {isSelected && <TypeBadge $type={BADGE_TYPE_MAP[type] || type}>{formData[type]?.client_type}</TypeBadge>}

                    <IconBox>
                        <MagnifyingGlass size={16} weight="bold" />
                    </IconBox>
                </InputBox>

                {isDropdownOpen &&
                    suggestions.length > 0 &&
                    createPortal(
                        <Dropdown ref={portalDropdownRef} style={dropdownStyle}>
                            {suggestions.map((client, index) => (
                                <SuggestionItem
                                    key={client.id || index}
                                    onClick={() => handleSelectSuggestion(client)}
                                    $isSelected={index === selectedIndex}>
                                    <span>{client.client_name}</span>
                                    <TypeBadge $type={BADGE_TYPE_MAP[type] || type}>{client.client_type}</TypeBadge>
                                </SuggestionItem>
                            ))}
                        </Dropdown>,
                        document.body
                    )}
            </InputWrapper>
        </Container>
    );
}
