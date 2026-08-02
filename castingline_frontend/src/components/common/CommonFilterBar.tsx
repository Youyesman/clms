import React from "react";
import styled from "styled-components";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { CustomIconButton } from "./CustomIconButton";
import { ui } from "../../styles/uiTokens";

/** 1. 스타일 정의 **/
const FilterBarContainer = styled.div<{ $wrap?: boolean }>`
    display: flex;
    align-items: center;
    padding: 8px 10px;
    background-color: ${ui.color.surface};
    border: 1px solid ${ui.color.border};
    border-radius: ${ui.radius.md};
    box-shadow: ${ui.shadow.xs};
    margin-bottom: 16px;
    /* wrap 모드: 필터 줄 + 우측 정렬 액션 줄의 2단 구성 */
    height: auto;
    min-height: 46px;
    ${({ $wrap }) =>
        $wrap
            ? "flex-direction: column; align-items: stretch; row-gap: 6px;"
            : ""}
    width: 100%;
    
    /* 
       Autocomplete 드롭다운이 짤리는 문제 수정을 위해 overflow-y: hidden 제거.
       대신 부모나 그리드 영역과의 겹침을 방지하기 위해 z-index 등 레이아웃 고려.
    */
    position: relative;
    z-index: 100; 

    &::-webkit-scrollbar { height: 6px; }
    &::-webkit-scrollbar-thumb { background: ${ui.color.border}; border-radius: 8px; }
`;

const FilterItemsScroll = styled.div<{ $wrap?: boolean }>`
    display: flex;
    align-items: center;
    flex: 1;
    gap: 6px;
    ${({ $wrap }) => ($wrap ? "flex-wrap: wrap; row-gap: 6px;" : "")}
`;

const FilterItemWrapper = styled.div<{ $width?: string }>`
    display: flex;
    align-items: center;
    flex-shrink: 0;
    width: ${({ $width }) => $width || "auto"};
    /* 칩이 자체 패딩과 hover 배경을 갖고 있어 바깥 여백은 최소로 둡니다. */
    position: relative;
`;

const ActionGroup = styled.div<{ $wrap?: boolean }>`
    display: flex;
    align-items: flex-end;
    gap: 8px;
    flex-shrink: 0;
    ${({ $wrap }) =>
        $wrap
            ? /* 2단 모드: 구분선 없이 아랫줄 우측 정렬 */
              `justify-content: flex-end; border-top: 1px solid ${ui.color.borderSubtle}; padding-top: 6px;`
            : `padding-left: 10px; border-left: 1px solid ${ui.color.border}; margin-left: auto;`}
`;

/* 검색 버튼: 칩들과 같은 고스트 아이콘 — 필터바에서 혼자 튀지 않도록 */
const SearchButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    background: transparent;
    border: none;
    border-radius: ${ui.radius.md};
    color: ${ui.color.textMuted};
    cursor: pointer;
    transition: background-color 0.12s ease, color 0.12s ease;

    &:hover {
        background: ${ui.color.surfaceHover};
        color: ${ui.color.textStrong};
    }
    &:active {
        background: ${ui.color.border};
    }

    svg {
        width: 15px;
        height: 15px;
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

/**
 * 필터바 안의 입력 요소를 "칩" 형태로 렌더링합니다.
 *
 * 노션 데이터베이스 필터와 같은 방식으로, 라벨과 값이 한 덩어리에 들어가고
 * 평소에는 테두리가 없다가 마우스를 올리거나 열었을 때만 배경이 생깁니다.
 * 필터가 10개 넘게 붙는 화면에서도 선이 겹치지 않고 높이도 절반으로 줄어듭니다.
 *
 * 호출부에서 variant를 명시했다면 그 값을 존중합니다.
 * DOM 태그(<div> 등)에는 넘기지 않습니다 — 알 수 없는 속성 경고 방지.
 */
const withChipVariant = (child: React.ReactNode): React.ReactNode => {
    if (!React.isValidElement(child)) return child;

    const props = child.props as { variant?: unknown; children?: React.ReactNode };

    /* <div> 같은 DOM 태그로 컨트롤을 감싼 경우가 많습니다.
       DOM에는 variant를 넘길 수 없으니(알 수 없는 속성 경고) 안쪽으로 내려갑니다. */
    if (typeof child.type === "string") {
        if (props.children === undefined) return child;
        return React.cloneElement(child as React.ReactElement<any>, {
            children: React.Children.map(props.children, withChipVariant),
        });
    }

    if (props.variant !== undefined) return child;

    return React.cloneElement(child as React.ReactElement<any>, { variant: "chip" });
};

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
                    return <FilterItemWrapper>{withChipVariant(child)}</FilterItemWrapper>;
                })}
                {onSearch && (
                    <div style={{ paddingLeft: "2px", display: "flex", alignItems: "center" }}>
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
