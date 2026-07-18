import React from "react";
import styled from "styled-components";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { CustomIconButton } from "./CustomIconButton";

/** 1. 스타일 정의 **/
const FilterBarContainer = styled.div<{ $wrap?: boolean }>`
    display: flex;
    align-items: center;
    padding: 8px 20px;
    background-color: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 4px; /* 조금 더 둥글게 */
    box-shadow:
        0 4px 6px -1px rgba(0, 0, 0, 0.1),
        0 2px 4px -1px rgba(0, 0, 0, 0.06); /* 조금 더 입체감 있는 그림자 */
    margin-bottom: 16px;
    /* wrap 모드: 필터 줄 + 우측 정렬 액션 줄의 2단 구성 */
    height: ${({ $wrap }) => ($wrap ? "auto" : "56px")};
    ${({ $wrap }) =>
        $wrap
            ? "flex-direction: column; align-items: stretch; row-gap: 8px; min-height: 56px; padding-top: 10px; padding-bottom: 10px;"
            : ""}
    width: 100%;
    
    /* 
       Autocomplete 드롭다운이 짤리는 문제 수정을 위해 overflow-y: hidden 제거.
       대신 부모나 그리드 영역과의 겹침을 방지하기 위해 z-index 등 레이아웃 고려.
    */
    position: relative;
    z-index: 100; 

    &::-webkit-scrollbar { height: 4px; }
    &::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
`;

const FilterItemsScroll = styled.div<{ $wrap?: boolean }>`
    display: flex;
    align-items: center;
    flex: 1;
    ${({ $wrap }) => ($wrap ? "flex-wrap: wrap; row-gap: 10px;" : "")}
`;

const FilterItemWrapper = styled.div<{ $width?: string }>`
    display: flex;
    align-items: center;
    flex-shrink: 0;
    width: ${({ $width }) => $width || "auto"};
    padding: 0 16px;
    position: relative;
    height: 32px;

    /* 아이템 우측 세로 구분선 */
    &:not(:last-child)::after {
        content: "";
        position: absolute;
        right: 0;
        top: 6px;
        bottom: 6px;
        width: 1px;
        background-color: #e2e8f0;
    }

    /* 첫 번째 아이템의 왼쪽 패딩 제거 */
    &:first-child {
        padding-left: 0;
    }
`;

const ActionGroup = styled.div<{ $wrap?: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    ${({ $wrap }) =>
        $wrap
            ? /* 2단 모드: 구분선 없이 아랫줄 우측 정렬 */
              "justify-content: flex-end; border-top: 1px solid #f1f5f9; padding-top: 8px;"
            : "padding-left: 16px; border-left: 2px solid #f1f5f9; margin-left: auto;"}
`;

/* 돋보기 버튼 시인성 강화를 위한 전용 블루 버튼 스타일 */
const SearchButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    border: none;
    border-radius: 6px;
    color: #ffffff;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);

    &:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
        background: linear-gradient(135deg, #60a5fa 0%, #2563eb 100%);
    }

    &:active {
        transform: translateY(0);
        box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4);
    }

    svg {
        width: 18px;
        height: 18px;
    }
`;

/** 2. 컴포넌트 인터페이스 **/
interface CommonFilterBarProps {
    children: React.ReactNode;
    onSearch?: () => void;
    actions?: React.ReactNode;
    /** 필터가 많은 페이지에서 두 줄로 자동 줄바꿈 */
    wrap?: boolean;
}

/** 3. 메인 컴포넌트 **/
export const CommonFilterBar: React.FC<CommonFilterBarProps> = ({ children, onSearch, actions, wrap }) => {
    /* Enter 키 입력 시 검색 실행 */
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && onSearch) {
            onSearch();
        }
    };

    return (
        <FilterBarContainer onKeyDown={handleKeyDown} $wrap={wrap}>
            <FilterItemsScroll $wrap={wrap}>
                {React.Children.map(children, (child) => {
                    if (!child) return null;
                    return <FilterItemWrapper>{child}</FilterItemWrapper>;
                })}
                {onSearch && (
                    <div style={{ paddingLeft: "12px" }}>
                        <SearchButton onClick={onSearch} title="검색 실행">
                            <MagnifyingGlass weight="bold" />
                        </SearchButton>
                    </div>
                )}
            </FilterItemsScroll>
            {actions && <ActionGroup $wrap={wrap}>{actions}</ActionGroup>}
        </FilterBarContainer>
    );
};
