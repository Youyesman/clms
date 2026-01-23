import React, { useCallback, useState } from "react";
import styled from "styled-components";
import { AxiosDelete, AxiosGet, AxiosPatch, AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { Plus, Trash } from "@phosphor-icons/react";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import dayjs from "dayjs";
import { ExcelIconButton } from "../../../components/common/ExcelIconButton";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";

/** 1. 스타일 정의: 테이블 레이아웃 **/



const ActionGroup = styled.div`
    display: flex;
    gap: 4px;
`;

/* 아이콘 전용 버튼 스타일 */
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

/** 2. 테이블 스타일 (GenericTable 규격) **/
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
export const Theater = ({
    screenData,
    setScreenData,
    selectedScreen,
    setSelectedScreen,
    editingScreen,
    setEditingScreen,
    editScreenValue,
    setEditScreenValue,
    isSaving,
    setIsSaving,
    selectedClient,
}) => {
    const toast = useToast();

    const handleAddScreen = () => {
        if (!selectedClient) {
            toast.warning("먼저 극장을 선택하세요.");
            return;
        }
        const newScreen = {
            client: selectedClient.id,
            auditorium: "신규",
            seat_count: 0,
            auditorium_name: "신규 관 이름",
        };
        AxiosPost("theaters", newScreen)
            .then((res) => {
                setScreenData((prev) => [...prev, res.data]);
                toast.success("극장관이 추가되었습니다.");
            })
            .catch((error: any) => {
                console.log(error);
                const errorMessage = handleBackendErrors(error);
                toast.error(`${errorMessage}`);
            });
    };

    const handleDeleteScreen = () => {
        if (!selectedScreen) {
            toast.warning("삭제할 극장관을 선택하세요.");
            return;
        }
        if (!window.confirm("선택한 극장관을 삭제하시겠습니까?")) return;

        AxiosDelete("theaters", selectedScreen.id)
            .then(() => {
                setScreenData((prev) => prev.filter((item) => item.id !== selectedScreen.id));
                setSelectedScreen(null);
                toast.success("극장관이 삭제되었습니다.");
            })
            .catch((error: any) => {
                console.log(error);
                const errorMessage = handleBackendErrors(error);
                toast.error(`${errorMessage}`);
            });
    };

    const handleSelectScreen = (screen: any) => setSelectedScreen(screen);

    const handleEditScreen = (screen: any, field: string) => {
        setEditingScreen({ id: screen.id, field });
        setEditScreenValue(screen[field] || "");
    };

    const handleCancelEditScreen = () => {
        setEditingScreen({ id: null, field: null });
        setEditScreenValue("");
    };

    const handleSaveScreen = (screen: any, field: string) => {
        const newValue = field === "seat_count" ? parseInt(editScreenValue as string) || 0 : editScreenValue;

        // 값이 변경되지 않았으면 API 호출 없이 종료
        const isSame = field === "seat_count" 
            ? Number(screen[field]) === Number(newValue) 
            : screen[field] === newValue;

        if (isSame) {
            handleCancelEditScreen();
            return;
        }

        if (isSaving) return;
        setIsSaving(true);
        const updatedScreen = {
            ...screen,
            [field]: newValue,
        };
        AxiosPatch(`theaters/${screen.id}`, updatedScreen)
            .then((res) => {
                setScreenData((prev) => prev.map((item) => (item.id === screen.id ? res.data : item)));
                setEditingScreen({ id: null, field: null });
                setEditScreenValue("");
                toast.success("극장관 정보가 수정되었습니다.");
            })
            .catch((error: any) => {
                console.log(error);
                const errorMessage = handleBackendErrors(error);
                toast.error(`${errorMessage}`);
            })
            .finally(() => setIsSaving(false));
    };
    const [isDownloading, setIsDownloading] = useState(false); // 로딩 상태 추가

    // ✅ 극장관 엑셀 다운로드 핸들러
    const handleDownloadExcel = useCallback(async () => {
        setIsDownloading(true);
        try {
            // 선택된 극장이 있다면 해당 극장 것만, 없으면 전체 다운로드 가능하도록 파라미터 전달
            const res = await AxiosGet("theaters-excel-export/", {
                params: { client_id: selectedClient?.id || "" },
                responseType: "blob",
            });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement("a");
            link.href = url;

            const theaterName = selectedClient?.client_name || "전체";
            link.setAttribute("download", `극장관정보_${theaterName}_${dayjs().format("YYYYMMDD")}.xlsx`);

            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success("극장관 엑셀 다운로드가 완료되었습니다.");
        } catch (e) {
            toast.error("엑셀 다운로드 중 오류가 발생했습니다.");
        } finally {
            setIsDownloading(false);
        }
    }, [selectedClient, toast]);

    // 합계 계산
    const totalScreens = screenData.length;
    const totalSeats = screenData.reduce((sum, item) => sum + (parseInt(item.seat_count) || 0), 0);

    return (
        <CommonSectionCard>
            <CommonListHeader
                title="극장관 정보"
                actions={
                    <>
                        <CustomIconButton onClick={handleAddScreen} title="추가">
                            <Plus weight="bold" />
                        </CustomIconButton>
                        <CustomIconButton onClick={handleDeleteScreen} color="red" title="삭제" disabled={!selectedScreen}>
                            <Trash weight="bold" />
                        </CustomIconButton>
                        <ExcelIconButton
                            onClick={handleDownloadExcel}
                            isLoading={isDownloading}
                            title="극장관 정보 엑셀 다운로드"
                        />
                    </>
                }
            />

            <TableWrapper>
                <StyledTable>
                    <THead>
                        <tr>
                            <th style={{ width: "60px" }}>관</th>
                            <th style={{ width: "80px" }}>좌석</th>
                            <th>관이름</th>
                        </tr>
                    </THead>
                    <tbody>
                        {screenData.length > 0 ? (
                            <>
                                {screenData.map((item: any, index: number) => (
                                    <TR
                                        key={index}
                                        className={selectedScreen?.id === item.id ? "selected" : ""}
                                        onClick={() => handleSelectScreen(item)}>
                                        <TD onDoubleClick={() => handleEditScreen(item, "auditorium")}>
                                            {editingScreen.id === item.id && editingScreen.field === "auditorium" ? (
                                                <EditInput
                                                    autoComplete="off"
                                                    value={editScreenValue}
                                                    onChange={(e) => setEditScreenValue(e.target.value)}
                                                    onBlur={() => handleSaveScreen(item, "auditorium")}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") handleSaveScreen(item, "auditorium");
                                                        if (e.key === "Escape") handleCancelEditScreen();
                                                    }}
                                                    autoFocus
                                                />
                                            ) : (
                                                item.auditorium
                                            )}
                                        </TD>
                                        <TD onDoubleClick={() => handleEditScreen(item, "seat_count")}>
                                            {editingScreen.id === item.id && editingScreen.field === "seat_count" ? (
                                                <EditInput
                                                    autoComplete="off"
                                                    type="number"
                                                    value={editScreenValue}
                                                    onChange={(e) => setEditScreenValue(e.target.value)}
                                                    onBlur={() => handleSaveScreen(item, "seat_count")}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") handleSaveScreen(item, "seat_count");
                                                        if (e.key === "Escape") handleCancelEditScreen();
                                                    }}
                                                    autoFocus
                                                />
                                            ) : (
                                                item.seat_count
                                            )}
                                        </TD>
                                        <TD onDoubleClick={() => handleEditScreen(item, "auditorium_name")}>
                                            {editingScreen.id === item.id && editingScreen.field === "auditorium_name" ? (
                                                <EditInput
                                                    autoComplete="off"
                                                    value={editScreenValue}
                                                    onChange={(e) => setEditScreenValue(e.target.value)}
                                                    onBlur={() => handleSaveScreen(item, "auditorium_name")}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") handleSaveScreen(item, "auditorium_name");
                                                        if (e.key === "Escape") handleCancelEditScreen();
                                                    }}
                                                    autoFocus
                                                />
                                            ) : (
                                                item.auditorium_name
                                            )}
                                        </TD>
                                    </TR>
                                ))}
                                <TR style={{ backgroundColor: "#f1f5f9", fontWeight: "bold" }}>
                                    <TD>합계</TD>
                                    <TD>{totalSeats.toLocaleString()}</TD>
                                    <TD>{totalScreens}개관</TD>
                                </TR>
                            </>
                        ) : (
                            <TR>
                                <TD colSpan={3} style={{ padding: "40px", color: "#94a3b8" }}>
                                    데이터가 없습니다.
                                </TD>
                            </TR>
                        )}
                    </tbody>
                </StyledTable>
            </TableWrapper>
        </CommonSectionCard>
    );
};
