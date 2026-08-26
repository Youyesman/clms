// A003: [집계작 시간표] 요약보고서(PDF) 다운로드 모달
// 크롤러 관리의 보고서 생성 API(crawler/schedules/report)를 재사용하되,
// 출력 유형 3종(주요작만 / 주요작+경쟁작 / 경쟁작만)과
// 조회 기간(비연속 다중 선택 포함)을 지정할 수 있다.
import { useState } from "react";
import styled from "styled-components";
import { AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.5);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
`;

const ModalBox = styled.div`
    background: #ffffff;
    border-radius: 8px;
    width: 480px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    box-shadow: 0 4px 20px rgba(15, 23, 42, 0.15);
`;

const TypeCard = styled.label<{ $active: boolean; $disabled?: boolean }>`
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    border: 1px solid ${({ $active }) => ($active ? "#2563eb" : "#e2e8f0")};
    background: ${({ $active }) => ($active ? "#eff6ff" : "#ffffff")};
    border-radius: 8px;
    cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
    opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)};

    .title { font-size: 13px; font-weight: 700; color: #1e293b; }
    .desc { font-size: 12px; color: #64748b; margin-top: 2px; }
`;

interface Props {
    movieTitle: string | null; // 현재 선택된 영화 (주요작)
    defaultStart: string;
    defaultEnd: string;
    onClose: () => void;
}

type ReportScope = "main_only" | "main_comp" | "comp_only";

export function TimetableReportModal({ movieTitle, defaultStart, defaultEnd, onClose }: Props) {
    const toast = useToast();
    const [scope, setScope] = useState<ReportScope>(movieTitle ? "main_comp" : "comp_only");
    const [start, setStart] = useState(defaultStart);
    const [end, setEnd] = useState(defaultEnd);
    const [useSpecificDates, setUseSpecificDates] = useState(false);
    const [specificDates, setSpecificDates] = useState<string[]>([]);
    const [dateInput, setDateInput] = useState("");
    const [busy, setBusy] = useState(false);

    const TYPE_OPTIONS: { value: ReportScope; title: string; desc: string; needMain: boolean }[] = [
        { value: "main_only", title: "① 주요작만", desc: "우리 영화 상세 1P", needMain: true },
        { value: "main_comp", title: "② 주요작 + 경쟁작", desc: "우리 영화 상세 1P + 경쟁작 비교 2P", needMain: true },
        { value: "comp_only", title: "③ 경쟁작만", desc: "담당 영화 없는 기간용 / 실시간 예매율 Top 20 요약 1P", needMain: false },
    ];

    const download = async () => {
        if (scope !== "comp_only" && !movieTitle) {
            toast.error("주요작 보고서는 먼저 영화를 선택해주세요.");
            return;
        }
        if (useSpecificDates) {
            if (specificDates.length === 0) {
                toast.error("출력할 날짜를 하나 이상 추가해주세요.");
                return;
            }
        } else if (!start) {
            toast.error("조회 기간을 선택해주세요.");
            return;
        }
        setBusy(true);
        try {
            toast.success("보고서 생성 중... 잠시만 기다려주세요.");
            const response: any = await AxiosPost(
                "crawler/schedules/report",
                {
                    start_date: start,
                    end_date: end || start,
                    dates: useSpecificDates ? specificDates : undefined,
                    mode: scope === "comp_only" ? "none" : "main",
                    scope,
                    main_title: scope !== "comp_only" ? movieTitle : undefined,
                    format: "pdf",
                },
                { responseType: "blob" }
            );
            const blob = new Blob([response.data], { type: "application/pdf" });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            let filename = scope === "comp_only" ? "경쟁작 요약보고서.pdf" : `요약보고서_${movieTitle}.pdf`;
            const cd = response.headers?.["content-disposition"];
            if (cd) {
                const star = cd.match(/filename\*=(?:utf-8'')?([^;]+)/i);
                const plain = cd.match(/filename="?([^";]+)"?/);
                if (star?.[1]) filename = decodeURIComponent(star[1]);
                else if (plain?.[1]) filename = decodeURIComponent(plain[1]);
            }
            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success("보고서가 다운로드 되었습니다.");
            onClose();
        } catch (error: any) {
            let msg = "데이터가 없거나 오류가 발생했습니다.";
            if (error.response?.data instanceof Blob) {
                try { msg = JSON.parse(await error.response.data.text()).error || msg; } catch {}
            } else {
                msg = error.response?.data?.error || msg;
            }
            toast.error("보고서 생성 실패: " + msg);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Overlay onClick={onClose}>
            <ModalBox onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>요약보고서(PDF) 다운로드</span>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 16 }}>&times;</button>
                </div>

                {/* 출력 유형 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>출력 유형</div>
                    {TYPE_OPTIONS.map((opt) => {
                        const disabled = opt.needMain && !movieTitle;
                        return (
                            <TypeCard key={opt.value} $active={scope === opt.value} $disabled={disabled}>
                                <input
                                    type="radio"
                                    name="report-scope"
                                    checked={scope === opt.value}
                                    disabled={disabled}
                                    onChange={() => setScope(opt.value)}
                                    style={{ marginTop: 3 }}
                                />
                                <div>
                                    <div className="title">
                                        {opt.title}
                                        {opt.needMain && movieTitle && scope === opt.value && (
                                            <span style={{ marginLeft: 6, color: "#2563eb" }}>— {movieTitle}</span>
                                        )}
                                    </div>
                                    <div className="desc">{opt.desc}{disabled ? " (영화를 먼저 선택하세요)" : ""}</div>
                                </div>
                            </TypeCard>
                        );
                    })}
                </div>

                {/* 조회 기간 */}
                <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>조회 기간</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: useSpecificDates ? 0.4 : 1 }}>
                        <input type="date" value={start} disabled={useSpecificDates} onChange={(e) => setStart(e.target.value)}
                            style={{ flex: 1, height: 32, padding: "0 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, color: "#475569", outline: "none" }} />
                        <span style={{ color: "#94a3b8", fontSize: 13 }}>~</span>
                        <input type="date" value={end} disabled={useSpecificDates} onChange={(e) => setEnd(e.target.value)}
                            style={{ flex: 1, height: 32, padding: "0 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, color: "#475569", outline: "none" }} />
                    </div>

                    {/* 비연속 다중 선택 */}
                    <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, fontWeight: 600, color: "#475569", cursor: "pointer" }}>
                        <input type="checkbox" checked={useSpecificDates} onChange={() => setUseSpecificDates(v => !v)} />
                        특정 날짜만 골라서 출력 (비연속 다중 선택)
                    </label>
                    {useSpecificDates && (
                        <div style={{ marginTop: 6 }}>
                            <div style={{ display: "flex", gap: 6 }}>
                                <input
                                    type="date"
                                    value={dateInput}
                                    onChange={(e) => setDateInput(e.target.value)}
                                    style={{ flex: 1, height: 30, padding: "0 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, color: "#475569", outline: "none" }}
                                />
                                <button
                                    onClick={() => {
                                        if (!dateInput) return;
                                        setSpecificDates(prev => (prev.includes(dateInput) ? prev : [...prev, dateInput].sort()));
                                        setDateInput("");
                                    }}
                                    style={{ height: 30, padding: "0 12px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                    추가
                                </button>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                                {specificDates.map(d => (
                                    <span key={d}
                                        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                                        {d}
                                        <span onClick={() => setSpecificDates(prev => prev.filter(x => x !== d))} style={{ cursor: "pointer", fontWeight: 700 }}>×</span>
                                    </span>
                                ))}
                                {specificDates.length === 0 && (
                                    <span style={{ fontSize: 11, color: "#94a3b8" }}>날짜를 추가하세요 (예: 8/29, 8/30, 9/5, 9/6)</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button onClick={onClose} disabled={busy}
                        style={{ height: 34, padding: "0 16px", background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        취소
                    </button>
                    <button onClick={download} disabled={busy}
                        style={{ height: 34, padding: "0 16px", background: "#dc2626", color: "white", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
                        {busy ? "생성 중…" : "PDF 다운로드"}
                    </button>
                </div>
            </ModalBox>
        </Overlay>
    );
}
