import styled, { css } from "styled-components";

/** 1. 전체 페이지 레이아웃 **/
export const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    background-color: #f7f7f7;
    min-height: 100vh;
    font-family: "MS Sans Serif", sans-serif;
`;

/** 2. 창(Window) 스타일 **/
export const ContentWindow = styled.div<{ flex?: number; height?: string }>`
    background-color: #ffffff;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    padding: 8px;
    display: flex;
    flex-direction: column;
    flex: ${({ flex }) => flex || 1};
    height: ${({ height }) => height || "auto"};
    overflow: hidden;
`;

export const WindowHeader = styled.div`
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    padding: 6px;
    font-size: 14px;
    font-weight: bold;
    margin-bottom: 10px;
`;

/** 3. 필터 및 입력 스타일 **/
export const FilterBar = styled.div`
    background: white;
    padding: 12px 16px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    align-items: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
`;

export const FilterItem = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    label {
        font-weight: bold;
        white-space: nowrap;
        font-size: 12px;
    }
`;

const InputStyle = css`
    background-color: #ffffff;
    border: 1px solid #b0b0b0;
    padding: 4px 8px;
    font-size: 12px;
    border-radius: 4px;
    &:focus {
        border-color: #005f99;
        outline: none;
    }
`;

export const BaseInput = styled.input`
    ${InputStyle} width: 100%;
`;
export const BaseSelect = styled.select`
    ${InputStyle} cursor: pointer;
`;

/** 4. 테이블 스타일 (핵심) **/
export const TableWrapper = styled.div`
    overflow: auto;
    flex: 1;
`;

export const CommonTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;

    th {
        background-color: #e0e0e0;
        border: 1px solid #b0b0b0;
        padding: 8px;
        font-weight: normal;
        position: sticky;
        top: 0;
    }

    td {
        border: 1px solid #b0b0b0;
        padding: 8px;
        white-space: nowrap;
    }

    tbody tr:nth-child(odd) {
        background-color: #f5f5f5;
    }

    tbody tr:hover {
        background-color: #0073b3;
        color: white;
        cursor: pointer;
    }

    tbody tr.selected {
        background-color: #005f99;
        color: white;
    }
`;

/** 5. 버튼 스타일 **/
export const BaseButton = styled.button`
    background-color: #e0e0e0;
    border-top: 1px solid #ffffff;
    border-left: 1px solid #ffffff;
    border-right: 1px solid #666666;
    border-bottom: 1px solid #666666;
    padding: 6px 14px;
    font-size: 12px;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.1s ease;

    &:hover {
        background-color: #ececec;
    }
    &:active {
        background-color: #d0d0d0;
        border: 1px solid #666666;
        border-right: 1px solid #ffffff;
        border-bottom: 1px solid #ffffff;
        transform: translate(1px, 1px);
    }
`;

/** 6. 그리드 및 정보 레이아웃 **/
export const MainGrid = styled.div`
    display: flex;
    gap: 12px;
    flex: 1;
`;

export const InfoRow = styled.div`
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    gap: 10px;

    .label {
        font-weight: bold;
        width: 120px; // 이전 스타일 유지
        flex-shrink: 0;
    }
    .value {
        flex: 1;
    }
`;
