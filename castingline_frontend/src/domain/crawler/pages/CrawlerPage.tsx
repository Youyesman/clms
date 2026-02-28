import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { useToast } from "../../../components/common/CustomToast";
import { AxiosPost, AxiosGet, AxiosPatch, AxiosDelete, BASE_URL } from "../../../axios/Axios";
import { CustomButton } from "../../../components/common/CustomButton";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomCheckbox } from "../../../components/common/CustomCheckbox";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { GenericTable } from "../../../components/GenericTable";
import { Play, DownloadSimple, CircleNotch, CheckCircle, WarningCircle, StopCircleIcon, FileXls, Gear, Lightning, FilmStrip } from "@phosphor-icons/react";
import { ScheduleExportModal } from "./ScheduleExportModal";
import { useAppAlert } from "../../../atom/alertUtils";

// --- Types ---
interface IChoiceCompany {
    cgv: boolean;
    mega: boolean;
    lotte: boolean;
}

interface ICrawlerConfig {
    crawlStartDate: string;
    crawlEndDate: string;
    choiceCompany: IChoiceCompany;
}

export interface ICrawlerHistory {
    id: number;
    created_at: string;
    finished_at: string | null;
    status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
    trigger_type: 'MANUAL' | 'SCHEDULED' | 'TRANSFORM';
    configuration: any;
    result_summary: any;
    error_message: string | null;
    excel_file_path: string | null;
}

interface CrawlTarget {
    id: number;
    title: string;
    clean_title: string;
    movie_type: 'main' | 'competitor';
    is_active: boolean;
    created_at: string;
}

// --- Styled Components (System Design) ---
const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    background-color: #f8fafc;
    min-height: 100vh;
    font-family: "SUIT", sans-serif;
`;

const ContentGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
`;

const DetailContainer = styled.div`
    width: 100%;
    background-color: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
    overflow: hidden;
`;

const CompactConfigBar = styled.div`
    padding: 16px 24px;
    display: flex;
    align-items: flex-end;
    gap: 24px;
    flex-wrap: wrap;
    background-color: #fff;
    border-top: 1px solid #f1f5f9;
`;

const ConfigItem = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const StyledInputContainer = styled.div`
    height: 32px;
    display: flex;
    align-items: center;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    background: #fff;
    overflow: hidden;
    transition: all 0.2s ease;
    
    &:focus-within {
        outline: 1px solid #0f172a;
        outline-offset: -1px;
    }
`;

const StyledLabelBox = styled.div`
    height: 100%;
    padding: 0 12px;
    background: #f1f5f9;
    border-right: 1px solid #cbd5e1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: #475569;
    white-space: nowrap;
`;

const StyledContentBox = styled.div`
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 16px;
    height: 100%;
`;

const StatusBadge = styled.span<{ status: string }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 600;

    ${({ status }) => {
        if (status === 'SUCCESS') return `background-color: #dcfce7; color: #15803d; border: 1px solid #bbf7d0;`;
        if (status === 'SUCCESS_PARTIAL') return `background-color: #fef3c7; color: #d97706; border: 1px solid #fde68a;`;
        if (status === 'FAILED') return `background-color: #fee2e2; color: #b91c1c; border: 1px solid #fecaca;`;
        if (status === 'RUNNING') return `background-color: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe;`;
        return `background-color: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0;`;
    }}
`;

// --- Settings Modal ---
const SettingsModalOverlay = styled.div`
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
`;

const SettingsModalContent = styled.div`
    background: white;
    padding: 24px;
    border-radius: 8px;
    width: 400px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
`;

const ModalHeader = styled.h3`
    font-size: 18px;
    font-weight: 700;
    color: #1e293b;
    margin: 0;
`;

const ModalActions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
`;

const SubSectionHeader = styled.div`
    padding: 10px 24px;
    border-top: 1px solid #e2e8f0;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    font-weight: 700;
    color: #374151;
    letter-spacing: 0.2px;
`;

// --- Crawl Target Styled Components ---
const TargetFormSection = styled.div`
    padding: 12px 24px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #fff;
`;

const TargetFormRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
`;

const TypeToggleGroup = styled.div`
    display: flex;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    overflow: hidden;
    flex-shrink: 0;
`;

const TypeToggleBtn = styled.button<{ $active: boolean }>`
    height: 32px;
    padding: 0 14px;
    border: none;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: "SUIT", sans-serif;
    background: ${(p) => (p.$active ? "#1e293b" : "#fff")};
    color: ${(p) => (p.$active ? "#fff" : "#64748b")};
    transition: all 0.15s;
`;




const TargetInput = styled.input`
    flex: 1;
    height: 32px;
    padding: 0 12px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
    font-family: "SUIT", sans-serif;
    &:focus { border-color: #3b82f6; }
`;

const TargetAddBtn = styled.button`
    height: 32px;
    padding: 0 16px;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    font-family: "SUIT", sans-serif;
    &:disabled { background: #cbd5e1; cursor: default; }
`;

const TargetCountBar = styled.div`
    padding: 8px 24px 10px;
    font-size: 12px;
    color: #64748b;
    display: flex;
    align-items: center;
    gap: 4px;
    strong { color: #1e293b; font-weight: 700; }
    .sep { color: #cbd5e1; margin: 0 6px; }
`;

const TargetEmptyMsg = styled.div`
    padding: 28px;
    text-align: center;
    color: #94a3b8;
    font-size: 13px;
    margin: 0 24px 16px;
    border: 1px dashed #e2e8f0;
    border-radius: 6px;
`;

const TargetTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-family: "SUIT", sans-serif;

    tbody tr {
        transition: background-color 0.1s ease;
    }
    tbody tr:hover {
        background-color: #f8fafc;
    }
    tbody tr:last-child td {
        border-bottom: none;
    }
`;

const TargetTh = styled.th`
    padding: 9px 14px;
    text-align: left;
    background: #f1f5f9;
    border-bottom: 2px solid #e2e8f0;
    font-weight: 700;
    color: #6b7280;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
`;

const TargetTd = styled.td`
    padding: 10px 14px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
    color: #374151;
`;

const TargetToggle = styled.button<{ $active: boolean }>`
    padding: 3px 10px;
    border-radius: 20px;
    border: 1px solid ${(p) => (p.$active ? "#bbf7d0" : "#e5e7eb")};
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    font-family: "SUIT", sans-serif;
    background: ${(p) => (p.$active ? "#dcfce7" : "#f9fafb")};
    color: ${(p) => (p.$active ? "#15803d" : "#9ca3af")};
    transition: all 0.15s;
    &:hover {
        background: ${(p) => (p.$active ? "#bbf7d0" : "#f1f5f9")};
        border-color: ${(p) => (p.$active ? "#86efac" : "#d1d5db")};
    }
`;

const TargetDeleteBtn = styled.button`
    padding: 3px 10px;
    border: 1px solid #e5e7eb;
    background: #fff;
    color: #9ca3af;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    font-family: "SUIT", sans-serif;
    transition: all 0.15s;
    &:hover {
        background: #fef2f2;
        border-color: #fca5a5;
        color: #ef4444;
    }
`;

const TargetInfoBox = styled.div`
    margin: 4px 24px 16px;
    padding: 10px 14px;
    background: #f8fafc;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    font-size: 11.5px;
    color: #6b7280;
    line-height: 1.6;
    code {
        background: #e0f2fe;
        padding: 1px 5px;
        border-radius: 3px;
        font-size: 11px;
        color: #0369a1;
        font-family: monospace;
    }
`;

const JsonInputArea = styled.textarea`
    flex: 1;
    min-height: 80px;
    padding: 10px 12px;
    border: 1px solid #3b82f6;
    border-radius: 4px;
    font-size: 12px;
    font-family: monospace;
    color: #1e293b;
    resize: vertical;
    outline: none;
    background: #f8fafc;
    line-height: 1.5;
    &:focus { border-color: #2563eb; background: #fff; }
`;

const JsonToggleBtn = styled.button<{ $active: boolean }>`
    height: 32px;
    padding: 0 12px;
    border: 1px solid ${(p) => (p.$active ? "#3b82f6" : "#cbd5e1")};
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: "SUIT", sans-serif;
    background: ${(p) => (p.$active ? "#eff6ff" : "#fff")};
    color: ${(p) => (p.$active ? "#3b82f6" : "#64748b")};
    white-space: nowrap;
    transition: all 0.15s;
    &:hover { border-color: #3b82f6; color: #3b82f6; }
`;

// --- Initial State ---
const getTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
};

const getThreeDaysAfter = () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
};

const INITIAL_CONFIG: ICrawlerConfig = {
    crawlStartDate: getTomorrow(),
    crawlEndDate: getThreeDaysAfter(),
    choiceCompany: {
        cgv: true,
        mega: true,
        lotte: true
    }
};

export const CrawlerPage = () => {
    const toast = useToast();
    const { showAlert } = useAppAlert();

    const [config, setConfig] = useState<ICrawlerConfig>(INITIAL_CONFIG);
    const [history, setHistory] = useState<ICrawlerHistory[]>([]);

    // Export Modal State
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportTargetHistory, setExportTargetHistory] = useState<ICrawlerHistory | null>(null);

    // Quick Download Settings State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [quickMovieTitle, setQuickMovieTitle] = useState("");

    // Crawl Target State
    const [targets, setTargets] = useState<CrawlTarget[]>([]);
    const [targetInput, setTargetInput] = useState("");
    const [targetMovieType, setTargetMovieType] = useState<'main' | 'competitor'>('main');
    const [targetLoading, setTargetLoading] = useState(false);
    const [showJsonInput, setShowJsonInput] = useState(false);
    const [jsonInput, setJsonInput] = useState("");

    // Pagination State
    const [page, setPage] = useState(1);
    const pageSize = 10;

    useEffect(() => {
        const saved = localStorage.getItem("quickDownloadMovieTitle");
        if (saved) setQuickMovieTitle(saved);
    }, []);

    const saveSettings = () => {
        localStorage.setItem("quickDownloadMovieTitle", quickMovieTitle);
        setIsSettingsOpen(false);
        toast.success("설정이 저장되었습니다.");
    };

    // -- Crawl Targets --
    const fetchTargets = async () => {
        try {
            const res = await AxiosGet("crawler/targets/");
            setTargets(res.data);
        } catch {
            toast.error("대상 영화 목록 불러오기 실패");
        }
    };

    const handleAddTarget = async () => {
        const title = targetInput.trim();
        if (!title) return;
        setTargetLoading(true);
        try {
            await AxiosPost("crawler/targets", {
                title,
                movie_type: targetMovieType,
            });
            setTargetInput("");
            await fetchTargets();
            toast.success(`'${title}' 추가 완료`);
        } catch {
            toast.error("추가 실패");
        } finally {
            setTargetLoading(false);
        }
    };

    const handleBulkAddFromJson = async () => {
        let parsed: any;
        try {
            const cleaned = jsonInput
                .trim()
                .replace(/,(\s*[}\]])/g, '$1')  // 객체/배열 내 trailing comma 제거
                .replace(/,\s*$/, '');           // 맨 끝 trailing comma 제거
            parsed = JSON.parse(cleaned);
        } catch {
            toast.error("JSON 파싱 오류. 형식을 확인해주세요.");
            return;
        }

        const mainMovies: string[] = [];
        const rivalMovies: string[] = [];

        if (parsed.movieName) {
            const val = parsed.movieName;
            if (Array.isArray(val)) mainMovies.push(...val.filter(Boolean));
            else if (typeof val === 'string' && val.trim()) mainMovies.push(val.trim());
        }
        if (parsed.rivalMovieNames) {
            const val = parsed.rivalMovieNames;
            if (Array.isArray(val)) rivalMovies.push(...val.filter(Boolean));
            else if (typeof val === 'string' && val.trim()) rivalMovies.push(val.trim());
        }

        if (mainMovies.length === 0 && rivalMovies.length === 0) {
            toast.error("추가할 영화가 없습니다. movieName 또는 rivalMovieNames 키를 확인하세요.");
            return;
        }

        setTargetLoading(true);
        try {
            for (const title of mainMovies) {
                await AxiosPost("crawler/targets", {
                    title,
                    movie_type: 'main',
                });
            }
            for (const title of rivalMovies) {
                await AxiosPost("crawler/targets", {
                    title,
                    movie_type: 'competitor',
                });
            }
            await fetchTargets();
            setJsonInput("");
            setShowJsonInput(false);
            toast.success(`주영화 ${mainMovies.length}편, 경쟁작 ${rivalMovies.length}편 추가 완료`);
        } catch {
            toast.error("일부 추가 실패. 중복 항목을 확인하세요.");
            await fetchTargets();
        } finally {
            setTargetLoading(false);
        }
    };

    const handleToggleTarget = async (id: number) => {
        try {
            await AxiosPatch(`crawler/targets`, {}, id);
            setTargets((prev) =>
                prev.map((t) => (t.id === id ? { ...t, is_active: !t.is_active } : t))
            );
        } catch {
            toast.error("상태 변경 실패");
        }
    };

    const handleDeleteTarget = (id: number, title: string) => {
        showAlert(
            "대상 영화 삭제",
            `'${title}' 을(를) 삭제하시겠습니까?`,
            "warning",
            async () => {
                try {
                    await AxiosDelete("crawler/targets", id);
                    setTargets((prev) => prev.filter((t) => t.id !== id));
                    toast.success("삭제 완료");
                } catch {
                    toast.error("삭제 실패");
                }
            },
            true
        );
    };

    // -- Polling History --
    const fetchHistory = async () => {
        try {
            const res = await AxiosGet("crawler/history");
            setHistory(res.data);
        } catch (e) {
            console.error("Failed to fetch history", e);
        }
    };

    useEffect(() => {
        fetchTargets();
        fetchHistory();
        const interval = setInterval(fetchHistory, 5000);
        return () => clearInterval(interval);
    }, []);

    // -- Handlers --
    const handleConfigChange = (field: keyof ICrawlerConfig, value: any) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    const handleCompanyChange = (company: keyof IChoiceCompany) => {
        setConfig(prev => ({
            ...prev,
            choiceCompany: { ...prev.choiceCompany, [company]: !prev.choiceCompany[company] }
        }));
    };

    const handleRun = async () => {
        try {
            if (!config.crawlStartDate || !config.crawlEndDate) {
                toast.error("날짜를 선택해주세요.");
                return;
            }
            await AxiosPost("crawler/run", config);
            toast.success("크롤러가 실행되었습니다.");
            fetchHistory();
        } catch (error: any) {
            console.error(error);
            const msg = error.response?.data?.error || error.message || "오류가 발생했습니다.";
            toast.error(`실패: ${msg}`);
        }
    };

    const handleDownload = (item: ICrawlerHistory) => {
        const token = localStorage.getItem("token");
        fetch(`${BASE_URL}/crawler/download/${item.id}`, {
            headers: { 'Authorization': `token ${token}` }
        })
            .then(response => {
                if (!response.ok) throw new Error("Download failed");
                return response.blob();
            })
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;

                // Determine extension
                let ext = ".xlsx";
                if (item.excel_file_path && item.excel_file_path.endsWith(".txt")) {
                    ext = ".txt";
                }

                a.download = `crawler_log_${item.id}${ext}`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            })
            .catch(err => toast.error("다운로드 실패: " + err.message));
    };

    const handleStop = (historyId: number) => {
        showAlert(
            "크롤링 중단",
            "진행 중인 크롤링 작업을 중단하시겠습니까?",
            "warning",
            async () => {
                try {
                    await AxiosPost(`crawler/stop/${historyId}`, {});
                    toast.success("중단 요청되었습니다.");
                    fetchHistory();
                } catch (error: any) {
                    const msg = error.response?.data?.error || error.message || "오류가 발생했습니다.";
                    toast.error(`중단 실패: ${msg}`);
                }
            },
            true
        );
    };

    const formatDateTime = (isoString: string | null) => {
        if (!isoString) return "-";
        const d = new Date(isoString);
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const handleTransform = (historyId: number) => {
        showAlert(
            "스케줄 생성",
            "선택한 이력을 기반으로 스케줄을 생성하시겠습니까?\n기존 데이터가 있다면 덮어쓰거나 무시될 수 있습니다.",
            "warning",
            async () => {
                try {
                    await AxiosPost(`crawler/transform/${historyId}`, {});
                    toast.success("스케줄 생성 작업이 시작되었습니다. 실행 이력에서 진행 상태를 확인할 수 있습니다.");
                    fetchHistory();
                } catch (error: any) {
                    const msg = error.response?.data?.error || error.message || "오류가 발생했습니다.";
                    toast.error(`스케줄 생성 실패: ${msg}`);
                }
            },
            true
        );
    };

    const handleOpenExportModal = (item: ICrawlerHistory) => {
        setExportTargetHistory(item);
        setIsExportModalOpen(true);
    };

    const handleQuickDownload = async () => {
        if (!quickMovieTitle) {
            toast.error("설정에서 영화 제목을 먼저 입력해주세요.");
            setIsSettingsOpen(true);
            return;
        }

        const d = new Date();
        d.setDate(d.getDate() + 1);
        const startDate = d.toISOString().split('T')[0];

        const d2 = new Date();
        d2.setDate(d2.getDate() + 3); // Tomorrow + 2 days = 3 days total range (Start is +1, End is +3) -> +1, +2, +3
        const endDate = d2.toISOString().split('T')[0];

        try {
            toast.success("엑셀 생성을 요청했습니다. 잠시만 기다려주세요...");
            const response = await AxiosPost("crawler/schedules/export", {
                start_date: startDate,
                end_date: endDate,
                movie_title: quickMovieTitle
            }, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;

            // Extract filename if possible, else default
            const contentDisposition = response.headers['content-disposition'];
            let filename = `schedule_quick_${startDate}.xlsx`;
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                if (fileNameMatch && fileNameMatch.length === 2)
                    filename = fileNameMatch[1];
            }

            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();

        } catch (error: any) {
            console.error(error);
            toast.error("다운로드 실패: " + (error.response?.data?.error || "데이터가 없거나 오류가 발생했습니다."));
        }
    };

    const formatDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return m > 0 ? `${m}분 ${s}초` : `${s}초`;
    };

    // --- Table Configuration ---
    const headers = [
        {
            key: "id",
            label: "번호",
            width: "60px",
            renderCell: (val: number) => <span style={{ color: '#94a3b8' }}>#{val}</span>
        },
        {
            key: "trigger_type",
            label: "실행",
            width: "60px",
            renderCell: (val: string) => {
                const isAuto = val === 'SCHEDULED';
                return (
                    <span style={{
                        fontSize: '11px',
                        fontWeight: 'bold',
                        color: isAuto ? '#f59e0b' : '#3b82f6', // Orange for Auto, Blue for Manual
                    }}>
                        {isAuto ? '자동' : '수동'}
                    </span>
                );
            }
        },
        {
            key: "job_type", // Virtual column for Job Type
            label: "작업",
            width: "80px",
            renderCell: (_: any, item: ICrawlerHistory) => {
                const isTransform = item.trigger_type === 'TRANSFORM';
                return (
                    <span style={{
                        fontSize: '11px',
                        fontWeight: 'bold',
                        color: isTransform ? '#8b5cf6' : '#10b981', // Purple for Transform, Green for Crawl
                    }}>
                        {isTransform ? '스케줄 변환' : '크롤링'}
                    </span>
                );
            }
        },
        {
            key: "configuration", // [NEW] Target Companies
            label: "수집 대상",
            width: "120px",
            renderCell: (val: any) => {
                if (!val || !val.choiceCompany) return "-";
                const targets: string[] = [];
                if (val.choiceCompany.cgv) targets.push("CGV");
                if (val.choiceCompany.lotte) targets.push("Lotte");
                if (val.choiceCompany.mega) targets.push("Mega");
                return (
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {targets.map(t => (
                            <span key={t} style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #e2e8f0',
                                fontWeight: 600
                            }}>{t}</span>
                        ))}
                    </div>
                );
            }
        },
        {
            key: "created_at",
            label: "시작 시간",
            renderCell: (val: string) => formatDateTime(val)
        },
        {
            key: "finished_at",
            label: "종료 시간",
            renderCell: (val: string | null) => val ? formatDateTime(val) : "-"
        },
        {
            key: "duration", // [NEW] Duration Column
            label: "소요 시간",
            width: "100px",
            renderCell: (_: any, item: ICrawlerHistory) => {
                if (!item.finished_at) return "-";
                const diff = (new Date(item.finished_at).getTime() - new Date(item.created_at).getTime()) / 1000;
                return <span style={{ color: '#64748b', fontSize: '12px' }}>{formatDuration(diff)}</span>;
            }
        },
        {
            key: "status",
            label: "결과",
            width: "120px",
            renderCell: (val: string, item: ICrawlerHistory) => {
                const totalFailures = item.result_summary?.total_failures ?? 0;
                const isPartial = val === 'SUCCESS' && totalFailures > 0;
                const displayStatus = isPartial ? 'SUCCESS_PARTIAL' : val;
                return (
                    <StatusBadge status={displayStatus} title={isPartial ? `${totalFailures}개 극장/날짜 수집 실패` : undefined}>
                        {val === 'RUNNING' && <CircleNotch className="spin" size={12} />}
                        {val === 'SUCCESS' && !isPartial && <CheckCircle size={12} weight="fill" />}
                        {(val === 'FAILED' || isPartial) && <WarningCircle size={12} weight="fill" />}
                        {isPartial
                            ? `성공 (${totalFailures}건 실패)`
                            : val === 'SUCCESS' ? '성공'
                            : val === 'FAILED' ? '오류'
                            : val === 'RUNNING' ? '진행중' : '대기'}
                    </StatusBadge>
                );
            }
        },
        {
            key: "logs",
            label: "로그 / 작업", // Renamed for clarity
            width: "200px", // Increased width
            renderCell: (_: any, item: ICrawlerHistory) => (
                item.status === 'SUCCESS' ? (
                    item.trigger_type === 'TRANSFORM' ? (
                        <button
                            onClick={() => handleOpenExportModal(item)}
                            style={{
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: '#16a34a', // Green
                                fontSize: '11px',
                                fontWeight: 600
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dcfce7'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                        >
                            <FileXls size={14} weight="fill" />
                            엑셀 시간표
                        </button>
                    ) : (
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                                onClick={() => handleDownload(item)}
                                style={{
                                    background: 'none',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: '#475569',
                                    fontSize: '11px',
                                    fontWeight: 500
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <DownloadSimple size={14} />
                                다운로드
                            </button>
                            <button
                                onClick={() => handleTransform(item.id)}
                                style={{
                                    background: '#f0f9ff',
                                    border: '1px solid #bae6fd',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: '#0284c7',
                                    fontSize: '11px',
                                    fontWeight: 600
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e0f2fe'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f0f9ff'}
                            >
                                <Play size={14} weight="fill" />
                                스케줄 생성
                            </button>
                        </div>
                    )
                ) : (item.status === 'RUNNING' || item.status === 'PENDING') ? (
                    <button
                        onClick={() => handleStop(item.id)}
                        style={{
                            background: '#fff1f2',
                            border: '1px solid #fecaca',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: '#e11d48',
                            fontSize: '11px',
                            fontWeight: 600
                        }}
                    >
                        <StopCircleIcon size={14} />
                        중단
                    </button>
                ) : item.status === 'FAILED' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: '#ef4444' }}>{item.error_message?.slice(0, 10)}...</span>
                        {item.excel_file_path && (
                            <button
                                onClick={() => handleDownload(item)}
                                style={{
                                    background: '#fff1f2',
                                    border: '1px solid #fecaca',
                                    borderRadius: '6px',
                                    padding: '2px 6px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                    color: '#e11d48',
                                    fontSize: '10px',
                                    fontWeight: 500
                                }}
                            >
                                <DownloadSimple size={12} />
                                로그
                            </button>
                        )}
                    </div>
                ) : "-"
            )
        }
    ];

    return (
        <PageContainer>
            <ContentGrid>
                {/* [상단] 실행 설정 */}
                <DetailContainer>
                    <CommonListHeader
                        title="크롤러 관리"
                        subtitle={null}
                    />
                    <CompactConfigBar>
                        <ConfigItem>
                            <CustomInput
                                leftLabel="시작일"
                                inputType="date"
                                value={config.crawlStartDate}
                                setValue={(v) => handleConfigChange('crawlStartDate', v)}
                                style={{ width: '260px' }}
                            />
                        </ConfigItem>

                        <ConfigItem>
                            <CustomInput
                                leftLabel="종료일"
                                inputType="date"
                                value={config.crawlEndDate}
                                setValue={(v) => handleConfigChange('crawlEndDate', v)}
                                style={{ width: '260px' }}
                            />
                        </ConfigItem>

                        <ConfigItem>
                            <StyledInputContainer>
                                <StyledLabelBox>수집 대상</StyledLabelBox>
                                <StyledContentBox>
                                    <CustomCheckbox label="CGV" checked={config.choiceCompany.cgv} onChange={() => handleCompanyChange('cgv')} />
                                    <CustomCheckbox label="Lotte" checked={config.choiceCompany.lotte} onChange={() => handleCompanyChange('lotte')} />
                                    <CustomCheckbox label="Megabox" checked={config.choiceCompany.mega} onChange={() => handleCompanyChange('mega')} />
                                </StyledContentBox>
                            </StyledInputContainer>
                        </ConfigItem>

                        <div style={{ flex: 1 }}></div>

                        {/* Quick Download & Settings */}
                        <CustomButton
                            onClick={() => setIsSettingsOpen(true)}
                            size="sm"
                            color="gray"
                            style={{ padding: '0 10px' }}
                            title="빠른 다운로드 설정"
                        >
                            <Gear size={16} />
                        </CustomButton>

                        <CustomButton
                            onClick={handleQuickDownload}
                            size="sm"
                            color="blue"
                            style={{ padding: '0 12px', minWidth: '160px' }}
                        >
                            <Lightning size={16} weight="fill" style={{ marginRight: '4px' }} />
                            빠른 다운로드 (3일)
                        </CustomButton>

                        <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 8px' }}></div>

                        <CustomButton onClick={handleRun} size="sm" style={{ padding: '0 20px', fontSize: '13px', fontWeight: 600 }}>
                            <Play size={16} weight="fill" style={{ marginRight: '6px' }} /> 크롤링 시작
                        </CustomButton>
                    </CompactConfigBar>

                    <SubSectionHeader>
                        <FilmStrip size={14} weight="fill" color="#6b7280" style={{ flexShrink: 0 }} />
                        크롤 대상 영화
                        <span style={{ fontSize: 11.5, fontWeight: 400, color: '#9ca3af', marginLeft: 2 }}>
                            — 영화 추가 시 위 수집 설정(극장·기간)이 함께 적용됩니다
                        </span>
                    </SubSectionHeader>
                    <TargetFormSection>
                        <TargetFormRow>
                            <FilmStrip size={18} color="#3b82f6" style={{ flexShrink: 0 }} />
                            <TargetInput
                                placeholder="영화 제목 입력 (예: 아바타: 불의 재)"
                                value={targetInput}
                                onChange={(e) => setTargetInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAddTarget()}
                                style={{ minWidth: 220 }}
                            />
                            <TypeToggleGroup>
                                <TypeToggleBtn
                                    $active={targetMovieType === 'main'}
                                    onClick={() => setTargetMovieType('main')}
                                >주영화</TypeToggleBtn>
                                <TypeToggleBtn
                                    $active={targetMovieType === 'competitor'}
                                    onClick={() => setTargetMovieType('competitor')}
                                >경쟁작</TypeToggleBtn>
                            </TypeToggleGroup>
                            <JsonToggleBtn
                                $active={showJsonInput}
                                onClick={() => setShowJsonInput((v) => !v)}
                                title="JSON 형식으로 일괄 추가"
                            >
                                JSON 일괄
                            </JsonToggleBtn>
                            <div style={{ flex: 1 }} />
                            <TargetAddBtn onClick={handleAddTarget} disabled={targetLoading || !targetInput.trim()}>
                                + 추가
                            </TargetAddBtn>
                        </TargetFormRow>
                        {showJsonInput && (
                            <TargetFormRow style={{ alignItems: 'flex-start' }}>
                                <JsonInputArea
                                    placeholder={`{\n  "movieName": "극장판엉덩이탐정:스타앤드문",\n  "rivalMovieNames": ["왕과사는남자", "휴민트", "초속5센티미터"]\n}`}
                                    value={jsonInput}
                                    onChange={(e) => setJsonInput(e.target.value)}
                                />
                                <TargetAddBtn
                                    onClick={handleBulkAddFromJson}
                                    disabled={targetLoading || !jsonInput.trim()}
                                    style={{ alignSelf: 'flex-end', flexShrink: 0 }}
                                >
                                    일괄 추가
                                </TargetAddBtn>
                            </TargetFormRow>
                        )}
                    </TargetFormSection>
                    <TargetCountBar>
                        전체 <strong>{targets.length}</strong>편
                        <span className="sep">·</span>
                        주영화 <strong>{targets.filter(t => t.movie_type === 'main').length}</strong>편
                        <span className="sep">·</span>
                        경쟁작 <strong>{targets.filter(t => t.movie_type === 'competitor').length}</strong>편
                        <span className="sep">·</span>
                        활성 <strong style={{ color: '#15803d' }}>{targets.filter(t => t.is_active).length}</strong>편
                    </TargetCountBar>
                    {targets.length === 0 ? (
                        <TargetEmptyMsg>
                            등록된 대상 영화가 없습니다. 추가하면 해당 영화만 크롤링됩니다.
                        </TargetEmptyMsg>
                    ) : (
                        <div style={{ overflowX: "auto", paddingBottom: "4px" }}>
                            <TargetTable>
                                <thead>
                                    <tr>
                                        <TargetTh style={{ width: 56 }}>상태</TargetTh>
                                        <TargetTh style={{ width: 60 }}>구분</TargetTh>
                                        <TargetTh>입력 제목</TargetTh>
                                        <TargetTh>정규화 제목</TargetTh>
                                        <TargetTh style={{ width: 130 }}>등록일</TargetTh>
                                        <TargetTh style={{ width: 56 }}></TargetTh>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...targets].sort((a, b) => {
                                        if (a.movie_type === b.movie_type) return 0;
                                        return a.movie_type === 'main' ? -1 : 1;
                                    }).map((t) => (
                                        <tr key={t.id}>
                                            <TargetTd>
                                                <TargetToggle
                                                    $active={t.is_active}
                                                    onClick={() => handleToggleTarget(t.id)}
                                                    title={t.is_active ? "클릭하여 비활성화" : "클릭하여 활성화"}
                                                >
                                                    {t.is_active ? "활성" : "중지"}
                                                </TargetToggle>
                                            </TargetTd>
                                            <TargetTd>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    padding: '2px 8px',
                                                    borderRadius: 20,
                                                    fontSize: 10.5,
                                                    fontWeight: 700,
                                                    letterSpacing: '0.3px',
                                                    background: t.movie_type === 'main' ? '#fef9c3' : '#f0fdf4',
                                                    color: t.movie_type === 'main' ? '#a16207' : '#15803d',
                                                    border: `1px solid ${t.movie_type === 'main' ? '#fde68a' : '#bbf7d0'}`,
                                                }}>
                                                    {t.movie_type === 'main' ? '주영화' : '경쟁작'}
                                                </span>
                                            </TargetTd>
                                            <TargetTd>
                                                <span style={{ fontWeight: 500, color: t.is_active ? "#1e293b" : "#94a3b8" }}>
                                                    {t.title}
                                                </span>
                                            </TargetTd>
                                            <TargetTd>
                                                <span style={{ color: "#3b82f6", fontSize: 12, fontFamily: "monospace" }}>
                                                    {t.clean_title}
                                                </span>
                                            </TargetTd>
                                            <TargetTd style={{ color: "#94a3b8", fontSize: 11 }}>{t.created_at}</TargetTd>
                                            <TargetTd>
                                                <TargetDeleteBtn onClick={() => handleDeleteTarget(t.id, t.title)}>
                                                    삭제
                                                </TargetDeleteBtn>
                                            </TargetTd>
                                        </tr>
                                    ))}
                                </tbody>
                            </TargetTable>
                        </div>
                    )}
                    <TargetInfoBox>
                        입력한 제목에서 특수문자·괄호·포맷 태그를 제거한 뒤 크롤된 제목과 비교합니다.{" "}
                        <code>아바타: 불의 재</code> 입력 시 → <code>아바타- 불의재(3D)</code>,{" "}
                        <code>아바타: 불의 재 [IMAX]</code> 도 모두 매칭됩니다.
                    </TargetInfoBox>
                </DetailContainer>

                {/* [하단] 실행 이력 */}
                <div style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.06)',
                    background: '#fff',
                }}>
                    <CommonListHeader
                        title="실행 이력"
                        subtitle={null}
                    />
                    <div style={{ height: '500px' }}>
                        <GenericTable
                            headers={headers}
                            data={history.slice((page - 1) * pageSize, page * pageSize)}
                            page={page}
                            pageSize={pageSize}
                            totalCount={history.length}
                            onPageChange={setPage}
                            getRowKey={(item: any) => item.id}
                        />
                    </div>
                </div>
            </ContentGrid>
            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>

            <ScheduleExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                historyItem={exportTargetHistory}
            />

            {isSettingsOpen && (
                <SettingsModalOverlay onClick={() => setIsSettingsOpen(false)}>
                    <SettingsModalContent onClick={e => e.stopPropagation()}>
                        <ModalHeader>빠른 다운로드 설정</ModalHeader>
                        <CustomInput
                            leftLabel="영화 제목"
                            placeholder="예: 주토피아"
                            value={quickMovieTitle}
                            setValue={setQuickMovieTitle}
                        />
                        <div style={{ fontSize: '13px', color: '#64748b' }}>
                            * '빠른 다운로드' 버튼 클릭 시, <strong>내일 ~ 글피 (3일간)</strong>의 스케줄을 이 제목으로 조회하여 즉시 엑셀로 다운로드합니다.
                        </div>
                        <ModalActions>
                            <CustomButton onClick={() => setIsSettingsOpen(false)} color="gray" size="sm">취소</CustomButton>
                            <CustomButton onClick={saveSettings} size="sm" color="blue">저장</CustomButton>
                        </ModalActions>
                    </SettingsModalContent>
                </SettingsModalOverlay>
            )}
        </PageContainer >
    );
};
