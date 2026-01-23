import React from "react";
import styled, { keyframes } from "styled-components";
import { X } from "@phosphor-icons/react";

const scaleIn = keyframes`
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
`;

const Backdrop = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.5); /* Slate 900 기반 반투명 */
    z-index: 2000;
    display: flex;
    justify-content: center;
    align-items: center;
    backdrop-filter: blur(2px); /* 배경 살짝 흐리게 */
`;

/* GNB와 Sidenav를 고려한 포지셔닝 유지 */
const ModalPositioner = styled.div`
    position: fixed;
    top: var(--gnb-height, 60px);
    left: var(--sidenav-width, 0px);
    width: calc(100vw - var(--sidenav-width, 0px));
    height: calc(100vh - var(--gnb-height, 60px));
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: none;
`;

const ModalBox = styled.div<{ $width?: string | number }>`
    background: white;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    animation: ${scaleIn} 0.2s ease-out;
    pointer-events: auto;
    position: relative;
    border-radius: 8px;
    width: ${({ $width }) => ($width ? (typeof $width === "number" ? `${$width}px` : $width) : "500px")};
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid #e2e8f0;
`;

const CloseButton = styled.button`
    position: absolute;
    top: 14px;
    right: 16px;
    padding: 6px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: #64748b;
    z-index: 2100;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;

    &:hover {
        background-color: #f1f5f9;
        color: #0f172a;
    }
`;

interface CustomModalProps {
    children: React.ReactNode;
    onClose: () => void;
    width?: string | number;
    title?: string; // 타이틀 Props 추가
}

export default function CustomModal({ children, onClose, width, title }: CustomModalProps) {
    return (
        <Backdrop onClick={onClose}>
            <ModalPositioner>
                <ModalBox $width={width} onClick={(e) => e.stopPropagation()}>
                    <CloseButton onClick={onClose} title="닫기">
                        <X size={20} weight="bold" />
                    </CloseButton>

                    {/* 타이틀이 있을 경우 헤더 영역 표시 */}
                    {title && (
                        <ModalHeader>
                            <div className="modal-title">{title}</div>
                        </ModalHeader>
                    )}

                    <ModalContent>{children}</ModalContent>
                </ModalBox>
            </ModalPositioner>
        </Backdrop>
    );
}

const ModalHeader = styled.div`
    padding: 24px 30px;
    text-align: center;
    font-family: SUIT;
    font-size: 24px;
    font-weight: 700;
    color: #252b37;
`;

const ModalContent = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 24px;

    &::-webkit-scrollbar {
        width: 6px;
    }
    &::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 10px;
    }
`;
