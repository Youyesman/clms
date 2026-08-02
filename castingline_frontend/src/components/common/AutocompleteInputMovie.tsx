import React, { useEffect, useRef, useState, useCallback } from "react";
import styled, { css, keyframes } from "styled-components";
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
interface Movie {
    id?: string;
    title_ko: string;
    distributor?: {
        client_name: string;
    };
    release_date: string;
}

interface AutocompleteInputProps {
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
    isPrimaryOnly?: boolean;
}

/* ---------------- Styled Components ---------------- */
// ... (omitting unchanged styled components)
const Container = styled.div<{ $chip?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 4px;
    /* 칩은 내용만큼만 차지합니다 (필터바에서 나란히 붙이기 위함) */
    width: ${({ $chip }) => ($chip ? "auto" : "100%")};
    position: relative;
`;

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

const InputBox = styled.div<{ $disabled?: boolean; $hasLeft?: boolean; $chip?: boolean; $applied?: boolean }>`
    height: 32px;
    background: ${({ $disabled }) => ($disabled ? "#f1f5f9" : "white")};
    border-radius: 4px;
    border: 1px solid #cbd5e1;
    display: flex;
    align-items: center;
    padding: ${({ $hasLeft }) => ($hasLeft ? "0 10px 0 0" : "0 10px")};
    gap: 8px; /* 뱃지와 아이콘 사이 간격 */
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

const InternalLabelBox = styled.div<{ $width?: string; $chip?: boolean; $applied?: boolean }>`
    height: 100%;
    width: ${({ $width }) => $width || "auto"};
    min-width: fit-content;
    padding: 0 12px;
    background: #f1f5f9;
    border-right: 1px solid #cbd5e1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: #475569;
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
    padding-left: ${({ $hasLeft }) => ($hasLeft ? "10px" : "0")};
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

/** ✅ 배급사 뱃지 스타일 **/
const DistributorBadge = styled.span`
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 800;
    white-space: nowrap;
    background-color: #eff6ff; /* Blue 50 */
    color: #2563eb; /* Blue 600 */
    border: 1px solid #bfdbfe; /* Blue 100 */
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
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
    list-style: none;
    padding: 4px;
    margin: 0;
    max-height: 240px;
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
    justify-content: space-between; /* 제목과 뱃지 양끝 배치 */
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

export function AutocompleteInputMovie({
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
    isPrimaryOnly = false,
    variant = "default",
}: AutocompleteInputProps) {
    const toast = useToast();
    const [suggestions, setSuggestions] = useState<Movie[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const isChip = variant === "chip";
    const showInternalLabel = label && labelPlacement === "left";

    // 방향키로 선택을 옮기면 목록이 따라 스크롤되도록 (보이는 영역 밖 선택 방지)
    useEffect(() => {
        if (selectedIndex < 0) return;
        const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
        item?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    const fetchSuggestions = async (name: string) => {
        if (!name) {
            setSuggestions([]);
            setIsDropdownOpen(false);
            return;
        }

        try {
            let url = `movies/?search=${encodeURIComponent(name)}`;
            if (isPrimaryOnly) {
                url += "&is_primary_movie=true";
            }
            const res = await AxiosGet(url);
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
        // 타이핑 시 ID를 제거하여 뱃지 숨김 및 확정 상태 해제
        setFormData((prev: any) => ({
            ...prev,
            movie: { title_ko: value } as Movie,
        }));
        setInputValue(value);
        debouncedFetchSuggestions(value);
    };

    const handleSelectSuggestion = (movie: Movie) => {
        setFormData((prev: any) => ({
            ...prev,
            movie,
        }));
        setInputValue(movie.title_ko);
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

    // 영화가 실제로 선택된 상태인지 확인
    const isSelected = !!formData.movie?.id;
    /* 거래처/영화가 실제로 선택되면 걸러내고 있는 필터 */
    const isApplied = isChip && isSelected;
    const releaseDate = formData.movie?.release_date?.substring(0, 4);
    return (
        <Container ref={dropdownRef} $chip={isChip}>
            {label && labelPlacement === "top" && (
                <LabelRow>
                    <LabelText>
                        {label} {required && <RequiredMark>*</RequiredMark>}
                    </LabelText>
                </LabelRow>
            )}

            <InputWrapper>
                <InputBox $disabled={disabled} $chip={isChip} $applied={isApplied} $hasLeft={Boolean(showInternalLabel)}>
                    {showInternalLabel && (
                        <InternalLabelBox $width={labelWidth} $chip={isChip} $applied={isApplied}>
                            {label}
                            {required && <RequiredMark style={{ marginLeft: "2px" }}>*</RequiredMark>}
                        </InternalLabelBox>
                    )}

                    <InputField
                        ref={inputRef}
                        type="text"
                        value={formData.movie?.title_ko || ""}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        disabled={disabled}
                        autoComplete="off"
                        $hasLeft={Boolean(showInternalLabel)}
                        $chip={isChip}
                        $applied={isApplied}
                    />

                    {/** ✅ 선택된 상태일 때 배급사 뱃지 표시 **/}
                    {isSelected && releaseDate && <DistributorBadge>{releaseDate}</DistributorBadge>}

                    <IconBox>
                        <MagnifyingGlass size={16} weight="bold" />
                    </IconBox>
                </InputBox>

                {isDropdownOpen && suggestions.length > 0 && (
                    <Dropdown ref={listRef}>
                        {suggestions.map((movie, index) => (
                            <SuggestionItem
                                key={movie.id || index}
                                onClick={() => handleSelectSuggestion(movie)}
                                $isSelected={index === selectedIndex}>
                                <span>{movie.title_ko}</span>
                                {/** ✅ 드롭다운 리스트에서도 배급사 뱃지 표시 **/}
                                {movie.release_date && (
                                    <DistributorBadge>{movie.release_date?.substring(0, 4)}</DistributorBadge>
                                )}
                            </SuggestionItem>
                        ))}
                    </Dropdown>
                )}
            </InputWrapper>
        </Container>
    );
}
