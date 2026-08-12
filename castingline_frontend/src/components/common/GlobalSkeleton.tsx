import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styled, { keyframes } from "styled-components";
import { setUpdateLoadingCallback } from "../../axios/Axios";

// 조회가 이 시간보다 오래 걸릴 때만 큰 로딩 표시를 띄운다.
// (바로 뜨는 가벼운 조회에서 화면이 깜빡이는 것을 막기 위함 — L001)
const HEAVY_LOADING_DELAY_MS = 400;

// 화면 상단 얇은 프로그레시브 바
const ProgressBar = styled(motion.div)`
    position: fixed;
    top: 0;
    left: 0;
    height: 3px;
    background: linear-gradient(90deg, #3aa3d3, #67c5bf);
    z-index: 9999;
    box-shadow: 0 0 10px rgba(58, 163, 211, 0.5);
`;

// 화면 전체 반투명 스켈레톤 레이어 (필요 시 노출)
const SkeletonOverlay = styled(motion.div)`
    position: fixed;
    top: 60px; // Topbar 아래부터
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(248, 250, 252, 0.55);
    backdrop-filter: blur(1px);
    z-index: 9998;
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: none; // 클릭 방해 금지 (선택사항)
`;

const spin = keyframes`
    to { transform: rotate(360deg); }
`;

const LoadingCard = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 22px;
    border-radius: 12px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 18px 40px -18px rgba(15, 23, 42, 0.45);
    font-family: "SUIT", "Pretendard", sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: #1e293b;
`;

const Spinner = styled.span`
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 3px solid #dbeafe;
    border-top-color: #2563eb;
    animation: ${spin} 0.7s linear infinite;
`;

export const GlobalSkeleton = () => {
    const [isLoading, setIsLoading] = useState(false);
    // 오래 걸리는 조회에만 붙는 "불러오는 중" 카드
    const [showHeavy, setShowHeavy] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // Axios 인터셉터로부터 로딩 상태 업데이트 받기 (언마운트 시 구독 해제 — L001)
        return setUpdateLoadingCallback((loading) => {
            setIsLoading(loading);
        });
    }, []);

    useEffect(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (!isLoading) {
            setShowHeavy(false);
            return;
        }
        timerRef.current = setTimeout(() => setShowHeavy(true), HEAVY_LOADING_DELAY_MS);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [isLoading]);

    return (
        <AnimatePresence>
            {isLoading && (
                <>
                    <ProgressBar
                        initial={{ width: "0%", opacity: 0 }}
                        animate={{ width: "95%", opacity: 1 }}
                        exit={{ width: "100%", opacity: 0 }}
                        transition={{
                            width: { duration: 10, ease: "linear" }, // 대기 중엔 천천히
                            opacity: { duration: 0.2 }
                        }}
                    />
                    <SkeletonOverlay
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        {showHeavy && (
                            <LoadingCard>
                                <Spinner />
                                데이터를 불러오는 중입니다…
                            </LoadingCard>
                        )}
                    </SkeletonOverlay>
                </>
            )}
        </AnimatePresence>
    );
};
