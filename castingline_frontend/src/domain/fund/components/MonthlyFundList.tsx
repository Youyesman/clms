import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { AxiosGet, AxiosPatch } from "../../../axios/Axios";
import { GenericTable } from "../../../components/GenericTable";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { DailyFundList } from "./DailyFundList"; // 일별 리스트 임포트
import { ExcelIconButton } from "../../../components/common/ExcelIconButton";
import { CommonListHeader } from "../../../components/common/CommonListHeader";

/** 스타일 정의 **/
const DetailContainer = styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    background-color: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    box-shadow: 
        0 4px 6px -1px rgba(0, 0, 0, 0.1), 
        0 2px 4px -1px rgba(0, 0, 0, 0.06);
    overflow: hidden;
    height: 100%;
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

const ContentSplitter = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-y: auto;
    gap: 16px;
    padding-bottom: 20px;
`;

interface MonthlyFundListProps {
    client_id: number;
    client_name: string;
    yyyy: string;
    onRefreshAnnual: () => void;
    parentStatus: boolean;
}

export function MonthlyFundList({ client_id, client_name, yyyy, onRefreshAnnual, parentStatus }: MonthlyFundListProps) {
    const toast = useToast();
    const [monthlyFunds, setMonthlyFunds] = useState<any[]>([]);
    const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
    const [isExcelLoading, setIsExcelLoading] = useState(false);

    // 1. 데이터 조회: '그 해' 기준 1~12월 가상 목록 가져오기
    const fetchMonthlyData = useCallback(() => {
        if (!client_id || !yyyy) return;
        AxiosGet(`monthly-funds/?client_id=${client_id}&yyyy=${yyyy}`)
            .then((res) => {
                setMonthlyFunds(res.data.results);
            })
            .catch((err) => console.error("월별 내역 로드 실패:", err));
    }, [client_id, yyyy]);

    useEffect(() => {
        fetchMonthlyData();
        setSelectedMonth(null); // 극장이나 연도가 바뀌면 선택된 월 초기화
    }, [fetchMonthlyData]);
    useEffect(() => {
        fetchMonthlyData();
    }, [fetchMonthlyData, parentStatus]);
    // 2. 상태 수정: '그 해'와 '해당 월' 정보를 담아 Upsert
    const handleUpdateStatus = (mm: number, val: boolean) => {
        AxiosPatch(
            "monthly-funds",
            {
                fund_yn: val,
                yyyy: yyyy, // 그 해
                mm: mm, // 해당 월
            },
            client_id
        )
            .then((res) => {
                setMonthlyFunds((prev) => prev.map((m) => (m.mm === mm ? res.data : m)));
                toast.success(`${mm}월 기금 상태가 변경되었습니다.`);
                if (onRefreshAnnual) onRefreshAnnual();
            })
            .catch((err) => toast.error(handleBackendErrors(err)));
    };

    const handleExcelDownload = useCallback(() => {
        setIsExcelLoading(true);
        AxiosGet(`monthly-fund-excel-export/?client_id=${client_id}&yyyy=${yyyy}`, {
            responseType: "blob",
        })
            .then((res) => {
                const url = window.URL.createObjectURL(new Blob([res.data]));
                const link = document.createElement("a");
                link.href = url;
                let fileName = `Monthly_Fund_All_${yyyy}.xlsx`;
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
    }, [client_id, client_name, yyyy, toast]);

    const headers = [
        { key: "yyyy", label: "년도" },
        { key: "mm", label: "월" },
        { key: "fund_yn", label: "기금여부" },
    ];

    return (
        <DetailContainer>
            <CommonListHeader
                title="월별 기금 상세내역"
                subtitle={`[${client_name} - ${yyyy}년]`}
                actions={<ExcelIconButton onClick={handleExcelDownload} isLoading={isExcelLoading} />}
            />

            <ContentSplitter>
                {/* 월별 리스트 테이블 */}
                <div style={{ minHeight: "400px" }}>
                    <GenericTable
                        headers={headers}
                        data={monthlyFunds}
                        getRowKey={(m) => m.mm}
                        selectedItem={monthlyFunds.find((m) => m.mm === selectedMonth)}
                        onSelectItem={(row) => setSelectedMonth(row.mm)}
                        formatCell={(key, value, row) => {
                            if (key === "mm") return `${value}월`;
                            if (key === "fund_yn") {
                                return (
                                    <RadioWrapper onClick={(e) => e.stopPropagation()}>
                                        <label>
                                            <input
                                                type="radio"
                                                checked={value === false}
                                                onChange={() => handleUpdateStatus(row.mm, false)}
                                            />{" "}
                                            일반
                                        </label>
                                        <label>
                                            <input
                                                type="radio"
                                                checked={value === true}
                                                onChange={() => handleUpdateStatus(row.mm, true)}
                                            />{" "}
                                            기금면제
                                        </label>
                                    </RadioWrapper>
                                );
                            }
                            return value ?? "";
                        }}
                    />
                </div>

                {/* 일별 리스트 섹션 (월 선택 시 노출) */}
                {selectedMonth && (
                    <div style={{ minHeight: "350px" }}>
                        <DailyFundList
                            key={`${client_id}-${yyyy}-${selectedMonth}`}
                            client_id={client_id}
                            client_name={client_name}
                            yyyy={yyyy}
                            mm={selectedMonth}
                            onRefreshMonthly={fetchMonthlyData}
                            onRefreshAnnual={onRefreshAnnual}
                            parentStatus={monthlyFunds.find((m) => m.mm === selectedMonth)?.fund_yn}
                        />
                    </div>
                )}
            </ContentSplitter>
        </DetailContainer>
    );
}
