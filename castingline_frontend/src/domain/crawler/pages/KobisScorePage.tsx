import { useState } from "react";
import styled from "styled-components";
import {
    DownloadSimple,
    UploadSimple,
    CheckCircle,
    XCircle,
    FilmSlate,
    Gear,
    ListMagnifyingGlass,
} from "@phosphor-icons/react";
import { AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { ScoreExcelUploader } from "../../score/pages/ScoreExcelUploader";
import { ScoreDeleteModal } from "../../score/components/ScoreDeleteModal";
import { KobisAccountSettings } from "./KobisAccountSettings";
import { KobisScoreVerifyModal } from "./KobisScoreVerifyModal";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";
import { CustomInput } from "../../../components/common/CustomInput";

const XLSX_MIME =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface IMovie {
    movieCd: string;
    movieNm: string;
    theaters: number;
    visitors: number;
    error: string;
    filename: string | null;
    file_b64: string | null;
}
interface IAccount {
    name: string;
    ok: boolean;
    error: string;
    movies: IMovie[];
}
interface ICrawlResult {
    start: string;
    end: string;
    total_movies: number;
    accounts: IAccount[];
}

const todayStr = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const b64ToBlob = (b64: string) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: XLSX_MIME });
};

export const KobisScorePage = () => {
    const toast = useToast();
    const { openModal } = useGlobalModal();

    const [start, setStart] = useState(todayStr(-1));
    const [end, setEnd] = useState(todayStr(-1));
    const [include, setInclude] = useState("");
    const [exclude, setExclude] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ICrawlResult | null>(null);

    const run = async () => {
        if (!start) {
            toast.error("상영 시작일을 입력하세요.");
            return;
        }
        setLoading(true);
        setResult(null);
        try {
            const res = await AxiosPost("crawler/kobis_score_all", {
                start,
                end: end || start,
                includes: include,
                excludes: exclude,
            });
            setResult(res.data as ICrawlResult);
            // 키워드로 찾은 배급사와 매칭되는 계정이 없는 경우 등 — 빈 화면 대신 원인 안내 (K001)
            if (res.data.warning) {
                toast.warning(res.data.warning);
                return;
            }
            const files = (res.data.accounts as IAccount[]).flatMap((a) =>
                a.movies.filter((m) => m.file_b64)
            ).length;
            toast.success(`수집 완료 — 영화 파일 ${files}개`);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "수집에 실패했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const downloadOne = (mv: IMovie) => {
        if (!mv.file_b64 || !mv.filename) return;
        const url = window.URL.createObjectURL(b64ToBlob(mv.file_b64));
        const a = document.createElement("a");
        a.href = url;
        a.download = mv.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    };

    const allFiles = () =>
        (result?.accounts || []).flatMap((a) => a.movies.filter((m) => m.file_b64));

    const downloadAll = () => {
        const list = allFiles();
        if (!list.length) {
            toast.error("저장할 파일이 없습니다.");
            return;
        }
        list.forEach((m, i) => setTimeout(() => downloadOne(m), i * 400));
    };

    const uploadOne = (acc: IAccount, mv: IMovie) => {
        if (!mv.file_b64 || !mv.filename) return;
        const file = new File([b64ToBlob(mv.file_b64)], mv.filename, {
            type: XLSX_MIME,
        });
        openModal(
            <ScoreExcelUploader
                initialFile={file}
                onUploadSuccess={() => { /* 저장 완료 */ }}
            />,
            { title: `스코어 업로드 — ${acc.name} / ${mv.movieNm}`, width: "1600px" }
        );
    };

    // 수집한 영진위 엑셀 ↔ CLMS 등록 스코어 대사 (극장×요금×날짜 인원수)
    const verifyOne = (acc: IAccount, mv: IMovie) => {
        if (!mv.file_b64 || !mv.filename) return;
        const file = new File([b64ToBlob(mv.file_b64)], mv.filename, {
            type: XLSX_MIME,
        });
        openModal(
            <KobisScoreVerifyModal
                file={file}
                movieName={mv.movieNm}
                distributorName={acc.name}
            />,
            { title: `스코어 검증 — ${acc.name} / ${mv.movieNm}`, width: "1280px" }
        );
    };

    // KOBIS 상세내역 업로드는 체인 4사를 뺀 일반극장이 대상이므로 삭제도 같은 범위로 (A001)
    const openScoreDelete = () => {
        openModal(
            <ScoreDeleteModal
                excludeMultis={["CGV", "메가박스", "롯데", "씨네큐"]}
                scopeLabel="일반극장(CGV·메가박스·롯데·씨네큐 제외)"
                sourceLabel="KOBIS 상세내역"
            />,
            { title: "스코어 삭제", width: "560px" }
        );
    };

    const openSettings = () => {
        openModal(<KobisAccountSettings />, {
            title: "KOBIS 배급사 계정 설정",
            width: "1020px",
        });
    };

    const okCount = result?.accounts.filter((a) => a.ok).length ?? 0;
    const failCount = (result?.accounts.length ?? 0) - okCount;
    const fileCount = result ? allFiles().length : 0;

    return (
        <Wrapper>
            <Header>
                <HeaderText>
                    <h2>KOBIS 상세내역 수집</h2>
                    <p>
                        모든 배급사 계정으로 KOBIS(통합전산망)에 로그인해
                        회원용통계(영화사별)상세 엑셀을 영화별로 내려받습니다. 파일은
                        영진위(일반극장) 스코어 업로드 양식과 동일하며, 업로드 시 영화를
                        선택하면 됩니다. (조회 기간 최대 1개월 — KOBIS 제한)
                    </p>
                </HeaderText>
                <SettingsBtn onClick={openSettings}>
                    <Gear size={16} weight="bold" /> 배급사 계정 설정
                </SettingsBtn>
            </Header>

            <CommonFilterBar
                actions={
                    <RunBtn onClick={run} disabled={loading}>
                        {loading ? "수집 중…" : "수집 실행"}
                    </RunBtn>
                }>
                <CustomInput label="상영일 시작" inputType="date" value={start} setValue={setStart} />
                <CustomInput label="상영일 종료" inputType="date" value={end} setValue={setEnd} />
                <CustomInput
                    label="영화명 키워드(쉼표, 비우면 전체)"
                    placeholder="예: 백룸"
                    value={include}
                    setValue={setInclude}
                />
                <CustomInput label="제외 키워드(쉼표)" placeholder="예: 무대인사" value={exclude} setValue={setExclude} />
            </CommonFilterBar>

            {loading && (
                <Notice>
                    전 배급사 로그인·영화별 상세 엑셀을 내려받는 중입니다… (영화 수와
                    기간에 따라 수십 초~수 분 소요)
                </Notice>
            )}

            {result && (
                <>
                    <SummaryBar>
                        <span>
                            상영일 <b>{result.start}</b>
                            {result.end !== result.start && <> ~ <b>{result.end}</b></>}
                        </span>
                        <span>
                            로그인 성공 <b className="ok">{okCount}</b> / 실패{" "}
                            <b className="fail">{failCount}</b>
                        </span>
                        <span>
                            수집 파일 <b>{fileCount}</b>개
                        </span>
                        <DownloadAllBtn
                            onClick={downloadAll}
                            disabled={fileCount === 0}
                        >
                            <DownloadSimple size={15} weight="bold" /> 전체 저장
                            ({fileCount})
                        </DownloadAllBtn>
                    </SummaryBar>

                    <Table>
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}>상태</th>
                                <th style={{ width: 220 }}>배급사</th>
                                <th>영화</th>
                                <th style={{ width: 80 }}>극장수</th>
                                <th style={{ width: 90 }}>관객수</th>
                                <th style={{ width: 330 }}>작업</th>
                            </tr>
                        </thead>
                        <tbody>
                            {result.accounts.map((a) => {
                                if (!a.ok) {
                                    return (
                                        <tr key={a.name} className="failrow">
                                            <td>
                                                <XCircle size={18} weight="fill" color="#dc2626" />
                                            </td>
                                            <td className="name">{a.name}</td>
                                            <td className="movies" colSpan={4}>
                                                <span className="err">{a.error}</span>
                                            </td>
                                        </tr>
                                    );
                                }
                                if (!a.movies.length) {
                                    return (
                                        <tr key={a.name}>
                                            <td>
                                                <CheckCircle size={18} weight="fill" color="#16a34a" />
                                            </td>
                                            <td className="name">{a.name}</td>
                                            <td className="movies" colSpan={4}>
                                                <span className="dim">해당 영화 없음</span>
                                            </td>
                                        </tr>
                                    );
                                }
                                return a.movies.map((mv, i) => (
                                    <tr key={`${a.name}-${mv.movieCd}`}>
                                        <td>
                                            {i === 0 &&
                                                (mv.file_b64 || !mv.error ? (
                                                    <CheckCircle size={18} weight="fill" color="#16a34a" />
                                                ) : (
                                                    <XCircle size={18} weight="fill" color="#dc2626" />
                                                ))}
                                        </td>
                                        <td className="name">{i === 0 ? a.name : ""}</td>
                                        <td className="movies">
                                            {mv.movieNm}
                                            {mv.error && <span className="err"> — {mv.error}</span>}
                                        </td>
                                        <td className="num">{mv.theaters.toLocaleString()}</td>
                                        <td className="num">{mv.visitors.toLocaleString()}</td>
                                        <td>
                                            {mv.file_b64 && (
                                                <RowActions>
                                                    <ActBtn onClick={() => downloadOne(mv)}>
                                                        <DownloadSimple size={14} />
                                                        엑셀
                                                    </ActBtn>
                                                    <ActBtn
                                                        $variant="upload"
                                                        onClick={() => uploadOne(a, mv)}
                                                    >
                                                        <UploadSimple size={14} />
                                                        스코어 업로드
                                                    </ActBtn>
                                                    <ActBtn
                                                        $variant="verify"
                                                        onClick={() => verifyOne(a, mv)}
                                                    >
                                                        <ListMagnifyingGlass size={14} />
                                                        스코어 검증
                                                    </ActBtn>
                                                    <ActBtn
                                                        onClick={openScoreDelete}
                                                        style={{ color: "#dc2626", borderColor: "#fecaca" }}
                                                        title="상영일·영화를 지정해 이미 등록된 스코어를 일괄 삭제합니다.">
                                                        스코어 삭제
                                                    </ActBtn>
                                                </RowActions>
                                            )}
                                        </td>
                                    </tr>
                                ));
                            })}
                        </tbody>
                    </Table>
                </>
            )}

            {!result && !loading && (
                <Empty>
                    <FilmSlate size={40} />
                    <p>상영일과 영화 키워드를 입력하고 수집을 실행하세요.</p>
                </Empty>
            )}
        </Wrapper>
    );
};

/* ───── styles ───── */
const Wrapper = styled.div`
    padding: 20px;
    background: #f8fafc;
    min-height: 100%;
    font-family: "SUIT", sans-serif;
`;
const Header = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
`;
const HeaderText = styled.div`
    h2 {
        font-size: 20px;
        font-weight: 700;
        color: #0f172a;
        margin: 0 0 4px;
    }
    p {
        font-size: 13px;
        color: #64748b;
        margin: 0;
    }
`;
const SettingsBtn = styled.button`
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #475569;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    &:hover {
        background: #f1f5f9;
        border-color: #94a3b8;
    }
`;
const RunBtn = styled.button`
    height: 32px;
    padding: 0 16px;
    border: 0;
    border-radius: 6px;
    background: #2563eb;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    &:hover:not(:disabled) {
        background: #1d4ed8;
    }
    &:disabled {
        opacity: 0.6;
        cursor: wait;
    }
`;
const Notice = styled.div`
    padding: 14px 16px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
    color: #1d4ed8;
    font-size: 13px;
    margin-bottom: 16px;
`;
const SummaryBar = styled.div`
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 12px;
    font-size: 13px;
    color: #475569;
    b {
        color: #0f172a;
    }
    b.ok {
        color: #16a34a;
    }
    b.fail {
        color: #dc2626;
    }
`;
const DownloadAllBtn = styled.button`
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 14px;
    border: 1px solid #16a34a;
    background: #16a34a;
    color: #ffffff;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    &:hover:not(:disabled) {
        background: #15803d;
    }
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;
const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
    font-size: 12.5px;
    thead th {
        background: #f8fafc;
        color: #64748b;
        font-size: 12px;
        font-weight: 600;
        text-align: left;
        padding: 10px 12px;
        border-bottom: 1px solid #e2e8f0;
    }
    tbody td {
        padding: 9px 12px;
        border-bottom: 1px solid #e2e8f0;
        color: #1e293b;
        vertical-align: middle;
    }
    tbody tr.failrow {
        background: #fef2f2;
    }
    .name {
        font-weight: 600;
        color: #0f172a;
        white-space: nowrap;
    }
    .movies {
        color: #475569;
    }
    .movies .dim {
        color: #94a3b8;
    }
    .movies .err,
    .err {
        color: #dc2626;
    }
    .num {
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
`;
const RowActions = styled.div`
    display: flex;
    gap: 6px;
`;
const ActBtn = styled.button<{ $variant?: "upload" | "verify" }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    padding: 0 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    border: 1px solid
        ${({ $variant }) =>
            $variant === "upload"
                ? "#2563eb"
                : $variant === "verify"
                ? "#0f766e"
                : "#cbd5e1"};
    background: ${({ $variant }) =>
        $variant === "upload" ? "#2563eb" : "#ffffff"};
    color: ${({ $variant }) =>
        $variant === "upload"
            ? "#ffffff"
            : $variant === "verify"
            ? "#0f766e"
            : "#475569"};
    &:hover {
        ${({ $variant }) =>
            $variant === "upload"
                ? "background:#1d4ed8;"
                : $variant === "verify"
                ? "background:#f0fdfa;"
                : "background:#f1f5f9;"}
    }
`;
const Empty = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 72px 24px;
    color: #94a3b8;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.6;
`;
