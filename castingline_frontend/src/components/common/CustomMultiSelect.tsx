import React, { useEffect, useRef, useState } from "react";
import styled, { keyframes } from "styled-components";
import { CaretDown, Check } from "@phosphor-icons/react";
import { createPortal } from "react-dom";

/* ---------- 애니메이션 ---------- */
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
`;

/* ---------- 스타일 ---------- */
const Wrapper = styled.div`
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const SelectButton = styled.div<{ $open?: boolean; $disabled?: boolean }>`
    display: inline-flex;
    height: 32px;
    background: ${({ $disabled }) => ($disabled ? "#f1f5f9" : "white")};
    border-radius: 4px;
    border: ${({ $open }) => ($open ? "1px solid #0f172a" : "1px solid #cbd5e1")};
    align-items: center;
    cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
    transition: all 0.2s ease;
    overflow: hidden;
    opacity: ${({ $disabled }) => ($disabled ? 0.6 : 1)};

    &:hover { border-color: ${({ $open, $disabled }) => ($disabled ? "#cbd5e1" : $open ? "#0f172a" : "#94a3b8")}; }
`;

const InternalLabelBox = styled.div`
    height: 100%;
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
    border-radius: 3px 0 0 3px;
    white-space: nowrap;
    flex-shrink: 0;
`;

const ValueDisplay = styled.div<{ $isPlaceholder?: boolean }>`
    flex: 1;
    padding: 0 10px;
    font-size: 13px;
    font-weight: 500;
    color: ${({ $isPlaceholder }) => ($isPlaceholder ? "#94a3b8" : "#1e293b")};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 60px;
`;

const Badge = styled.span`
    background: #2563eb;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 10px;
    margin-right: 6px;
    flex-shrink: 0;
`;

const CaretIcon = styled(CaretDown) <{ $open?: boolean }>`
    color: #64748b;
    transition: transform 0.2s ease;
    margin-right: 10px;
    flex-shrink: 0;
    ${({ $open }) => $open && `transform: rotate(180deg);`}
`;

const Dropdown = styled.div`
    position: absolute;
    padding: 12px 16px;
    background: white;
    box-shadow: 0px 8px 24px rgba(0, 0, 0, 0.15);
    border-radius: 8px;
    border: 1px solid #cbd5e1;
    z-index: 10000;
    max-height: 400px;
    overflow-y: auto;
    animation: ${fadeIn} 0.15s ease;
    min-width: 500px;
`;

const GroupRow = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 0;
    border-bottom: 1px solid #f1f5f9;

    &:last-of-type { border-bottom: none; }
`;

const GroupTitle = styled.div`
    font-size: 12px;
    font-weight: 700;
    color: #475569;
    min-width: 90px;
    flex-shrink: 0;
    white-space: nowrap;
`;

const GroupItems = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    flex: 1;
`;

const OptionItem = styled.div<{ $selected?: boolean }>`
    height: 28px;
    padding: 0 10px;
    border-radius: 4px;
    background: ${({ $selected }) => ($selected ? "#eff6ff" : "white")};
    border: 1px solid ${({ $selected }) => ($selected ? "#bfdbfe" : "transparent")};
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    white-space: nowrap;

    &:hover { background: ${({ $selected }) => ($selected ? "#dbeafe" : "#f8fafc")}; }
`;

const Checkbox = styled.div<{ $checked: boolean }>`
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: ${({ $checked }) => ($checked ? "none" : "1.5px solid #cbd5e1")};
    background: ${({ $checked }) => ($checked ? "#2563eb" : "#fff")};
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s;
`;

const OptionLabel = styled.div`
    flex: 1;
    font-size: 13px;
    color: #1e293b;
`;

const ResetBtn = styled.div`
    margin-top: 8px;
    padding: 6px 0;
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    color: #ef4444;
    cursor: pointer;
    border-top: 1px solid #e2e8f0;

    &:hover { color: #dc2626; }
`;

/* ---------- 타입 ---------- */
export interface FormatGroup {
    label: string;       // 그룹 헤더 (예: "필름/디지털")
    key: string;         // 식별 키
    items: string[];     // 선택지 목록
}

interface CustomMultiSelectProps {
    label?: string;
    groups: FormatGroup[];
    value: string[];
    onChange: (v: string[]) => void;
    style?: React.CSSProperties;
    disabled?: boolean;
    /** true(기본): 같은 그룹 내 1개만 선택(라디오). false: 그룹 내 복수 선택 허용 */
    radioPerGroup?: boolean;
}

export function CustomMultiSelect({ label = "포맷", groups, value, onChange, style, disabled = false, radioPerGroup = true }: CustomMultiSelectProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    const toggle = () => !disabled && setIsOpen(prev => !prev);

    const handleToggleItem = (item: string) => {
        // 이미 선택됨 → 해제
        if (value.includes(item)) {
            onChange(value.filter(v => v !== item));
            return;
        }

        if (radioPerGroup) {
            // 같은 그룹 내 1개만 선택 (라디오): 기존 그룹 선택 제거 후 추가
            const group = groups.find(g => g.items.includes(item));
            if (!group) return;
            const filtered = value.filter(v => !group.items.includes(v));
            onChange([...filtered, item]);
        } else {
            // 그룹 내 복수 선택 허용 (체크박스)
            onChange([...value, item]);
        }
    };

    // 외부 클릭 닫기
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

    // 스크롤 시 닫기
    useEffect(() => {
        if (!isOpen) return;
        const close = () => setIsOpen(false);
        window.addEventListener("scroll", close, true);
        return () => window.removeEventListener("scroll", close, true);
    }, [isOpen]);

    // 위치 계산 (Portal)
    useEffect(() => {
        if (isOpen && wrapperRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const MAX_H = 400;
            const MARGIN = 4;
            const openUpward = viewportHeight - rect.bottom < MAX_H && rect.top > viewportHeight - rect.bottom;

            setDropdownStyle({
                position: "fixed",
                [openUpward ? "bottom" : "top"]: openUpward
                    ? viewportHeight - rect.top + MARGIN
                    : rect.bottom + MARGIN,
                left: rect.left,
                minWidth: 500,
                maxHeight: MAX_H,
                zIndex: 9999,
            });
        }
    }, [isOpen]);

    return (
        <Wrapper ref={wrapperRef} style={style}>
            <SelectButton onClick={toggle} $open={isOpen} $disabled={disabled}>
                <InternalLabelBox>{label}</InternalLabelBox>
                <ValueDisplay $isPlaceholder={value.length === 0}>
                    {value.length === 0 ? "전체" : value.length <= 2 ? value.join(", ") : `${value[0]}, ${value[1]} 외 ${value.length - 2}건`}
                </ValueDisplay>
                {value.length > 0 && <Badge>{value.length}</Badge>}
                <CaretIcon size={16} weight="bold" $open={isOpen} />
            </SelectButton>

            {isOpen && createPortal(
                <Dropdown ref={dropdownRef} style={dropdownStyle}>
                    {groups.map(group => (
                        <GroupRow key={group.key}>
                            <GroupTitle>{group.label}</GroupTitle>
                            <GroupItems>
                                {group.items.map(item => (
                                    <OptionItem
                                        key={item}
                                        $selected={value.includes(item)}
                                        onClick={() => handleToggleItem(item)}
                                    >
                                        <Checkbox $checked={value.includes(item)}>
                                            {value.includes(item) && <Check size={10} weight="bold" color="#fff" />}
                                        </Checkbox>
                                        <OptionLabel>{item}</OptionLabel>
                                    </OptionItem>
                                ))}
                            </GroupItems>
                        </GroupRow>
                    ))}
                    {value.length > 0 && (
                        <ResetBtn onClick={() => onChange([])}>
                            전체 초기화
                        </ResetBtn>
                    )}
                </Dropdown>,
                document.body
            )}
        </Wrapper>
    );
}
