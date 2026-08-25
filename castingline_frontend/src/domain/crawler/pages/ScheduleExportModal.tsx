import React, { useState } from "react";
import styled from "styled-components";
import { AxiosPost, AxiosGet } from "../../../axios/Axios";
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
    width: 640px;
    max-width: 92%;
    box-shadow: 0 4px 20px rgba(15, 23, 42, 0.15);
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
        &:hover { color: #475569; }
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
    color: #475569;
    &:focus {
        outline: none;
        border-color: #2563eb;
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
    background: ${({ $selected }) => ($selected ? "#eff6ff" : "#ffffff")};
    cursor: pointer;
    font-size: 13px;
    font-weight: ${({ $selected }) => ($selected ? 600 : 500)};
    color: ${({ $selected }) => ($selected ? "#1d4ed8" : "#475569")};
    font-family: "SUIT", sans-serif;
    transition: all 0.15s;

    &:hover {
        border-color: #bfdbfe;
        background: #eff6ff;
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
        &:disabled { background-color: #dcfce7; cursor: not-allowed; }
    `
            : `
        background-color: #f1f5f9;
        color: #475569;
        &:hover { background-color: #e2e8f0; }
    `}
`;

// E005: 특별 상영 포맷 빠른 선택 (백엔드 canonical 태그와 동일 표기)
const SPECIAL_FORMATS = ["IMAX", "3D", "4DX", "SUPER-4D", "DOLBY", "ATMOS", "SCREENX", "MX4D"];

export const ScheduleExportModal: React.FC<ScheduleExportModalProps> = ({
    isOpen,
    onClose,
    startDate,
    endDate,
    mainMovies,
}) => {
    const toast = useToast();
    const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);
    // E006: 주요작 없이(경쟁작만) 다운로드
    const [noMain, setNoMain] = useState(false);
    const [brandFilter, setBrandFilter] = useState({ cgv: true, lotte: true, mega: true, normal: true });
    const [exportStartDate, setExportStartDate] = useState(startDate);
    const [exportEndDate, setExportEndDate] = useState(endDate || startDate);
    const [isExporting, setIsExporting] = useState(false);
    const [specialKeyword, setSpecialKeyword] = useState(""); // 특수상영 키워드 (쉼표 구분)
    // U002: 특별 상영 포맷 필터 — 선택 시 일반 엑셀 다운로드에도 해당 포맷만 담긴다.
    const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
    // 특수상영용 영화 선택 (크롤 대상 영화 전체에서)
    const [crawlTargets, setCrawlTargets] = useState<CrawlTarget[]>([]);
    const [specialMovieId, setSpecialMovieId] = useState<number | null>(null);
    // C004: 경쟁작 다중 선택 — 미선택 시 크롤 대상 영화의 모든 경쟁작(기존 동작)
    const [selectedCompetitorIds, setSelectedCompetitorIds] = useState<number[]>([]);

    // props 변경 시 날짜 동기화
    React.useEffect(() => {
        if (isOpen) {
            setExportStartDate(startDate);
            setExportEndDate(endDate || startDate);
            // 크롤 대상 영화 목록 로드
            AxiosGet("crawler/targets")
                .then((res: any) => setCrawlTargets(res.data || []))
                .catch(() => setCrawlTargets([]));
        }
    }, [isOpen, startDate, endDate]);

    if (!isOpen) return null;

    const selectedMovie = noMain
        ? null
        : mainMovies.find((m) => m.id === selectedMovieId) || (mainMovies.length === 1 ? mainMovies[0] : null);
    const specialMovie = crawlTargets.find((m) => m.id === specialMovieId) || null;

    const handleExport = async () => {
        if (!selectedMovie && !noMain) {
            toast.warning("영화를 선택하거나 '주요작 없이 다운로드'를 선택해주세요.");
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

        // C004: 선택한 경쟁작만 내보내기 (미선택 시 전체)
        const competitorTitles = crawlTargets
            .filter((m) => selectedCompetitorIds.includes(m.id))
            .map((m) => m.clean_title || m.title);

        setIsExporting(true);
        try {
            toast.success("엑셀 생성 중... 잠시만 기다려주세요.");
            const response: any = await AxiosPost(
                "crawler/schedules/export",
                {
                    start_date: exportStartDate,
                    end_date: exportEndDate,
                    // E006: 주요작 없이 다운로드 시 movie_title 미전송 → 경쟁작만 내보냄
                    movie_title: selectedMovie ? selectedMovie.clean_title || selectedMovie.title : undefined,
                    brands: brands.length < 4 ? brands : undefined,
                    // U002: 특별 포맷을 고르면 주요작 유무와 관계없이 그 포맷만 내보낸다
                    formats: selectedFormats.length > 0 ? selectedFormats : undefined,
                    // C004: 경쟁작 다중 선택 — 미선택이면 미전송(전체)
                    competitors: competitorTitles.length > 0 ? competitorTitles : undefined,
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
            let filename = `${selectedMovie ? selectedMovie.title : "경쟁작"}_schedule.xlsx`;
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

    // 특수상영(무대인사·GV 등) 키워드 다운로드 — 선택한 영화 한정, 이미 수집된 시간표에서 필터 (쉼표 다중 입력)
    const handleSpecialExport = async () => {
        if (!specialMovie) {
            toast.warning("크롤 대상 영화를 선택해주세요.");
            return;
        }
        // 위에서 고른 특별 포맷 + 직접 입력한 키워드를 합쳐서 조회한다
        const keyword = [
            ...selectedFormats,
            ...specialKeyword.split(",").map((k) => k.trim()).filter(Boolean),
        ].join(", ");
        if (!keyword) {
            toast.warning("특별 포맷을 선택하거나 특수상영 키워드를 입력해주세요. (예: 무대인사, GV)");
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

        setIsExporting(true);
        try {
            toast.success("특수상영 엑셀 생성 중...");
            const response: any = await AxiosPost(
                "crawler/schedules/special_export",
                {
                    start_date: exportStartDate,
                    end_date: exportEndDate,
                    keyword,
                    movie_title: specialMovie.clean_title || specialMovie.title,
                    brands: brands.length < 4 ? brands : undefined,
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
            let filename = `특수상영_${keyword}_${exportStartDate}.xlsx`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/);
                if (match?.[1]) filename = decodeURIComponent(match[1]);
            }
            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success("특수상영 엑셀이 다운로드 되었습니다.");
        } catch (error: any) {
            let msg = "데이터가 없거나 오류가 발생했습니다.";
            if (error.response?.data instanceof Blob) {
                try { msg = JSON.parse(await error.response.data.text()).error || msg; } catch {}
            } else {
                msg = error.response?.data?.error || msg;
            }
            toast.error("다운로드 실패: " + msg);
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
                                    onClick={() => { setSelectedMovieId(m.id); setNoMain(false); }}
                                >
                                    {m.title}
                                </MovieItem>
                            ))}
                            {/* E006: 주요작 없이(경쟁작만) 다운로드 — 상영시간표 시트 없이 경쟁작·비교표만 생성 */}
                            <MovieItem
                                $selected={noMain}
                                onClick={() => { setNoMain(true); setSelectedMovieId(null); }}
                                style={{ borderStyle: "dashed" }}
                            >
                                주요작 없이 다운로드 (경쟁작만 — 상영시간표 시트 제외)
                            </MovieItem>
                        </MovieList>
                    </div>

                    {/* C004: 경쟁작 다중 선택 — 미선택 시 크롤 대상 영화의 모든 경쟁작 */}
                    <div>
                        <SectionLabel>경쟁작 선택 (다중 선택 · 미선택 시 전체)</SectionLabel>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 120, overflowY: "auto" }}>
                            {crawlTargets.filter((m) => m.movie_type === "competitor" && m.is_active).map((m) => {
                                const active = selectedCompetitorIds.includes(m.id);
                                return (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() =>
                                            setSelectedCompetitorIds((prev) =>
                                                prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                                            )
                                        }
                                        style={{
                                            padding: "3px 10px",
                                            borderRadius: 999,
                                            fontSize: 11,
                                            fontWeight: 700,
                                            fontFamily: "SUIT, sans-serif",
                                            cursor: "pointer",
                                            border: `1px solid ${active ? "#2563eb" : "#cbd5e1"}`,
                                            background: active ? "#eff6ff" : "#ffffff",
                                            color: active ? "#1d4ed8" : "#64748b",
                                        }}
                                    >
                                        {m.title}
                                    </button>
                                );
                            })}
                            {crawlTargets.filter((m) => m.movie_type === "competitor" && m.is_active).length === 0 && (
                                <span style={{ fontSize: 12, color: "#94a3b8" }}>등록된 경쟁작이 없습니다.</span>
                            )}
                        </div>
                    </div>

                    <div>
                        <SectionLabel>계열사 선택</SectionLabel>
                        <BrandRow>
                            <CustomCheckbox label="CGV" checked={brandFilter.cgv} onChange={() => setBrandFilter((p) => ({ ...p, cgv: !p.cgv }))} />
                            <CustomCheckbox label="Lotte" checked={brandFilter.lotte} onChange={() => setBrandFilter((p) => ({ ...p, lotte: !p.lotte }))} />
                            <CustomCheckbox label="Megabox" checked={brandFilter.mega} onChange={() => setBrandFilter((p) => ({ ...p, mega: !p.mega }))} />
                            <CustomCheckbox label="일반극장" checked={brandFilter.normal} onChange={() => setBrandFilter((p) => ({ ...p, normal: !p.normal }))} />
                        </BrandRow>
                    </div>

                    {/* U002: 특별 상영 포맷 필터 — 위 '다운로드'(일반 엑셀)와 아래 '특수상영'에 모두 적용된다 */}
                    <div>
                        <SectionLabel>특별 상영 포맷</SectionLabel>
                        <div style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 8px" }}>
                            선택하면 <b>선택한 포맷의 회차만</b> 담아 내보냅니다. (주요작 있는 엑셀·주요작 없이 받는 엑셀 모두 동일 적용 / 미선택 시 전체 포맷)
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {SPECIAL_FORMATS.map((f) => {
                                const active = selectedFormats.includes(f);
                                return (
                                    <button
                                        key={f}
                                        type="button"
                                        onClick={() =>
                                            setSelectedFormats((prev) =>
                                                prev.includes(f) ? prev.filter((k) => k !== f) : [...prev, f]
                                            )
                                        }
                                        style={{
                                            padding: "3px 10px",
                                            borderRadius: 999,
                                            fontSize: 11,
                                            fontWeight: 700,
                                            fontFamily: "SUIT, sans-serif",
                                            cursor: "pointer",
                                            border: `1px solid ${active ? "#16a34a" : "#cbd5e1"}`,
                                            background: active ? "#f0fdf4" : "#ffffff",
                                            color: active ? "#15803d" : "#64748b",
                                        }}
                                    >
                                        {f}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
                        <SectionLabel>특수상영 다운로드</SectionLabel>
                        <div style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 8px" }}>
                            <b>크롤 대상 영화에서 선택</b>한 영화의, 키워드(쉼표 구분 — 무대인사·GV 등)와 위에서 고른 특별 포맷이 든 스케줄만
                            위 기간·계열사 범위에서 별도 양식 엑셀로 받습니다.
                        </div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                            <select
                                value={specialMovieId ?? ""}
                                onChange={(e) => setSpecialMovieId(e.target.value ? Number(e.target.value) : null)}
                                style={{ flex: 1, minWidth: 0, height: 32, padding: "0 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, background: "#ffffff", textOverflow: "ellipsis" }}
                            >
                                <option value="">크롤 대상 영화 선택</option>
                                {crawlTargets.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.title}{m.movie_type === "competitor" ? " (경쟁작)" : ""}{!m.is_active ? " [비활성]" : ""}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <DateInput
                                type="text"
                                style={{ flex: 1 }}
                                value={specialKeyword}
                                onChange={(e) => setSpecialKeyword(e.target.value)}
                                placeholder="예: 무대인사, GV"
                            />
                            <Button
                                $variant="primary"
                                onClick={handleSpecialExport}
                                disabled={isExporting || (!specialKeyword.trim() && selectedFormats.length === 0) || !specialMovie}
                            >
                                {isExporting ? <Spinner className="spin" size={16} /> : <DownloadSimple size={16} weight="bold" />}
                                특수상영
                            </Button>
                        </div>
                    </div>
                </Body>
                <Footer>
                    <Button onClick={onClose}>취소</Button>
                    <Button $variant="primary" onClick={handleExport} disabled={isExporting || (!selectedMovie && !noMain)}>
                        {isExporting ? <Spinner className="spin" size={16} /> : <DownloadSimple size={16} weight="bold" />}
                        다운로드
                    </Button>
                </Footer>
            </ModalContainer>
        </Overlay>
    );
};
