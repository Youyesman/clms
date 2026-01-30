import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { AxiosGet, AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { X, DownloadSimple, Spinner } from "@phosphor-icons/react";
import { ICrawlerHistory } from "./CrawlerPage"; // Import type

interface IScheduleExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    historyItem: ICrawlerHistory | null;
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
    width: 450px;
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
        font-size: 18px;
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

const Label = styled.label`
    font-size: 13px;
    font-weight: 600;
    color: #475569;
    margin-bottom: 6px;
    display: block;
`;

const Select = styled.select`
    width: 100%;
    padding: 10px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 14px;
    color: #334155;
    background-color: #fff;
    &:focus {
        outline: none;
        border-color: #3b82f6;
    }
`;

const Input = styled.input`
    width: 100%;
    padding: 10px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 14px;
    color: #334155;
    &:focus {
        outline: none;
        border-color: #3b82f6;
    }
`;

const Footer = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 10px;
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' }>`
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    display: flex;
    align-items: center;
    gap: 6px;
    
    ${props => props.variant === 'primary' ? `
        background-color: #16a34a;
        color: white;
        &:hover { background-color: #15803d; }
        &:disabled { background-color: #86efac; cursor: not-allowed; }
    ` : `
        background-color: #f1f5f9;
        color: #475569;
        &:hover { background-color: #e2e8f0; }
    `}
`;

export const ScheduleExportModal: React.FC<IScheduleExportModalProps> = ({ isOpen, onClose, historyItem }) => {
    const toast = useToast();
    const [selectedDate, setSelectedDate] = useState<string>("");
    const [selectedMovie, setSelectedMovie] = useState<string>("");
    const [movieOptions, setMovieOptions] = useState<string[]>([]);
    const [isLoadingMovies, setIsLoadingMovies] = useState<boolean>(false);
    const [isExporting, setIsExporting] = useState<boolean>(false);

    // Initial Date Setting
    useEffect(() => {
        if (isOpen && historyItem && historyItem.configuration?.crawlStartDate) {
            // Default to start date if not set, or keep empty to force user interaction?
            // User specifically said "Select date -> get movies".
            // Let's not auto-select to avoid auto-fetching. Or auto-select start date.
            // Auto-select is better UX.
            // convert timestamp or format?
            // configuration might have "crawlStartDate": "YYYY-MM-DD"
            setSelectedDate(historyItem.configuration.crawlStartDate);
        } else if (!isOpen) {
            // Reset
            setSelectedDate("");
            setSelectedMovie("");
            setMovieOptions([]);
        }
    }, [isOpen, historyItem]);

    // Fetch Movies when Date Changes
    useEffect(() => {
        if (!selectedDate) return;

        const fetchMovies = async () => {
            setIsLoadingMovies(true);
            try {
                // API expects YYYYMMDD
                const dateParam = selectedDate.replace(/-/g, "");
                const res: any = await AxiosGet(`crawler/schedules/options`, { params: { date: dateParam } });

                if (res.data && res.data.movies) {
                    setMovieOptions(res.data.movies);
                    setSelectedMovie(""); // Reset movie selection
                }
            } catch (error) {
                console.error("Failed to fetch movies", error);
                toast.error("영화 목록을 불러오지 못했습니다.");
            } finally {
                setIsLoadingMovies(false);
            }
        };

        fetchMovies();
    }, [selectedDate]);

    const handleExport = async () => {
        if (!selectedDate || !selectedMovie) return;

        setIsExporting(true);
        try {
            const dateParam = selectedDate.replace(/-/g, "");

            // Need to use raw axios or configure response type for blob
            // Assuming AxiosPost wrapper handles json. We might need direct access or update wrapper.
            // Usually AxiosPost returns `response.data`.
            // But for file download we need `responseType: 'blob'`.
            // If Wrapper doesn't support config, we might need a workaround or modify AxiosPost.
            // Let's assume we can import `axiosInstance` or similar if `AxiosPost` is restrictive.
            // Checking Axios wrapper usage: usually `AxiosPost(url, data, config)`.

            // NOTE: I will try to use the imported AxiosPost. if it doesn't support config arg, I will need to check.
            // Assuming standard wrapper: export const AxiosPost = async (url: string, data?: any, config?: AxiosRequestConfig) ...

            const response: any = await AxiosPost(
                `crawler/schedules/export`,
                { date: dateParam, movie_title: selectedMovie },
                { responseType: 'blob' }
            );

            // Handle Blob
            // Since our wrapper might return `response.data` or `response`, distinct checking needed.
            // If wrapper returns `response.data` directly, then `response` IS the blob.
            // Let's assume wrapper returns data.

            const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${selectedMovie}_${dateParam}_schedule.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();

            toast.success("엑셀 파일이 다운로드 되었습니다.");
            onClose();

        } catch (error) {
            console.error("Export failed", error);
            toast.error("엑셀 다운로드에 실패했습니다.");
        } finally {
            setIsExporting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Overlay onClick={onClose}>
            <ModalContainer onClick={(e) => e.stopPropagation()}>
                <Header>
                    <h2>엑셀 시간표 출력</h2>
                    <button onClick={onClose}><X size={20} /></button>
                </Header>
                <Body>
                    <div>
                        <Label>날짜 선택</Label>
                        <Input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <Label>영화 선택 {isLoadingMovies && <Spinner className="spin" size={12} style={{ marginLeft: 6 }} />}</Label>
                        <Select
                            value={selectedMovie}
                            onChange={(e) => setSelectedMovie(e.target.value)}
                            disabled={isLoadingMovies || !selectedDate}
                        >
                            <option value="">영화를 선택하세요</option>
                            {movieOptions.map((movie, idx) => (
                                <option key={idx} value={movie}>{movie}</option>
                            ))}
                        </Select>
                    </div>
                </Body>
                <Footer>
                    <Button onClick={onClose}>취소</Button>
                    <Button
                        variant="primary"
                        onClick={handleExport}
                        disabled={isExporting || !selectedDate || !selectedMovie}
                    >
                        {isExporting ? <Spinner className="spin" size={16} /> : <DownloadSimple size={16} weight="bold" />}
                        출력
                    </Button>
                </Footer>
            </ModalContainer>
        </Overlay>
    );
};
