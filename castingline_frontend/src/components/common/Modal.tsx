import { useEffect, useRef, useState } from "react";
import styled from "styled-components";

interface ModalContentProps {
    $width?: string;
}
const ModalBackground = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
`;

const ModalContainer = styled.div<ModalContentProps>`
    background: white;
    padding: 30px;
    border-radius: 12px;
    width: ${({ $width }) => $width || "400px"};
    max-width: 90%;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    gap: 20px;
    animation: fadeIn 0.3s ease;

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;
const ModalHeader = styled.h3`
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    border-bottom :1px solid rgba(0,0,0,0.1);
    padding-bottom : 10px;
`;

const ModalContent = styled.div`
`

export function Modal({ isOpen, onClose, children, width, title = '' }) {
    const backgroundRef = useRef(null);
    const [mouseDownTarget, setMouseDownTarget] = useState(null);

    const handleMouseDown = (e) => {
        setMouseDownTarget(e.target);
    };

    const handleMouseUp = (e) => {
        if (
            mouseDownTarget === backgroundRef.current &&
            e.target === backgroundRef.current
        ) {
            onClose();
        }
    };
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        if (isOpen) {
            window.addEventListener("keydown", handleKeyDown);
        }

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, onClose]);

    return isOpen ? (
        <ModalBackground
            ref={backgroundRef}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
        >
            <ModalContainer
                $width={width}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
            >
                {title && <ModalHeader>{title}</ModalHeader>}
                <ModalContent>{children}</ModalContent>

            </ModalContainer>
        </ModalBackground>
    ) : null;
}
