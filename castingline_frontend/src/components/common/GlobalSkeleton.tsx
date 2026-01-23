import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styled from "styled-components";
import { setUpdateLoadingCallback } from "../../axios/Axios";

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
    background: rgba(255, 255, 255, 0.3);
    backdrop-filter: blur(1px);
    z-index: 9998;
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: none; // 클릭 방해 금지 (선택사항)
`;

export const GlobalSkeleton = () => {
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        // Axios 인터셉터로부터 로딩 상태 업데이트 받기
        setUpdateLoadingCallback((loading) => {
            setIsLoading(loading);
        });
    }, []);

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
                        {/* 여기에 추가적인 스켈레톤 애니메이션(shimmer 등)을 넣을 수 있습니다 */}
                    </SkeletonOverlay>
                </>
            )}
        </AnimatePresence>
    );
};
