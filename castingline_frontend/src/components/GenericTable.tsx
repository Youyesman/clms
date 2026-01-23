import React, { useRef, useState } from "react";
import styled, { css } from "styled-components";
import {
  CaretLeft,
  CaretRight,
  CaretDoubleLeft,
  CaretDoubleRight,
  ArrowsDownUp,
  CaretUp,
  CaretDown,
} from "@phosphor-icons/react";

/** 1. 테이블 컨테이너 및 스타일 **/
const TableWrapper = styled.div`
  width: 100%;
  overflow: auto;
  background-color: #ffffff;
  border-radius: 4px;
  flex: 1;

  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  &::-webkit-scrollbar-track {
    background: #f8fafc;
  }
  &::-webkit-scrollbar-thumb {
    background: #94a3b8;
    border-radius: 10px;
  }
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-family:
    "SUIT",
    -apple-system,
    sans-serif;
  font-size: 11.5px;
  table-layout: auto;
`;

const THead = styled.thead`
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: #f1f5f9;
`;

const StyledTH = styled.th<{ $stickyLeft?: string; $width?: string }>`
  border-bottom: 2px solid #64748b;
  border-right: 1px solid #cbd5e1;
  padding: 8px 10px;
  font-weight: 800;
  color: #0f172a;
  white-space: nowrap;
  cursor: pointer;
  height: 34px;
  transition: background-color 0.2s;

  ${(props) =>
    props.$width &&
    css`
      width: ${props.$width};
      min-width: ${props.$width};
    `}

  ${(props) =>
    props.$stickyLeft &&
    css`
      position: sticky;
      left: ${props.$stickyLeft};
      z-index: 20;
      background-color: #f1f5f9;
      border-right: 2px solid #94a3b8;
    `}

  &:hover {
    background-color: #e2e8f0;
  }
  .header-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
`;

const TFoot = styled.tfoot`
  position: sticky;
  bottom: 0;
  z-index: 10;
  background-color: #fff1f2;
  tr {
    border-top: none;
  }
  td {
    padding: 10px 12px;
    font-weight: 900;
    color: #9f1239;
    border-right: 1px solid #fecdd3;
    text-align: left;
    background-color: #fff1f2;
    &:first-child {
      color: #9f1239;
    }
  }
`;

const TR = styled.tr<{ $isHighlight?: boolean }>`
  height: 30px;
  border-bottom: 1px solid #e2e8f0;
  transition: background-color 0.2s;
  background-color: ${(props) => (props.$isHighlight ? "#fffbeb" : "#ffffff")};
  border-left: ${(props) =>
    props.$isHighlight ? "4px solid #f59e0b" : "4px solid transparent"};

  &:nth-child(even) {
    background-color: ${(props) =>
      props.$isHighlight ? "#fffbeb" : "#f8fafc"};
  }

  &:hover {
    background-color: #f1f5f9 !important;
    cursor: pointer;
  }

  &.selected {
    background-color: #1e293b !important;
    border-left: ${(props) =>
      props.$isHighlight ? "4px solid #f59e0b" : "4px solid transparent"};
    &,
    td {
      color: #ffffff !important;
      border-right-color: #334155 !important;
    }
  }
`;

const TD = styled.td<{ $stickyLeft?: string; $cellStyle?: any }>`
  border-right: 1px solid #e2e8f0;
  padding: 6px 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  color: #1e293b;
  font-weight: 500;
  background-color: inherit;

  ${(props) =>
    props.$stickyLeft &&
    css`
      position: sticky;
      left: ${props.$stickyLeft};
      z-index: 5;
      background-color: #ffffff; /* Sticky columns need background */
      border-right: 2px solid #94a3b8; /* Separator */
    `}

  ${(props) => props.$cellStyle && css(props.$cellStyle)}

  &.read-only {
    color: #64748b;
  }
  &.editable {
    cursor: cell;
    &:hover {
      background-color: rgba(0, 0, 0, 0.02);
    }
  }

  input {
    width: 100%;
    border: 2px solid #3b82f6;
    border-radius: 2px;
    padding: 2px 4px;
    font-family: inherit;
    font-size: inherit;
    outline: none;
  }
`;

const PaginationContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 12px 0;
  background: #ffffff;
`;

const PageButton = styled.button<{ active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  border: 1px solid ${(props) => (props.active ? "#0f172a" : "#cbd5e1")};
  background: ${(props) => (props.active ? "#0f172a" : "#ffffff")};
  color: ${(props) => (props.active ? "#ffffff" : "#1e293b")};
  font-size: 11px;
  font-weight: ${(props) => (props.active ? "800" : "600")};
  cursor: pointer;
  border-radius: 4px;
  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
`;

/** 2. 컴포넌트 본문 **/
export function GenericTable({
  headers,
  data,
  selectedItem,
  onSelectItem,
  getRowKey,
  formatCell,
  onSortChange,
  sortKey,
  sortOrder,
  page,
  pageSize,
  totalCount,
  onPageChange,
  summaryData,
  topRow,
  getRowHighlight,
  onUpdateCell,
  showCheckbox,
  selectedIds = [],
  onSelectionChange,
}: any) {
  const tableRef = useRef<HTMLTableElement>(null);
  const totalPages = Math.ceil(totalCount / pageSize);

  // 인라인 편집 상태
  const [editingCell, setEditingCell] = useState<{
    rowId: any;
    key: string;
  } | null>(null);
  const [editValue, setEditValue] = useState<any>("");

  const handleDoubleClick = (item: any, header: any) => {
    if (header.editable) {
      setEditingCell({ rowId: getRowKey(item), key: header.key });
      setEditValue(item[header.key] ?? "");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, item: any, key: string) => {
    if (e.key === "Enter") {
      onUpdateCell(item, key, editValue);
      setEditingCell(null);
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  const renderPageNumbers = () => {
    const pages: React.ReactNode[] = [];
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <PageButton key={i} active={i === page} onClick={() => onPageChange(i)}>
          {i}
        </PageButton>,
      );
    }
    return pages;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "#fff",
      }}
    >
      <TableWrapper>
        <StyledTable ref={tableRef}>
          <THead>
            <tr>
              {showCheckbox && (
                <StyledTH style={{ width: "40px", cursor: "default" }}>
                  <div className="header-content">
                    <input
                      type="checkbox"
                      checked={data.length > 0 && selectedIds.length === data.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          onSelectionChange(data.map((item: any) => getRowKey(item)));
                        } else {
                          onSelectionChange([]);
                        }
                      }}
                    />
                  </div>
                </StyledTH>
              )}
              {headers.map((header: any) => (
                <StyledTH
                  key={header.key}
                  $stickyLeft={header.stickyLeft}
                  $width={header.width}
                  onClick={() => onSortChange && onSortChange(header.key)}
                >
                  <div className="header-content">
                    {header.label}
                    {sortKey === header.key ? (
                      sortOrder === "asc" ? (
                        <CaretUp size={12} weight="bold" />
                      ) : (
                        <CaretDown size={12} weight="bold" />
                      )
                    ) : (
                      <ArrowsDownUp size={10} color="#64748b" />
                    )}
                  </div>
                </StyledTH>
              ))}
            </tr>
          </THead>
          <tbody>
            {topRow && topRow}
            {data.map((item: any) => {
              const rowKey = getRowKey(item);
              const isSelected =
                selectedItem && rowKey === getRowKey(selectedItem);
              const shouldHighlight = getRowHighlight
                ? getRowHighlight(item)
                : false;

              return (
                <TR
                  key={rowKey}
                  className={isSelected ? "selected" : ""}
                  $isHighlight={shouldHighlight} // 달러 기호($)를 붙여 에러 수정
                  onClick={() => onSelectItem && onSelectItem(item)}
                >
                  {showCheckbox && (
                    <TD style={{ width: "40px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(rowKey)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            onSelectionChange([...selectedIds, rowKey]);
                          } else {
                            onSelectionChange(selectedIds.filter((id: any) => id !== rowKey));
                          }
                        }}
                      />
                    </TD>
                  )}
                  {headers.map((header: any) => {
                    const isEditing =
                      editingCell?.rowId === rowKey &&
                      editingCell?.key === header.key;

                    return (
                      <TD
                        key={header.key}
                        $stickyLeft={header.stickyLeft}
                        $cellStyle={header.cellStyle}
                        className={header.editable ? "editable" : "read-only"}
                        onDoubleClick={(e) => {
                          e.stopPropagation(); // 행 선택 이벤트 방지
                          handleDoubleClick(item, header);
                        }}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => setEditingCell(null)}
                            onKeyDown={(e) =>
                              handleKeyDown(e, item, header.key)
                            }
                          />
                        ) : header.renderCell ? (
                          header.renderCell(item[header.key], item)
                        ) : formatCell ? (
                          formatCell(header.key, item[header.key], item)
                        ) : (
                          (item[header.key] ?? "")
                        )}
                      </TD>
                    );
                  })}
                </TR>
              );
            })}
          </tbody>
          {summaryData && (
            <TFoot>
              <tr>
                {headers.map((header: any, idx: number) => (
                  <td key={`summary-${header.key}`}>
                    {idx === 0 && !summaryData[header.key]
                      ? "합계"
                      : formatCell
                        ? formatCell(
                            header.key,
                            summaryData[header.key],
                            summaryData,
                          )
                        : (summaryData[header.key] ?? "")}
                  </td>
                ))}
              </tr>
            </TFoot>
          )}
        </StyledTable>
      </TableWrapper>

      {totalCount > 0 && (
        <PaginationContainer>
          <PageButton onClick={() => onPageChange(1)} disabled={page === 1}>
            <CaretDoubleLeft size={14} weight="bold" />
          </PageButton>
          <PageButton
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
          >
            <CaretLeft size={14} weight="bold" />
          </PageButton>
          {renderPageNumbers()}
          <PageButton
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages || totalPages === 0}
          >
            <CaretRight size={14} weight="bold" />
          </PageButton>
          <PageButton
            onClick={() => onPageChange(totalPages)}
            disabled={page === totalPages || totalPages === 0}
          >
            <CaretDoubleRight size={14} weight="bold" />
          </PageButton>
        </PaginationContainer>
      )}
    </div>
  );
}
