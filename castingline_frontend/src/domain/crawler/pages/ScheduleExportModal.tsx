import React, { useState } from "react";
import styled from "styled-components";
import { AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { X, DownloadSimple, Spinner } from "@phosphor-icons/react";
import { CustomCheckbox } from "../../../components/common/CustomCheckbox";

interface CrawlTarget {
    id: number;
    title: string;
    clean_title?: string;
    movie_type: "main" | "competitor";
    is_active: boolean;
}

interface ScheduleExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    startDate: string;
    endDate: string;
    mainMovies: CrawlTarget[];
}

const Overlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
`;

const ModalContainer = styled.div`
    background-color: white;
    padding: 24px;
    border-radius: 12px;
    width: 420px;
    max-width: 90%;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    gap: 20px;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;

    h2 {
        font-size: 16px;
        font-weight: 700;
        color: #1e293b;
        margin: 0;
    }

    button {
        background: none;
        border: none;
        cursor: pointer;
        color: #64748b;
        &:hover { color: #334155; }
    }
`;

const Body = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const SectionLabel = styled.div`
    font-size: 12px;
    font-weight: 700;
    color: #64748b;
    margin-bottom: 6px;
`;

const DateRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const DateInput = styled.input`
    flex: 1;
    padding: 8px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 13px;
    font-family: "SUIT", sans-serif;
    color: #334155;
    &:focus {
        outline: none;
        border-color: #3b82f6;
    }
`;

const MovieList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const MovieItem = styled.button<{ $selected: boolean }>`
    display: flex;
    align-items: center;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid ${({ $selected }) => ($selected ? "#2563eb" : "#e2e8f0")};
    border-radius: 6px;
    background: ${({ $selected }) => ($selected ? "#eff6ff" : "#fff")};
    cursor: pointer;
    font-size: 13px;
    font-weight: ${({ $selected }) => ($selected ? 600 : 500)};
    color: ${({ $selected }) => ($selected ? "#1d4ed8" : "#334155")};
    font-family: "SUIT", sans-serif;
    transition: all 0.15s;

    &:hover {
        border-color: #93c5fd;
        background: #f0f7ff;
    }
`;

const BrandRow = styled.div`
    display: flex;
    gap: 16px;
    align-items: center;
`;

const Footer = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
`;

const Button = styled.button<{ $variant?: "primary" | "secondary" }>`
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: "SUIT", sans-serif;

    ${(props) =>
        props.$variant === "primary"
            ? `
        background-color: #16a34a;
        color: white;
        &:hover { background-color: #15803d; }
        &:disabled { background-color: #86efac; cursor: not-allowed; }
    `
            : `
        background-color: #f1f5f9;
        color: #475569;
        &:hover { background-color: #e2e8f0; }
    `}
`;

export const ScheduleExportModal: React.FC<ScheduleExportModalProps> = ({
    isOpen,
    onClose,
    startDate,
    endDate,
    mainMovies,
}) => {
    const toast = useToast();
    const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);
    const [brandFilter, setBrandFilter] = useState({ cgv: true, lotte: true, mega: true });
    const [exportStartDate, setExportStartDate] = useState(startDate);
    const [exportEndDate, setExportEndDate] = useState(endDate || startDate);
    const [isExporting, setIsExporting] = useState(false);

    // props 변경 시 날짜 동기화
    React.useEffect(() => {
        if (isOpen) {
            setExportStartDate(startDate);
            setExportEndDate(endDate || startDate);
        }
    }, [isOpen, startDate, endDate]);

    if (!isOpen) return null;

    const selectedMovie = mainMovies.find((m) => m.id === selectedMovieId) || (mainMovies.length === 1 ? mainMovies[0] : null);

    const handleExport = async () => {
        if (!selectedMovie) {
            toast.warning("영화를 선택해주세요.");
            return;
        }

        const brands: string[] = [];
        if (brandFilter.cgv) brands.push("CGV");
        if (brandFilter.lotte) brands.push("LOTTE");
        if (brandFilter.mega) brands.push("MEGABOX");

        if (brands.length === 0) {
            toast.warning("계열사를 하나 이상 선택해주세요.");
            return;
        }

        setIsExporting(true);
        try {
            toast.success("엑셀 생성 중... 잠시만 기다려주세요.");
            const response: any = await AxiosPost(
                "crawler/schedules/export",
                {
                    start_date: exportStartDate,
                    end_date: exportEndDate,
                    movie_title: selectedMovie.clean_title || selectedMovie.title,
                    brands: brands.length < 3 ? brands : undefined,
                },
                { responseType: "blob" }
            );

            const blob = new Blob([response.data], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;

            const contentDisposition = response.headers?.["content-disposition"];
            let filename = `${selectedMovie.title}_schedule.xlsx`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/);
                if (match?.[1]) filename = match[1];
            }

            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success("엑셀 파일이 다운로드 되었습니다.");
            onClose();
        } catch (error: any) {
            console.error(error);
            toast.error("다운로드 실패: " + (error.response?.data?.error || "데이터가 없거나 오류가 발생했습니다."));
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Overlay onClick={onClose}>
            <ModalContainer onClick={(e) => e.stopPropagation()}>
                <Header>
                    <h2>엑셀 다운로드</h2>
                    <button onClick={onClose}>
                        <X size={20} />
                    </button>
                </Header>
                <Body>
                    <div>
                        <SectionLabel>조회 기간</SectionLabel>
                        <DateRow>
                            <DateInput type="date" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} />
                            <span style={{ color: "#94a3b8", fontSize: 13 }}>~</span>
                            <DateInput type="date" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} />
                        </DateRow>
                    </div>

                    <div>
                        <SectionLabel>주요작 선택</SectionLabel>
                        <MovieList>
                            {mainMovies.map((m) => (
                                <MovieItem
                                    key={m.id}
                                    $selected={selectedMovie?.id === m.id}
                                    onClick={() => setSelectedMovieId(m.id)}
                                >
                                    {m.title}
                                </MovieItem>
                            ))}
                        </MovieList>
                    </div>

                    <div>
                        <SectionLabel>계열사 선택</SectionLabel>
                        <BrandRow>
                            <CustomCheckbox label="CGV" checked={brandFilter.cgv} onChange={() => setBrandFilter((p) => ({ ...p, cgv: !p.cgv }))} />
                            <CustomCheckbox label="Lotte" checked={brandFilter.lotte} onChange={() => setBrandFilter((p) => ({ ...p, lotte: !p.lotte }))} />
                            <CustomCheckbox label="Megabox" checked={brandFilter.mega} onChange={() => setBrandFilter((p) => ({ ...p, mega: !p.mega }))} />
                        </BrandRow>
                    </div>
                </Body>
                <Footer>
                    <Button onClick={onClose}>취소</Button>
                    <Button $variant="primary" onClick={handleExport} disabled={isExporting || !selectedMovie}>
                        {isExporting ? <Spinner className="spin" size={16} /> : <DownloadSimple size={16} weight="bold" />}
                        다운로드
                    </Button>
                </Footer>
            </ModalContainer>
        </Overlay>
    );
};
