import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { AxiosGet, AxiosPatch } from "../../../axios/Axios";
import { GenericTable } from "../../../components/GenericTable";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { ExcelIconButton } from "../../../components/common/ExcelIconButton";
import { CommonListHeader } from "../../../components/common/CommonListHeader";

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
    margin-top: 12px;
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
        input {
            margin: 0;
            accent-color: #0f172a;
        }
    }
`;

interface DailyFundListProps {
    client_id: number;
    client_name: string;
    yyyy: string; // 부모로부터 전달된 '그 해'
    mm: number; // 부모로부터 전달된 '그 월'
    onRefreshMonthly: () => void; // 일별 수정 시 월별 카운트 갱신용
}

export function DailyFundList({
    client_id,
    client_name,
    yyyy,
    mm,
    onRefreshMonthly,
    onRefreshAnnual,
    parentStatus,
}: any) {
    const toast = useToast();
    const [dailyFunds, setDailyFunds] = useState<any[]>([]);
    const [isExcelLoading, setIsExcelLoading] = useState(false);

    // 조회: 백엔드에서 생성된 1~31일 리스트를 받아옴
    const fetchDailyData = useCallback(() => {
        if (!client_id || !yyyy || !mm) return;
        AxiosGet(`daily-funds/?client_id=${client_id}&yyyy=${yyyy}&mm=${mm}`).then((res) =>
            setDailyFunds(res.data.results)
        );
    }, [client_id, yyyy, mm]);

    useEffect(() => {
        fetchDailyData();
    }, [fetchDailyData, parentStatus]);

    const handleExcelDownload = useCallback(() => {
        setIsExcelLoading(true);
        AxiosGet(`daily-fund-excel-export/?client_id=${client_id}&yyyy=${yyyy}&mm=${mm}`, {
            responseType: "blob",
        })
            .then((res) => {
                const url = window.URL.createObjectURL(new Blob([res.data]));
                const link = document.createElement("a");
                link.href = url;
                let fileName = `Daily_Fund_${client_name}_${yyyy}${mm}.xlsx`;
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
    }, [client_id, client_name, yyyy, mm, toast]);

    const handleUpdateStatus = (dd: number, val: boolean) => {
        // 수정 시 해당 '일(dd)'과 '그 해(yyyy)', '그 월(mm)' 정보를 전송
        AxiosPatch("daily-funds", { fund_yn: val, yyyy, mm, dd }, client_id).then((res) => {
            // 특정 날짜(dd) 데이터만 응답받은 실제 DB 데이터로 교체
            setDailyFunds((prev) => prev.map((item) => (item.dd === dd ? res.data : item)));

            if (onRefreshMonthly) onRefreshMonthly();
            if (onRefreshAnnual) onRefreshAnnual();
            toast.success(`${dd}일 상태가 저장되었습니다.`);
        });
    };

    return (
        <DetailContainer>
            <CommonListHeader
                title="일별 상세 내역"
                subtitle={`[${client_name} - ${yyyy}년 ${mm}월]`}
                actions={<ExcelIconButton onClick={handleExcelDownload} isLoading={isExcelLoading} />}
            />
            <GenericTable
                headers={[
                    { key: "dd", label: "날짜" },
                    { key: "fund_yn", label: "기금여부" },
                ]}
                data={dailyFunds}
                getRowKey={(d) => d.dd}
                formatCell={(key, value, row) => {
                    if (key === "dd") return `${value}일`;
                    if (key === "fund_yn") {
                        return (
                            <RadioWrapper>
                                <label>
                                    <input
                                        type="radio"
                                        checked={value === false}
                                        onChange={() => handleUpdateStatus(row.dd, false)}
                                    />{" "}
                                    일반
                                </label>
                                <label>
                                    <input
                                        type="radio"
                                        checked={value === true}
                                        onChange={() => handleUpdateStatus(row.dd, true)}
                                    />{" "}
                                    기금면제
                                </label>
                            </RadioWrapper>
                        );
                    }
                    return value;
                }}
            />
        </DetailContainer>
    );
}
