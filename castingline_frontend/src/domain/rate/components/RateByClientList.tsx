import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { AxiosGet, AxiosPatch, AxiosPost } from "../../../axios/Axios";
import { GenericTable } from "../../../components/GenericTable";
import { useToast } from "../../../components/common/CustomToast";
import {
  CheckSquareIcon,
  Plus,
  SquareIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import formatDateTime from "../../../components/common/formatDateTime";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { CommonListHeader } from "../../../components/common/CommonListHeader";

const ListContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #ffffff;
  border: 1px solid #94a3b8;
  border-radius: 4px;
  overflow: hidden;
`;

// ListHeader removed
const CheckboxWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #64748b;
  &.checked {
    color: #2563eb;
  }
`;
export function RateByClientMovieList({
  selectedRate,
  innerSelectedRate,
  setInnerSelectedRate,
  onRefreshMaster,
  handleDeleteRates,
}: any) {
  const toast = useToast();
  const [dataList, setDataList] = useState<any>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // 현재 선택된 극장명 추출
  const theaterName = selectedRate?.client?.client_name || "";

  const fetchData = useCallback(async () => {
    const clientId = selectedRate?.client?.id;
    const movieId = selectedRate?.movie?.id;
    if (!clientId || !movieId) {
      setDataList([]);
      setTotalCount(0);
      return;
    }

    try {
      const res = await AxiosGet(
        `rates/?client_id=${clientId}&movie_id=${movieId}&page=${page}&page_size=${pageSize}`,
      );
      setDataList(res.data.results || []);
      setTotalCount(res.data.count || 0);
    } catch (error) {
      console.error(error);
    }
  }, [selectedRate, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /** ✅ 즉시 객체 추가 핸들러 **/
  const handleAdd = async () => {
    const clientId = selectedRate?.client?.id;
    const movieId = selectedRate?.movie?.id;

    if (!clientId || !movieId) {
      toast.warning("기준이 될 극장과 영화를 먼저 선택해주세요.");
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    try {
      const payload = {
        client: clientId,
        movie: movieId,
        start_date: today,
        end_date: null,
        share_rate: "0",
      };

      await AxiosPost("rates", payload);
      toast.success("새 부율 이력이 추가되었습니다.");

      fetchData();
      if (onRefreshMaster) onRefreshMaster();
    } catch (e: any) {
      toast.error(handleBackendErrors(e));
    }
  };

  const handleUpdateCell = async (item: any, key: string, value: any) => {
    try {
      await AxiosPatch("rates", { [key]: value }, item.id);
      toast.success("수정되었습니다.");
      fetchData();
      if (onRefreshMaster) onRefreshMaster();
    } catch (e: any) {
      toast.error(handleBackendErrors(e));
    }
  };
  // ✅ 선택 로직 추가
  const isAllSelected =
    dataList.length > 0 && selectedIds.length === dataList.length;

  const toggleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(dataList.map((r) => r.id));
  };

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((itemId) => itemId !== id)
        : [...prev, id],
    );
  };

  // ✅ 삭제 후 선택 초기화 포함된 핸들러
  const onDeleteClick = () => {
    if (selectedIds.length > 0) {
      handleDeleteRates(selectedIds);
      setSelectedIds([]); // 삭제 후 체크 해제
    }
  };

  const headers = [
    {
      key: "selection",
      label: (
        <CheckboxWrapper onClick={toggleSelectAll}>
          {isAllSelected ? (
            <CheckSquareIcon size={18} weight="fill" color="#2563eb" />
          ) : (
            <SquareIcon size={18} />
          )}
        </CheckboxWrapper>
      ),
      width: "40px",
      renderCell: (_: any, row: any) => (
        <CheckboxWrapper
          className={selectedIds.includes(row.id) ? "checked" : ""}
          onClick={(e) => toggleSelect(row.id, e)}
        >
          {selectedIds.includes(row.id) ? (
            <CheckSquareIcon size={18} weight="fill" />
          ) : (
            <SquareIcon size={18} />
          )}
        </CheckboxWrapper>
      ),
    },
    {
      key: "movie",
      label: "영화명",
      renderCell: (v: any, row: any) => row.movie?.title_ko,
    },
    { key: "start_date", label: "시작일", editable: true },
    { key: "end_date", label: "종료일", editable: true },
    {
      key: "share_rate",
      label: "부율",
      editable: true,
      renderCell: (v: any) => <strong>{v}%</strong>,
    },
    {
      key: "updated_date",
      label: "처리일시",
      renderCell: (v: any, row: any) => formatDateTime(row.updated_date),
    },
  ];
  return (
    <ListContainer>
      <CommonListHeader
        title="공통 부율 이력"
        subtitle={theaterName ? `[${theaterName}]` : undefined}
        actions={
          <>
            <CustomIconButton
              color="red"
              onClick={onDeleteClick}
              disabled={selectedIds.length === 0}
              title="선택 삭제"
            >
              <TrashIcon weight="bold" />
            </CustomIconButton>
            <CustomIconButton color="blue" onClick={handleAdd} title="부율 추가">
              <Plus weight="bold" />
            </CustomIconButton>
          </>
        }
      />
      <GenericTable
        headers={headers}
        data={dataList}
        selectedItem={innerSelectedRate}
        onSelectItem={setInnerSelectedRate}
        getRowKey={(r: any) => r.id}
        onUpdateCell={handleUpdateCell}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
      />
    </ListContainer>
  );
}
