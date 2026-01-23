import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { GenericTable } from "../../../components/GenericTable";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { Plus, Trash, Square, CheckSquare, Checks, Calendar } from "@phosphor-icons/react";
import { CustomInput } from "../../../components/common/CustomInput";
import dayjs from "dayjs";
import { useToast } from "../../../components/common/CustomToast";
import { AxiosGet } from "../../../axios/Axios";
import { ExcelIconButton } from "../../../components/common/ExcelIconButton";
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

/* 1. 일괄 등록을 위한 별도 컨테이너 */
const BulkActionBar = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 20px;
    background-color: #ffffff;
    border-bottom: 2px solid #64748b;

    .section-label {
        font-size: 13px;
        font-weight: 700;
        color: #475569;
        margin-right: 4px;
    }
`;

const BulkSaveButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #1e293b;
    color: #ffffff;
    border: none;
    border-radius: 6px;
    padding: 0 16px;
    height: 36px;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-left: auto; /* 우측 정렬 */

    &:hover {
        background-color: #0f172a;
    }
    &:disabled {
        background-color: #cbd5e1;
        cursor: not-allowed;
    }
`;

const TableWrapper = styled.div`
    flex: 1;
    overflow: hidden;
`;

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

type Props = {
    rates: any[];
    selectedRate: any;
    handleSelectRate: (rate: any) => void;
    handleAddRate: () => void;
    handleDeleteRates: (ids: number[]) => void;
    /* 3. onBulkUpdate 파라미터 확장 */
    onBulkUpdate: (baseDate: string, seoulRate: string, provinceRate: string) => void;
    sortKey: string | null;
    sortOrder: "asc" | "desc";
    page: number;
    pageSize: number;
    totalCount: number;
    onSortChange: (key: string) => void;
    onPageChange: (page: number) => void;
    activeFilters?: any;
};

export function RateList({
    rates,
    selectedRate,
    handleSelectRate,
    handleAddRate,
    handleDeleteRates,
    onBulkUpdate,
    sortKey,
    sortOrder,
    page,
    pageSize,
    totalCount,
    onSortChange,
    onPageChange,
    activeFilters,
}: Props) {
    // 일괄 등록 상태값
    const toast = useToast();
    const [baseDate, setBaseDate] = useState(""); // 2. 기준일자 상태 추가
    const [seoulValue, setSeoulValue] = useState("");
    const [provinceValue, setProvinceValue] = useState("");
    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownloadExcel = async () => {
        // ✅ 필수 필터 검증: 극장명 또는 영화명 중 하나는 필수
        const hasMovieFilter = !!(
            activeFilters.movie?.movie_code || 
            activeFilters.movie?.id || 
            activeFilters.movie?.title_ko
        );
        const hasClientFilter = !!(
            activeFilters.client?.client_code || 
            activeFilters.client?.id
        );

        if (!hasMovieFilter && !hasClientFilter) {
            toast.warning("엑셀 다운로드를 위해서는 극장명 또는 영화명 중 하나는 필수로 입력해야 합니다.");
            return;
        }

        setIsDownloading(true);
        try {
            // ✅ 현재 검색 조건을 모두 쿼리 파라미터로 전달 (페이지네이션 제외)
            const params = new URLSearchParams();
            
            // 영화 필터
            if (activeFilters.movie?.movie_code) {
                params.append("movie_code", activeFilters.movie.movie_code);
            }
            if (activeFilters.movie?.id) {
                params.append("movie_id", String(activeFilters.movie.id));
            }
            if (activeFilters.movie?.title_ko) {
                params.append("movie_title", activeFilters.movie.title_ko);
            }
            
            // 극장 필터
            if (activeFilters.client?.client_code) {
                params.append("client_code", activeFilters.client.client_code);
            }
            if (activeFilters.client?.id) {
                params.append("client_id", String(activeFilters.client.id));
            }
            
            // 추가 필터
            if (activeFilters.clientType && activeFilters.clientType !== "전체") {
                params.append("client_type", activeFilters.clientType);
            }
            if (activeFilters.theater_kind && activeFilters.theater_kind !== "전체") {
                params.append("theater_kind", activeFilters.theater_kind);
            }
            if (activeFilters.classification && activeFilters.classification !== "전체") {
                params.append("classification", activeFilters.classification);
            }
            
            // 검색어 (search 파라미터)
            // ordering은 필요시 추가 가능
            
            const res = await AxiosGet(`rate-excel-export/?${params.toString()}`, {
                responseType: "blob",
            });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement("a");
            link.href = url;

            const movieTitle = activeFilters.movie?.title_ko || "부율";
            link.setAttribute("download", `전체부율_${movieTitle}_${dayjs().format("YYYYMMDD")}.xlsx`);

            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success("전체 극장 부율 엑셀 다운로드가 완료되었습니다.");
        } catch (e) {
            toast.error("엑셀 생성 중 오류가 발생했습니다.");
        } finally {
            setIsDownloading(false);
        }
    };
    const headers = [
        { key: "client_code", label: "극장 코드" },
        { key: "client_name", label: "극장명" },
        {
            key: "movie",
            label: "영화명",
            renderCell: (value: any, row: any) => row.movie?.title_ko,
        },
        { key: "classification", label: "구분" },
        { key: "start_date", label: "시작일자" },
        { key: "end_date", label: "종료일자" },
        { key: "region_code", label: "지역" },
        { key: "share_rate", label: "부율" },
        { key: "updated_date", label: "처리일시" },
    ];

    return (
        <ListContainer>
            {/* 상단 헤더: 타이틀 및 기본 액션 */}
            <CommonListHeader
                title="극장 부율 관리"
                actions={
                    <>
                        <CustomIconButton color="blue" onClick={handleAddRate} title="부율 추가">
                            <Plus weight="bold" />
                        </CustomIconButton>
                        <ExcelIconButton
                            onClick={handleDownloadExcel}
                            isLoading={isDownloading}
                            title="현재 영화 부율 엑셀 다운로드"
                        />
                    </>
                }
            />

            {/* 일괄 등록 섹션 (따로 분리) */}
            <BulkActionBar>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="section-label">기준일자</span>
                    <CustomInput style={{ width: "150px" }} inputType="date" value={baseDate} setValue={setBaseDate} />
                </div>

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginLeft: "20px",
                    }}>
                    <span className="section-label">서울 부율</span>
                    <CustomInput
                        style={{ width: "80px" }}
                        inputType="number"
                        placeholder="0"
                        value={seoulValue}
                        setValue={setSeoulValue}
                    />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="section-label">지방 부율</span>
                    <CustomInput
                        style={{ width: "80px" }}
                        inputType="number"
                        placeholder="0"
                        value={provinceValue}
                        setValue={setProvinceValue}
                    />
                </div>

                <BulkSaveButton
                    onClick={() => onBulkUpdate(baseDate, seoulValue, provinceValue)}
                    disabled={!baseDate || (!seoulValue && !provinceValue)}>
                    <Checks weight="bold" size={18} />
                    일괄 수정 적용
                </BulkSaveButton>
            </BulkActionBar>

            <TableWrapper>
                <GenericTable
                    headers={headers}
                    data={rates}
                    selectedItem={selectedRate}
                    onSelectItem={handleSelectRate}
                    getRowKey={(rate: any) => rate.id}
                    formatCell={(key: string, value: any, row: any) => {
                        const client = row.client;
                        if (key === "client_code") return client?.client_code ?? "-";
                        if (key === "client_name") return client?.client_name ?? "-";
                        if (key === "classification") return client?.classification ?? "-";
                        if (key === "region_code") return client?.region_code ?? "-";
                        if (key === "share_rate") return value !== null ? `${value}%` : "0%";
                        if (key === "updated_date" && value) {
                            return new Date(value).toLocaleString("ko-KR", {
                                year: "2-digit",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                            });
                        }
                        return value ?? "";
                    }}
                    sortKey={sortKey}
                    sortOrder={sortOrder}
                    onSortChange={onSortChange}
                    page={page}
                    pageSize={pageSize}
                    totalCount={totalCount}
                    onPageChange={onPageChange}
                />
            </TableWrapper>
        </ListContainer>
    );
}
