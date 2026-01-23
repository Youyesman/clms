import React, { useEffect, useState, useCallback } from "react";
import styled from "styled-components";
import { AxiosDelete, AxiosGet, AxiosPatch, AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";

// 도메인 컴포넌트
import { RateFilter } from "../components/RateFilter";
import { RateList } from "../components/RateList";
import { RateByClientMovieList } from "../components/RateByClientList";
import { TheaterRateByClientMovieList } from "../components/TheaterRateByClientMovieList";
import { OrderRateStatusList } from "../components/OrderRateStatusList";

/** 1. 스타일 정의 **/
const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background-color: #f8fafc;
    min-height: 100vh;
    font-family: "SUIT", sans-serif;
`;
const ContentSection = styled.div`
    flex: 1;
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 16px;
    min-width: 0;
    /* 높이를 유동적으로 조절하거나 고정 */
    height: calc(100vh - 200px);
`;

const DetailSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
    overflow-y: auto; /* 내용이 많아지면 스크롤 */
    min-width: 0;
`;
/** 2. 메인 컴포넌트 **/
export function ManageRate() {
    const toast = useToast();

    // 데이터 상태
    const [rates, setRates] = useState<any[]>([]);
    const [selectedRate, setSelectedRate] = useState<any>(null);
    const [totalCount, setTotalCount] = useState(0);

    // 필터 및 페이징 상태
    const [filterData, setFilterData] = useState<any>({
        movie: null,
        client: null,
        clientType: "전체",
        theater_kind: "전체",
        classification: "전체",
    });

    const [activeFilters, setActiveFilters] = useState<any>({}); // 검색 버튼 클릭 시 반영
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [page, setPage] = useState(1);
    const pageSize = 20;
    const [innerSelectedRate, setInnerSelectedRate] = useState<any>(null);
    /** ✅ 검색 핸들러 (버튼 클릭 시 호출) **/
    const handleSearch = () => {
        setPage(1); // 검색 시 페이지 초기화
        setActiveFilters({ ...filterData });
    };

    /** ✅ 데이터 요청 로직 (필터, 정렬, 페이지 변경 시 자동 호출) **/
    const fetchRates = useCallback(() => {
        // 0. 필수 검색 조건 체크: 영화명이나 극장명이 없으면 조회를 수행하지 않음
        const hasMovie = !!activeFilters.movie?.movie_code;
        const hasClient = !!activeFilters.client?.client_code;

        if (!hasMovie && !hasClient) {
            setRates([]);
            setTotalCount(0);
            return; // 함수 종료
        }

        const params = new URLSearchParams();

        // 1. 활성화된 필터 적용
        if (activeFilters.movie?.movie_code) params.append("movie_code", activeFilters.movie.movie_code);
        if (activeFilters.client?.client_code) params.append("client_code", activeFilters.client.client_code);
        if (activeFilters.clientType && activeFilters.clientType !== "전체")
            params.append("client_type", activeFilters.clientType);
        if (activeFilters.theater_kind && activeFilters.theater_kind !== "전체")
            params.append("theater_kind", activeFilters.theater_kind);
        if (activeFilters.classification && activeFilters.classification !== "전체")
            params.append("classification", activeFilters.classification);

        // 2. 정렬 적용
        if (sortKey) {
            params.append("ordering", sortOrder === "desc" ? `-${sortKey}` : sortKey);
        }

        // 3. 페이징 적용
        params.append("page", String(page));
        params.append("page_size", String(pageSize));

        AxiosGet(`rates/?${params.toString()}`)
            .then((res) => {
                setRates(res.data.results);
                setTotalCount(res.data.count);
            })
            .catch((error) => {
                const msg = handleBackendErrors(error);
                toast.error(msg || "부율 목록을 불러오지 못했습니다.");
                setRates([]);
            })
            .finally(() => {
                // setLoading(false);
            });
    }, [activeFilters, sortKey, sortOrder, page]);

    useEffect(() => {
        fetchRates();
    }, [fetchRates]);

    // 부율 선택 시
    const handleSelectRate = (rate: any) => {
        setSelectedRate(rate);
        // ⭐ 핵심: 다른 극장을 선택하면 하단 상영관 부율이 보이지 않도록 이력 선택 상태를 초기화합니다.
        setInnerSelectedRate(null);
    };

    // 정렬 변경 시
    const handleSortChange = (key: string) => {
        let newOrder: "asc" | "desc" = sortKey === key && sortOrder === "asc" ? "desc" : "asc";
        setSortKey(key);
        setSortOrder(newOrder);
        setPage(1);
    };

    // 부율 추가
    const handleAddRate = () => {
        // 필터에서 선택된 극장과 영화의 ID 추출
        const clientId = activeFilters.client?.id;
        const movieId = activeFilters.movie?.id;

        if (!clientId || !movieId) {
            toast.warning("현재 검색 조건에 극장과 영화가 모두 선택되어 있어야 합니다.");
            return;
        }

        const payload = {
            client: clientId, // Serializer에서 PrimaryKeyRelatedField로 ID를 받음
            movie: movieId,
            start_date: new Date().toISOString().split("T")[0], // 오늘 날짜 기본값
            share_rate: "0",
        };

        AxiosPost("rates", payload)
            .then((res) => {
                fetchRates(); // 리스트 갱신
                setSelectedRate(res.data);
                toast.success("새 부율 설정이 추가되었습니다.");
            })
            .catch((error) => {
                toast.error(handleBackendErrors(error));
            });
    };
    const handleDeleteRates = (ids: number[]) => {
        if (ids.length === 0) return;

        if (!window.confirm(`정말로 선택한 ${ids.length}개의 항목을 삭제하시겠습니까?`)) return;

        // 백엔드에 추가한 bulk_delete 액션 호출
        AxiosPost("rates/bulk_delete", { ids })
            .then(() => {
                fetchRates(); // 메인 리스트 새로고침

                // 만약 현재 우측에 상세 정보가 열려있는 항목이 삭제 목록에 포함되었다면 닫기
                if (selectedRate && ids.includes(selectedRate.id)) {
                    setSelectedRate(null);
                }

                toast.success("선택한 항목이 삭제되었습니다.");
            })
            .catch((error) => {
                console.error(error);
                toast.error("삭제 중 오류가 발생했습니다.");
            });
    };
    const handleBulkUpdate = async (baseDate: string, seoulRate: string, provinceRate: string) => {
        // 1. 유효성 검사
        if (!baseDate) {
            toast.warning("기준일자를 선택해주세요.");
            return;
        }
        if (!seoulRate && !provinceRate) {
            toast.warning("수정할 부율을 최소 하나 이상 입력해주세요.");
            return;
        }

        if (
            !window.confirm(
                `${baseDate} 기점으로 부율을 일괄 변경하시겠습니까?\n기존 데이터의 기간이 조정되고 새로운 데이터가 생성됩니다.`,
            )
        )
            return;

        try {
            const filterParams = {
                movie_code: activeFilters.movie?.movie_code,
                client_code: activeFilters.client?.client_code,
                client_type: activeFilters.clientType !== "전체" ? activeFilters.clientType : null,
                theater_kind: activeFilters.theater_kind !== "전체" ? activeFilters.theater_kind : null,
                classification: activeFilters.classification !== "전체" ? activeFilters.classification : null,
            };

            await AxiosPost("rates/bulk_region_update", {
                filter_params: filterParams,
                base_date: baseDate, // 추가된 기준일자
                seoul_rate: seoulRate,
                province_rate: provinceRate,
            });

            toast.success("부율 타임라인 일괄 업데이트가 완료되었습니다.");
            fetchRates();
        } catch (error: any) {
            toast.error(handleBackendErrors(error) || "일괄 등록 중 오류가 발생했습니다.");
        }
    };
    return (
        <PageContainer>
            {/* 상단 필터 영역 (RateFilter 내부에서 CustomInput, CustomSelect 등을 쓰도록 유도) */}
            <RateFilter formData={filterData} setFormData={setFilterData} handleSearch={handleSearch} />

            {/* 하단 목록 영역 */}
            <ContentSection>
                {/* 1. 전체 부율 목록 (Master) */}
                <RateList
                    rates={rates}
                    selectedRate={selectedRate}
                    handleSelectRate={handleSelectRate}
                    handleAddRate={handleAddRate}
                    handleDeleteRates={handleDeleteRates}
                    onBulkUpdate={handleBulkUpdate}
                    sortKey={sortKey}
                    sortOrder={sortOrder}
                    page={page}
                    pageSize={pageSize}
                    totalCount={totalCount}
                    onSortChange={handleSortChange}
                    onPageChange={(newPage: number) => setPage(newPage)}
                    activeFilters={activeFilters}
                />

                <DetailSection>
                    {/* 2. 상단: 공통 부율 이력 (flex 비율 조정) */}
                    <div style={{ flex: "1 1 300px" }}>
                        <RateByClientMovieList
                            selectedRate={selectedRate}
                            innerSelectedRate={innerSelectedRate}
                            setInnerSelectedRate={setInnerSelectedRate}
                            handleDeleteRates={handleDeleteRates}
                            onRefreshMaster={fetchRates}
                        />
                    </div>

                    {/* 3. 중간: 상영관별 개별 부율 */}
                    <div style={{ flex: "1 1 250px" }}>
                        <TheaterRateByClientMovieList selectedInnerRate={innerSelectedRate} />
                    </div>

                    {/* 4. 하단: 오더 기준 부율 현황 (신규 추가) */}
                    <div style={{ flex: "1 1 250px" }}>
                        <OrderRateStatusList activeFilters={activeFilters} onRefreshMaster={fetchRates} />
                    </div>
                </DetailSection>
            </ContentSection>
        </PageContainer>
    );
}
