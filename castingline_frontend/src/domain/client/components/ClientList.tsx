import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { AxiosGet } from "../../../axios/Axios";
import { GenericTable } from "../../../components/GenericTable";
import { CustomButton } from "../../../components/common/CustomButton"; // 경로 확인
import { Plus } from "@phosphor-icons/react";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { useToast } from "../../../components/common/CustomToast";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";

/** 1. 스타일 정의 **/


const TableWrapper = styled.div`
    flex: 1;
    overflow: hidden; /* GenericTable 내부 스크롤 사용 */
`;

/** 2. 메인 컴포넌트 **/
export function ClientList({ clients, setClients, selectedClient, handleSelectClient, handleAddClient, filter, refreshTrigger }) {
    const toast = useToast();
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);
    const [totalCount, setTotalCount] = useState(0);

    // 쿼리 파라미터 생성 로직
    const buildQueryParams = () => {
        const params = new URLSearchParams();
        if (filter.clientType) params.append("client_type", filter.clientType);
        if (filter.clientName) params.append("client_name", filter.clientName);
        if (filter.status !== "전체") {
            params.append("operational_status", filter.status);
        }
        if (filter.classification && filter.classification !== "전체")
            params.append("classification", filter.classification);
        if (filter.multi && filter.multi !== "전체") params.append("theater_kind", filter.multi);

        if (sortKey) {
            const ordering = sortOrder === "desc" ? `-${sortKey}` : sortKey;
            params.append("ordering", ordering);
        }

        params.append("page", String(page));
        params.append("page_size", String(pageSize));
        return params.toString();
    };
    useEffect(() => {
        setPage(1);
    }, [sortKey, sortOrder,]);

    const getClients = () => {
        const query = buildQueryParams();
        AxiosGet(`clients/?${query}`)
            .then((res) => {
                setClients(res.data.results);
                setTotalCount(res.data.count);
            })
            .catch((error: any) => {
                console.log(error);
                const errorMessage = handleBackendErrors(error);
                toast.error(`${errorMessage}`);
                setClients([]);
            });
    }
    // 데이터 호출
    useEffect(() => {
        getClients()
    }, [sortKey, sortOrder, page, refreshTrigger]);

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > Math.ceil(totalCount / pageSize)) return;
        setPage(newPage);
    };

    const handleSortChange = (key: string) => {
        let newOrder: "asc" | "desc" = "asc";
        if (sortKey === key) {
            newOrder = sortOrder === "asc" ? "desc" : "asc";
        }
        setSortKey(key);
        setSortOrder(newOrder);
        setPage(1);
    };

    // 테이블 헤더 정의
    const headers = [
        { key: "client_code", label: "거래처 코드" },
        { key: "client_type", label: "거래처 구분" },
        { key: "client_name", label: "거래처명" },
        { key: "classification", label: "직위" },
        { key: "operational_status", label: "사용1" },
        { key: "client_status", label: "사용2" },
        { key: "theater_code", label: "극장코드" },
        { key: "theater_name", label: "극장명" },
        { key: "excel_theater_name", label: "엑셀극장명" },
        { key: "region_code", label: "지역" },
        { key: "theater_kind", label: "멀티" },
        { key: "business_operator", label: "종사업자" },
        { key: "legal_entity_type", label: "법인/개인 구분" },
        { key: "business_registration_number", label: "사업자번호" },
        { key: "business_name", label: "사업자명" },
        { key: "business_category", label: "업태" },
        { key: "business_industry", label: "업종" },
        { key: "business_address", label: "사업장 소재지" },
        { key: "representative_name", label: "대표자명" },
        { key: "settlement_department", label: "부금처" },
        { key: "settlement_mobile_number", label: "부금담당자 휴대폰" },
        { key: "settlement_phone_number", label: "전화번호(부금)" },
        { key: "fax_number", label: "팩스번호" },
        { key: "settlement_contact", label: "담당자(부금)" },
        { key: "representative_phone_number", label: "전화번호(대표)" },
        { key: "invoice_email_address", label: "세금계산서 메일" },
        { key: "invoice_email_address2", label: "세금계산서 메일2" },
        { key: "settlement_remarks", label: "부금특이사항" },
        { key: "distributor_theater_name", label: "배급사 극장명" },
    ];

    const longTextFields = ["business_address", "settlement_remarks"];

    return (
        <CommonSectionCard>
            <CommonListHeader
                title="거래처 목록"
                actions={
                    <CustomIconButton onClick={handleAddClient} title="거래처 추가">
                        <Plus size={16} weight="bold" />
                    </CustomIconButton>
                }
            />

            <TableWrapper>
                <GenericTable
                    headers={headers}
                    data={clients}
                    selectedItem={selectedClient}
                    onSelectItem={handleSelectClient}
                    longTextFields={longTextFields}
                    getRowKey={(client) => client.id}
                    formatCell={(key, value) => (key === "operational_status" ? (value ? "폐관" : "사용") : value ?? "")}
                    onSortChange={handleSortChange}
                    sortKey={sortKey}
                    sortOrder={sortOrder}
                    page={page}
                    pageSize={pageSize}
                    totalCount={totalCount}
                    onPageChange={handlePageChange}
                />
            </TableWrapper>
        </CommonSectionCard>
    );
}
