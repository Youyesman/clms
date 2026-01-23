import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { AxiosGet, AxiosPatch, AxiosPost } from "../../../axios/Axios";
import { GenericTable } from "../../../components/GenericTable";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import formatDateTime from "../../../components/common/formatDateTime";
import { CommonListHeader } from "../../../components/common/CommonListHeader";

const ListContainer = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: #ffffff;
    border: 1px solid #94a3b8;
    border-radius: 4px;
    overflow: hidden;
`;

// ListHeader removed
export function TheaterRateByClientMovieList({ selectedInnerRate }: { selectedInnerRate: any }) {
    const toast = useToast();
    const [mergedData, setMergedData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchAllData = useCallback(async () => {
        if (!selectedInnerRate?.id) {
            setMergedData([]);
            return;
        }

        setLoading(true);
        try {
            const theaterRes = await AxiosGet(`theaters/?client_id=${selectedInnerRate.client.id}`);
            const theaters = theaterRes.data.results || [];

            const rateRes = await AxiosGet(`theater-rates/?rate_id=${selectedInnerRate.id}`);
            const rates = rateRes.data.results || [];

            const merged = theaters.map((t: any) => {
                const rateEntry = rates.find((r: any) => r.theater === t.id);
                return {
                    ...rateEntry,
                    theater_id: t.id,
                    theater_name: t.auditorium_name,
                    // ✅ 수정: 데이터가 없으면 상위 선택된 부율(selectedInnerRate.share_rate)을 표시
                    share_rate: rateEntry?.share_rate ?? selectedInnerRate.share_rate,
                    is_new: !rateEntry,
                };
            });

            setMergedData(merged);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [selectedInnerRate]);

    useEffect(() => { fetchAllData(); }, [fetchAllData]);

    const handleUpdateCell = async (item: any, key: string, value: any) => {
        try {
            // 부율 값 숫자 유효성 검사 (필요 시)
            if (key === "share_rate" && isNaN(Number(value))) {
                toast.warning("숫자만 입력 가능합니다.");
                return;
            }

            if (item.is_new) {
                const payload = {
                    rate: selectedInnerRate.id,
                    theater: item.theater_id,
                    [key]: value
                };
                await AxiosPost("theater-rates", payload);
                toast.success("상영관별 예외 부율이 설정되었습니다.");
            } else {
                await AxiosPatch("theater-rates", { [key]: value }, item.id);
                toast.success("수정되었습니다.");
            }
            fetchAllData();
        } catch (e: any) {
            toast.error(handleBackendErrors(e));
        }
    };

    const headers = [
        { key: "theater_name", label: "상영관" },
        {
            key: "share_rate",
            label: "부율 (%)",
            editable: true,
            // ✅ 수정: 개별 설정된 값은 강조하고, 기본값은 스타일을 다르게 할 수 있음
            renderCell: (v: any, row: any) => (
                <span style={{ fontWeight: row.is_new ? 400 : 800, color: row.is_new ? "#94a3b8" : "#2563eb" }}>
                    {v} {row.is_new && "(기본)"}
                </span>
            )
        },
        {
            key: "updated_date",
            label: "처리일시",
            renderCell: (v: any, row: any) => row.is_new ? "-" : formatDateTime(row.updated_date)
        },
    ];

    return (
        <ListContainer>
            <CommonListHeader
                title="상영관별 예외 부율 설정"
                subtitle={selectedInnerRate ? `[기본 부율: ${selectedInnerRate.share_rate}%]` : undefined}
            />
            {!selectedInnerRate ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                    공통 부율 이력을 선택해주세요.
                </div>
            ) : (
                <GenericTable
                    headers={headers}
                    data={mergedData}
                    getRowKey={(r: any) => `theater-${r.theater_id}`}
                    onUpdateCell={handleUpdateCell}
                />
            )}
        </ListContainer>
    );
}