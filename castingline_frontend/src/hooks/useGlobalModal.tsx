// src/forwarder/hooks/useGlobalModal.tsx
import React, { createContext, useContext, useState } from "react";
import CustomModal from "../components/common/CustomModal";

type ModalOptions = {
    width?: string | number; // ← width 전달 가능
    title?: string;
    /** true면 바깥(배경) 클릭으로 닫히지 않음 — 작업 중 데이터가 날아가면 안 되는 모달용 */
    disableBackdropClose?: boolean;
};

type ModalContextType = {
    openModal: (content: React.ReactNode, options?: ModalOptions) => void;
    closeModal: () => void;
} | null;

const ModalContext = createContext<ModalContextType>(null);

export function GlobalModalProvider({ children }) {
    const [modalContent, setModalContent] = useState<React.ReactNode>(null);
    const [modalOptions, setModalOptions] = useState<ModalOptions>({});

    const openModal = (content: React.ReactNode, options: ModalOptions = {}) => {
        setModalContent(content);
        setModalOptions(options);
    };

    const closeModal = () => {
        setModalContent(null);
        setModalOptions({});
    };

    return (
        <ModalContext.Provider value={{ openModal, closeModal }}>
            {children}

            {modalContent && (
                <CustomModal
                    onClose={closeModal}
                    width={modalOptions.width}
                    title={modalOptions.title}
                    disableBackdropClose={modalOptions.disableBackdropClose}>
                    {modalContent}
                </CustomModal>
            )}
        </ModalContext.Provider>
    );
}

export const useGlobalModal = () => {
    const ctx = useContext(ModalContext);
    if (!ctx) throw new Error("useGlobalModal must be used within GlobalModalProvider");
    return ctx;
};
