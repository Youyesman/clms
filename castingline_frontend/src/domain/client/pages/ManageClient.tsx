import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { AxiosGet, AxiosPost, AxiosPatch } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";

// 공통 컴포넌트
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomSelect } from "../../../components/common/CustomSelect";

// 도메인 컴포넌트
import { Theater } from "../components/Theater";
import { ClientList } from "../components/ClientList";
import { Rate } from "../components/Fare";
import { ClientDetail } from "../components/ClientDetail";
import { useAppAlert } from "../../../atom/alertUtils";
import { OPERATIONAL_STATUS_OPTIONS, CLIENT_TYPES, MANAGEMENT_TYPES, THEATER_KINDS } from "../../../constant/Constants";
import dayjs from "dayjs";
import { ExcelIconButton } from "../../../components/common/ExcelIconButton";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";

/** 1. 레이아웃 스타일 정의 **/
const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background-color: #f8fafc;
    min-height: 100vh;
    font-family: "SUIT", sans-serif;
`;


const MainGrid = styled.div`
    display: flex;
    gap: 16px;
    flex: 1;
`;

const LeftSection = styled.div`
    flex: 1.2;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
`;

const RightSection = styled.div`
    flex: 0.8;
    min-width: 0;
`;

const SubTableGrid = styled.div`
    display: flex;
    gap: 16px;
    flex: 1;
    & > div {
        flex: 1;
    }
`;

/** 2. 페이지 컴포넌트 본문 **/
export function ManageClient() {
    const toast = useToast();
    const { showAlert } = useAppAlert();
    // 데이터 상태
    const [clients, setClients] = useState<any[]>([]);
    const [selectedClient, setSelectedClient] = useState<any>(null);
    const [formData, setFormData] = useState<any>({});
    const [screenData, setScreenData] = useState<any[]>([]);
    const [feeData, setFeeData] = useState<any[]>([]);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    // 수정 및 로딩 상태
    const [selectedScreen, setSelectedScreen] = useState<any>(null);
    const [selectedFee, setSelectedFee] = useState<any>(null);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    const [editingScreen, setEditingScreen] = useState<{ id: number | null; field: string | null }>({
        id: null,
        field: null,
    });
    const [editScreenValue, setEditScreenValue] = useState<string | number>("");
    const [editingFee, setEditingFee] = useState<{ id: number | null }>({ id: null });

    // 필터 상태
    const [filter, setFilter] = useState({
        clientType: "",
        clientName: "",
        status: "false", // 기본값 "false" (사용)
        classification: "전체",
        multi: "전체",
    });

    // ✅ 컴포넌트용 필터 변경 핸들러
    const handleFilterUpdate = (name: string, value: string) => {
        setFilter((prev) => ({ ...prev, [name]: value }));
    };

    const onClickSearch = () => {
        setRefreshTrigger((prev) => prev + 1);
    };

    const handleSelectClient = (client: any) => {
        setSelectedClient(client);
        setFormData({ ...client });
        setSelectedScreen(null);
        setSelectedFee(null);
        setEditingScreen({ id: null, field: null });
        setEditingFee({ id: null });

        if (client) {
            AxiosGet(`theaters/?client_id=${client.id}`)
                .then((res) => setScreenData(res.data.results || []))
                .catch(() => setScreenData([]));

            AxiosGet(`fares/?client_id=${client.id}`)
                .then((res) => setFeeData(res.data.results || []))
                .catch(() => setFeeData([]));
        } else {
            setScreenData([]);
            setFeeData([]);
        }
    };

    const handleInputChange = (e: any) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev: any) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };
    const validateForm = () => {
        // 1. 공통 필수 항목 (모든 타입 공통)
        if (!formData.client_code?.trim()) {
            toast.warning("거래처 코드는 필수 입력 사항입니다.");
            return false;
        }
        if (!formData.client_name?.trim()) {
            toast.warning("거래처명은 필수 입력 사항입니다.");
            return false;
        }
        if (!formData.client_type) {
            toast.warning("거래처 구분을 선택해주세요.");
            return false;
        }

        // 3. 형식 검사 (이메일 등)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (formData.settlement_email && !emailRegex.test(formData.settlement_email)) {
            toast.warning("부금담당자 메일의 형식이 올바르지 않습니다.");
            return false;
        }
        if (formData.invoice_email_address && !emailRegex.test(formData.invoice_email_address)) {
            toast.warning("세금계산서 메일 1의 형식이 올바르지 않습니다.");
            return false;
        }

        if (formData.invoice_email_address2 && !emailRegex.test(formData.invoice_email_address2)) {
            toast.warning("세금계산서 메일 2의 형식이 올바르지 않습니다.");
            return false;
        }

        return true;
    };
    const handleUpdateClient = () => {
        if (!selectedClient) return;

        // 전송 전 유효성 검사 실시
        if (!validateForm()) {
            return; // 검사 탈락 시 함수 종료
        }

        AxiosPatch(`clients/${selectedClient.id}`, formData)
            .then((res) => {
                setClients((prev) => prev.map((c) => (c.id === selectedClient.id ? res.data : c)));
                setSelectedClient(res.data);
                toast.success("거래처 정보가 수정되었습니다.");
            })
            .catch((err) => {
                console.error(err);
                toast.error("거래처 수정에 실패했습니다.");
            });
    };

    const handleAddClient = () => {
        const newClient = { client_name: "새 거래처", operational_status: true };
        AxiosPost("clients", newClient).then((res) => {
            setClients((prev) => [...prev, res.data]);
            handleSelectClient(res.data);
            toast.success("새 거래처가 추가되었습니다.");
        });
    };

    const handleBulkUpdateSettlement = () => {
        const dept = formData.settlement_department;

        if (!dept) {
            toast.warning("부금처가 선택되지 않았습니다.");
            return;
        }

        // 기존 window.confirm 대신 커스텀 알럿 호출
        showAlert(
            "부금처 일괄 업데이트", // title
            `[${dept}] 부금처를 가진 모든 거래처의 정보를 현재 입력된 정보로 일괄 수정하시겠습니까?`, // subTitle
            "warning", // type (디자인에 따라 'info' 또는 'warning' 사용)
            () => {
                // [확인] 버튼 클릭 시 실행될 콜백 (onConfirmCallback)
                const bulkData = {
                    target_department: dept,
                    settlement_contact: formData.settlement_contact,
                    settlement_phone_number: formData.settlement_phone_number,
                    settlement_mobile_number: formData.settlement_mobile_number,
                    settlement_email: formData.settlement_email,
                    invoice_email_address: formData.invoice_email_address,
                    invoice_email_address2: formData.invoice_email_address2,
                    settlement_remarks: formData.settlement_remarks,
                };

                AxiosPatch(`clients/bulk_update_settlement`, bulkData)
                    .then((res) => {
                        toast.success(`[${dept}] ${res.data.updated_count}개의 거래처 정보가 업데이트되었습니다.`);
                        setRefreshTrigger((prev) => prev + 1);
                    })
                    .catch(() => {
                        toast.error("일괄 업데이트 처리 중 오류가 발생했습니다.");
                    });
            },
            true, // showCancelBtn (취소 버튼 표시)
        );
    };
    const [isDownloading, setIsDownloading] = useState(false); // 로딩 상태 추가

    // ✅ 엑셀 다운로드 핸들러 - 현재 검색 조건을 모두 전달
    const handleDownloadExcel = async () => {
        setIsDownloading(true);

        try {
            // 현재 필터 조건을 쿼리 파라미터로 구성 (페이지네이션 제외)
            const params = new URLSearchParams();
            
            // 거래처 타입 필터
            if (filter.clientType) {
                params.append("client_type", filter.clientType);
            }
            
            // 기타 필터 조건들
            if (filter.clientName) params.append("client_name", filter.clientName);
            if (filter.status !== "전체") {
                params.append("operational_status", filter.status);
            }
            if (filter.classification && filter.classification !== "전체") {
                params.append("classification", filter.classification);
            }
            if (filter.multi && filter.multi !== "전체") {
                params.append("theater_kind", filter.multi);
            }
            
            const res = await AxiosGet(`client-excel-export/?${params.toString()}`, {
                responseType: "blob",
            });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `거래처정보_${dayjs().format("YYYYMMDD")}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success("엑셀 다운로드가 완료되었습니다.");
        } catch (e) {
            toast.error("다운로드 실패");
        } finally {
            setIsDownloading(false);
        }
    };
    return (
        <PageContainer>
            {/* ✅ 상단 필터 영역: Custom 컴포넌트 적용 */}
            <CommonFilterBar
                onSearch={onClickSearch}
                actions={
                    <ExcelIconButton
                        onClick={handleDownloadExcel}
                        isLoading={isDownloading}
                        title="전체 극장 정보 엑셀 다운로드"
                    />
                }
            >
                <CustomSelect
                    label="거래처구분"
                    // "전체"를 포함해야 하므로 스프레드 연산자 사용
                    options={["전체", ...CLIENT_TYPES]}
                    value={filter.clientType || "전체"}
                    onChange={(v) => handleFilterUpdate("clientType", v === "전체" ? "" : v)}
                    size="sm"
                />
                <CustomInput
                    label="거래처명"
                    value={filter.clientName}
                    setValue={(v) => handleFilterUpdate("clientName", v)}
                    placeholder="검색어 입력"
                />
                <CustomSelect
                    label="상태"
                    // 새로 추가한 상수 사용
                    options={[{ label: "전체", value: "전체" }, ...OPERATIONAL_STATUS_OPTIONS]}
                    value={filter.status}
                    onChange={(v) => handleFilterUpdate("status", v)}
                    size="sm"
                />
                <CustomSelect
                    label="직위" // 기존 "구분"에서 "직위"로 레이블 변경
                    // MANAGEMENT_TYPES는 이미 "전체"를 포함하고 있음
                    options={["전체", ...MANAGEMENT_TYPES]}
                    value={filter.classification}
                    onChange={(v) => handleFilterUpdate("classification", v)}
                    size="sm"
                />
                <CustomSelect
                    label="멀티"
                    // "전체"를 포함해야 하므로 스프레드 연산자 사용
                    options={["전체", ...THEATER_KINDS]}
                    value={filter.multi}
                    onChange={(v) => handleFilterUpdate("multi", v)}
                    size="sm"
                />
            </CommonFilterBar>

            <MainGrid>
                <LeftSection>
                    <ClientList
                        clients={clients}
                        setClients={setClients}
                        selectedClient={selectedClient}
                        handleSelectClient={handleSelectClient}
                        handleAddClient={handleAddClient}
                        filter={filter}
                        refreshTrigger={refreshTrigger}
                    />

                    <SubTableGrid>
                        <Theater
                            screenData={screenData}
                            setScreenData={setScreenData}
                            selectedScreen={selectedScreen}
                            setSelectedScreen={setSelectedScreen}
                            selectedClient={selectedClient}
                            isSaving={isSaving}
                            setIsSaving={setIsSaving}
                            editingScreen={editingScreen}
                            setEditingScreen={setEditingScreen}
                            editScreenValue={editScreenValue}
                            setEditScreenValue={setEditScreenValue}
                        />
                        <Rate
                            feeData={feeData}
                            setFeeData={setFeeData}
                            selectedFee={selectedFee}
                            setSelectedFee={setSelectedFee}
                            selectedClient={selectedClient}
                            isSaving={isSaving}
                            setIsSaving={setIsSaving}
                            editingFee={editingFee}
                            setEditingFee={setEditingFee}
                        />
                    </SubTableGrid>
                </LeftSection>

                <RightSection>
                    <ClientDetail
                        selectedClient={selectedClient}
                        formData={formData}
                        setFormData={setFormData}
                        handleInputChange={handleInputChange}
                        handleUpdateClient={handleUpdateClient}
                        handleBulkUpdateSettlement={handleBulkUpdateSettlement}
                    />
                </RightSection>
            </MainGrid>
        </PageContainer>
    );
}
