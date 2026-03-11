import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { AxiosGet, AxiosPatch } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";

// 공통 컴포넌트
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomSelect } from "../../../components/common/CustomSelect";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { AutocompleteInputClient } from "../../../components/common/AutocompleteInputClient";
import { GenericTable } from "../../../components/GenericTable";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { MonthlyFundList } from "../components/MonthlyFundList";
import { ExcelIconButton } from "../../../components/common/ExcelIconButton";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";

/** 스타일 정의 **/
const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background-color: #f8fafc;
    min-height: 100vh;
    font-family: "SUIT", sans-serif;
`;


const MainGrid = styled.div`
    display: flex;
    flex-direction: row;
    gap: 16px;
    flex: 1;
    align-items: flex-start;
`;

/** 스타일 정의 **/

const DetailSection = styled.div`
    flex: 0.8;
    height: calc(100vh - 160px);
    display: flex;
    flex-direction: column;
`;


const RadioWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    font-size: 13px;
    label {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        font-weight: 500;
        input {
            margin: 0;
            cursor: pointer;
            accent-color: #0f172a;
        }
    }
`;

export function ManageFund() {
    const toast = useToast();
    const [funds, setFunds] = useState<any[]>([]);
    const [selectedFund, setSelectedFund] = useState<any>(null);
    const THIS_YEAR = new Date().getFullYear().toString(); // "2026"
    // 🔍 검색 필터 상태 업데이트
    const [searchParams, setSearchParams] = useState({
        yyyy: THIS_YEAR, // 초기값을 2026으로 설정
        multi_type: "전체",
        fund_filter: "전체",
        client: null as any,
    });

    const [activeFilters, setActiveFilters] = useState<any>({
        yyyy: THIS_YEAR, // 필터의 초기 기준도 2026으로 설정
    });
    const [clientInput, setClientInput] = useState("");

    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [isExcelLoading, setIsExcelLoading] = useState(false);

    const fetchFunds = useCallback(() => {
        const params = new URLSearchParams();
        if (activeFilters.yyyy) params.append("yyyy", activeFilters.yyyy);
        if (activeFilters.client_id) params.append("client_id", activeFilters.client_id);

        // 멀티구분 필터 로직 적용
        if (activeFilters.multi_type === "멀티") params.append("multi_only", "true");
        else if (activeFilters.multi_type === "일반") params.append("normal_only", "true");

        // 기금면제 필터 로직 적용 (false: 일반, true: 기금면제)
        if (activeFilters.fund_filter === "일반") params.append("fund_yn", "false");
        else if (activeFilters.fund_filter === "기금제외") params.append("fund_yn", "true");

        if (sortKey) params.append("ordering", sortOrder === "desc" ? `-${sortKey}` : sortKey);
        params.append("page", String(page));
        params.append("page_size", "20");

        AxiosGet(`funds/?${params.toString()}`)
            .then((res) => {
                setFunds(res.data.results);
                setTotalCount(res.data.count);
            })
            .catch((error) => toast.error(handleBackendErrors(error)));
    }, [activeFilters, sortKey, sortOrder, page]);

    useEffect(() => {
        fetchFunds();
    }, [fetchFunds]);

    const handleSearch = () => {
        setPage(1);
        setActiveFilters({
            yyyy: searchParams.yyyy,
            multi_type: searchParams.multi_type,
            fund_filter: searchParams.fund_filter,
            client_id: clientInput.trim() === "" ? "" : searchParams.client?.id || "",
        });
    };

    const handleUpdateFundStatus = (clientId: number, val: boolean) => {
        const currentYyyy = activeFilters.yyyy || searchParams.yyyy;

        AxiosPatch(
            "funds",
            {
                fund_yn: val,
                yyyy: currentYyyy,
            },
            clientId
        )
            .then((res) => {
                // ✅ 핵심: f.id가 아니라 f.client_id로 비교해야 합니다.
                // 백엔드에서 리턴한 res.data(업데이트된 객체)로 해당 행만 교체합니다.
                setFunds((prev) => prev.map((f) => (f.client_id === clientId ? res.data : f)));

                // ✅ 상세 섹션(선택된 항목)도 즉시 업데이트
                if (selectedFund?.client_id === clientId) {
                    setSelectedFund(res.data);
                }

                toast.success("기금 상태가 반영되었습니다.");
            })
            .catch((err) => toast.error(handleBackendErrors(err)));
    };

    const handleExcelExport = () => {
        setIsExcelLoading(true);
        const params = new URLSearchParams();
        if (activeFilters.yyyy) params.append("yyyy", activeFilters.yyyy);
        if (activeFilters.client_id) params.append("client_id", activeFilters.client_id);

        if (activeFilters.multi_type === "멀티") params.append("multi_only", "true");
        else if (activeFilters.multi_type === "일반") params.append("normal_only", "true");

        if (activeFilters.fund_filter === "일반") params.append("fund_yn", "false");
        else if (activeFilters.fund_filter === "기금제외") params.append("fund_yn", "true");

        // Use the generic excel-export endpoint defined in fund/urls.py
        AxiosGet(`fund-excel-export/?${params.toString()}`, { responseType: "blob" })
            .then((res) => {
                const url = window.URL.createObjectURL(new Blob([res.data]));
                const link = document.createElement("a");
                link.href = url;
                // Try to get filename from content-disposition
                let fileName = `Fund_Status_${activeFilters.yyyy}.xlsx`;
                const contentDisposition = res.headers["content-disposition"];
                if (contentDisposition) {
                     const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                     if (fileNameMatch && fileNameMatch.length === 2)
                         fileName = fileNameMatch[1];
                }
                link.setAttribute("download", fileName);
                document.body.appendChild(link);
                link.click();
                link.remove();
            })
            .catch((err) => {
                console.error(err);
                toast.error("엑셀 다운로드 중 오류가 발생했습니다.");
            })
            .finally(() => {
                setIsExcelLoading(false);
            });
    };

    const headers = [
        { key: "client_code", label: "극장코드" },
        { key: "client_name", label: "극장명" },
        { key: "fund_yn", label: "년 전체 기금구분" },
        { key: "theater_kind", label: "멀티구분" },
        { key: "value", label: "값" },
    ];
    return (
        <PageContainer>
            <CommonFilterBar onSearch={handleSearch}>
                <div style={{ width: "150px" }}>
                    <CustomInput
                        label="년도"
                        value={searchParams.yyyy}
                        setValue={(v) => setSearchParams((prev: any) => ({ ...prev, yyyy: v }))}
                        labelWidth="40px"
                    />
                </div>
                {/* 멀티/일반 선택 필터 */}
                <div style={{ width: "160px" }}>
                    <CustomSelect
                        label="멀티"
                        options={["전체", "멀티", "일반"]}
                        value={searchParams.multi_type}
                        onChange={(v) => setSearchParams((prev: any) => ({ ...prev, multi_type: v }))}
                        labelWidth="40px"
                    />
                </div>
                {/* 기금 일반/제외 필터 */}
                <div style={{ width: "180px" }}>
                    <CustomSelect
                        label="기금"
                        options={["전체", "일반", "기금제외"]}
                        value={searchParams.fund_filter}
                        onChange={(v) => setSearchParams((prev: any) => ({ ...prev, fund_filter: v }))}
                        labelWidth="40px"
                    />
                </div>
                <div style={{ width: "260px" }}>
                    <AutocompleteInputClient
                        type="client"
                        label="극장명"
                        formData={searchParams}
                        setFormData={setSearchParams}
                        inputValue={clientInput}
                        setInputValue={setClientInput}
                        labelWidth="50px"
                    />
                </div>
            </CommonFilterBar>

            <MainGrid>
                <CommonSectionCard flex={1.2} height="calc(100vh - 160px)">
                    <CommonListHeader
                        title="연간 극장 기금 관리"
                        actions={<ExcelIconButton onClick={handleExcelExport} isLoading={isExcelLoading} />}
                    />
                    <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
                        <GenericTable
                            headers={headers}
                            data={funds}
                            selectedItem={selectedFund}
                            onSelectItem={setSelectedFund}
                            getRowKey={(f) => f.client_id}
                            formatCell={(key, value, row) => {
                                if (key === "theater_kind") return row.theater_kind || "-";
                                if (key === "value") return value;
                                if (key === "fund_yn") {
                                    return (
                                        <RadioWrapper onClick={(e) => e.stopPropagation()}>
                                            <label>
                                                <input
                                                    type="radio"
                                                    checked={value === false}
                                                    onChange={() => handleUpdateFundStatus(row.client_id, false)}
                                                />{" "}
                                                일반
                                            </label>
                                            <label>
                                                <input
                                                    type="radio"
                                                    checked={value === true}
                                                    onChange={() => handleUpdateFundStatus(row.client_id, true)}
                                                />{" "}
                                                기금면제
                                            </label>
                                        </RadioWrapper>
                                    );
                                }
                                return value ?? "";
                            }}
                            onSortChange={(key) => {
                                const newOrder = sortKey === key && sortOrder === "asc" ? "desc" : "asc";
                                setSortKey(key);
                                setSortOrder(newOrder);
                                setPage(1);
                            }}
                            sortKey={sortKey}
                            sortOrder={sortOrder}
                            page={page}
                            pageSize={20}
                            totalCount={totalCount}
                            onPageChange={setPage}
                        />
                    </div>
                </CommonSectionCard>

                <DetailSection>
                    {selectedFund ? (
                        <MonthlyFundList
                            key={selectedFund.client_id} // 연도나 극장이 바뀔 때 리셋
                            client_id={selectedFund.client_id}
                            client_name={selectedFund.client_name}
                            yyyy={selectedFund.yyyy}
                            // ✅ 부모(연간)의 새로고침 함수를 자식에게 전달
                            onRefreshAnnual={fetchFunds}
                            // ✅ 연간 상태값이 바뀌면 자식(월별)도 다시 그리도록 prop 전달
                            parentStatus={selectedFund.fund_yn}
                        />
                    ) : (
                        <div
                            style={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: "#fff",
                                border: "1px solid #cbd5e1",
                                borderRadius: "4px",
                                color: "#94a3b8",
                            }}>
                            극장을 선택하면 상세 기금 내역이 표시됩니다.
                        </div>
                    )}
                </DetailSection>
            </MainGrid>
        </PageContainer>
    );
}
