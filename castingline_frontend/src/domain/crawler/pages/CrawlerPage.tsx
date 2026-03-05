import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { useToast } from "../../../components/common/CustomToast";
import { AxiosPost, AxiosGet, AxiosPatch, AxiosDelete } from "../../../axios/Axios";
import { CustomCheckbox } from "../../../components/common/CustomCheckbox";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { GenericTable } from "../../../components/GenericTable";
import { Play, CircleNotch, CheckCircle, WarningCircle, StopCircleIcon, DownloadSimple, FileXls, Spinner, FilmStrip } from "@phosphor-icons/react";
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

// --- Styled Components ---
const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background-color: #f4f6f8;
    min-height: 100vh;
    font-family: "SUIT", sans-serif;
`;

const Card = styled.div`
    background: #fff;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
    overflow: hidden;
`;

const StatusBadge = styled.span<{ status: string }>`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    ${({ status }) => {
        if (status === 'SUCCESS') return `background: #ecfdf5; color: #059669;`;
        if (status === 'SUCCESS_PARTIAL') return `background: #fffbeb; color: #d97706;`;
        if (status === 'FAILED') return `background: #fef2f2; color: #dc2626;`;
        if (status === 'RUNNING') return `background: #eff6ff; color: #2563eb;`;
        return `background: #f3f4f6; color: #6b7280;`;
    }}
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

    const [isExporting, setIsExporting] = useState(false);
    const [showExportPicker, setShowExportPicker] = useState(false);

    // 실패 상세 모달
    const [failureModalItem, setFailureModalItem] = useState<ICrawlerHistory | null>(null);

    // Crawl Target State
    const [targets, setTargets] = useState<CrawlTarget[]>([]);
    const [targetInput, setTargetInput] = useState("");
    const [targetMovieType, setTargetMovieType] = useState<'main' | 'competitor'>('main');
    const [targetLoading, setTargetLoading] = useState(false);
    const [showJsonInput, setShowJsonInput] = useState(false);
    const [jsonInput, setJsonInput] = useState("");
    const [selectedTargetIds, setSelectedTargetIds] = useState<number[]>([]);

    // Pagination State
    const [page, setPage] = useState(1);
    const pageSize = 10;


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
            toast.success(`주요작 ${mainMovies.length}편, 경쟁작 ${rivalMovies.length}편 추가 완료`);
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

    const handleBulkDeleteTargets = () => {
        if (selectedTargetIds.length === 0) return;
        showAlert(
            "일괄 삭제",
            `선택된 ${selectedTargetIds.length}개 영화를 삭제하시겠습니까?`,
            "warning",
            async () => {
                try {
                    await AxiosPost("crawler/targets/bulk_delete", { ids: selectedTargetIds });
                    setTargets((prev) => prev.filter((t) => !selectedTargetIds.includes(t.id)));
                    setSelectedTargetIds([]);
                    toast.success(`${selectedTargetIds.length}개 삭제 완료`);
                } catch {
                    toast.error("일괄 삭제 실패");
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

    const handleDownload = async (item: ICrawlerHistory) => {
        try {
            const response: any = await AxiosGet(`crawler/download/${item.id}`, { responseType: 'blob' });
            const blob = new Blob([response.data], {
                type: response.headers?.['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            let ext = ".xlsx";
            if (item.excel_file_path && item.excel_file_path.endsWith(".txt")) {
                ext = ".txt";
            }

            a.download = `crawler_log_${item.id}${ext}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            toast.error("다운로드 실패: " + (err.message || "오류가 발생했습니다."));
        }
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

    const handleExcelDownload = async (selectedMovie?: CrawlTarget) => {
        const mainMovies = targets.filter(t => t.movie_type === 'main' && t.is_active);
        if (mainMovies.length === 0) {
            toast.error("크롤 대상 영화에 주요작을 먼저 등록해주세요.");
            return;
        }
        if (!config.crawlStartDate) {
            toast.error("시작일을 설정해주세요.");
            return;
        }

        // 주요작가 2개 이상이고 아직 선택 안 한 경우 → 드롭다운 표시
        if (mainMovies.length > 1 && !selectedMovie) {
            setShowExportPicker(prev => !prev);
            return;
        }

        const mainMovie = selectedMovie || mainMovies[0];
        setShowExportPicker(false);
        setIsExporting(true);
        try {
            toast.success("엑셀 생성 중... 잠시만 기다려주세요.");
            const response: any = await AxiosPost("crawler/schedules/export", {
                start_date: config.crawlStartDate,
                end_date: config.crawlEndDate || config.crawlStartDate,
                movie_title: mainMovie.clean_title || mainMovie.title,
            }, { responseType: 'blob' });

            const blob = new Blob([response.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;

            const contentDisposition = response.headers?.['content-disposition'];
            let filename = `${mainMovie.title}_schedule.xlsx`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/);
                if (match?.[1]) filename = match[1];
            }

            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success("엑셀 파일이 다운로드 되었습니다.");
        } catch (error: any) {
            console.error(error);
            toast.error("다운로드 실패: " + (error.response?.data?.error || "데이터가 없거나 오류가 발생했습니다."));
        } finally {
            setIsExporting(false);
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
            key: "trigger_type",
            label: "구분",
            width: "80px",
            renderCell: (val: string, item: ICrawlerHistory) => {
                const isAuto = val === 'SCHEDULED';
                const isTransform = val === 'TRANSFORM';
                return (
                    <span style={{ fontSize: '11px', fontWeight: 600, color: isTransform ? '#8b5cf6' : isAuto ? '#f59e0b' : '#3b82f6' }}>
                        {isTransform ? '변환' : isAuto ? '자동' : '수동'}
                    </span>
                );
            }
        },
        {
            key: "created_at",
            label: "시작",
            renderCell: (val: string) => <span style={{ fontSize: '12px' }}>{formatDateTime(val)}</span>
        },
        {
            key: "duration",
            label: "소요",
            width: "70px",
            renderCell: (_: any, item: ICrawlerHistory) => {
                if (!item.finished_at) return "-";
                const diff = (new Date(item.finished_at).getTime() - new Date(item.created_at).getTime()) / 1000;
                return <span style={{ color: '#64748b', fontSize: '11px' }}>{formatDuration(diff)}</span>;
            }
        },
        {
            key: "status",
            label: "결과",
            width: "110px",
            renderCell: (val: string, item: ICrawlerHistory) => {
                const totalFailures = item.result_summary?.total_failures ?? 0;
                const totalSkipped = item.result_summary?.total_skipped ?? 0;
                const isPartial = val === 'SUCCESS' && totalFailures > 0;
                const displayStatus = isPartial ? 'SUCCESS_PARTIAL' : val;
                const successLabel = totalSkipped > 0 ? `성공 (스킵${totalSkipped})` : '성공';
                return (
                    <StatusBadge
                        status={displayStatus}
                        title={isPartial ? `${totalFailures}개 실패 — 클릭하여 상세 보기` : totalSkipped > 0 ? `${totalSkipped}개 극장 날짜 미등록 스킵` : undefined}
                        style={isPartial ? { cursor: 'pointer' } : undefined}
                        onClick={isPartial ? () => setFailureModalItem(item) : undefined}
                    >
                        {val === 'RUNNING' && <CircleNotch className="spin" size={12} />}
                        {val === 'SUCCESS' && !isPartial && <CheckCircle size={12} weight="fill" />}
                        {(val === 'FAILED' || isPartial) && <WarningCircle size={12} weight="fill" />}
                        {isPartial ? `일부실패(${totalFailures})` : val === 'SUCCESS' ? successLabel : val === 'FAILED' ? '오류' : val === 'RUNNING' ? '진행중' : '대기'}
                    </StatusBadge>
                );
            }
        },
        {
            key: "logs",
            label: "",
            width: "100px",
            renderCell: (_: any, item: ICrawlerHistory) => (
                (item.status === 'RUNNING' || item.status === 'PENDING') ? (
                    <button onClick={() => handleStop(item.id)} title="중단"
                        style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, color: '#e11d48', fontSize: '11px', fontWeight: 600 }}>
                        <StopCircleIcon size={13} /> 중단
                    </button>
                ) : item.status === 'FAILED' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: '10px', color: '#ef4444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 60 }} title={item.error_message || ''}>{item.error_message?.slice(0, 8)}..</span>
                        {item.excel_file_path && (
                            <button onClick={() => handleDownload(item)} title="로그 다운로드"
                                style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 4, padding: '2px 5px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', color: '#e11d48' }}>
                                <DownloadSimple size={12} />
                            </button>
                        )}
                    </div>
                ) : (item.status === 'SUCCESS' && (item.result_summary?.total_failures ?? 0) > 0) ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => setFailureModalItem(item)} title="실패 상세 보기"
                            style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, color: '#d97706', fontSize: '11px', fontWeight: 600, fontFamily: '"SUIT",sans-serif' }}>
                            <WarningCircle size={12} /> 상세
                        </button>
                        {item.excel_file_path && (
                            <button onClick={() => handleDownload(item)} title="로그 다운로드"
                                style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '2px 5px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', color: '#d97706' }}>
                                <DownloadSimple size={12} />
                            </button>
                        )}
                    </div>
                ) : "-"
            )
        }
    ];

    return (
        <PageContainer>
            {/* ===== 수동 실행 설정 ===== */}
            <Card>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>크롤러 관리</span>
                    <div style={{ position: 'relative' }}>
                        <button
                            data-export-btn
                            onClick={() => handleExcelDownload()}
                            disabled={isExporting || !targets.some(t => t.movie_type === 'main' && t.is_active)}
                            style={{ height: 32, padding: '0 14px', border: 'none', borderRadius: 6, background: isExporting ? '#86efac' : '#16a34a', color: '#fff', cursor: isExporting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, fontFamily: '"SUIT",sans-serif' }}
                        >
                            {isExporting ? <Spinner className="spin" size={14} /> : <FileXls size={14} weight="fill" />}
                            엑셀 다운로드
                        </button>
                        {showExportPicker && (() => {
                            const btnEl = document.querySelector('[data-export-btn]') as HTMLElement | null;
                            const rect = btnEl?.getBoundingClientRect();
                            const top = rect ? rect.bottom + 4 : 0;
                            const right = rect ? window.innerWidth - rect.right : 0;
                            return (
                                <>
                                    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 999 }} onClick={() => setShowExportPicker(false)} />
                                    <div style={{ position: 'fixed', top, right, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 1000, minWidth: 200, padding: '6px 0' }}>
                                        <div style={{ padding: '6px 14px', fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>주요작 선택</div>
                                        {targets.filter(t => t.movie_type === 'main' && t.is_active).map(t => (
                                            <button
                                                key={t.id}
                                                onClick={() => handleExcelDownload(t)}
                                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#1f2937', fontFamily: '"SUIT",sans-serif' }}
                                                onMouseOver={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                                                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                {t.title}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
                <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', minWidth: 36 }}>기간</span>
                        <input
                            type="date"
                            value={config.crawlStartDate}
                            onChange={(e) => handleConfigChange('crawlStartDate', e.target.value)}
                            style={{ height: 34, padding: '0 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: '"SUIT",sans-serif', color: '#111827', outline: 'none' }}
                        />
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>~</span>
                        <input
                            type="date"
                            value={config.crawlEndDate}
                            onChange={(e) => handleConfigChange('crawlEndDate', e.target.value)}
                            style={{ height: 34, padding: '0 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: '"SUIT",sans-serif', color: '#111827', outline: 'none' }}
                        />
                    </div>
                    <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>극장</span>
                        <CustomCheckbox label="CGV" checked={config.choiceCompany.cgv} onChange={() => handleCompanyChange('cgv')} />
                        <CustomCheckbox label="Lotte" checked={config.choiceCompany.lotte} onChange={() => handleCompanyChange('lotte')} />
                        <CustomCheckbox label="Megabox" checked={config.choiceCompany.mega} onChange={() => handleCompanyChange('mega')} />
                    </div>
                    <div style={{ flex: 1 }} />
                    <button
                        onClick={handleRun}
                        style={{ height: 34, padding: '0 20px', background: '#111827', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: '"SUIT",sans-serif' }}
                    >
                        <Play size={14} weight="fill" /> 크롤링 시작
                    </button>
                </div>
            </Card>

            {/* ===== 하단 2컬럼 레이아웃 ===== */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

            {/* ===== 크롤 대상 영화 ===== */}
            <Card style={{ flex: 1, minWidth: 0 }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FilmStrip size={15} weight="fill" color="#6b7280" />
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>크롤 대상 영화</span>
                        <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 400 }}>
                            등록된 영화만 수집 대상에 포함됩니다
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#6b7280' }}>
                        <span>전체 <b style={{ color: '#111827' }}>{targets.length}</b></span>
                        <span style={{ color: '#d1d5db' }}>|</span>
                        <span>주요작 <b style={{ color: '#b45309' }}>{targets.filter(t => t.movie_type === 'main').length}</b></span>
                        <span style={{ color: '#d1d5db' }}>|</span>
                        <span>경쟁작 <b style={{ color: '#059669' }}>{targets.filter(t => t.movie_type === 'competitor').length}</b></span>
                    </div>
                </div>

                {/* 입력 폼 */}
                <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, background: '#fafbfc', borderBottom: '1px solid #f0f0f0' }}>
                    <input
                        placeholder="영화 제목을 입력하세요"
                        value={targetInput}
                        onChange={(e) => setTargetInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddTarget()}
                        style={{ flex: 1, height: 34, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', fontFamily: '"SUIT",sans-serif', background: '#fff' }}
                    />
                    <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                        {(['main', 'competitor'] as const).map(type => (
                            <button
                                key={type}
                                onClick={() => setTargetMovieType(type)}
                                style={{
                                    height: 34, padding: '0 14px', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    fontFamily: '"SUIT",sans-serif',
                                    background: targetMovieType === type ? '#111827' : '#fff',
                                    color: targetMovieType === type ? '#fff' : '#6b7280',
                                }}
                            >
                                {type === 'main' ? '주요작' : '경쟁작'}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setShowJsonInput(v => !v)}
                        style={{
                            height: 34, padding: '0 12px', border: `1px solid ${showJsonInput ? '#3b82f6' : '#d1d5db'}`, borderRadius: 6,
                            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"SUIT",sans-serif',
                            background: showJsonInput ? '#eff6ff' : '#fff', color: showJsonInput ? '#2563eb' : '#6b7280', whiteSpace: 'nowrap' as const,
                        }}
                    >
                        JSON
                    </button>
                    <button
                        onClick={handleAddTarget}
                        disabled={targetLoading || !targetInput.trim()}
                        style={{
                            height: 34, padding: '0 16px', background: targetLoading || !targetInput.trim() ? '#d1d5db' : '#2563eb',
                            color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: targetLoading || !targetInput.trim() ? 'default' : 'pointer',
                            fontFamily: '"SUIT",sans-serif', whiteSpace: 'nowrap' as const,
                        }}
                    >
                        추가
                    </button>
                </div>

                {/* JSON 입력 */}
                {showJsonInput && (
                    <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                        <textarea
                            placeholder={`{\n  "movieName": "극장판엉덩이탐정:스타앤드문",\n  "rivalMovieNames": ["왕과사는남자", "휴민트"]\n}`}
                            value={jsonInput}
                            onChange={(e) => setJsonInput(e.target.value)}
                            style={{ flex: 1, minHeight: 80, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', color: '#111827', resize: 'vertical' as const, outline: 'none', background: '#fff', lineHeight: 1.5 }}
                        />
                        <button
                            onClick={handleBulkAddFromJson}
                            disabled={targetLoading || !jsonInput.trim()}
                            style={{
                                height: 34, padding: '0 16px', background: targetLoading || !jsonInput.trim() ? '#d1d5db' : '#2563eb',
                                color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: targetLoading || !jsonInput.trim() ? 'default' : 'pointer',
                                fontFamily: '"SUIT",sans-serif', flexShrink: 0, whiteSpace: 'nowrap' as const,
                            }}
                        >
                            일괄 추가
                        </button>
                    </div>
                )}

                {/* 일괄 삭제 버튼 */}
                {selectedTargetIds.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: '#fef2f2', borderRadius: 6, margin: '0 0 4px' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626' }}>
                            {selectedTargetIds.length}개 선택됨
                        </span>
                        <button
                            onClick={handleBulkDeleteTargets}
                            style={{ padding: '4px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"SUIT",sans-serif' }}
                        >
                            일괄 삭제
                        </button>
                        <button
                            onClick={() => setSelectedTargetIds([])}
                            style={{ padding: '4px 10px', background: 'transparent', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, cursor: 'pointer', fontFamily: '"SUIT",sans-serif' }}
                        >
                            선택 해제
                        </button>
                    </div>
                )}

                {/* 영화 목록 테이블 */}
                {targets.length === 0 ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                        등록된 대상 영화가 없습니다. 영화를 추가하면 해당 영화만 크롤링됩니다.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: '"SUIT",sans-serif' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    <th style={{ padding: '10px 8px 10px 16px', width: 36 }}>
                                        <input
                                            type="checkbox"
                                            checked={targets.length > 0 && selectedTargetIds.length === targets.length}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedTargetIds(targets.map((t) => t.id));
                                                } else {
                                                    setSelectedTargetIds([]);
                                                }
                                            }}
                                            style={{ cursor: 'pointer', accentColor: '#3b82f6' }}
                                        />
                                    </th>
                                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9ca3af', width: 52, whiteSpace: 'nowrap' }}>상태</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9ca3af', width: 70, whiteSpace: 'nowrap' }}>구분</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9ca3af' }}>입력 제목</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9ca3af' }}>정규화 제목</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9ca3af', width: 140 }}>등록일</th>
                                    <th style={{ padding: '10px 12px', width: 48 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...targets].sort((a, b) => {
                                    if (a.movie_type === b.movie_type) return 0;
                                    return a.movie_type === 'main' ? -1 : 1;
                                }).map((t) => (
                                    <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6', background: selectedTargetIds.includes(t.id) ? '#eff6ff' : undefined }}>
                                        <td style={{ padding: '8px 8px 8px 16px' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedTargetIds.includes(t.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedTargetIds((prev) => [...prev, t.id]);
                                                    } else {
                                                        setSelectedTargetIds((prev) => prev.filter((id) => id !== t.id));
                                                    }
                                                }}
                                                style={{ cursor: 'pointer', accentColor: '#3b82f6' }}
                                            />
                                        </td>
                                        <td style={{ padding: '8px 16px' }}>
                                            <button
                                                onClick={() => handleToggleTarget(t.id)}
                                                title={t.is_active ? "클릭하여 비활성화" : "클릭하여 활성화"}
                                                style={{
                                                    padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                    fontFamily: '"SUIT",sans-serif', border: 'none',
                                                    background: t.is_active ? '#ecfdf5' : '#f3f4f6',
                                                    color: t.is_active ? '#059669' : '#9ca3af',
                                                }}
                                            >
                                                {t.is_active ? 'ON' : 'OFF'}
                                            </button>
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <span style={{
                                                display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' as const,
                                                background: t.movie_type === 'main' ? '#fef3c7' : '#ecfdf5',
                                                color: t.movie_type === 'main' ? '#b45309' : '#059669',
                                            }}>
                                                {t.movie_type === 'main' ? '주요작' : '경쟁작'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 12px', fontWeight: 500, color: t.is_active ? '#111827' : '#9ca3af' }}>
                                            {t.title}
                                        </td>
                                        <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: 12, fontFamily: 'monospace' }}>
                                            {t.clean_title}
                                        </td>
                                        <td style={{ padding: '8px 12px', color: '#9ca3af', fontSize: 11 }}>
                                            {t.created_at}
                                        </td>
                                        <td style={{ padding: '8px 12px' }}>
                                            <button
                                                onClick={() => handleDeleteTarget(t.id, t.title)}
                                                style={{ padding: '3px 8px', border: '1px solid #e5e7eb', background: '#f9fafb', color: '#6b7280', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: '"SUIT",sans-serif', whiteSpace: 'nowrap' }}
                                                onMouseOver={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                                                onMouseOut={(e) => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
                                            >
                                                삭제
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* 하단 안내 */}
                <div style={{ padding: '10px 20px 14px', fontSize: 11, color: '#9ca3af', lineHeight: 1.6 }}>
                    입력 제목에서 특수문자/괄호/태그를 제거 후 크롤 데이터와 비교합니다.
                    <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 3, fontSize: 11, color: '#6b7280', fontFamily: 'monospace', marginLeft: 4 }}>아바타: 불의 재</code> 입력 시
                    <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 3, fontSize: 11, color: '#6b7280', fontFamily: 'monospace', marginLeft: 4 }}>아바타- 불의재(3D)</code>,
                    <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 3, fontSize: 11, color: '#6b7280', fontFamily: 'monospace', marginLeft: 4 }}>아바타: 불의 재 [IMAX]</code> 모두 매칭
                </div>
            </Card>

            {/* ===== 실행 이력 ===== */}
            <Card style={{ flex: 1, minWidth: 0 }}>
                <CommonListHeader title="실행 이력" subtitle={null} />
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
            </Card>

            </div>{/* 하단 2컬럼 레이아웃 끝 */}

            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>

            {/* ===== 실패 상세 모달 ===== */}
            {failureModalItem && (() => {
                const summary = failureModalItem.result_summary;
                const failures: Array<{ brand?: string; theater?: string; date?: string; reason?: string }> = summary?.failure_summary ?? [];
                const totalFailures: number = summary?.total_failures ?? 0;
                return (
                    <div
                        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => setFailureModalItem(null)}
                    >
                        <div
                            style={{ background: '#fff', borderRadius: 12, width: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* 모달 헤더 */}
                            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <WarningCircle size={18} weight="fill" color="#d97706" />
                                    <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                                        실패 상세 내역
                                    </span>
                                    <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>
                                        총 {totalFailures}건
                                    </span>
                                </div>
                                <button
                                    onClick={() => setFailureModalItem(null)}
                                    style={{ background: 'none', border: 'none', fontSize: 18, color: '#9ca3af', cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}
                                >
                                    &times;
                                </button>
                            </div>

                            {/* 모달 본문 */}
                            <div style={{ overflow: 'auto', flex: 1, padding: '0' }}>
                                {failures.length === 0 ? (
                                    <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                                        상세 실패 내역이 기록되지 않았습니다.
                                    </div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: '"SUIT",sans-serif' }}>
                                        <thead>
                                            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', width: 70 }}>극장사</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', width: 100 }}>극장</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', width: 100 }}>날짜</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280' }}>실패 사유</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {failures.map((f, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                    <td style={{ padding: '8px 14px', fontWeight: 600, color: '#374151' }}>{f.brand || '-'}</td>
                                                    <td style={{ padding: '8px 14px', color: '#4b5563' }}>{f.theater || '-'}</td>
                                                    <td style={{ padding: '8px 14px', color: '#6b7280', fontFamily: 'monospace', fontSize: 11 }}>{f.date || '-'}</td>
                                                    <td style={{ padding: '8px 14px', color: '#dc2626', fontSize: 11 }}>{f.reason || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* 모달 푸터 */}
                            <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9fafb', borderRadius: '0 0 12px 12px' }}>
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                                    {totalFailures > failures.length
                                        ? `* 상위 ${failures.length}건만 표시됩니다. 전체 내역은 엑셀을 다운로드하세요.`
                                        : `총 ${failures.length}건`
                                    }
                                </span>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {failureModalItem.excel_file_path && (
                                        <button
                                            onClick={() => { handleDownload(failureModalItem); }}
                                            style={{ height: 32, padding: '0 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: '"SUIT",sans-serif' }}
                                        >
                                            <DownloadSimple size={13} /> 엑셀 다운로드
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setFailureModalItem(null)}
                                        style={{ height: 32, padding: '0 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"SUIT",sans-serif' }}
                                    >
                                        닫기
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

        </PageContainer>
    );
};
