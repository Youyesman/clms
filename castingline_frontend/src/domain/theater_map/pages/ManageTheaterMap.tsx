import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { AxiosGet } from "../../../axios/Axios";
import { GenericTable } from "../../../components/GenericTable";
import { CustomSelect } from "../../../components/common/CustomSelect";
import { TheaterMapHistory } from "../components/TheaterMapHistory";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { Plus, MagnifyingGlass } from "@phosphor-icons/react"; // ✅ MagnifyingGlass 추가
import { TheaterMapAddModal } from "../components/TheaterMapAddModal";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { AutocompleteInputClient } from "../../../components/common/AutocompleteInputClient";
import { MANAGEMENT_TYPES, OPERATIONAL_STATUS_OPTIONS, THEATER_KINDS } from "../../../constant/Constants";
import { useToast } from "../../../components/common/CustomToast";
import dayjs from "dayjs";
import { ExcelIconButton } from "../../../components/common/ExcelIconButton";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background-color: #f8fafc;
    min-height: 100vh;
`;


const MainGrid = styled.div`
    display: flex;
    gap: 20px;
    flex: 1;
`;

/** 스타일 정의 **/



export function ManageTheaterMap() {
    const toast = useToast();
    const { openModal } = useGlobalModal();
    const [loading, setLoading] = useState(false);
    const [distributors, setDistributors] = useState<any[]>([]);

    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const pageSize = 20;

    const [selectedDistId, setSelectedDistId] = useState<number | null>(null);
    const [selectedDistName, setSelectedDistName] = useState<string>("");

    const [filters, setFilters] = useState<any>({
        theater: null,
        status: "전체",
        classification: "전체",
        theater_kind: "전체",
    });
    const [theaterSearchInput, setTheaterSearchInput] = useState("");

    const [currentMaps, setCurrentMaps] = useState<any[]>([]);
    const [selectedPair, setSelectedPair] = useState<any>(null);

    // 배급사 목록 초기 로드
    useEffect(() => {
        const fetchDistributors = async () => {
            try {
                const res = await AxiosGet("theater-map-distributors/");
                const data = Array.isArray(res.data) ? res.data : res.data.results;
                setDistributors(
                    data.map((d: any) => ({
                        label: d.client_name,
                        value: String(d.id),
                        name: d.client_name,
                        id: d.id,
                    })),
                );
            } catch (error) {
                console.error(error);
            }
        };
        fetchDistributors();
    }, []);

    // 데이터 가져오기 본체
    const fetchTheaterMaps = async (p: number) => {
        if (!selectedDistId) {
            return;
        }
        setLoading(true);
        try {
            const ordering = sortKey ? (sortOrder === "desc" ? `-${sortKey}` : sortKey) : "";
            const params = new URLSearchParams({
                distributor: String(selectedDistId),
                latest: "true",
                page: String(p),
                page_size: String(pageSize),
            });

            if (filters.theater?.id) params.append("theater", filters.theater.id);
            if (filters.status !== "전체") params.append("operational_status", filters.status);
            if (filters.classification !== "전체") params.append("classification", filters.classification);
            if (filters.theater_kind !== "전체") params.append("theater_kind", filters.theater_kind);
            if (ordering) params.append("ordering", ordering);

            const res = await AxiosGet(`theater-maps/?${params.toString()}`);
            setCurrentMaps(res.data.results || []);
            setTotalCount(res.data.count || 0);
        } catch (error) {
            console.error(error);
            toast.error("조회 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    // ✅ 검색 버튼 핸들러
    const handleSearch = () => {
        if (!selectedDistId) {
            toast.warning("대상 배급사를 선택해주세요.");
            return;
        }
        setPage(1);
        setSelectedPair(null);
        fetchTheaterMaps(1);
    };

    // ✅ 정렬이나 페이지 변경 시에만 자동 조회가 발생하도록 설정 (필터 변경 시엔 발생 X)
    useEffect(() => {
        if (selectedDistId) fetchTheaterMaps(page);
    }, [page, sortKey, sortOrder]);

    const handleSortChange = (key: string) => {
        let newOrder: "asc" | "desc" = "asc";
        if (sortKey === key) newOrder = sortOrder === "asc" ? "desc" : "asc";
        setSortKey(key);
        setSortOrder(newOrder);
        setPage(1);
    };

    const headers = [
        { key: "theater__client_code", label: "극장코드", renderCell: (_, row) => row.theater_details.client_code },
        {
            key: "theater__client_name",
            label: "시스템상 극장명",
            renderCell: (_, row) => row.theater_details.client_name,
        },
        {
            key: "distributor_theater_name",
            label: "배급사측 지정명(현재)",
            renderCell: (v) => <b style={{ color: "#2563eb" }}>{v}</b>,
        },
        { key: "apply_date", label: "최종 적용일" },
    ];
    const [isDownloading, setIsDownloading] = useState(false); // ✅ 다운로드 상태 추가

    // ✅ 엑셀 다운로드 핸들러
    const handleDownloadExcel = async () => {
        // 배급사 선택 여부 체크 (필수)
        if (!selectedDistId) {
            toast.warning("대상 배급사를 선택해주세요.");
            return;
        }

        setIsDownloading(true);
        try {
            // 현재 적용된 모든 필터를 파라미터로 전달
            const params = new URLSearchParams();
            if (selectedDistId) params.append("distributor", String(selectedDistId));
            if (filters.theater?.id) params.append("theater", filters.theater.id);
            if (filters.status !== "전체") params.append("operational_status", filters.status);
            if (filters.classification !== "전체") params.append("classification", filters.classification);
            if (filters.theater_kind !== "전체") params.append("theater_kind", filters.theater_kind);

            const res = await AxiosGet(`theater-maps-excel-export/?${params.toString()}`, {
                responseType: "blob",
            });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement("a");
            link.href = url;

            const distName = selectedDistName ? `_${selectedDistName}` : "";
            link.setAttribute("download", `극장명매핑현황${distName}_${dayjs().format("YYYYMMDD")}.xlsx`);

            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success("엑셀 다운로드가 완료되었습니다.");
        } catch (e) {
            toast.error("엑셀 다운로드 중 오류가 발생했습니다.");
        } finally {
            setIsDownloading(false);
        }
    };
    return (
        <PageContainer>
            <CommonFilterBar
                onSearch={handleSearch}
                actions={
                    <ExcelIconButton
                        onClick={handleDownloadExcel}
                        isLoading={isDownloading}
                        title="매핑 현황 엑셀 다운로드"
                    />
                }
            >
                <CustomSelect
                    style={{ width: "250px" }}
                    label="대상 배급사"
                    value={selectedDistId ? String(selectedDistId) : ""}
                    options={distributors}
                    onChange={(val) => {
                        const target = distributors.find((d: any) => d.value === val);
                        setSelectedDistId(target ? Number(target.id) : null);
                        setSelectedDistName(target?.name || "");
                    }}
                    placeholder="배급사 선택"
                />

                <AutocompleteInputClient
                    label="극장명 검색"
                    type="theater"
                    placeholder="극장명/코드 검색"
                    formData={filters}
                    setFormData={setFilters}
                    inputValue={theaterSearchInput}
                    setInputValue={setTheaterSearchInput}
                />

                <CustomSelect
                    label="상태"
                    value={filters.status}
                    options={["전체", ...OPERATIONAL_STATUS_OPTIONS]}
                    onChange={(v) => setFilters((prev: any) => ({ ...prev, status: v }))}
                />

                <CustomSelect
                    label="구분"
                    value={filters.classification}
                    options={["전체", ...MANAGEMENT_TYPES]}
                    onChange={(v) => setFilters((prev: any) => ({ ...prev, classification: v }))}
                />

                <CustomSelect
                    label="멀티"
                    value={filters.theater_kind}
                    options={["전체", ...THEATER_KINDS]}
                    onChange={(v) => setFilters((prev: any) => ({ ...prev, theater_kind: v }))}
                />
            </CommonFilterBar>

            <MainGrid>
                <CommonSectionCard flex={1.2}>
                    <CommonListHeader
                        title="극장명 매핑 현황"
                        subtitle={`(${totalCount})`}
                        actions={
                            <CustomIconButton
                                disabled={!selectedDistId}
                                onClick={() => {
                                    openModal(
                                        <TheaterMapAddModal
                                            distributorId={selectedDistId!}
                                            distributorName={selectedDistName}
                                            onSuccess={() => fetchTheaterMaps(1)}
                                        />,
                                        { title: "신규 배급사별 극장명 등록" },
                                    );
                                }}>
                                <Plus size={16} weight="bold" />
                            </CustomIconButton>
                        }
                    />
                    <GenericTable
                        headers={headers}
                        data={currentMaps}
                        loading={loading}
                        selectedItem={selectedPair}
                        onSelectItem={setSelectedPair}
                        getRowKey={(row) => row.id}
                        page={page}
                        totalCount={totalCount}
                        pageSize={pageSize}
                        onPageChange={setPage}
                        sortKey={sortKey}
                        sortOrder={sortOrder}
                        onSortChange={handleSortChange}
                    />
                </CommonSectionCard>
                <CommonSectionCard flex={0.8}>
                    <TheaterMapHistory selectedPair={selectedPair} onCompleted={() => fetchTheaterMaps(page)} />
                </CommonSectionCard>
            </MainGrid>
        </PageContainer>
    );
}
