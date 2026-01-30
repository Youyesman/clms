import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { useToast } from "../../../components/common/CustomToast";
import { AxiosPost, AxiosGet, BASE_URL } from "../../../axios/Axios";
import { CustomButton } from "../../../components/common/CustomButton";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomCheckbox } from "../../../components/common/CustomCheckbox";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { GenericTable } from "../../../components/GenericTable";
import { Play, DownloadSimple, CircleNotch, CheckCircle, WarningCircle, StopCircleIcon } from "@phosphor-icons/react";

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

interface ICrawlerHistory {
    id: number;
    created_at: string;
    finished_at: string | null;
    status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
    trigger_type: 'MANUAL' | 'SCHEDULED';
    configuration: any;
    result_summary: any;
    error_message: string | null;
    excel_file_path: string | null;
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
        if (status === 'FAILED') return `background-color: #fee2e2; color: #b91c1c; border: 1px solid #fecaca;`;
        if (status === 'RUNNING') return `background-color: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe;`;
        return `background-color: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0;`;
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
    const [config, setConfig] = useState<ICrawlerConfig>(INITIAL_CONFIG);
    const [history, setHistory] = useState<ICrawlerHistory[]>([]);

    // Pagination State
    const [page, setPage] = useState(1);
    const pageSize = 10;

    const toast = useToast();

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

    const handleDownload = (historyId: number) => {
        const token = localStorage.getItem("token");
        fetch(`${BASE_URL}/crawler/download/${historyId}`, {
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
                a.download = `crawler_log_${historyId}.xlsx`; // Changed name to crawler_log
                document.body.appendChild(a);
                a.click();
                a.remove();
            })
            .catch(err => toast.error("다운로드 실패: " + err.message));
    };

    const handleStop = async (historyId: number) => {
        if (!window.confirm("크롤링 작업을 중단하시겠습니까?")) return;
        try {
            await AxiosPost(`crawler/stop/${historyId}`, {});
            toast.success("중단 요청되었습니다.");
            fetchHistory();
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || "오류가 발생했습니다.";
            toast.error(`중단 실패: ${msg}`);
        }
    };

    const formatDateTime = (isoString: string | null) => {
        if (!isoString) return "-";
        const d = new Date(isoString);
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
            label: "구분",
            width: "80px",
            renderCell: (val: string) => (
                <span style={{
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: val === 'MANUAL' ? '#3b82f6' : '#10b981',
                }}>
                    {val === 'MANUAL' ? 'Manual' : 'Schedule'}
                </span>
            )
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
            width: "80px",
            renderCell: (_: any, item: ICrawlerHistory) => {
                if (!item.finished_at) return "-";
                const diff = (new Date(item.finished_at).getTime() - new Date(item.created_at).getTime()) / 1000;
                return <span style={{ color: '#64748b', fontSize: '12px' }}>{Math.floor(diff)}초</span>;
            }
        },
        {
            key: "status", // Result Column (Mapped to Status)
            label: "결과",
            width: "80px",
            renderCell: (val: string) => (
                <StatusBadge status={val}>
                    {val === 'RUNNING' && <CircleNotch className="spin" size={12} />}
                    {val === 'SUCCESS' && <CheckCircle size={12} weight="fill" />}
                    {val === 'FAILED' && <WarningCircle size={12} weight="fill" />}
                    {val === 'SUCCESS' ? '성공' : val === 'FAILED' ? '오류' : val === 'RUNNING' ? '진행중' : '대기'}
                </StatusBadge>
            )
        },
        {
            key: "logs",
            label: "로그",
            width: "100px",
            renderCell: (_: any, item: ICrawlerHistory) => (
                item.status === 'SUCCESS' ? (
                    <button
                        onClick={() => handleDownload(item.id)}
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
                    <span style={{ fontSize: '11px', color: '#ef4444' }}>{item.error_message?.slice(0, 10)}...</span>
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
                        title="크롤러 실행 (Manual Run)"
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

                        <CustomButton onClick={handleRun} size="sm" style={{ padding: '0 20px', fontSize: '13px', fontWeight: 600 }}>
                            <Play size={16} weight="fill" style={{ marginRight: '6px' }} /> 크롤링 시작
                        </CustomButton>
                    </CompactConfigBar>
                </DetailContainer>

                {/* [하단] 실행 이력 (GenericTable 사용) */}
                <div style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
                }}>
                    <CommonListHeader
                        title="실행 이력 (History)"
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
        </PageContainer>
    );
};
