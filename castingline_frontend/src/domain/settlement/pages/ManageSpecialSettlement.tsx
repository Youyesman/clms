import React, { useState, useMemo, useCallback } from "react";
import styled, { keyframes } from "styled-components";
import { MagnifyingGlass, CircleNotch } from "@phosphor-icons/react";
import { GenericTable } from "../../../components/GenericTable";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { AxiosGet } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import dayjs from "dayjs";
import { AutocompleteInputMovie } from "../../../components/common/AutocompleteInputMovie";
import { AutocompleteInputClient } from "../../../components/common/AutocompleteInputClient";
// ✅ 이전에 만든 엑셀 아이콘 버튼 임포트
import { ExcelIconButton } from "../../../components/common/ExcelIconButton";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";

/* ---------------- Styled Components ---------------- */
const rotate = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background-color: #f8fafc;
    min-height: 100vh;
`;


/** 스타일 정의 **/

const LoadingOverlay = styled.div`
    position: absolute;
    top: 48px; /* TableHeader height approximately */
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(255, 255, 255, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
`;

const Spinner = styled(CircleNotch)`
    animation: ${rotate} 1s linear infinite;
    color: #2563eb;
`;


const ValueText = styled.span<{ $hasValue: boolean }>`
    color: ${({ $hasValue }) => ($hasValue ? "#2563eb" : "#cbd5e1")};
    font-weight: ${({ $hasValue }) => ($hasValue ? "800" : "400")};
`;

/* ---------------- Main Component ---------------- */
export function ManageSpecialSettlement() {
    const toast = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false); // ✅ 엑셀 로딩 상태 추가
    const [clientInput, setClientInput] = useState("");
    const [movieInput, setMovieInput] = useState("");

    const [searchParams, setSearchParams] = useState({
        start_date: dayjs().startOf("month").format("YYYY-MM-DD"),
        end_date: dayjs().format("YYYY-MM-DD"),
        movie: {} as any,
        client: {} as any,
    });

    const [settlementData, setSettlementData] = useState<any[]>([]);
    const [activeDates, setActiveDates] = useState<string[]>([]);

    // 1. 테이블 헤더 구성
    const headers = useMemo(() => {
        const baseHeaders = [
            { key: "client_name", label: "극장명", stickyLeft: "0px", width: "120px" },
            { key: "fare", label: "요금", stickyLeft: "120px", width: "80px" },
        ];

        const dynamicHeaders = activeDates.map((date) => ({
            key: date,
            label: dayjs(date).format("MM-DD"),
            renderCell: (val: any) => <ValueText $hasValue={Number(val) > 0}>{Number(val).toLocaleString()}</ValueText>,
        }));

        const totalHeaders = [
            { key: "row_visitor_sum", label: "관객합계", cellStyle: { backgroundColor: "#fff7ed", fontWeight: "bold", color: "#c2410c" } },
            { key: "row_amount_sum", label: "매출합계", cellStyle: { backgroundColor: "#fff7ed", fontWeight: "bold", color: "#c2410c" } },
        ];

        return [...baseHeaders, ...dynamicHeaders, ...totalHeaders];
    }, [activeDates]);

    // 2. 데이터 조회
    const handleSearch = useCallback(async () => {
        if (!searchParams.movie?.id) {
            toast.error("영화를 선택해주세요.");
            return;
        }

        setIsLoading(true);
        try {
            const res = await AxiosGet("special-settlement/", {
                params: {
                    start_date: searchParams.start_date,
                    end_date: searchParams.end_date,
                    movie_id: searchParams.movie.id,
                    client_id: searchParams.client?.id || "",
                },
            });

            const datesWithData = Array.from(new Set(res.data.map((item: any) => item.entry_date))).sort() as string[];
            setActiveDates(datesWithData);

            const grouped: Record<string, any> = {};

            res.data.forEach((item: any) => {
                const key = `${item.client_name}_${item.fare}`;
                if (!grouped[key]) {
                    grouped[key] = {
                        client_name: item.client_name,
                        fare: Number(item.fare),
                        row_visitor_sum: 0,
                        row_amount_sum: 0,
                    };
                    datesWithData.forEach((d) => (grouped[key][d] = 0));
                }

                const visitor = Number(item.visitor || 0);

                // ⭐️ [수정 핵심] = 이 아니라 += 로 바꿔야 누적됩니다.
                grouped[key][item.entry_date] += visitor;

                // 행 합계 및 매출 합계 누적 (이 부분은 기존에도 += 였을 겁니다)
                grouped[key].row_visitor_sum += visitor;
                grouped[key].row_amount_sum += visitor * Number(item.fare);
            });

            setSettlementData(Object.values(grouped));
        } catch (e: any) {
            toast.error(handleBackendErrors(e));
        } finally {
            setIsLoading(false);
        }
    }, [searchParams, toast]);

    // ✅ 3. 백엔드 연동 엑셀 다운로드 로직
    const handleDownloadExcel = useCallback(async () => {
        if (!searchParams.movie?.id) {
            toast.error("영화를 선택해주세요.");
            return;
        }

        setIsDownloading(true);
        try {
            const res = await AxiosGet("special-settlement/excel/", {
                params: {
                    start_date: searchParams.start_date,
                    end_date: searchParams.end_date,
                    movie_id: searchParams.movie.id,
                    client_id: searchParams.client?.id || "",
                },
                responseType: "blob", // 📍 파일 다운로드를 위한 설정 필수
            });

            // Blob 데이터를 파일로 변환하여 다운로드 트리거
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement("a");
            link.href = url;

            // 파일명 설정 (영화제목_날짜.xlsx)
            const fileName = `지정부금집계_${searchParams.movie.title_ko || "내역"}_${dayjs().format("YYYYMMDD")}.xlsx`;
            link.setAttribute("download", fileName);

            document.body.appendChild(link);
            link.click();

            // 정리
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success("엑셀 다운로드가 완료되었습니다.");
        } catch (e: any) {
            toast.error("엑셀 파일 생성 중 오류가 발생했습니다.");
        } finally {
            setIsDownloading(false);
        }
    }, [searchParams, toast]);

    // 4. 합계 계산
    const summaryData = useMemo(() => {
        const summary: any = { client_name: "합계", fare: "" };
        let totalVisitor = 0;
        let totalAmount = 0;

        activeDates.forEach((date) => {
            const daySum = settlementData.reduce((acc, cur) => acc + (cur[date] || 0), 0);
            summary[date] = daySum;
        });

        settlementData.forEach((row) => {
            totalVisitor += row.row_visitor_sum;
            totalAmount += row.row_amount_sum;
        });

        summary.row_visitor_sum = totalVisitor;
        summary.row_amount_sum = totalAmount;

        return summary;
    }, [settlementData, activeDates]);

    return (
        <PageContainer>
            <CommonFilterBar onSearch={handleSearch}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <CustomInput
                        label="조회기간"
                        inputType="date"
                        value={searchParams.start_date}
                        setValue={(v) => setSearchParams((p: any) => ({ ...p, start_date: v }))}
                        labelWidth="60px"
                    />
                    <span style={{ color: "#94a3b8" }}>~</span>
                    <CustomInput
                        inputType="date"
                        value={searchParams.end_date}
                        setValue={(v) => setSearchParams((p: any) => ({ ...p, end_date: v }))}
                    />
                </div>
                <div style={{ width: "260px" }}>
                    <AutocompleteInputMovie
                        label="영화"
                        formData={searchParams}
                        setFormData={setSearchParams}
                        inputValue={movieInput}
                        setInputValue={setMovieInput}
                        placeholder="영화 검색"
                        labelWidth="50px"
                        isPrimaryOnly={true}
                    />
                </div>
                <div style={{ width: "260px" }}>
                    <AutocompleteInputClient
                        type="client"
                        label="극장"
                        formData={searchParams}
                        setFormData={setSearchParams}
                        inputValue={clientInput}
                        setInputValue={setClientInput}
                        placeholder="전체 극장"
                        labelWidth="50px"
                    />
                </div>
            </CommonFilterBar>

            <CommonSectionCard flex={1} height="calc(100vh - 180px)" style={{ position: 'relative' }}>
                <CommonListHeader
                    title="지정 부금 집계 내역"
                    actions={
                        <ExcelIconButton
                            onClick={handleDownloadExcel}
                            isLoading={isDownloading}
                            title="엑셀 다운로드"
                        />
                    }
                />
                {isLoading && (
                    <LoadingOverlay>
                        <Spinner size={40} weight="bold" />
                    </LoadingOverlay>
                )}
                <GenericTable
                    headers={headers}
                    data={settlementData}
                    getRowKey={(item: any, idx: number) => `${item.client_name}-${item.fare}-${idx}`}
                    formatCell={(key: string, value: any) => {
                        if (typeof value === "number") {
                            return value.toLocaleString();
                        }
                        return value || "-";
                    }}
                    summaryData={summaryData}
                    page={1}
                    pageSize={1000}
                    totalCount={settlementData.length}
                    onPageChange={() => {}}
                />
            </CommonSectionCard>
        </PageContainer>
    );
}
