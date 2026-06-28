import { useState } from "react";
import styled from "styled-components";
import {
    DownloadSimple,
    UploadSimple,
    CheckCircle,
    XCircle,
    FilmSlate,
    Gear,
} from "@phosphor-icons/react";
import { AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { ScoreExcelUploader } from "../../score/pages/ScoreExcelUploader";
import { MegaboxAccountSettings } from "./MegaboxAccountSettings";

const XLSX_MIME =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface IMovie {
    movieNo: string;
    movieNm: string;
}
interface IAccount {
    name: string;
    ok: boolean;
    error: string;
    row_count: number;
    movies: IMovie[];
    filename: string | null;
    file_b64: string | null;
}
interface ICrawlResult {
    start: string;
    end: string;
    total_rows: number;
    accounts: IAccount[];
}

const todayStr = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const b64ToBlob = (b64: string) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: XLSX_MIME });
};

export const MegaboxScorePage = () => {
    const toast = useToast();
    const { openModal } = useGlobalModal();

    const [start, setStart] = useState(todayStr());
    const [end, setEnd] = useState(todayStr());
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
            const res = await AxiosPost("crawler/megabox_score_all", {
                start,
                end: end || start,
                includes: include,
                excludes: exclude,
            });
            setResult(res.data as ICrawlResult);
            const withData = (res.data.accounts as IAccount[]).filter(
                (a) => a.file_b64
            ).length;
            toast.success(`크롤 완료 — ${withData}개 배급사에서 데이터 수집`);
        } catch (e: any) {
            toast.error(
                e?.response?.data?.error || "크롤링에 실패했습니다."
            );
        } finally {
            setLoading(false);
        }
    };

    const downloadOne = (acc: IAccount) => {
        if (!acc.file_b64 || !acc.filename) return;
        const url = window.URL.createObjectURL(b64ToBlob(acc.file_b64));
        const a = document.createElement("a");
        a.href = url;
        a.download = acc.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    };

    const downloadAll = () => {
        const list = (result?.accounts || []).filter((a) => a.file_b64);
        if (!list.length) {
            toast.error("저장할 파일이 없습니다.");
            return;
        }
        list.forEach((a, i) => setTimeout(() => downloadOne(a), i * 400));
    };

    const uploadOne = (acc: IAccount) => {
        if (!acc.file_b64 || !acc.filename) return;
        const file = new File([b64ToBlob(acc.file_b64)], acc.filename, {
            type: XLSX_MIME,
        });
        openModal(
            <ScoreExcelUploader
                initialFile={file}
                onUploadSuccess={() => { /* 저장 완료 */ }}
            />,
            { title: `스코어 업로드 — ${acc.name}`, width: "1600px" }
        );
    };

    const openSettings = () => {
        openModal(<MegaboxAccountSettings />, {
            title: "메가박스 배급사 계정 설정",
            width: "860px",
        });
    };

    const okCount = result?.accounts.filter((a) => a.ok).length ?? 0;
    const failCount = (result?.accounts.length ?? 0) - okCount;
    const dataCount = result?.accounts.filter((a) => a.file_b64).length ?? 0;

    return (
        <Wrapper>
            <Header>
                <HeaderText>
                    <h2>메가박스 스코어 수집</h2>
                    <p>
                        상영일 기준으로 모든 배급사 계정에 로그인해 관람객현황을 크롤하고,
                        배급사별 엑셀로 추출합니다.
                    </p>
                </HeaderText>
                <SettingsBtn onClick={openSettings}>
                    <Gear size={16} weight="bold" /> 배급사 계정 설정
                </SettingsBtn>
            </Header>

            <Controls>
                <Field>
                    <label>상영일 (시작)</label>
                    <input
                        type="date"
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                    />
                </Field>
                <span className="tilde">~</span>
                <Field>
                    <label>상영일 (종료)</label>
                    <input
                        type="date"
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                    />
                </Field>
                <Field $grow>
                    <label>영화명 키워드 (쉼표로 여러 개, 비우면 전체)</label>
                    <input
                        type="text"
                        placeholder="예: 백룸"
                        value={include}
                        onChange={(e) => setInclude(e.target.value)}
                    />
                </Field>
                <Field $grow>
                    <label>제외 키워드 (쉼표)</label>
                    <input
                        type="text"
                        placeholder="예: 눈동자"
                        value={exclude}
                        onChange={(e) => setExclude(e.target.value)}
                    />
                </Field>
                <RunBtn onClick={run} disabled={loading}>
                    {loading ? "크롤링 중…" : "크롤링 실행"}
                </RunBtn>
            </Controls>

            {loading && (
                <Notice>전 배급사 로그인·크롤 중입니다… (보통 수 초 소요)</Notice>
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
                            데이터 수집 배급사 <b>{dataCount}</b>개 · 총{" "}
                            <b>{result.total_rows.toLocaleString()}</b>행
                        </span>
                        <DownloadAllBtn
                            onClick={downloadAll}
                            disabled={dataCount === 0}
                        >
                            <DownloadSimple size={15} weight="bold" /> 전체 저장
                            ({dataCount})
                        </DownloadAllBtn>
                    </SummaryBar>

                    <Table>
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}>상태</th>
                                <th>배급사</th>
                                <th>영화</th>
                                <th style={{ width: 70 }}>행수</th>
                                <th style={{ width: 220 }}>작업</th>
                            </tr>
                        </thead>
                        <tbody>
                            {result.accounts.map((a) => (
                                <tr key={a.name} className={!a.ok ? "failrow" : ""}>
                                    <td>
                                        {a.ok ? (
                                            <CheckCircle
                                                size={18}
                                                weight="fill"
                                                color="#16a34a"
                                            />
                                        ) : (
                                            <XCircle
                                                size={18}
                                                weight="fill"
                                                color="#dc2626"
                                            />
                                        )}
                                    </td>
                                    <td className="name">{a.name}</td>
                                    <td className="movies">
                                        {a.ok ? (
                                            a.movies.length ? (
                                                a.movies
                                                    .map((m) => m.movieNm)
                                                    .join(", ")
                                            ) : (
                                                <span className="dim">
                                                    해당 영화 없음
                                                </span>
                                            )
                                        ) : (
                                            <span className="err">{a.error}</span>
                                        )}
                                    </td>
                                    <td className="num">
                                        {a.row_count
                                            ? a.row_count.toLocaleString()
                                            : "-"}
                                    </td>
                                    <td>
                                        {a.file_b64 && (
                                            <RowActions>
                                                <ActBtn
                                                    onClick={() => downloadOne(a)}
                                                >
                                                    <DownloadSimple size={14} />
                                                    엑셀
                                                </ActBtn>
                                                <ActBtn
                                                    $variant="upload"
                                                    onClick={() => uploadOne(a)}
                                                >
                                                    <UploadSimple size={14} />
                                                    스코어 업로드
                                                </ActBtn>
                                            </RowActions>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </>
            )}

            {!result && !loading && (
                <Empty>
                    <FilmSlate size={40} />
                    <p>상영일과 영화 키워드를 입력하고 크롤링을 실행하세요.</p>
                </Empty>
            )}
        </Wrapper>
    );
};

/* ───── styles ───── */
const Wrapper = styled.div`
    padding: 28px 32px;
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
    height: 36px;
    padding: 0 14px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #fff;
    color: #334155;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    &:hover {
        background: #f1f5f9;
        border-color: #94a3b8;
    }
`;
const Controls = styled.div`
    display: flex;
    align-items: flex-end;
    gap: 12px;
    flex-wrap: wrap;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;
    .tilde {
        padding-bottom: 9px;
        color: #94a3b8;
    }
`;
const Field = styled.div<{ $grow?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex: ${({ $grow }) => ($grow ? "1 1 200px" : "0 0 auto")};
    label {
        font-size: 12px;
        font-weight: 600;
        color: #475569;
    }
    input {
        height: 38px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 0 10px;
        font-size: 14px;
        font-family: inherit;
        &:focus {
            outline: none;
            border-color: #2563eb;
        }
    }
`;
const RunBtn = styled.button`
    height: 38px;
    padding: 0 20px;
    border: 0;
    border-radius: 8px;
    background: #2563eb;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
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
    border-radius: 10px;
    color: #1e40af;
    font-size: 13px;
    margin-bottom: 16px;
`;
const SummaryBar = styled.div`
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
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
    height: 34px;
    padding: 0 14px;
    border: 1px solid #16a34a;
    background: #16a34a;
    color: #fff;
    border-radius: 8px;
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
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
    font-size: 13px;
    thead th {
        background: #f1f5f9;
        color: #475569;
        font-weight: 700;
        text-align: left;
        padding: 10px 12px;
        border-bottom: 1px solid #e2e8f0;
    }
    tbody td {
        padding: 9px 12px;
        border-bottom: 1px solid #f1f5f9;
        color: #334155;
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
    .movies .err {
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
const ActBtn = styled.button<{ $variant?: "upload" }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    padding: 0 10px;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid
        ${({ $variant }) => ($variant === "upload" ? "#2563eb" : "#cbd5e1")};
    background: ${({ $variant }) =>
        $variant === "upload" ? "#2563eb" : "#fff"};
    color: ${({ $variant }) => ($variant === "upload" ? "#fff" : "#334155")};
    &:hover {
        ${({ $variant }) =>
            $variant === "upload"
                ? "background:#1d4ed8;"
                : "background:#f1f5f9;"}
    }
`;
const Empty = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 80px 0;
    color: #94a3b8;
    font-size: 14px;
`;
