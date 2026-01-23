import styled from "styled-components";
import { XCircleIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface FileItem {
    id: number;
    name: string;
}

interface Props {
    files: FileItem[];
    onDelete: (id: number) => void;
    onAddFiles: (files: File[]) => void;
}

export default function AttachmentList({ files, onDelete, onAddFiles }: Props) {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const openFileDialog = () => {
        inputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            onAddFiles(Array.from(e.target.files));
        }
    };

    // Drag & Drop
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => setIsDragging(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) {
            onAddFiles(Array.from(e.dataTransfer.files));
        }
    };

    const isEmpty = files.length === 0;

    return (
        <Wrapper
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            isDragging={isDragging}
            isEmpty={isEmpty}>
            {isEmpty ? (
                <EmptyBox>
                    <EmptyText>{t("Drag files here or select files to attach")}</EmptyText>

                    <SelectButton onClick={openFileDialog}>{t("Select Files")}</SelectButton>
                    <input
                        type="file"
                        multiple
                        ref={inputRef}
                        style={{ display: "none" }}
                        onChange={handleFileChange}
                    />
                </EmptyBox>
            ) : (
                <>
                    <TopRow>
                        <FileChips>
                            {files.map((file) => (
                                <FileChip key={file.id}>
                                    <span>{file.name}</span>
                                    <XCircleIcon
                                        size={18}
                                        weight="fill"
                                        style={{ cursor: "pointer" }}
                                        onClick={() => onDelete(file.id)}
                                    />
                                </FileChip>
                            ))}
                        </FileChips>

                        <FileSelectSmall onClick={openFileDialog}>{t("Select Files")}</FileSelectSmall>
                        <input
                            type="file"
                            multiple
                            ref={inputRef}
                            style={{ display: "none" }}
                            onChange={handleFileChange}
                        />
                    </TopRow>
                </>
            )}

            {isDragging && <DragOverlay>{t("Drop files here")}</DragOverlay>}
        </Wrapper>
    );
}

/* ====================== Styled =========================== */

const Wrapper = styled.div<{ isDragging: boolean; isEmpty: boolean }>`
    width: 100%;
    border: 1px ${({ isDragging }) => (isDragging ? "dashed var(--Blue-700)" : "solid #d5d7da")};
    border-radius: 8px;
    padding: ${({ isEmpty }) => (isEmpty ? "40px 0" : "12px 16px")};
    background: ${({ isDragging, isEmpty }) => (isDragging ? "#eef4ff" : isEmpty ? "rgba(242, 242, 242, 1)" : "white")};
    position: relative;
    text-align: center;
    transition: border 0.15s ease, background 0.15s ease;
    min-height: 100px;
`;

const EmptyBox = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
`;

const EmptyText = styled.div`
    color: #757575;
    font-size: 14px;
`;

const SelectButton = styled.div`
    color: var(--Blue-700);
    font-size: 14px;
    cursor: pointer;

    &:hover {
        text-decoration: underline;
    }
`;

const TopRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const FileChips = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    text-align: left;
`;

const FileChip = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;

    padding: 6px 12px;
    background: #f2f3f5;
    border-radius: 20px;

    font-size: 13px;
    font-weight: 500;
    color: #333;
`;

const FileSelectSmall = styled.div`
    white-space: nowrap;
    font-size: 14px;
    font-weight: 500;
    color: var(--Blue-700);
    cursor: pointer;
    text-align: center;
    vertical-align: middle;

    &:hover {
        text-decoration: underline;
    }
`;

const DragOverlay = styled.div`
    position: absolute;
    inset: 0;
    background: var(--Blue-50);
    border-radius: 8px;

    display: flex;
    justify-content: center;
    align-items: center;

    font-size: 15px;
    font-weight: 600;
    color: var(--Blue-700);

    pointer-events: none;
`;
