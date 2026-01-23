import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { AxiosGet, AxiosPost } from "../../../axios/Axios";
import { GenericTable } from "../../../components/GenericTable";
import {
  CheckCircle,
  XCircle,
  PlusCircle,
  Checks,
} from "@phosphor-icons/react";
import { CustomInput } from "../../../components/common/CustomInput";
import { CommonListHeader } from "../../../components/common/CommonListHeader";

/** 스타일 정의 **/
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

const BulkInputBar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background-color: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  .input-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .section-label {
    font-size: 12px;
    font-weight: 700;
    color: #475569;
  }
`;

const BulkSaveButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  background-color: #1e293b;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  padding: 0 12px;
  height: 28px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  margin-left: auto;
  &:hover {
    background-color: #0f172a;
  }
  &:disabled {
    background-color: #cbd5e1;
    cursor: not-allowed;
  }
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: #2563eb;
  &:hover {
    color: #1d4ed8;
  }
  &:disabled {
    color: #cbd5e1;
    cursor: not-allowed;
  }
`;

// ✅ Props 타입 정의 (onRefreshMaster 추가)
interface Props {
  activeFilters: any;
  onRefreshMaster?: () => void;
}

export function OrderRateStatusList({ activeFilters, onRefreshMaster }: Props) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 5;

  const [onlyMissingRate, setOnlyMissingRate] = useState(true);

  // 입력 상태
  const [baseDate, setBaseDate] = useState("");
  const [seoulValue, setSeoulValue] = useState("");
  const [provinceValue, setProvinceValue] = useState("");

  const fetchOrders = useCallback(async () => {
    if (!activeFilters.movie?.movie_code) {
      setOrders([]);
      setTotalCount(0);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("movie_code", activeFilters.movie.movie_code);
      if (activeFilters.client?.client_code)
        params.append("client_code", activeFilters.client.client_code);
      params.append("missing_rate_only", String(onlyMissingRate));
      params.append("page", String(page));
      params.append("page_size", String(pageSize));

      const res = await AxiosGet(`order-rate-status/?${params.toString()}`);
      setOrders(res.data.results || []);
      setTotalCount(res.data.count || 0);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [activeFilters, page, onlyMissingRate]);

  useEffect(() => {
    setPage(1);
  }, [activeFilters, onlyMissingRate]);
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // ✅ 단건 등록
  const handleAddRate = async (row: any) => {
    if (!baseDate || (!seoulValue && !provinceValue))
      return alert("날짜와 부율을 입력해주세요.");

    const isSeoul = row.classification === "서울" || row.region_code === "01";
    const rateValue = isSeoul ? seoulValue : provinceValue;

    if (!rateValue)
      return alert(`${isSeoul ? "서울" : "지방"} 부율 값이 없습니다.`);
    if (!window.confirm(`${row.client_name} 부율을 등록하시겠습니까?`)) return;

    try {
      await AxiosPost("rates", {
        client: row.client, // ✅ row.client_id 대신 row.client 사용
        movie: row.movie, // ✅ row.movie_id 대신 row.movie 사용
        share_rate: parseFloat(rateValue),
        start_date: baseDate,
      });
      alert("등록되었습니다.");
      fetchOrders();
      if (onRefreshMaster) onRefreshMaster(); // ✅ 마스터 목록(부율 관리) 새로고침
    } catch (error) {
      alert("등록 실패");
    }
  };

  // ✅ 일괄 등록
  const handleBulkAddRate = async () => {
    const targets = orders.filter((o: any) => !o.has_rate);
    if (targets.length === 0) return alert("대상 없음");
    if (!baseDate || (!seoulValue && !provinceValue))
      return alert("날짜/부율 입력 필요");

    if (!window.confirm(`${targets.length}건을 일괄 등록하시겠습니까?`)) return;

    const payload = targets.map((row: any) => {
      const isSeoul = row.classification === "서울" || row.region_code === "01";
      return {
        client: row.client,
        movie: row.movie,
        share_rate: parseFloat(
          isSeoul ? seoulValue || "0" : provinceValue || "0",
        ),
        start_date: baseDate,
      };
    });

    try {
      await AxiosPost("rates", payload);
      alert(`${targets.length}건 등록 완료`);
      fetchOrders();
      if (onRefreshMaster) onRefreshMaster(); // ✅ 마스터 목록(부율 관리) 새로고침
    } catch (error) {
      alert("일괄 등록 실패");
    }
  };

  const headers = [
    {
      key: "client_name",
      label: "극장명",
      renderCell: (_: any, row: any) => row?.client_name,
    },
    { key: "classification", label: "구분", width: "60px" },
    { key: "release_date", label: "개봉일" },
    {
      key: "rate_status",
      label: "부율등록",
      width: "80px",
      renderCell: (_: any, row: any) =>
        row.has_rate ? (
          <CheckCircle size={20} weight="fill" color="#10b981" />
        ) : (
          <XCircle size={20} weight="fill" color="#ef4444" />
        ),
    },
    {
      key: "add_action",
      label: "추가",
      width: "50px",
      renderCell: (_: any, row: any) =>
        !row.has_rate && (
          <ActionButton onClick={() => handleAddRate(row)} title="등록">
            <PlusCircle size={22} weight="duotone" />
          </ActionButton>
        ),
    },
  ];

  return (
    <ListContainer>
      <CommonListHeader
        title="오더 기준 부율 등록 현황"
        actions={
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "12px",
            fontWeight: 700,
            color: "#475569",
            cursor: "pointer"
          }}>
            <input
              type="checkbox"
              style={{ cursor: "pointer", width: "16px", height: "16px" }}
              checked={onlyMissingRate}
              onChange={(e) => setOnlyMissingRate(e.target.checked)}
            />
            미등록 극장만 보기
          </label>
        }
      />

      <BulkInputBar>
        <div className="input-group">
          <span className="section-label">기준일자</span>
          <CustomInput
            style={{ width: "120px" }}
            inputType="date"
            value={baseDate}
            setValue={setBaseDate}
          />
        </div>
        <div className="input-group">
          <span className="section-label">서울</span>
          <CustomInput
            style={{ width: "60px" }}
            inputType="number"
            placeholder="0"
            value={seoulValue}
            setValue={setSeoulValue}
          />
        </div>
        <div className="input-group">
          <span className="section-label">지방</span>
          <CustomInput
            style={{ width: "60px" }}
            inputType="number"
            placeholder="0"
            value={provinceValue}
            setValue={setProvinceValue}
          />
        </div>
        <BulkSaveButton
          onClick={handleBulkAddRate}
          disabled={loading || !baseDate}
        >
          <Checks weight="bold" size={16} />
          미등록 전체 추가
        </BulkSaveButton>
      </BulkInputBar>

      <GenericTable
        headers={headers}
        data={orders}
        getRowKey={(r: any) => `order-status-${r.client}-${r.movie}`}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
        loading={loading}
      />
    </ListContainer>
  );
}
