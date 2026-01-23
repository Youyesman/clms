import { useState, useRef, useEffect, useCallback } from "react";
import styled from "styled-components";
import { AxiosDelete, AxiosGet, AxiosPatch, AxiosPost } from "../../../axios/Axios";
import { GenericTable } from "../../../components/GenericTable";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { CheckCircleIcon, MagnifyingGlassIcon, Plus, Trash } from "@phosphor-icons/react";
import { useToast } from "../../../components/common/CustomToast";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { AddOrderDetailModal } from "./AddOrderDetailModal";
import formatDateTime from "../../../components/common/formatDateTime";
import { CustomInput } from "../../../components/common/CustomInput";
import { AutocompleteInputClient } from "../../../components/common/AutocompleteInputClient";
import { ExcelIconButton } from "../../../components/common/ExcelIconButton";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";

/** 스타일 정의 **/

const FilterGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    .label {
        font-size: 12px;
        font-weight: 700;
        color: #475569;
        white-space: nowrap;
    }
`;





export function OrderDetail({
    selectedOrderList,
    orderDetail,
    setOrderDetail,
    selectedOrderDetail,
    setSelectedOrderDetail,
    handleSelectOrderDetail,
}) {
    const toast = useToast();
    const { openModal, closeModal } = useGlobalModal();
    const [filterStartDate, setFilterStartDate] = useState("");
    const [searchClient, setSearchClient] = useState<any>({ theater: null });
    const [clientInputValue, setClientInputValue] = useState("");

    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    const [isFilterMode, setIsFilterMode] = useState(false);
    const [isExcelLoading, setIsExcelLoading] = useState(false);
    const fetchSortedOrderDetail = useCallback((
        key: string | null,
        order: "asc" | "desc",
        currentPage = 1,
        forceFilterMode = false // 검색 버튼 클릭 시 true로 전달
    ) => {
        const currentFilterMode = forceFilterMode || isFilterMode;

        // 검색 버튼도 안 눌렀고, 선택된 영화도 없으면 조회 안 함
        if (!selectedOrderList?.id && !currentFilterMode && !filterStartDate && !searchClient.theater?.id) {
            setOrderDetail([]);
            setTotalCount(0);
            return;
        }

        const ordering = key ? `${order === "asc" ? "" : "-"}${key}` : "";
        const params = new URLSearchParams();

        // -----------------------------------------------------------
        // [핵심 로직] 
        // 필터 모드가 아닐 때만 영화 ID(id)를 파라미터에 추가합니다.
        // -----------------------------------------------------------
        if (!currentFilterMode && selectedOrderList?.id) {
            params.append("id", String(selectedOrderList.id));
        }

        if (filterStartDate) params.append("start_date", filterStartDate);
        if (searchClient.theater?.id) params.append("client_id", String(searchClient.theater.id));

        params.append("ordering", ordering);
        params.append("page", String(currentPage));
        params.append("page_size", String(pageSize));

        AxiosGet(`order/?${params.toString()}`)
            .then((res) => {
                setOrderDetail(res.data.results);
                setTotalCount(res.data.count);
            })
            .catch((error) => toast.error(handleBackendErrors(error)));
    }, [selectedOrderList?.id, filterStartDate, searchClient.theater?.id, isFilterMode, sortKey, sortOrder]);

    /** ✅ 2. 검색 버튼 클릭 핸들러 **/
    const onClickSearch = () => {
        if (!filterStartDate && !searchClient.theater?.id) {
            toast.warning("기준일자 또는 극장명을 입력해주세요.");
            return;
        }
        setIsFilterMode(true); // 필터 모드 활성화 (영화 ID 무시 시작)
        setPage(1);
        fetchSortedOrderDetail(sortKey, sortOrder, 1, true);
    };

    /** ✅ 3. 왼쪽에서 영화를 새로 선택했을 때 **/
    useEffect(() => {
        if (selectedOrderList?.id) {
            setIsFilterMode(false); // 필터 모드 해제 (해당 영화 상세 보기로 복귀)
            setPage(1);
            // 여기서 직접 호출할 때는 forceFilterMode를 false(기본값)로 둡니다.
            const params = new URLSearchParams({
                id: String(selectedOrderList.id),
                page: "1",
                page_size: String(pageSize),
            });
            AxiosGet(`order/?${params.toString()}`)
                .then((res) => {
                    setOrderDetail(res.data.results);
                    setTotalCount(res.data.count);
                });
        }
    }, [selectedOrderList?.id]);
    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > Math.ceil(totalCount / pageSize)) return;
        setPage(newPage);
        fetchSortedOrderDetail(sortKey, sortOrder, newPage);
    };

    const handleSortChange = (key: string) => {
        let newOrder: "asc" | "desc" = sortKey === key && sortOrder === "asc" ? "desc" : "asc";
        setSortKey(key);
        setSortOrder(newOrder);
        fetchSortedOrderDetail(key, newOrder, 1);
    };

    const handleAddOrderDetail = () => {
        openModal(<AddOrderDetailModal selectedOrderList={selectedOrderList} onSuccess={() => { fetchSortedOrderDetail(sortKey, sortOrder, page); }}></AddOrderDetailModal>, { title: "오더 상세 내역 추가", width: '600px' })
    };

    const handleUpdateCell = (item: any, key: string, value: any) => {
        // ✅ 빈 문자열("")인 경우 null로 변환하여 전송 (날짜 필드 에러 방지)
        const processedValue = value === "" ? null : value;

        // ✅ 이미 같은 값이면 API 호출 안 함
        if (item[key] === processedValue) return;

        AxiosPatch("order", { [key]: processedValue }, item.id)
            .then((res) => {
                setOrderDetail((prev: any[]) =>
                    prev.map((order) =>
                        (order.id === item.id ? { ...order, [key]: processedValue } : order)
                    )
                );
                toast.success("저장되었습니다.");
            })
            .catch((error) => {
                // 에러 발생 시 사용자에게 알림 (이미 handleBackendErrors가 처리 중)
                toast.error(handleBackendErrors(error));
            });
    };
    const handleDeleteOrderDetail = (id: number) => {
        if (!window.confirm("정말 삭제하시겠습니까?")) return;
        AxiosDelete(`order`, id)
            .then(() => {
                setOrderDetail((prev: any[]) => prev.filter((item) => item.id !== id));
                setSelectedOrderDetail(null);
                toast.success("삭제되었습니다.");
            })
            .catch((error) => toast.error(handleBackendErrors(error)));
    };
    const handleSyncEndDate = (e: React.MouseEvent, item: any) => {
        e.stopPropagation(); // 행 선택 이벤트 방지
        if (!item.last_screening_date) {
            toast.error("마지막 상영일 데이터가 없습니다.");
            return;
        }
        // end_date 컬럼을 last_screening_date 값으로 업데이트
        handleUpdateCell(item, "end_date", item.last_screening_date);
    };

    const handleExcelDownload = useCallback(() => {
        if (!filterStartDate) {
            toast.warning("기준일자를 선택해주세요.");
            return;
        }
        setIsExcelLoading(true);
        const params = new URLSearchParams();

        if (!isFilterMode && selectedOrderList?.id) {
            params.append("id", String(selectedOrderList.id));
        }

        if (filterStartDate) params.append("start_date", filterStartDate);
        if (searchClient.theater?.id) params.append("client_id", String(searchClient.theater.id));

        if (sortKey) {
            params.append("ordering", sortOrder === "desc" ? `-${sortKey}` : sortKey);
        }

        AxiosGet(`order-excel-export/?${params.toString()}`, { responseType: "blob" })
            .then((res) => {
                const url = window.URL.createObjectURL(new Blob([res.data]));
                const link = document.createElement("a");
                link.href = url;
                let fileName = `Order_List.xlsx`;
                const contentDisposition = res.headers["content-disposition"];
                if (contentDisposition) {
                    const fileNameMatch = contentDisposition.match(/filename="?(.+)"?/);
                    if (fileNameMatch && fileNameMatch.length === 2) fileName = fileNameMatch[1];
                }
                link.setAttribute("download", fileName);
                document.body.appendChild(link);
                link.click();
                link.remove();
            })
            .catch((err) => toast.error("엑셀 다운로드 중 오류가 발생했습니다."))
            .finally(() => {
                setIsExcelLoading(false);
            });
    }, [selectedOrderList?.id, filterStartDate, searchClient.theater?.id, isFilterMode, sortKey, sortOrder, toast]);

    const headers = [
        { key: "movie", label: "영화" },
        { key: "format", label: "포맷" },
        { key: "client", label: "극장명" },
        { key: "release_date", label: "개봉일", editable: true },
        { key: "end_date", label: "종영일", editable: true }, // 업데이트될 대상
        {
            key: "last_screening_date",
            label: "마지막상영",
            editable: true,
            // 셀 렌더링 커스텀
            renderCell: (value: any, item: any) => (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span>{value ?? "-"}</span>
                    {value && (
                        <button
                            onClick={(e) => handleSyncEndDate(e, item)}
                            title="종영일로 복사"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: 'none',
                                background: '#10b981', // 초록색 계열
                                color: 'white',
                                borderRadius: '4px',
                                width: '20px',
                                height: '20px',
                                cursor: 'pointer',
                                padding: '0'
                            }}
                        >
                            <CheckCircleIcon size={14} weight="fill" />
                        </button>
                    )}
                </div>
            )
        },
        { key: "remark", label: "비고", editable: true },
        { key: "region_code", label: "지역" },
        { key: "classification", label: "직위" },
        { key: "theater_kind", label: "멀티" },
        {
            key: "created_date",
            label: "생성일자",
            renderCell: (value) => value ? formatDateTime(value) : "-"
        },
    ];
    const handleRowHighlight = (item: any) => {
        if (!item.is_auto_generated || !item.created_date) return false;

        const createdDate = new Date(item.created_date);
        const now = new Date();
        const diffInHours = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);

        return diffInHours < 24; // 24시간 이내면 true 반환
    };
    return (
        <>
            <CommonFilterBar onSearch={onClickSearch}>
                <FilterGroup>
                    <div className="label">기준일자:</div>
                    <CustomInput
                        inputType="date"
                        size="sm"
                        value={filterStartDate}
                        setValue={setFilterStartDate}
                        style={{ width: "130px" }}
                    />
                </FilterGroup>
                <FilterGroup style={{ flex: 1, maxWidth: "350px" }}>
                    <div className="label">극장 검색:</div>
                    <AutocompleteInputClient
                        type="theater"
                        placeholder="극장명 검색..."
                        formData={searchClient}
                        setFormData={setSearchClient}
                        inputValue={clientInputValue}
                        setInputValue={setClientInputValue}
                    />
                </FilterGroup>
            </CommonFilterBar>

            <CommonSectionCard>
                <CommonListHeader
                    title="오더 상세 내역"
                    actions={
                        <>
                            <ExcelIconButton onClick={handleExcelDownload} isLoading={isExcelLoading} />
                            <CustomIconButton color="blue" onClick={handleAddOrderDetail} title="상세 추가">
                                <Plus weight="bold" />
                            </CustomIconButton>
                            <CustomIconButton
                                color="red"
                                disabled={!selectedOrderDetail}
                                onClick={() => handleDeleteOrderDetail(selectedOrderDetail.id)}
                                title="삭제">
                                <Trash weight="bold" />
                            </CustomIconButton>
                        </>
                    }
                />
                <GenericTable
                    headers={headers}
                    data={orderDetail}
                    selectedItem={selectedOrderDetail}
                    onSelectItem={handleSelectOrderDetail}
                    getRowKey={(item) => item.id}
                    getRowHighlight={handleRowHighlight}
                    formatCell={(key, value, row) => {
                        const movie = row.movie;
                        const client = row.client;
                        if (key === "movie") return movie?.title_ko ?? "";
                        if (key === "client") return client?.client_name ?? "";
                        if (key === "format")
                            return `${movie?.media_type || ""} ${movie?.audio_mode || ""} ${movie?.viewing_dimension || ""} ${movie?.screening_type || ""
                                } ${movie?.audio_dimension || ""} ${movie?.dx4_viewing_dimension || ""}`.trim();
                        if (key === "region_code") return client?.region_code ?? "";
                        if (key === "classification") return client?.classification ?? "";
                        if (key === "theater_kind") return client?.theater_kind ?? "";
                        return value ?? "";
                    }}
                    onUpdateCell={handleUpdateCell}
                    onSortChange={handleSortChange}
                    sortKey={sortKey}
                    sortOrder={sortOrder}
                    page={page}
                    pageSize={pageSize}
                    totalCount={totalCount}
                    onPageChange={handlePageChange}
                />
            </CommonSectionCard>
        </>
    );
}
