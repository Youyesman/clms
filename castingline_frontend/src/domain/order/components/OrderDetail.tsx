import { useState, useRef, useEffect, useCallback } from "react";
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
import { CustomCheckbox } from "../../../components/common/CustomCheckbox";
import styled from "styled-components";

/** O003(0903): 계열사 다중 선택 체크박스 (필터바 안) */
const ChainGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 6px;
    white-space: nowrap;
    .title { font-size: 12px; font-weight: 700; color: #64748b; margin-right: 2px; }
    label { font-size: 12px; }
    svg { width: 18px; height: 18px; }
`;

/** O002(0903): 일괄 종영/해제 텍스트 버튼 */
const BulkButton = styled.button<{ $tone?: "green" | "red" }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    height: 30px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
    ${({ $tone }) =>
        $tone === "red"
            ? "background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; &:hover:not(:disabled){background:#fecaca; border-color:#ef4444;}"
            : "background:#f0fdf4; border:1px solid #dcfce7; color:#15803d; &:hover:not(:disabled){background:#dcfce7; border-color:#16a34a;}"}
    &:disabled {
        background: #f8fafc;
        border-color: #e2e8f0;
        color: #94a3b8;
        cursor: not-allowed;
    }
`;

/** O003: 계열사 체크박스 항목 — 백엔드 chains 파라미터 값과 동일 */
const CHAIN_OPTIONS = ["CGV", "Lotte", "Megabox", "씨네큐", "일반관"] as const;
type ChainKey = (typeof CHAIN_OPTIONS)[number];
const ALL_CHAINS: Record<ChainKey, boolean> = {
    CGV: true, Lotte: true, Megabox: true, 씨네큐: true, 일반관: true,
};

/** 스타일 정의 **/





export function OrderDetail({
    selectedOrderList,
    orderDetail,
    setOrderDetail,
    selectedOrderDetail,
    setSelectedOrderDetail,
    handleSelectOrderDetail,
    kobisLinked = "",
}) {
    const toast = useToast();
    const { openModal, closeModal } = useGlobalModal();
    const [filterStartDate, setFilterStartDate] = useState("");
    const [searchClient, setSearchClient] = useState<any>({ theater: null });
    const [clientInputValue, setClientInputValue] = useState("");

    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [page, setPage] = useState(1);
    // O003(0903): 무한 스크롤 대신 100건 고정 페이징 — 페이지 안에서는 렉 없이 스크롤
    const PAGE_SIZE = 100;
    const [totalCount, setTotalCount] = useState(0);
    const [isExcelLoading, setIsExcelLoading] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isBulkBusy, setIsBulkBusy] = useState(false);
    // O003: 계열사 다중 선택 (기본 전체)
    const [chains, setChains] = useState<Record<ChainKey, boolean>>(ALL_CHAINS);
    // O004: 뒤늦게 도착한 이전 요청 응답이 최신 목록을 덮어쓰지 않도록 요청 순번을 기억
    const requestSeq = useRef(0);

    const movieOrderListId = selectedOrderList?.id ?? null;
    // O001(0903): 극장명은 키워드 검색 — 드롭다운에서 하나를 고르지 않아도 입력한
    // 글자가 들어간 극장 전부('씨네큐' → 씨네큐 신도림·경주보문·청라 …)가 조회된다
    const theaterKeyword = (searchClient.theater?.client_name || clientInputValue || "").trim();

    const selectedChains = CHAIN_OPTIONS.filter((c) => chains[c]);
    const chainParam = selectedChains.length === CHAIN_OPTIONS.length ? "" : selectedChains.join(",");

    /**
     * 조회 파라미터 — 영화(오더목록 선택)와 극장명 검색을 함께 적용한다 (O001).
     * · 영화 선택 + 극장 검색 → 그 영화의 키워드 극장 오더만
     * · 영화 미선택 + 극장 검색 → 키워드 극장들의 모든 영화 (백엔드에서 개봉일 최신순)
     */
    const buildParams = useCallback(
        (key: string | null, order: "asc" | "desc") => {
            const params = new URLSearchParams();
            if (movieOrderListId) params.append("id", String(movieOrderListId));
            if (filterStartDate) params.append("start_date", filterStartDate);
            if (theaterKeyword) params.append("client_name", theaterKeyword);
            if (chainParam) params.append("chains", chainParam);
            // 오더 목록 상단에서 고른 KOBIS 연동 여부 필터
            if (kobisLinked) params.append("kobis_linked", kobisLinked);
            if (key) params.append("ordering", `${order === "asc" ? "" : "-"}${key}`);
            return params;
        },
        [movieOrderListId, filterStartDate, theaterKeyword, chainParam, kobisLinked]
    );

    const hasAnyFilter = !!(movieOrderListId || filterStartDate || theaterKeyword);

    const fetchSortedOrderDetail = useCallback(
        (
            key: string | null,
            order: "asc" | "desc",
            currentPage = 1
        ) => {
            const seq = ++requestSeq.current;
            if (!movieOrderListId && !filterStartDate && !theaterKeyword) {
                setOrderDetail([]);
                setTotalCount(0);
                setPage(1);
                return;
            }

            const params = buildParams(key, order);
            params.append("page", String(currentPage));
            params.append("page_size", String(PAGE_SIZE));

            setIsLoading(true);
            AxiosGet(`order/?${params.toString()}`)
                .then((res) => {
                    // O004: 정렬/영화를 바꾼 뒤 도착한 옛 응답은 버린다 (순서 뒤섞임 방지)
                    if (seq !== requestSeq.current) return;
                    setOrderDetail(res.data.results);
                    setTotalCount(res.data.count);
                    setPage(currentPage);
                })
                .catch((error) => {
                    if (seq !== requestSeq.current) return;
                    toast.error(handleBackendErrors(error));
                })
                .finally(() => {
                    if (seq === requestSeq.current) setIsLoading(false);
                });
        },
        [movieOrderListId, filterStartDate, theaterKeyword, buildParams]
    );

    /** ✅ 2. 검색 버튼 클릭 핸들러 **/
    const onClickSearch = () => {
        if (!hasAnyFilter) {
            toast.warning("영화를 선택하거나 기준일자·극장명을 입력해주세요.");
            return;
        }
        fetchSortedOrderDetail(sortKey, sortOrder, 1);
    };

    /** ✅ 3. 왼쪽에서 영화를 새로 선택/해제했을 때 (극장 검색어는 그대로 유지)
     *  O004(0903): 정렬·페이지·선택 행은 초기화하고 1페이지부터 다시 조회한다. */
    useEffect(() => {
        setSortKey(null);
        setSortOrder("asc");
        setSelectedOrderDetail(null);
        fetchSortedOrderDetail(null, "asc", 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [movieOrderListId, kobisLinked]);

    /** ✅ 4. 페이지 이동 (O003 — 100건 단위) **/
    const handlePageChange = (nextPage: number) => {
        if (nextPage < 1 || nextPage === page) return;
        fetchSortedOrderDetail(sortKey, sortOrder, nextPage);
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

    /** O002(0903): 선택 작품 전체 극장의 종영일을 각 극장 마지막상영일로 일괄 반영 */
    const handleBulkClose = () => {
        if (!movieOrderListId) {
            toast.warning("오더 목록에서 작품을 먼저 선택해주세요.");
            return;
        }
        if (!window.confirm("선택된 작품의 전체 극장 종영일을 각 극장별 [마지막상영일]로 일괄 업데이트하시겠습니까?")) return;
        setIsBulkBusy(true);
        AxiosPost("order/bulk-close", { orderlist_id: movieOrderListId })
            .then((res) => {
                const { updated = 0, skipped = 0 } = res.data || {};
                toast.success(
                    `${updated.toLocaleString()}개 극장의 종영일을 마지막상영일로 반영했습니다.` +
                    (skipped ? ` (마지막상영일 없음 ${skipped.toLocaleString()}개 제외)` : "")
                );
                fetchSortedOrderDetail(sortKey, sortOrder, page);
            })
            .catch((error) => toast.error(handleBackendErrors(error)))
            .finally(() => setIsBulkBusy(false));
    };

    /** O002(0903): 선택 작품 전체 극장의 종영일을 일괄 초기화(NULL) */
    const handleBulkClearEndDate = () => {
        if (!movieOrderListId) {
            toast.warning("오더 목록에서 작품을 먼저 선택해주세요.");
            return;
        }
        if (!window.confirm("선택된 작품의 전체 극장 종영일을 일괄 초기화(삭제)하시겠습니까?")) return;
        setIsBulkBusy(true);
        AxiosPost("order/bulk-clear-end-date", { orderlist_id: movieOrderListId })
            .then((res) => {
                const { updated = 0 } = res.data || {};
                toast.success(`${updated.toLocaleString()}개 극장의 종영일을 초기화했습니다.`);
                fetchSortedOrderDetail(sortKey, sortOrder, page);
            })
            .catch((error) => toast.error(handleBackendErrors(error)))
            .finally(() => setIsBulkBusy(false));
    };

    const handleUpdateCell = (item: any, key: string, value: any) => {
        // ✅ 빈 문자열("")인 경우 null로 변환하여 전송 (날짜 필드 에러 방지)
        const processedValue = value === "" ? null : value;

        // O001: 개봉일 공란 저장 차단 (백엔드에서도 거부한다)
        if (key === "release_date" && !processedValue) {
            toast.error("개봉일은 필수 입력값입니다.");
            return;
        }

        // ✅ 이미 같은 값이면 API 호출 안 함
        // O001(0827): 단, 종영일이 자동 연장돼 빨간 강조가 켜진 행은 값이 같아도
        // 저장을 보내야 강조 플래그가 해제된다 ('종영일로 복사' 체크 버튼 포함)
        if (item[key] === processedValue && !(key === "end_date" && item.end_date_auto_updated)) return;

        AxiosPatch("order", { [key]: processedValue }, item.id)
            .then((res) => {
                setOrderDetail((prev: any[]) =>
                    prev.map((order) =>
                        (order.id === item.id
                            ? {
                                ...order,
                                [key]: processedValue,
                                // O002: 종영일을 직접 저장하면 자동 연장 강조 해제
                                ...(key === "end_date" ? { end_date_auto_updated: false } : {}),
                            }
                            : order)
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
        // 극장명만으로 검색한 결과도 그대로 받을 수 있어야 한다 (O002)
        if (!hasAnyFilter) {
            toast.warning("영화를 선택하거나 기준일자·극장명을 입력해주세요.");
            return;
        }
        setIsExcelLoading(true);
        // 화면 목록과 완전히 같은 조건으로 내려받는다
        const params = buildParams(sortKey, sortOrder);

        AxiosGet(`order-excel-export/?${params.toString()}`, { responseType: "blob" })
            .then((res) => {
                const url = window.URL.createObjectURL(new Blob([res.data]));
                const link = document.createElement("a");
                link.href = url;
                let fileName = `Order_List.xlsx`;
                const contentDisposition = res.headers["content-disposition"];
                if (contentDisposition) {
                    const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
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
    }, [hasAnyFilter, buildParams, sortKey, sortOrder, toast]);

    const headers = [
        { key: "format", label: "포맷" },
        { key: "movie", label: "영화" },
        {
            key: "client",
            label: "극장명",
            // KOBIS 상세내역에 스코어가 넘어오지 않는 극장은 눈에 띄게 표시
            renderCell: (value: any) => (
                <span>
                    {value?.client_name ?? ""}
                    {value && value.kobis_linked === false && (
                        <span style={{ color: "#dc2626", fontWeight: 700, marginLeft: "6px" }}>
                            (KOBIS 미연동 극장)
                        </span>
                    )}
                </span>
            ),
        },
        {
            key: "rate",
            label: "부율",
            // 부율관리에 등록된 영화×극장 부율. 미등록 극장은 빨간색으로 표시하고
            // 백엔드에서 목록 맨 위로 정렬된다 (O001)
            renderCell: (_value: any, item: any) =>
                item.has_rate && item.share_rate != null ? (
                    <span>
                        {Number(item.share_rate) % 1 === 0
                            ? Number(item.share_rate).toFixed(0)
                            : Number(item.share_rate)}
                        %
                    </span>
                ) : (
                    <span style={{ color: "#dc2626", fontWeight: 700 }}>미등록</span>
                ),
        },
        { key: "release_date", label: "개봉일", editable: true },
        {
            key: "end_date",
            label: "종영일",
            editable: true, // 업데이트될 대상
            // O002: 종영일이 마지막 상영일로 자동 연장된 상태는 빨간색 강조.
            // 사용자가 직접 저장(수정 또는 '종영일로 복사')하면 해제된다.
            renderCell: (value: any, item: any) => (
                <span style={item.end_date_auto_updated
                    ? { color: "#dc2626", fontWeight: 700 }
                    : undefined}>
                    {value ?? ""}
                </span>
            ),
        },
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
                                background: '#16a34a', // 초록색 계열
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
            {/* 칩 디자인은 CommonFilterBar가 직계 자식에 주입한다 — styled 래퍼로
                감싸면 주입이 막히므로 인풋을 직접 배치한다 */}
            <CommonFilterBar
                onSearch={onClickSearch}
                actions={
                    <>
                        {/* O002: 작품 전체 극장 일괄 종영 / 종영일 일괄 해제 (오더 목록에서 작품 선택 시 활성) */}
                        <BulkButton
                            $tone="green"
                            disabled={!movieOrderListId || isBulkBusy}
                            onClick={handleBulkClose}
                            title="선택 작품 전체 극장의 종영일을 각 극장 마지막상영일로 반영">
                            <CheckCircleIcon size={14} weight="fill" /> 일괄 종영 처리
                        </BulkButton>
                        <BulkButton
                            $tone="red"
                            disabled={!movieOrderListId || isBulkBusy}
                            onClick={handleBulkClearEndDate}
                            title="선택 작품 전체 극장의 종영일을 비운다">
                            종영일 일괄 해제
                        </BulkButton>
                    </>
                }>
                <CustomInput
                    label="기준일자"
                    inputType="date"
                    value={filterStartDate}
                    setValue={setFilterStartDate}
                />
                <AutocompleteInputClient
                    type="theater"
                    label="극장명"
                    placeholder="극장명 키워드 (예: 씨네큐)"
                    formData={searchClient}
                    setFormData={setSearchClient}
                    inputValue={clientInputValue}
                    setInputValue={setClientInputValue}
                />
                {/* O003: 계열사 다중 선택 — 체크를 풀면 그 계열사는 조회에서 빠진다 */}
                <ChainGroup>
                    <span className="title">계열사</span>
                    {CHAIN_OPTIONS.map((c) => (
                        <CustomCheckbox
                            key={c}
                            label={c}
                            checked={chains[c]}
                            onChange={(v) => setChains((prev) => ({ ...prev, [c]: v }))}
                        />
                    ))}
                </ChainGroup>
            </CommonFilterBar>

            <CommonSectionCard>
                <CommonListHeader
                    title={
                        totalCount > 0
                            ? `오더 상세 내역 (${((page - 1) * PAGE_SIZE + 1).toLocaleString()}~${((page - 1) * PAGE_SIZE + orderDetail.length).toLocaleString()} / ${totalCount.toLocaleString()})`
                            : "오더 상세 내역"
                    }
                    actions={
                        <>
                            {isLoading && (
                                <span style={{ fontSize: 12, color: "#2563eb", fontWeight: 600, marginRight: 4 }}>
                                    불러오는 중…
                                </span>
                            )}
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
                {/* O003(0903): 100건 페이징. 표에 자체 높이를 줘 페이지 안에서 스크롤되게 한다 */}
                <div style={{ height: "65vh", display: "flex", flexDirection: "column", minHeight: 0 }}>
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
                        if (key === "movie") return (movie?.title_ko ?? "").replace(/\s*\([^)]+\)$/, "").trim();
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
                    pageSize={PAGE_SIZE}
                    totalCount={totalCount}
                    onPageChange={handlePageChange}
                />
                </div>
            </CommonSectionCard>
        </>
    );
}
