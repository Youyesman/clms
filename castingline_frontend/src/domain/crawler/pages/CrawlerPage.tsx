import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { useToast } from "../../../components/common/CustomToast";
import { AxiosPost, AxiosGet, BASE_URL } from "../../../axios/Axios";
import { CustomButton } from "../../../components/common/CustomButton";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomCheckbox } from "../../../components/common/CustomCheckbox";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { Plus, X, Trash, Play, DownloadSimple, CircleNotch, CheckCircle, WarningCircle, StopCircleIcon } from "@phosphor-icons/react";

// --- Types ---
interface ICineDeChefFilter {
    theaterNm: string;
    refineTheaterNm: string;
}

interface IMovieSetting {
    movieName: string;
    rivalMovieNames: string[];
}

interface IChoiceCompany {
    cgv: boolean;
    mega: boolean;
    lotte: boolean;
}

interface ICrawlerConfig {
    savePath: string;
    jsonPath: string;
    crawlStartDate: string;
    crawlEndDate: string;
    onlyExcel: boolean;
    choiceCompany: IChoiceCompany;
    specialTypeFilters: string[];
    cgvCineDeChefFilters: ICineDeChefFilter[];
    movieSettings: IMovieSetting[];
}

interface ICrawlerHistory {
    id: number;
    created_at: string;
    finished_at: string | null;
    status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
    configuration: any;
    result_summary: any;
    error_message: string | null;
    excel_file_path: string | null;
}

// --- Styled Components (System Design) ---
const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background-color: #f8fafc;
    min-height: 100vh;
    font-family: "SUIT", sans-serif;
`;

const ContentGrid = styled.div`
    display: flex;
    gap: 16px;
    width: 100%;
    align-items: flex-start;
    
    @media (max-width: 1200px) {
        flex-direction: column;
    }
`;

const Column = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
    min-width: 0;
`;

const DetailContainer = styled.div`
    width: 100%;
    background-color: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    overflow: hidden;
`;

const ScrollBody = styled.div`
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 32px;
`;

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const SectionHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid #f1f5f9;
    padding-bottom: 8px;
    margin-bottom: 8px;
`;

const SectionTitle = styled.h3`
    font-size: 15px;
    font-weight: 700;
    color: #334155;
    margin: 0;
`;

const FormGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    align-items: flex-start;
`;

const CheckboxGroup = styled.div`
    display: flex;
    gap: 20px;
    align-items: center;
    height: 38px;
`;

const Card = styled.div`
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const TagContainer = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
`;

const Tag = styled.div`
    background-color: #eff6ff;
    color: #1d4ed8;
    font-size: 13px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 100px;
    display: flex;
    align-items: center;
    gap: 4px;
    border: 1px solid #bfdbfe;
`;

const TagDelete = styled.button`
    background: none;
    border: none;
    cursor: pointer;
    color: #60a5fa;
    display: flex;
    align-items: center;
    padding: 0;
    &:hover { color: #1e40af; }
`;

const ActionButtonWrapper = styled.div`
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
`;

// --- History Table Styled Components ---
const HistoryTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
`;

const Th = styled.th`
    background-color: #f1f5f9;
    color: #475569;
    font-weight: 600;
    text-align: left;
    padding: 12px;
    border-bottom: 1px solid #e2e8f0;
`;

const Td = styled.td`
    padding: 12px;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
    vertical-align: middle;
`;

const StatusBadge = styled.span<{ status: string }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    
    ${({ status }) => {
        if (status === 'SUCCESS') return `background-color: #dcfce7; color: #166534;`;
        if (status === 'FAILED') return `background-color: #fee2e2; color: #991b1b;`;
        if (status === 'RUNNING') return `background-color: #dbeafe; color: #1e40af;`;
        return `background-color: #f1f5f9; color: #64748b;`;
    }}
`;

// --- Initial State ---
const INITIAL_CONFIG: ICrawlerConfig = {
    savePath: "/Users/janghyuck/Desktop/회사_관련/backend_for_SEND/excel_store",
    jsonPath: "/Users/janghyuck/Desktop/회사_관련/backend_for_SEND/json_result/result.json",
    crawlStartDate: new Date().toISOString().split('T')[0],
    crawlEndDate: new Date().toISOString().split('T')[0],
    onlyExcel: false,
    choiceCompany: {
        cgv: true,
        mega: false,
        lotte: false
    },
    specialTypeFilters: ["무대인사"],
    cgvCineDeChefFilters: [
        { theaterNm: "용산", refineTheaterNm: "용산아이파크몰" },
        { theaterNm: "센텀", refineTheaterNm: "센텀시티" },
        { theaterNm: "압구정", refineTheaterNm: "압구정" }
    ],
    movieSettings: [
        { movieName: "만약에우리", rivalMovieNames: [] }
    ]
};

export const CrawlerPage = () => {
    const [config, setConfig] = useState<ICrawlerConfig>(INITIAL_CONFIG);
    const [newSpecialFilter, setNewSpecialFilter] = useState("");
    const [newCineFilter, setNewCineFilter] = useState({ theaterNm: "", refineTheaterNm: "" });
    const [newMovieName, setNewMovieName] = useState("");

    const [history, setHistory] = useState<ICrawlerHistory[]>([]);

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
        const interval = setInterval(fetchHistory, 5000); // 5초마다 갱신
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

    // Special Filters
    const addSpecialFilter = () => {
        if (!newSpecialFilter.trim()) return;
        if (config.specialTypeFilters.includes(newSpecialFilter)) {
            toast.error("이미 존재하는 필터입니다.");
            return;
        }
        setConfig(prev => ({
            ...prev,
            specialTypeFilters: [...prev.specialTypeFilters, newSpecialFilter]
        }));
        setNewSpecialFilter("");
    };

    const removeSpecialFilter = (idx: number) => {
        setConfig(prev => ({
            ...prev,
            specialTypeFilters: prev.specialTypeFilters.filter((_, i) => i !== idx)
        }));
    };

    // CineDeChef Filters
    const addCineFilter = () => {
        if (!newCineFilter.theaterNm || !newCineFilter.refineTheaterNm) return;
        setConfig(prev => ({
            ...prev,
            cgvCineDeChefFilters: [...prev.cgvCineDeChefFilters, newCineFilter]
        }));
        setNewCineFilter({ theaterNm: "", refineTheaterNm: "" });
    };

    const removeCineFilter = (idx: number) => {
        setConfig(prev => ({
            ...prev,
            cgvCineDeChefFilters: prev.cgvCineDeChefFilters.filter((_, i) => i !== idx)
        }));
    };

    // Movie Settings
    const addMovie = () => {
        if (!newMovieName.trim()) return;
        setConfig(prev => ({
            ...prev,
            movieSettings: [...prev.movieSettings, { movieName: newMovieName, rivalMovieNames: [] }]
        }));
        setNewMovieName("");
    };

    const removeMovie = (movieIdx: number) => {
        setConfig(prev => ({
            ...prev,
            movieSettings: prev.movieSettings.filter((_, i) => i !== movieIdx)
        }));
    };

    const addRivalMovie = (movieIdx: number, rivalName: string) => {
        if (!rivalName.trim()) return;
        const newSettings = [...config.movieSettings];
        newSettings[movieIdx].rivalMovieNames.push(rivalName);
        setConfig(prev => ({ ...prev, movieSettings: newSettings }));
    };

    const removeRivalMovie = (movieIdx: number, rivalIdx: number) => {
        const newSettings = [...config.movieSettings];
        newSettings[movieIdx].rivalMovieNames = newSettings[movieIdx].rivalMovieNames.filter((_, i) => i !== rivalIdx);
        setConfig(prev => ({ ...prev, movieSettings: newSettings }));
    };

    const handleRun = async () => {
        try {
            if (!config.crawlStartDate || !config.crawlEndDate) {
                toast.error("날짜를 선택해주세요.");
                return;
            }
            await AxiosPost("crawler/run", config);
            toast.success("크롤러가 백그라운드에서 실행되었습니다.");
            fetchHistory(); // 즉시 갱신
        } catch (error: any) {
            console.error(error);
            const msg = error.response?.data?.error || error.message || "오류가 발생했습니다.";
            toast.error(`실패: ${msg}`);
        }
    };

    const handleDownload = (historyId: number) => {
        // Axios가 아닌 window.location 또는 a tag로 다운로드 처리 (브라우저 다운로드)
        // 토큰이 필요하다면 Axios로 blob을 받아서 처리해야 함. 여기서는 기존 AxiosWrapper 로직 참조.
        // FileResponse를 반환하므로 Blob 처리 필요.
        // Or simply open in new tab if auth token handling is complex, but let's try blob.

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
                a.download = `crawler_result_${historyId}.xlsx`;
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
            fetchHistory(); // 즉시 갱신
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || "오류가 발생했습니다.";
            toast.error(`중단 실패: ${msg}`);
        }
    };

    return (
        <PageContainer>
            <ContentGrid>
                {/* [좌측] 크롤러 설정 (Configuration) */}
                <Column>
                    <DetailContainer>
                        <CommonListHeader
                            title="크롤러 설정 (Configuration)"
                            subtitle="크롤링 날짜 및 대상을 설정합니다."
                        />
                        <ScrollBody>
                            {/* 1. 날짜 및 수집 대상 */}
                            <Section>
                                <SectionHeader><SectionTitle>수집 기간 및 대상</SectionTitle></SectionHeader>
                                <FormGrid>
                                    <CustomInput
                                        label="시작일"
                                        inputType="date"
                                        value={config.crawlStartDate}
                                        setValue={(v) => handleConfigChange('crawlStartDate', v)}
                                    />
                                    <CustomInput
                                        label="종료일"
                                        inputType="date"
                                        value={config.crawlEndDate}
                                        setValue={(v) => handleConfigChange('crawlEndDate', v)}
                                    />
                                </FormGrid>
                                <div style={{ display: 'flex', gap: '40px', alignItems: 'center', marginTop: '8px' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '8px' }}>수집 대상 기업</div>
                                        <CheckboxGroup>
                                            <CustomCheckbox label="CGV" checked={config.choiceCompany.cgv} onChange={() => handleCompanyChange('cgv')} />
                                            <CustomCheckbox label="Lotte" checked={config.choiceCompany.lotte} onChange={() => handleCompanyChange('lotte')} />
                                            <CustomCheckbox label="Megabox" checked={config.choiceCompany.mega} onChange={() => handleCompanyChange('mega')} />
                                        </CheckboxGroup>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '8px' }}>옵션</div>
                                        <CheckboxGroup>
                                            <CustomCheckbox
                                                label="엑셀 파일만 저장"
                                                checked={config.onlyExcel}
                                                onChange={(v) => handleConfigChange('onlyExcel', v)}
                                            />
                                        </CheckboxGroup>
                                    </div>
                                </div>
                            </Section>

                            {/* 2. 영화 설정 */}
                            <Section>
                                <SectionHeader><SectionTitle>영화 설정 (Target Movies)</SectionTitle></SectionHeader>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                    <CustomInput
                                        placeholder="추가할 타겟 영화 제목 입력"
                                        value={newMovieName}
                                        setValue={setNewMovieName}
                                        onKeyDown={(e) => { if (e.key === 'Enter') addMovie(); }}
                                        style={{ maxWidth: '300px' }}
                                    />
                                    <CustomButton onClick={addMovie} disabled={!newMovieName} size="md">
                                        <Plus size={16} weight="bold" /> 영화 추가
                                    </CustomButton>
                                </div>
                                {config.movieSettings.map((movie, mIdx) => (
                                    <Card key={mIdx}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontWeight: '700', fontSize: '15px', color: '#1e293b' }}>
                                                🎯 Target: <span style={{ color: '#2563eb' }}>{movie.movieName}</span>
                                            </div>
                                            <CustomButton onClick={() => removeMovie(mIdx)} size="sm" style={{ border: 'none' }}>
                                                <Trash size={14} weight="bold" /> 삭제
                                            </CustomButton>
                                        </div>
                                        <div style={{ marginTop: '8px', paddingLeft: '12px', borderLeft: '2px solid #cbd5e1' }}>
                                            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>관련 검색어 (Rival names)</div>
                                            <TagContainer>
                                                {movie.rivalMovieNames.map((rival, rIdx) => (
                                                    <Tag key={rIdx}>{rival}<TagDelete onClick={() => removeRivalMovie(mIdx, rIdx)}><X size={12} weight="bold" /></TagDelete></Tag>
                                                ))}
                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                    <CustomInput
                                                        placeholder="검색어 추가 (Enter)"
                                                        value=""
                                                        setValue={() => { }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                addRivalMovie(mIdx, (e.target as HTMLInputElement).value);
                                                                (e.target as HTMLInputElement).value = '';
                                                            }
                                                        }}
                                                        size="sm"
                                                        borderless
                                                        style={{ background: 'transparent', minWidth: '150px' }}
                                                    />
                                                </div>
                                            </TagContainer>
                                        </div>
                                    </Card>
                                ))}
                            </Section>

                            {/* 3. 기타 필터 */}
                            <Section>
                                <SectionHeader><SectionTitle>필터 설정 (Filters)</SectionTitle></SectionHeader>
                                <FormGrid>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>특수관 필터</div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <CustomInput placeholder="예: 무대인사" value={newSpecialFilter} setValue={setNewSpecialFilter} onKeyDown={(e) => { if (e.key === 'Enter') addSpecialFilter(); }} size="sm" />
                                            <CustomButton onClick={addSpecialFilter} size="sm"><Plus size={14} /></CustomButton>
                                        </div>
                                        <TagContainer>
                                            {config.specialTypeFilters.map((filter, idx) => (
                                                <Tag key={idx} style={{ backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' }}>
                                                    {filter}<TagDelete onClick={() => removeSpecialFilter(idx)} style={{ color: '#94a3b8' }}><X size={12} weight="bold" /></TagDelete>
                                                </Tag>
                                            ))}
                                        </TagContainer>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>씨네드쉐프 매핑</div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <CustomInput placeholder="지점" value={newCineFilter.theaterNm} setValue={(v) => setNewCineFilter(p => ({ ...p, theaterNm: v }))} size="sm" />
                                            <CustomInput placeholder="매핑" value={newCineFilter.refineTheaterNm} setValue={(v) => setNewCineFilter(p => ({ ...p, refineTheaterNm: v }))} size="sm" />
                                            <CustomButton onClick={addCineFilter} size="sm"><Plus size={14} /></CustomButton>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '100px', overflowY: 'auto' }}>
                                            {config.cgvCineDeChefFilters.map((item, idx) => (
                                                <div key={idx} style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: '#f8fafc', borderRadius: '4px' }}>
                                                    <span>{item.theaterNm} → {item.refineTheaterNm}</span>
                                                    <button onClick={() => removeCineFilter(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}><X size={12} /></button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </FormGrid>
                            </Section>

                            <ActionButtonWrapper>
                                <CustomButton onClick={handleRun} size="md" style={{ padding: '0 30px', height: '44px', fontSize: '15px' }}>
                                    <Play size={18} weight="fill" style={{ marginRight: '6px' }} /> 크롤링 시작
                                </CustomButton>
                            </ActionButtonWrapper>
                        </ScrollBody>
                    </DetailContainer>
                </Column>

                {/* [우측] 실행 이력 (History) */}
                <Column>
                    <DetailContainer>
                        <CommonListHeader
                            title="실행 이력 (History)"
                            subtitle="최근 크롤러 실행 기록 및 결과입니다."
                        />
                        <ScrollBody style={{ padding: 0 }}>
                            <HistoryTable>
                                <thead>
                                    <tr>
                                        <Th>Run ID</Th>
                                        <Th>Create At</Th>
                                        <Th>Status</Th>
                                        <Th>Companies</Th>
                                        <Th>Result</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((item) => (
                                        <tr key={item.id}>
                                            <Td>#{item.id}</Td>
                                            <Td>{new Date(item.created_at).toLocaleString('ko-KR', {
                                                month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                            })}</Td>
                                            <Td>
                                                <StatusBadge status={item.status}>
                                                    {item.status === 'RUNNING' && <CircleNotch className="spin" size={14} />}
                                                    {item.status === 'SUCCESS' && <CheckCircle size={14} weight="fill" />}
                                                    {item.status === 'FAILED' && <WarningCircle size={14} weight="fill" />}
                                                    {item.status}
                                                </StatusBadge>
                                            </Td>
                                            <Td>
                                                <div style={{ fontSize: '12px', color: '#64748b' }}>
                                                    {Object.entries(item.configuration.choiceCompany || {})
                                                        .filter(([_, v]) => v)
                                                        .map(([k]) => k.toUpperCase())
                                                        .join(', ')}
                                                </div>
                                            </Td>
                                            <Td>
                                                {item.status === 'SUCCESS' ? (
                                                    <CustomButton
                                                        size="sm"
                                                        onClick={() => handleDownload(item.id)}
                                                    >
                                                        <DownloadSimple size={14} style={{ marginRight: '4px' }} />
                                                        Excel
                                                    </CustomButton>
                                                ) : (item.status === 'RUNNING' || item.status === 'PENDING') ? (
                                                    <CustomButton
                                                        size="sm"
                                                        style={{ backgroundColor: '#fecaca', color: '#dc2626', border: '1px solid #fca5a5' }}
                                                        onClick={() => handleStop(item.id)}
                                                    >
                                                        <StopCircleIcon size={14} style={{ marginRight: '4px' }} />
                                                        정지
                                                    </CustomButton>
                                                ) : item.status === 'FAILED' ? (
                                                    <span style={{ fontSize: '11px', color: '#ef4444' }}>{item.error_message?.slice(0, 20)}...</span>
                                                ) : (
                                                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>-</span>
                                                )}
                                            </Td>
                                        </tr>
                                    ))}
                                    {history.length === 0 && (
                                        <tr>
                                            <Td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                                실행 기록이 없습니다.
                                            </Td>
                                        </tr>
                                    )}
                                </tbody>
                            </HistoryTable>
                        </ScrollBody>
                    </DetailContainer>
                </Column>
            </ContentGrid>
            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </PageContainer>
    );
};
