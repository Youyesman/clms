// src/forwarder/hooks/useGlobalModal.tsx
import React, { createContext, useContext, useState } from "react";
import CustomModal from "../components/common/CustomModal";

type ModalOptions = {
    width?: string | number; // ← width 전달 가능
    title?: string;
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
                <CustomModal onClose={closeModal} width={modalOptions.width} title={modalOptions.title}>
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
