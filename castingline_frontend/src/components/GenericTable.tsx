import React, { useRef, useState, useMemo } from "react";
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
import { ui } from "../styles/uiTokens";

/** 1. 테이블 컨테이너 및 스타일 **/
const TableWrapper = styled.div`
  width: 100%;
  overflow: auto;
  background-color: ${ui.color.surface};
  border-radius: ${ui.radius.md};
  flex: 1;
  min-height: 0;

  /* 스크롤바는 평소 옅게, 올려두면 진하게 — 표 위에 검은 막대가 얹힌 느낌 제거 */
  &::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: ${ui.color.borderStrong};
    border-radius: 8px;
    border: 3px solid ${ui.color.surface};
  }
  &:hover::-webkit-scrollbar-thumb {
    background: ${ui.color.textSubtle};
  }
`;

const StyledTable = styled.table`
  width: 100%;
  /* collapse는 sticky 셀에서 테두리가 따라오지 않아 가로 스크롤 시
     고정열 구분선이 사라지며 틈이 생김 → separate + spacing 0 사용 */
  border-collapse: separate;
  border-spacing: 0;
  font-family: ${ui.font.family};
  font-size: ${ui.font.size.md};
  table-layout: auto;
`;

const THead = styled.thead`
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: ${ui.color.surfaceMuted};
`;

const StyledTH = styled.th<{ $stickyLeft?: string; $width?: string }>`
  /* 헤더 아래 굵은 선 대신 얇은 경계선 — 표 전체의 선 굵기를 통일 */
  border-bottom: 1px solid ${ui.color.border};
  border-right: 1px solid ${ui.color.borderSubtle};
  padding: 8px 10px;
  font-size: ${ui.font.size.sm};
  font-weight: ${ui.font.weight.semibold};
  color: ${ui.color.textMuted};
  white-space: nowrap;
  cursor: pointer;
  height: ${ui.table.headHeight}px;
  transition: background-color 0.15s;

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
      background-color: ${ui.color.surfaceMuted};
      border-right: 1px solid ${ui.color.border};
      /* 고정열 폭을 선언값으로 강제 — 실제 폭이 커지면 다음 고정열 오프셋과
         어긋나 사이로 스크롤 내용이 비치는 문제 방지 */
      ${props.$width ? `max-width: ${props.$width}; overflow: hidden; text-overflow: ellipsis;` : ""}
      box-shadow: 1px 0 0 0 ${ui.color.surfaceMuted}; /* 서브픽셀 이음새 덮기 */
      box-sizing: border-box;
    `}

  &:hover {
    background-color: ${ui.color.surfaceHover};
    color: ${ui.color.textStrong};
  }
  .header-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }
  /* 정렬 안 된 컬럼의 화살표는 평소 숨김 — 30개 컬럼에 아이콘이 다 떠 있으면 산만함 */
  .sort-idle {
    display: inline-flex;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  &:hover .sort-idle {
    opacity: 1;
  }
`;

const TFoot = styled.tfoot`
  position: sticky;
  bottom: 0;
  z-index: 10;
  background-color: ${ui.color.surfaceMuted};
  tr {
    border-top: none;
  }
  td {
    padding: 10px 12px;
    font-weight: ${ui.font.weight.bold};
    color: ${ui.color.textStrong};
    border-top: 1px solid ${ui.color.borderStrong};
    border-right: 1px solid ${ui.color.borderSubtle};
    text-align: left;
    background-color: ${ui.color.surfaceMuted};
  }
`;

const TR = styled.tr<{ $isHighlight?: boolean }>`
  height: ${ui.table.rowHeight}px;
  transition: background-color 0.12s;
  /* 얼룩무늬(zebra) 제거 — 행 높이를 키우고 아래 경계선만 남기는 편이 덜 답답합니다 */
  background-color: ${(props) => (props.$isHighlight ? ui.color.warningSoft : ui.color.surface)};

  /* border-collapse: separate에서는 tr 테두리가 안 그려지므로 td에 적용 */
  & > td {
    border-bottom: 1px solid ${ui.color.border};
  }
  & > td:first-child {
    border-left: ${(props) =>
      props.$isHighlight ? `3px solid ${ui.color.warning}` : "3px solid transparent"};
  }

  &:hover {
    background-color: ${ui.color.surfaceHover} !important;
    cursor: pointer;
  }

  /* 선택 행: 검정 반전 대신 옅은 파랑 — 주변 톤과 어긋나지 않게 */
  &.selected {
    background-color: ${ui.color.primarySoft} !important;
    &,
    td {
      color: ${ui.color.primaryHover} !important;
      font-weight: ${ui.font.weight.semibold} !important;
      background-color: ${ui.color.primarySoft} !important;
    }
    & > td:first-child {
      border-left: 3px solid ${ui.color.primary};
    }
  }
`;

const TD = styled.td<{ $stickyLeft?: string; $cellStyle?: any; $width?: string }>`
  border-right: 1px solid ${ui.color.borderSubtle};
  padding: 6px 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  color: ${ui.color.text};
  font-weight: ${ui.font.weight.regular};
  background-color: inherit;

  ${(props) =>
    props.$stickyLeft &&
    css`
      position: sticky;
      left: ${props.$stickyLeft};
      z-index: 5;
      background-color: inherit; /* 선택/hover 배경이 고정열에도 그대로 이어지도록 */
      border-right: 1px solid ${ui.color.border};
      /* 고정열 폭 강제 (헤더 오프셋과 일치) + 서브픽셀 이음새 덮기 */
      ${props.$width
        ? `width: ${props.$width}; min-width: ${props.$width}; max-width: ${props.$width};`
        : ""}
      box-sizing: border-box;
    `}

  ${(props) => props.$cellStyle && css(props.$cellStyle)}

  &.read-only {
    color: ${ui.color.text};
  }
  &.editable {
    cursor: cell;
    &:hover {
      background-color: ${ui.color.primarySoft};
    }
  }

  input {
    width: 100%;
    border: 1px solid ${ui.color.primary};
    border-radius: ${ui.radius.sm};
    padding: 2px 4px;
    font-family: inherit;
    font-size: inherit;
    outline: none;
    box-shadow: 0 0 0 2px ${ui.color.primarySoft};
  }
`;

const PaginationContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
  padding: 10px 0;
  background: ${ui.color.surface};
  border-top: 1px solid ${ui.color.borderSubtle};
`;

const PageButton = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 30px;
  border: 1px solid ${(props) => (props.$active ? ui.color.primary : "transparent")};
  background: ${(props) => (props.$active ? ui.color.primarySoft : "transparent")};
  color: ${(props) => (props.$active ? ui.color.primary : ui.color.textMuted)};
  font-size: ${ui.font.size.sm};
  font-weight: ${(props) => (props.$active ? ui.font.weight.bold : ui.font.weight.medium)};
  cursor: pointer;
  border-radius: ${ui.radius.sm};
  transition: all 0.12s ease;

  &:hover:not(:disabled) {
    background: ${ui.color.surfaceHover};
    color: ${ui.color.textStrong};
  }
  &:disabled {
    opacity: 0.35;
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
  sortKey: externalSortKey,
  sortOrder: externalSortOrder,
  page: externalPage,
  pageSize: externalPageSize,
  totalCount: externalTotalCount,
  onPageChange: externalOnPageChange,
  summaryData,
  topRow,
  getRowHighlight,
  onUpdateCell,
  showCheckbox,
  selectedIds = [],
  onSelectionChange,
  hidePagination,
  sortable = true,
}: any) {
  const tableRef = useRef<HTMLTableElement>(null);

  // 내부 정렬 상태 (onSortChange가 없을 때 자체 정렬)
  const [internalSortKey, setInternalSortKey] = useState<string | null>(null);
  const [internalSortOrder, setInternalSortOrder] = useState<"asc" | "desc">("asc");

  const isExternalSort = !!onSortChange;
  const sortKey = isExternalSort ? externalSortKey : internalSortKey;
  const sortOrder = isExternalSort ? externalSortOrder : internalSortOrder;

  // 내부 정렬 핸들러
  const handleSortClick = (key: string) => {
    if (!sortable) return;
    if (isExternalSort) {
      onSortChange(key);
    } else {
      const newOrder = internalSortKey === key && internalSortOrder === "asc" ? "desc" : "asc";
      setInternalSortKey(key);
      setInternalSortOrder(newOrder);
    }
  };

  // 클라이언트 정렬 적용
  const sortedData = useMemo(() => {
    if (isExternalSort || !internalSortKey) return data;
    return [...data].sort((a: any, b: any) => {
      const aVal = a[internalSortKey];
      const bVal = b[internalSortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return internalSortOrder === "asc" ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal), "ko");
      return internalSortOrder === "asc" ? cmp : -cmp;
    });
  }, [data, internalSortKey, internalSortOrder, isExternalSort]);

  // pagination 기본값 처리
  const page = externalPage ?? 1;
  const pageSize = externalPageSize ?? data?.length ?? 50;
  const totalCount = externalTotalCount ?? data?.length ?? 0;
  const onPageChange = externalOnPageChange ?? (() => {});
  const totalPages = pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0;

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
        <PageButton key={i} $active={i === page} onClick={() => onPageChange(i)}>
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
        minHeight: 0,
        backgroundColor: ui.color.surface,
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
                      checked={sortedData.length > 0 && selectedIds.length === sortedData.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          onSelectionChange(sortedData.map((item: any) => getRowKey(item)));
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
                  style={sortable ? undefined : { cursor: "default" }}
                  onClick={() => handleSortClick(header.key)}
                >
                  <div className="header-content">
                    {header.label}
                    {sortable &&
                      (sortKey === header.key ? (
                        sortOrder === "asc" ? (
                          <CaretUp size={11} weight="bold" color={ui.color.primary} />
                        ) : (
                          <CaretDown size={11} weight="bold" color={ui.color.primary} />
                        )
                      ) : (
                        <span className="sort-idle">
                          <ArrowsDownUp size={10} color={ui.color.textSubtle} />
                        </span>
                      ))}
                  </div>
                </StyledTH>
              ))}
            </tr>
          </THead>
          <tbody>
            {topRow && topRow}
            {sortedData.map((item: any) => {
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
                        $width={header.width}
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

      {!hidePagination && totalCount > 0 && (
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
