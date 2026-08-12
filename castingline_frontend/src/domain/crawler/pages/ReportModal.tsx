import React, { useState } from "react";
import styled from "styled-components";
import { AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { X, FilePdf, FileXls, Spinner } from "@phosphor-icons/react";
import { CustomCheckbox } from "../../../components/common/CustomCheckbox";

/* P001: 영화 상영현황 보고서(PDF/엑셀) 생성 모달
   [시간표 수집] DB의 기준기간 + 전주(-7일) 데이터를 집계해
   A4 가로 3페이지 보고서를 내려받는다. */

interface CrawlTarget {
    id: number;
    title: string;
    clean_title?: string;
    movie_type: "main" | "competitor";
    is_active: boolean;
}

interface ReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    startDate: string;
    endDate: string;
    mainMovies: CrawlTarget[];
}

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    background-color: rgba(15, 23, 42, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
`;

const ModalContainer = styled.div`
    background-color: white;
    padding: 24px;
    border-radius: 8px;
    width: 560px;
    max-width: 92%;
    box-shadow: 0 4px 20px rgba(15, 23, 42, 0.15);
    display: flex;
    flex-direction: column;
    gap: 18px;
    font-family: "SUIT", sans-serif;
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
        &:hover { color: #475569; }
    }
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
    color: #475569;
    &:focus {
        outline: none;
        border-color: #2563eb;
    }
`;

const ModeItem = styled.button<{ $selected: boolean }>`
    display: flex;
    align-items: center;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid ${({ $selected }) => ($selected ? "#2563eb" : "#e2e8f0")};
    border-radius: 6px;
    background: ${({ $selected }) => ($selected ? "#eff6ff" : "#ffffff")};
    cursor: pointer;
    font-size: 13px;
    font-weight: ${({ $selected }) => ($selected ? 600 : 500)};
    color: ${({ $selected }) => ($selected ? "#1d4ed8" : "#475569")};
    font-family: "SUIT", sans-serif;
    margin-bottom: 4px;
    &:hover {
        border-color: #bfdbfe;
        background: #eff6ff;
    }
`;

const Footer = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
`;

const Button = styled.button<{ $variant?: "pdf" | "excel" }>`
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
    ${({ $variant }) =>
        $variant === "pdf"
            ? `background-color: #dc2626; color: white; &:hover { background-color: #b91c1c; } &:disabled { background-color: #fecaca; cursor: not-allowed; }`
            : $variant === "excel"
            ? `background-color: #16a34a; color: white; &:hover { background-color: #15803d; } &:disabled { background-color: #dcfce7; cursor: not-allowed; }`
            : `background-color: #f1f5f9; color: #475569; &:hover { background-color: #e2e8f0; }`}
`;

export const ReportModal: React.FC<ReportModalProps> = ({
    isOpen,
    onClose,
    startDate,
    endDate,
    mainMovies,
}) => {
    const toast = useToast();
    const [reportStart, setReportStart] = useState(startDate);
    const [reportEnd, setReportEnd] = useState(endDate || startDate);
    const [mode, setMode] = useState<"main" | "none">("main");
    const [mainMovieId, setMainMovieId] = useState<number | null>(null);
    // W002: 엑셀 다운로드와 같은 계열사 범위로 집계해야 두 파일의 숫자가 일치한다
    const [brandFilter, setBrandFilter] = useState({ cgv: true, lotte: true, mega: true, normal: true });
    const [isBusy, setIsBusy] = useState(false);

    React.useEffect(() => {
        if (isOpen) {
            setReportStart(startDate);
            setReportEnd(endDate || startDate);
        }
    }, [isOpen, startDate, endDate]);

    if (!isOpen) return null;

    const mainMovie =
        mainMovies.find((m) => m.id === mainMovieId) ||
        (mainMovies.length === 1 ? mainMovies[0] : null);

    const download = async (format: "pdf" | "excel") => {
        if (!reportStart) {
            toast.warning("기준 기간을 입력해주세요.");
            return;
        }
        if (mode === "main" && !mainMovie) {
            toast.warning("주요작을 선택해주세요.");
            return;
        }
        const brands: string[] = [];
        if (brandFilter.cgv) brands.push("CGV");
        if (brandFilter.lotte) brands.push("LOTTE");
        if (brandFilter.mega) brands.push("MEGABOX");
        if (brandFilter.normal) brands.push("일반극장");
        if (brands.length === 0) {
            toast.warning("계열사를 하나 이상 선택해주세요.");
            return;
        }
        setIsBusy(true);
        try {
            toast.success("보고서 생성 중... 잠시만 기다려주세요.");
            const response: any = await AxiosPost(
                "crawler/schedules/report",
                {
                    start_date: reportStart,
                    end_date: reportEnd || reportStart,
                    mode,
                    main_title: mode === "main" && mainMovie ? mainMovie.clean_title || mainMovie.title : undefined,
                    brands: brands.length < 4 ? brands : undefined,
                    format,
                },
                { responseType: "blob" }
            );
            const blob = new Blob([response.data], {
                type: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            const contentDisposition = response.headers?.["content-disposition"];
            let filename = `상영현황보고서_${mode === "main" && mainMovie ? mainMovie.title : "주요작X"}.${format === "pdf" ? "pdf" : "xlsx"}`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/);
                if (match?.[1]) filename = decodeURIComponent(match[1]);
            }
            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success("보고서가 다운로드 되었습니다.");
        } catch (error: any) {
            let msg = "데이터가 없거나 오류가 발생했습니다.";
            if (error.response?.data instanceof Blob) {
                try { msg = JSON.parse(await error.response.data.text()).error || msg; } catch {}
            } else {
                msg = error.response?.data?.error || msg;
            }
            toast.error("보고서 생성 실패: " + msg);
        } finally {
            setIsBusy(false);
        }
    };

    return (
        <Overlay onClick={onClose}>
            <ModalContainer onClick={(e) => e.stopPropagation()}>
                <Header>
                    <h2>상영현황 보고서 생성</h2>
                    <button onClick={onClose}>
                        <X size={20} />
                    </button>
                </Header>

                <div>
                    <SectionLabel>기준 기간 (전주는 자동으로 7일 전 동일 구간과 비교)</SectionLabel>
                    <DateRow>
                        <DateInput type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} />
                        <span style={{ color: "#94a3b8", fontSize: 13 }}>~</span>
                        <DateInput type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} />
                    </DateRow>
                </div>

                <div>
                    <SectionLabel>보고서 유형</SectionLabel>
                    <ModeItem $selected={mode === "main"} onClick={() => setMode("main")}>
                        주요작 있음 — 주요작 상영 현황 / 주요작 vs 경쟁작 / 전체 경쟁작
                    </ModeItem>
                    <ModeItem $selected={mode === "none"} onClick={() => setMode("none")}>
                        주요작 없음 — 경쟁작 전체 요약 / 경쟁 현황 / 전체 경쟁작
                    </ModeItem>
                </div>

                <div>
                    <SectionLabel>계열사 선택 (엑셀 다운로드와 같은 범위로 맞춰야 숫자가 일치합니다)</SectionLabel>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                        <CustomCheckbox label="CGV" checked={brandFilter.cgv} onChange={() => setBrandFilter((p) => ({ ...p, cgv: !p.cgv }))} />
                        <CustomCheckbox label="Lotte" checked={brandFilter.lotte} onChange={() => setBrandFilter((p) => ({ ...p, lotte: !p.lotte }))} />
                        <CustomCheckbox label="Megabox" checked={brandFilter.mega} onChange={() => setBrandFilter((p) => ({ ...p, mega: !p.mega }))} />
                        <CustomCheckbox label="일반극장" checked={brandFilter.normal} onChange={() => setBrandFilter((p) => ({ ...p, normal: !p.normal }))} />
                    </div>
                </div>

                {mode === "main" && (
                    <div>
                        <SectionLabel>주요작 선택</SectionLabel>
                        {mainMovies.length === 0 ? (
                            <div style={{ fontSize: 12, color: "#dc2626" }}>
                                등록된 주요작이 없습니다. [크롤 대상 영화]에서 주요작을 등록하거나 '주요작 없음'을 선택하세요.
                            </div>
                        ) : (
                            <select
                                value={mainMovie?.id ?? ""}
                                onChange={(e) => setMainMovieId(e.target.value ? Number(e.target.value) : null)}
                                style={{ width: "100%", height: 34, padding: "0 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, background: "#ffffff" }}
                            >
                                <option value="">주요작 선택</option>
                                {mainMovies.map((m) => (
                                    <option key={m.id} value={m.id}>{m.title}</option>
                                ))}
                            </select>
                        )}
                    </div>
                )}

                <Footer>
                    <Button onClick={onClose}>취소</Button>
                    <Button $variant="pdf" onClick={() => download("pdf")} disabled={isBusy}>
                        {isBusy ? <Spinner className="spin" size={16} /> : <FilePdf size={16} weight="bold" />}
                        PDF 보고서
                    </Button>
                    <Button $variant="excel" onClick={() => download("excel")} disabled={isBusy}>
                        {isBusy ? <Spinner className="spin" size={16} /> : <FileXls size={16} weight="bold" />}
                        엑셀 보고서
                    </Button>
                </Footer>
            </ModalContainer>
        </Overlay>
    );
};
