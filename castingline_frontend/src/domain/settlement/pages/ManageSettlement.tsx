import React, { useState, useMemo, useCallback, useEffect } from "react";
import styled, { keyframes } from "styled-components";
import { MagnifyingGlass, DownloadSimple, CircleNotch } from "@phosphor-icons/react";
import { AxiosGet } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomSelect } from "../../../components/common/CustomSelect";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { GenericTable } from "../../../components/GenericTable";
import { ExcelIconButton } from "../../../components/common/ExcelIconButton";
import dayjs from "dayjs";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";
import { CommonListHeader } from "../../../components/common/CommonListHeader";

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
    font-family: "SUIT", sans-serif;
`;


const ListSection = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    box-shadow: 
        0 4px 6px -1px rgba(0, 0, 0, 0.1), 
        0 2px 4px -1px rgba(0, 0, 0, 0.06);
    overflow: hidden;
    height: calc(100vh - 160px);
    position: relative;
`;

const LoadingOverlay = styled.div`
    position: absolute;
    top: 48px; /* ListHeader height */
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
// ... (omitting ListHeader unchanged)

const EseroButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    height: 32px;
    background-color: #0369a1;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.2s;
    &:hover {
        background-color: #0c4a6e;
    }
    &:disabled {
        background-color: #94a3b8;
        cursor: not-allowed;
    }
    .loading-icon {
        animation: ${rotate} 1s linear infinite;
    }
`;

export function ManageSettlement() {
    const toast = useToast();
    const [settlements, setSettlements] = useState<any[]>([]);
    const [movieOptions, setMovieOptions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [movieLoading, setMovieLoading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isEseroDownloading, setIsEseroDownloading] = useState(false);
    const [searchParams, setSearchParams] = useState({
        yyyyMm: dayjs().subtract(1, "month").format("YYYY-MM"),
        movieId: "",
        target: "전체극장",
    });

    // 1. 년월 변경 시 영화 목록 자동 호출
    const fetchMoviesByMonth = useCallback(async () => {
        setMovieLoading(true);
        try {
            const res = await AxiosGet(`settlement-movies/?yyyyMm=${searchParams.yyyyMm}`);
            setMovieOptions(res.data);
            // 영화 목록이 바뀌면 선택값과 결과 리스트 모두 초기화 (잔상 방지)
            setSearchParams((prev) => ({ ...prev, movieId: "" }));
            setSettlements([]);
        } catch (error: any) {
            setMovieOptions([]);
            setSettlements([]);
        } finally {
            setMovieLoading(false);
        }
    }, [searchParams.yyyyMm]);

    useEffect(() => {
        fetchMoviesByMonth();
    }, [fetchMoviesByMonth]);

    // 2. 최종 정산 조회
    const fetchSettlements = useCallback(async () => {
        if (!searchParams.movieId) {
            toast.error("조회할 영화를 선택해주세요.");
            return;
        }

        setSettlements([]); // 새 조회 시 이전 데이터 즉시 초기화
        setIsLoading(true);

        try {
            // searchParams.target 값이 "전체극장", "일반극장", "기금면제극장"으로 서버에 전달됨
            const res = await AxiosGet(
                `settlements/?yyyyMm=${searchParams.yyyyMm}&movie_id=${searchParams.movieId}&target=${searchParams.target}`,
            );
            setSettlements(res.data);
        } catch (error: any) {
            toast.error(handleBackendErrors(error));
        } finally {
            setIsLoading(false);
        }
    }, [searchParams, toast]);

    const handleDownloadEsero = async () => {
        if (!searchParams.movieId) {
            toast.error("조회할 영화를 먼저 선택해주세요.");
            return;
        }

        setIsEseroDownloading(true);
        try {
            const res = await AxiosGet("settlement-esero-export/", {
                params: {
                    yyyyMm: searchParams.yyyyMm,
                    movie_id: searchParams.movieId,
                    target: searchParams.target,
                },
                responseType: "blob",
            });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement("a");
            link.href = url;

            const movieTitle = movieOptions.find((m) => m.id === searchParams.movieId)?.title || "이세로";
            link.setAttribute("download", `이세로업로드_${movieTitle}_${searchParams.yyyyMm}.xlsx`);

            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success("이세로 엑셀 다운로드가 완료되었습니다.");
        } catch (e) {
            toast.error("엑셀 생성 중 오류가 발생했습니다.");
        } finally {
            setIsEseroDownloading(false);
        }
    };

    const headers = [
        { key: "지역", label: "지역" },
        { key: "멀티구분", label: "멀티구분" },
        { key: "classification", label: "구분" },
        { key: "거래처코드(바이포엠만 해당)", label: "거래처코드(바이포엠만 해당)" },
        { key: "극장명", label: "극장명" },
        { key: "사업자 등록번호", label: "사업자 등록번호" },
        { key: "종사업장번호", label: "종사업장번호" },
        { key: "공급받는자 상호", label: "공급받는자 상호" },
        { key: "공급받는자 성명", label: "공급받는자 성명" },
        { key: "사업장 소재", label: "사업장 소재" },
        { key: "업태", label: "업태" },
        { key: "업종", label: "업종" },
        { key: "수신자이메일", label: "수신자이메일" },
        { key: "수신자 전화번호", label: "수신자 전화번호" },
        { key: "날짜(From)", label: "날짜(From)" },
        { key: "날짜(To)", label: "날짜(To)" },
        { key: "상영타입", label: "상영타입" },
        { key: "인원", label: "인원" },
        { key: "금액(입장료)", label: "금액(입장료)" },
        { key: "기금제외금액", label: "기금제외금액" },
        { key: "부가세제외금액", label: "부가세제외금액" },
        { key: "부율", label: "부율" },
        { key: "공급가액", label: "공급가액" },
        { key: "부가세", label: "부가세" },
        { key: "영화사 지급금", label: "영화사 지급금" },
    ];

    const summaryData = useMemo(() => {
        // 합계 계산 시 소계 행(is_subtotal)은 제외
        const rawData = settlements.filter((s) => !s.is_subtotal);
        if (!rawData.length) return null;
        const sums = rawData.reduce(
            (acc: any, cur: any) => {
                acc["인원"] += cur["인원"] || 0;
                acc["금액(입장료)"] += cur["금액(입장료)"] || 0;
                acc["기금제외금액"] += cur["기금제외금액"] || 0;
                acc["부가세제외금액"] += cur["부가세제외금액"] || 0;
                acc["공급가액"] += cur["공급가액"] || 0;
                acc["부가세"] += cur["부가세"] || 0;
                acc["영화사 지급금"] += cur["영화사 지급금"] || 0;
                return acc;
            },
            {
                인원: 0,
                "금액(입장료)": 0,
                기금제외금액: 0,
                부가세제외금액: 0,
                공급가액: 0,
                부가세: 0,
                "영화사 지급금": 0,
            },
        );
        return { ...sums, 지역: "전체 총계" };
    }, [settlements]);
    const handleDownloadExcel = async () => {
        if (!searchParams.movieId) {
            toast.error("조회할 영화를 먼저 선택해주세요.");
            return;
        }

        setIsDownloading(true);
        try {
            const res = await AxiosGet("settlement-excel-export/", {
                params: {
                    yyyyMm: searchParams.yyyyMm,
                    movie_id: searchParams.movieId,
                    target: searchParams.target,
                },
                responseType: "blob",
            });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement("a");
            link.href = url;

            const movieTitle = movieOptions.find((m) => m.id === searchParams.movieId)?.title || "정산내역";
            link.setAttribute("download", `부금정산_${movieTitle}_${searchParams.yyyyMm}.xlsx`);

            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success("엑셀 다운로드가 완료되었습니다.");
        } catch (e) {
            toast.error("엑셀 생성 중 오류가 발생했습니다.");
        } finally {
            setIsDownloading(false);
        }
    };
    return (
        <PageContainer>
            <CommonFilterBar
                onSearch={fetchSettlements}
                actions={
                    <>
                        <EseroButton onClick={handleDownloadEsero} disabled={isEseroDownloading}>
                            {isEseroDownloading ? (
                                <CircleNotch size={16} weight="bold" className="loading-icon" />
                            ) : (
                                <DownloadSimple weight="bold" size={16} />
                            )}
                            이세로 다운로드
                        </EseroButton>
                        <ExcelIconButton
                            onClick={handleDownloadExcel}
                            isLoading={isDownloading}
                            title="정산 내역 엑셀 다운로드"
                        />
                    </>
                }
            >
                <div style={{ width: "200px" }}>
                    <CustomInput
                        label="부금년월"
                        inputType="month"
                        value={searchParams.yyyyMm}
                        setValue={(v) => setSearchParams((p: any) => ({ ...p, yyyyMm: v }))}
                        labelWidth="60px"
                    />
                </div>
                <div style={{ width: "300px", position: "relative" }}>
                    <CustomSelect
                        label="영화명"
                        options={movieOptions.map((m) => ({ label: m.title, value: String(m.id) }))}
                        value={searchParams.movieId}
                        onChange={(val) => setSearchParams((p: any) => ({ ...p, movieId: val }))}
                        labelWidth="50px"
                        disabled={movieLoading}
                    />
                    {movieLoading && (
                        <div style={{ position: "absolute", right: "32px", top: "8px", zIndex: 5 }}>
                            <Spinner size={16} weight="bold" />
                        </div>
                    )}
                </div>
                <div style={{ width: "250px" }}>
                    <CustomSelect
                        label="조회대상"
                        options={["전체극장", "일반극장", "기금면제극장"]}
                        value={searchParams.target}
                        onChange={(v) => setSearchParams((p: any) => ({ ...p, target: v }))}
                        labelWidth="60px"
                    />
                </div>
            </CommonFilterBar>

            <ListSection>
            <CommonListHeader title="월간 부금 정산 관리 내역" />
                {isLoading && (
                    <LoadingOverlay>
                        <Spinner size={40} weight="bold" />
                    </LoadingOverlay>
                )}
                <div style={{ flex: 1, overflow: "hidden" }}>
                    <GenericTable
                        headers={headers}
                        data={settlements}
                        // Key를 더 고유하게 만들어 리액트 엔진의 혼동 방지
                        getRowKey={(item: any, idx: number) =>
                            item.is_subtotal
                                ? `subtotal-${item["극장명"]}-${idx}`
                                : `row-${item["거래처코드"]}-${item["날짜(From)"]}-${idx}`
                        }
                        formatCell={(k: string, v: any) =>
                            typeof v === "number" && k !== "부율" ? v.toLocaleString() : (v ?? "-")
                        }
                        summaryData={summaryData}
                        getRowHighlight={(row: any) => row.is_subtotal} // 합계 행 색상 구분
                        page={1}
                        pageSize={1000}
                        totalCount={settlements.length}
                        onPageChange={() => {}}
                    />
                </div>
            </ListSection>
        </PageContainer>
    );
}
