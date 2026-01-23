// UploadDropzone.tsx
import styled from "styled-components";
import React, { useRef, useState } from "react";

interface Props {
    onFilesAdded: (files: File[]) => void;
}

export default function UploadDropzone({ onFilesAdded }: Props) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFiles = (fileList: FileList | null) => {
        if (!fileList) return;
        onFilesAdded(Array.from(fileList));
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
            e.dataTransfer.clearData();
        }
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
    };

    return (
        <DropzoneContainer
            isDragging={isDragging}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}>
            <InnerBox>
                {!isDragging ? (
                    <>
                        <p style={{ color: "var(--Gray-400)", fontSize: 16 }}>드래그 또는 파일을 선택하여 첨부하세요</p>
                        <ChooseButton>파일 선택하기</ChooseButton>
                    </>
                ) : (
                    <p style={{ color: "#1570EF", fontSize: 16, fontWeight: 600 }}>여기에 파일을 놓으세요</p>
                )}
            </InnerBox>

            <input
                type="file"
                multiple
                style={{ display: "none" }}
                ref={fileInputRef}
                onChange={(e) => handleFiles(e.target.files)}
            />
        </DropzoneContainer>
    );
}

/* ------------ Styled ------------- */

const DropzoneContainer = styled.div<{ isDragging: boolean }>`
    width: 100%;
    height: 120px;
    border-radius: 8px;

    background: ${({ isDragging }) => (isDragging ? "#F5FAFF" : "var(--Gray-50)")};

    border: ${({ isDragging }) => (isDragging ? "none" : "1px solid var(--Gray-300)")};

    outline: ${({ isDragging }) => (isDragging ? "2px dashed #1570ef" : "none")};

    outline-offset: -2px;

    display: flex;
    align-items: center;
    justify-content: center;

    cursor: pointer;

    transition: all 0.15s ease;
`;

const InnerBox = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
`;

const ChooseButton = styled.span`
    color: #1570ef;
    text-decoration: underline;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
`;
