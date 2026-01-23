import React, { useState } from "react";
import styled from "styled-components";

// 도메인 컴포넌트
import { OrderList } from "../components/OrderList";
import { OrderDetail } from "../components/OrderDetail";

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

/** * ✅ MainGrid를 세로 방향(column)으로 변경
 */
const MainGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
    flex: 1;
`;

const TopSection = styled.div`
    width: 100%;
    min-width: 0;
`;

const BottomSection = styled.div`
    width: 100%;
    min-width: 0;
`;

/** 2. 페이지 컴포넌트 본문 **/
export function ManageOrder() {
    // 상태 관리
    const [orderList, setOrderList] = useState<any[]>([]);
    const [orderDetail, setOrderDetail] = useState<any[]>([]);
    const [selectedOrderList, setSelectedOrderList] = useState<any>(null);
    const [selectedOrderDetail, setSelectedOrderDetail] = useState<any>(null);

    // 오더(메인) 선택 시 핸들러
    const handleSelectOrderList = (order: any) => {
        setSelectedOrderList(order);
    };

    // 오더 상세(서브) 선택 시 핸들러
    const handleSelectOrderDetail = (detail: any) => {
        setSelectedOrderDetail(detail);
    };

    return (
        <PageContainer>
            {/* 상단 필터바가 필요하다면 여기에 배치 */}

            <MainGrid>
                {/* 상단: 오더 목록 섹션 (가로를 꽉 채워 데이터 가시성 확보) */}
                <TopSection>
                    <OrderList
                        orderList={orderList}
                        setOrderList={setOrderList}
                        selectedOrderList={selectedOrderList}
                        setSelectedOrderList={setSelectedOrderList}
                        handleSelectOrderList={handleSelectOrderList}
                    />
                </TopSection>

                {/* 하단: 오더 상세 정보 섹션 */}
                <BottomSection>
                    <OrderDetail
                        selectedOrderList={selectedOrderList}
                        orderDetail={orderDetail}
                        setOrderDetail={setOrderDetail}
                        selectedOrderDetail={selectedOrderDetail}
                        setSelectedOrderDetail={setSelectedOrderDetail}
                        handleSelectOrderDetail={handleSelectOrderDetail}
                    />
                </BottomSection>
            </MainGrid>
        </PageContainer>
    );
}
