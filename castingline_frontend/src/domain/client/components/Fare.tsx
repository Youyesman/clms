import React, { useState } from "react";
import styled from "styled-components";
import { AxiosDelete, AxiosPatch, AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { Plus, Trash } from "@phosphor-icons/react";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";

/** 1. 스타일 정의: 테이블 스타일 **/



const ActionGroup = styled.div`
    display: flex;
    gap: 4px;
`;

const IconButton = styled.button<{ $color?: "blue" | "red" }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    color: #64748b;
    transition: all 0.15s ease;

    &:hover {
        border-color: ${({ $color }) => ($color === "red" ? "#ef4444" : "#2b5797")};
        color: ${({ $color }) => ($color === "red" ? "#ef4444" : "#2b5797")};
        background-color: ${({ $color }) => ($color === "red" ? "#fef2f2" : "#f1f8fc")};
    }

    &:active {
        transform: translateY(1px);
    }

    &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
`;

/** 2. 테이블 스타일 (GenericTable 규격 유지) **/
const TableWrapper = styled.div`
    width: 100%;
    overflow: auto;
    flex: 1;

    &::-webkit-scrollbar {
        width: 6px;
        height: 6px;
    }
    &::-webkit-scrollbar-track {
        background: #f8fafc;
    }
    &::-webkit-scrollbar-thumb {
        background: #94a3b8;
        border-radius: 10px;
    }
`;

const StyledTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-family: "SUIT", sans-serif;
    font-size: 11.5px;
`;

const THead = styled.thead`
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: #f8fafc;
    th {
        border-bottom: 1px solid #cbd5e1;
        border-right: 1px solid #e2e8f0;
        padding: 6px 8px;
        font-weight: 700;
        color: #475569;
        text-align: center;
        white-space: nowrap;
    }
`;

const TR = styled.tr`
    height: 30px;
    background-color: #ffffff;
    border-bottom: 1px solid #f1f5f9;
    &:nth-child(even) {
        background-color: #f8fafc;
    }
    &:hover {
        background-color: #f1f5f9 !important;
        cursor: pointer;
    }

    &.selected {
        background-color: #1e293b !important;
        &,
        td {
            color: #ffffff !important;
            border-right-color: #334155 !important;
        }
    }
`;

const TD = styled.td`
    border-right: 1px solid #f1f5f9;
    padding: 4px 10px;
    white-space: nowrap;
    text-align: center;
    color: #1e293b;
    font-weight: 500;
`;

const EditInput = styled.input`
    width: 100%;
    border: 1px solid #0f172a;
    padding: 2px 4px;
    font-size: 11.5px;
    font-family: "SUIT", sans-serif;
    outline: none;
    text-align: center;
`;

/** 3. 메인 컴포넌트 **/
export const Rate = ({
    feeData,
    setFeeData,
    selectedFee,
    setSelectedFee,
    editingFee,
    setEditingFee,
    isSaving,
    setIsSaving,
    selectedClient,
}) => {
    const toast = useToast();
    const [editFeeValue, setEditFeeValue] = useState<any>();

    const handleEditFee = (fee: any) => {
        setEditingFee({ id: fee.id });
        setEditFeeValue(fee.fare || 0);
    };

    const handleSelectFee = (fee: any) => setSelectedFee(fee);

    const handleCancelEditFee = () => {
        setEditingFee({ id: null });
        setEditFeeValue(0);
    };

    const handleAddFee = () => {
        if (!selectedClient) {
            toast.warning("먼저 극장을 선택하세요.");
            return;
        }
        const newFee = {
            client: selectedClient.id,
            fare: 0,
        };
        AxiosPost("fares", newFee)
            .then((res) => {
                setFeeData((prev) => [...prev, res.data]);
                toast.success("요금이 추가되었습니다.");
            })
            .catch((error: any) => {
                console.log(error);
                const errorMessage = handleBackendErrors(error);
                toast.error(`${errorMessage}`);
            });
    };

    const handleDeleteFee = () => {
        if (!selectedFee) {
            toast.warning("삭제할 요금을 선택하세요.");
            return;
        }
        if (!window.confirm("선택한 요금을 삭제하시겠습니까?")) return;

        AxiosDelete("fares", selectedFee.id)
            .then(() => {
                setFeeData((prev) => prev.filter((item) => item.id !== selectedFee.id));
                setSelectedFee(null);
                toast.success("요금이 삭제되었습니다.");
            })
            .catch((error: any) => {
                console.log(error);
                const errorMessage = handleBackendErrors(error);
                toast.error(`${errorMessage}`);
            });
    };

    const handleSaveFee = (fee: any) => {
        const newFare = parseInt(editFeeValue as any) || 0;

        // 값이 변경되지 않았으면 API 호출 없이 종료
        // (데이터베이스에서 오는 값은 문자열일 수 있으므로 Number로 변환하여 비교)
        if (Number(fee.fare) === Number(newFare)) {
            handleCancelEditFee();
            return;
        }

        if (isSaving) return;
        setIsSaving(true);
        const updatedFee = { ...fee, fare: newFare };
        AxiosPatch(`fares/${fee.id}`, updatedFee)
            .then((res) => {
                setFeeData((prev) => prev.map((item) => (item.id === fee.id ? res.data : item)));
                setEditingFee({ id: null });
                setEditFeeValue(0);
                toast.success("요금 정보가 수정되었습니다.");
            })
            .catch((error: any) => {
                console.log(error);
                const errorMessage = handleBackendErrors(error);
                toast.error(`${errorMessage}`);
            })
            .finally(() => setIsSaving(false));
    };

    return (
        <CommonSectionCard>
            <CommonListHeader
                title="요금"
                actions={
                    <>
                        <CustomIconButton onClick={handleAddFee} title="추가">
                            <Plus weight="bold" />
                        </CustomIconButton>
                        <CustomIconButton onClick={handleDeleteFee} color="red" title="삭제" disabled={!selectedFee}>
                            <Trash weight="bold" />
                        </CustomIconButton>
                    </>
                }
            />

            <TableWrapper>
                <StyledTable>
                    <THead>
                        <tr>
                            <th>요금</th>
                        </tr>
                    </THead>
                    <tbody>
                        {feeData.length > 0 ? (
                            feeData.map((item: any, index: number) => (
                                <TR
                                    key={index}
                                    className={selectedFee?.id === item.id ? "selected" : ""}
                                    onClick={() => handleSelectFee(item)}>
                                    <TD onDoubleClick={() => handleEditFee(item)}>
                                        {editingFee.id === item.id ? (
                                            <EditInput
                                                autoComplete="off"
                                                type="number"
                                                value={editFeeValue}
                                                onChange={(e) => setEditFeeValue(e.target.value)}
                                                onBlur={() => handleSaveFee(item)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleSaveFee(item);
                                                    if (e.key === "Escape") handleCancelEditFee();
                                                }}
                                                autoFocus
                                            />
                                        ) : (
                                            Number(item.fare || 0).toLocaleString()
                                        )}
                                    </TD>
                                </TR>
                            ))
                        ) : (
                            <TR>
                                <TD style={{ padding: "40px", color: "#94a3b8" }}>데이터가 없습니다.</TD>
                            </TR>
                        )}
                    </tbody>
                </StyledTable>
            </TableWrapper>
        </CommonSectionCard>
    );
};
