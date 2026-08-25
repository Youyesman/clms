import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import {
    CheckCircle,
    WarningCircle,
    Warning,
    ClipboardText,
} from "@phosphor-icons/react";
import { AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { AutocompleteInputMovie } from "../../../components/common/AutocompleteInputMovie";
import { ClientMappingQuickEdit } from "../../score/pages/ClientMappingQuickEdit";

/* ───── types ───── */
interface IMovieBrief {
    id: number;
    title_ko: string;
    release_date: string;
}
interface ISummary {
    excel_visitor: number;
    excel_compared_visitor: number;
    clms_visitor: number;
    diff_visitor: number;
    compare_keys: number;
    match_keys: number;
    diff_keys: number;
    diff_theaters: number;
    unmatched_theaters: number;
    unmatched_visitor: number;
    is_ok: boolean;
}
interface ITheaterStat {
    client_id: number;
    theater_name: string;
    excel_visitor: number;
    clms_visitor: number;
    diff: number;
    diff_count: number;
}
interface IDiff {
    client_id: number;
    theater_name: string;
    entry_date: string;
    fare: number;
    excel_visitor: number;
    clms_visitor: number;
    diff: number;
    kind: "only_excel" | "only_clms" | "mismatch";
}
interface IUnmatched {
    theater_name: string;
    visitor: number;
    rows: number;
    error: string;
}
interface IVerifyResult {
    movie: IMovieBrief;
    period: { start: string; end: string };
    summary: ISummary;
    theater_summary: ITheaterStat[];
    diffs: IDiff[];
    unmatched: IUnmatched[];
}
interface INeedMovie {
    need_movie: true;
    movie_name: string;
    message: string;
    candidates: IMovieBrief[];
}

interface Props {
    file: File;
    movieName: string;
    distributorName?: string;
}

const KIND_LABEL: Record<IDiff["kind"], string> = {
    only_excel: "CLMS 미등록",
    only_clms: "영진위에 없음",
    mismatch: "인원 불일치",
};

const n = (v: number) => (v ?? 0).toLocaleString();
const signed = (v: number) => (v > 0 ? `+${n(v)}` : n(v));

export const KobisScoreVerifyModal = ({
    file,
    movieName,
    distributorName,
}: Props) => {
    const toast = useToast();

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<IVerifyResult | null>(null);
    const [needMovie, setNeedMovie] = useState<INeedMovie | null>(null);
    const [error, setError] = useState("");

    const [movieForm, setMovieForm] = useState<{
        movie: { id?: string; title_ko: string };
    }>({ movie: { id: undefined, title_ko: "" } });
    const [movieInput, setMovieInput] = useState("");

    // S001: 미매핑 극장 행에서 '극장 매핑' 클릭 시 영진위 극장명 등록 패널 대상
    const [editingClient, setEditingClient] = useState<{ rawClientName: string } | null>(null);

    const verify = useCallback(
        async (movieId?: string) => {
            setLoading(true);
            setError("");
            try {
                const fd = new FormData();
                fd.append("file", file);
                if (movieId) fd.append("movie_id", movieId);
                else fd.append("movie_name", movieName);

                const res = await AxiosPost("score/verify-kofic", fd, {
                    headers: { "Content-Type": "multipart/form-data" },
                });
                if (res.data?.need_movie) {
                    setNeedMovie(res.data as INeedMovie);
                    setResult(null);
                    return;
                }
                setNeedMovie(null);
                setResult(res.data as IVerifyResult);
                if (res.data.summary.is_ok) {
                    toast.success("영진위 상세내역과 CLMS 스코어가 완전히 일치합니다.");
                } else {
                    toast.warning(
                        `차이 ${n(res.data.summary.diff_keys)}건 / 미매핑 극장 ${n(
                            res.data.summary.unmatched_theaters
                        )}곳이 확인되었습니다.`
                    );
                }
            } catch (e: any) {
                const msg = e?.response?.data?.error || "검증에 실패했습니다.";
                setError(msg);
                toast.error(msg);
            } finally {
                setLoading(false);
            }
        },
        [file, movieName, toast]
    );

    // 최초 진입 시 영화명으로 자동 매칭 시도
    const ranOnce = useRef(false);
    useEffect(() => {
        if (ranOnce.current) return;
        ranOnce.current = true;
        verify();
    }, [verify]);

    // 사용자가 영화를 직접 고르면 그 영화로 재검증
    useEffect(() => {
        if (movieForm.movie?.id) verify(String(movieForm.movie.id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [movieForm.movie?.id]);

    // S001: 극장 매핑 패널 닫기 — 영진위 극장명이 등록됐으면 같은 영화로 다시 검증
    const handleClientEditClose = (changed: boolean) => {
        setEditingClient(null);
        if (changed) {
            toast.info("극장 매핑이 등록되어 다시 검증합니다.");
            verify(result ? String(result.movie.id) : undefined);
        }
    };

    const copyDiffs = () => {
        if (!result?.diffs.length) return;
        const header = ["극장", "날짜", "요금", "영진위인원", "CLMS인원", "차이", "구분"];
        const body = result.diffs.map((d) =>
            [
                d.theater_name,
                d.entry_date,
                d.fare,
                d.excel_visitor,
                d.clms_visitor,
                d.diff,
                KIND_LABEL[d.kind],
            ].join("\t")
        );
        navigator.clipboard
            .writeText([header.join("\t"), ...body].join("\n"))
            .then(() => toast.success(`차이 ${result.diffs.length}건을 복사했습니다.`))
            .catch(() => toast.error("복사에 실패했습니다."));
    };

    /* ───── render ───── */
    return (
        <Wrap>
            <TopInfo>
                <div>
                    <b>{movieName}</b>
                    {distributorName && <span className="dim"> · {distributorName}</span>}
                </div>
                <div className="dim">{file.name}</div>
            </TopInfo>

            <Rule>
                비교 기준 — 발권금액 <b>0원 행 제외</b>, CGV·메가박스·롯데·씨네큐 체인,
                기타(일반)극장 포함,
                <b> 관(스크린)·회차는 무시</b>하고 <b>극장 × 요금 × 날짜</b> 단위 인원수 합계를
                대조합니다. 관객수는 회차별 컬럼이 아닌 <b>‘전체’ 컬럼</b> 기준이라
                0회차 스코어도 포함됩니다.
            </Rule>

            {loading && <Notice>영진위 엑셀을 분석하고 CLMS 스코어와 대조하는 중입니다…</Notice>}

            {error && !loading && <ErrBox>{error}</ErrBox>}

            {needMovie && !loading && (
                <PickBox>
                    <p>{needMovie.message}</p>
                    {needMovie.candidates.length > 0 && (
                        <Candidates>
                            {needMovie.candidates.map((c) => (
                                <CandBtn key={c.id} onClick={() => verify(String(c.id))}>
                                    {c.title_ko}
                                    {c.release_date && <em>{c.release_date}</em>}
                                </CandBtn>
                            ))}
                        </Candidates>
                    )}
                    <div style={{ maxWidth: 460, marginTop: 10 }}>
                        <AutocompleteInputMovie
                            label="영화 선택"
                            formData={movieForm}
                            setFormData={setMovieForm}
                            inputValue={movieInput}
                            setInputValue={setMovieInput}
                            placeholder="CLMS 영화 검색"
                            labelWidth="70px"
                            isPrimaryOnly
                        />
                    </div>
                </PickBox>
            )}

            {result && !loading && (
                <>
                    <Verdict $ok={result.summary.is_ok}>
                        {result.summary.is_ok ? (
                            <>
                                <CheckCircle size={22} weight="fill" />
                                <div>
                                    <b>완전 일치</b>
                                    <span>
                                        {result.movie.title_ko} · {result.period.start} ~{" "}
                                        {result.period.end} · 비교 {n(result.summary.compare_keys)}
                                        건 전부 동일
                                    </span>
                                </div>
                            </>
                        ) : (
                            <>
                                <WarningCircle size={22} weight="fill" />
                                <div>
                                    <b>
                                        차이 {n(result.summary.diff_keys)}건 (극장{" "}
                                        {n(result.summary.diff_theaters)}곳)
                                        {result.summary.unmatched_theaters > 0 &&
                                            ` · 미매핑 극장 ${n(result.summary.unmatched_theaters)}곳`}
                                    </b>
                                    <span>
                                        {result.movie.title_ko} · {result.period.start} ~{" "}
                                        {result.period.end}
                                    </span>
                                </div>
                            </>
                        )}
                    </Verdict>

                    <Stats>
                        <Stat>
                            <label>영진위 인원(전체)</label>
                            <strong>{n(result.summary.excel_visitor)}</strong>
                        </Stat>
                        <Stat>
                            <label>영진위 인원(비교대상)</label>
                            <strong>{n(result.summary.excel_compared_visitor)}</strong>
                        </Stat>
                        <Stat>
                            <label>CLMS 스코어 인원</label>
                            <strong>{n(result.summary.clms_visitor)}</strong>
                        </Stat>
                        <Stat $bad={result.summary.diff_visitor !== 0}>
                            <label>인원 차이</label>
                            <strong>{signed(result.summary.diff_visitor)}</strong>
                        </Stat>
                        <Stat>
                            <label>일치 / 비교 건수</label>
                            <strong>
                                {n(result.summary.match_keys)} / {n(result.summary.compare_keys)}
                            </strong>
                        </Stat>
                    </Stats>

                    {/* S001: 스코어 업로드와 동일하게 미매핑 극장을 에러 데이터로 표기하고
                        바로 극장 매핑(영진위 극장명 등록)할 수 있게 한다 */}
                    {result.unmatched.length > 0 && (
                        <Section>
                            <SecTitle $warn>
                                <Warning size={16} weight="fill" />
                                매핑되지 않은 극장 {n(result.unmatched.length)}곳
                            </SecTitle>
                            <Hint>
                                [극장 매핑]을 누르면 [거래처 관리] 극장 기본 정보의{" "}
                                <b>영진위 극장명</b>에 저장되어 바로 다시 검증합니다.
                            </Hint>
                            <Table>
                                <thead>
                                    <tr>
                                        <th>영진위 극장명</th>
                                        <th style={{ width: 100 }}>인원</th>
                                        <th style={{ width: 80 }}>행수</th>
                                        <th style={{ width: 260 }}>매칭 오류</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.unmatched.map((u) => (
                                        <tr key={u.theater_name} className="errorRow">
                                            <td>{u.theater_name}</td>
                                            <td className="num">{n(u.visitor)}</td>
                                            <td className="num">{n(u.rows)}</td>
                                            <td>
                                                <span className="err">{u.error}</span>
                                                <MapBtn
                                                    type="button"
                                                    onClick={() =>
                                                        setEditingClient({ rawClientName: u.theater_name })
                                                    }>
                                                    극장 매핑
                                                </MapBtn>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        </Section>
                    )}

                    {result.theater_summary.length > 0 && (
                        <Section>
                            <SecTitle>차이 극장 요약 ({n(result.theater_summary.length)}곳)</SecTitle>
                            <Table>
                                <thead>
                                    <tr>
                                        <th>극장</th>
                                        <th style={{ width: 110 }}>영진위 인원</th>
                                        <th style={{ width: 110 }}>CLMS 인원</th>
                                        <th style={{ width: 90 }}>차이</th>
                                        <th style={{ width: 90 }}>차이 건수</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.theater_summary.map((t) => (
                                        <tr key={t.client_id}>
                                            <td className="name">{t.theater_name}</td>
                                            <td className="num">{n(t.excel_visitor)}</td>
                                            <td className="num">{n(t.clms_visitor)}</td>
                                            <td className="num bad">{signed(t.diff)}</td>
                                            <td className="num">{n(t.diff_count)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        </Section>
                    )}

                    {result.diffs.length > 0 && (
                        <Section>
                            <SecTitle>
                                차이 상세 ({n(result.diffs.length)}건)
                                <CopyBtn onClick={copyDiffs}>
                                    <ClipboardText size={14} weight="bold" /> 복사
                                </CopyBtn>
                            </SecTitle>
                            <Scroll>
                                <Table>
                                    <thead>
                                        <tr>
                                            <th>극장</th>
                                            <th style={{ width: 110 }}>날짜</th>
                                            <th style={{ width: 90 }}>요금</th>
                                            <th style={{ width: 100 }}>영진위 인원</th>
                                            <th style={{ width: 100 }}>CLMS 인원</th>
                                            <th style={{ width: 80 }}>차이</th>
                                            <th style={{ width: 110 }}>구분</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.diffs.map((d, i) => (
                                            <tr key={`${d.client_id}-${d.entry_date}-${d.fare}-${i}`}>
                                                <td className="name">{d.theater_name}</td>
                                                <td>{d.entry_date}</td>
                                                <td className="num">{n(d.fare)}</td>
                                                <td className="num">{n(d.excel_visitor)}</td>
                                                <td className="num">{n(d.clms_visitor)}</td>
                                                <td className="num bad">{signed(d.diff)}</td>
                                                <td>
                                                    <Tag $kind={d.kind}>{KIND_LABEL[d.kind]}</Tag>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            </Scroll>
                        </Section>
                    )}
                </>
            )}

            {/* S001: 미매핑 극장 행에서 '극장 매핑' 클릭 시 인라인 매핑 패널 (스코어 업로드와 동일) */}
            {editingClient && (
                <ClientMappingQuickEdit
                    rawClientName={editingClient.rawClientName}
                    onClose={handleClientEditClose}
                />
            )}
        </Wrap>
    );
};

/* ───── styles ───── */
const Wrap = styled.div`
    font-family: "SUIT", sans-serif;
    font-size: 13px;
    color: #1e293b;
    /* S001: 극장 매핑 패널(Overlay, absolute)이 모달 전체를 덮도록 기준 컨테이너로 지정 */
    position: relative;
`;
const TopInfo = styled.div`
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 8px;
    b {
        font-size: 15px;
        color: #0f172a;
    }
    .dim {
        color: #94a3b8;
        font-size: 12px;
    }
`;
const Rule = styled.div`
    padding: 10px 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    color: #64748b;
    font-size: 12px;
    line-height: 1.6;
    margin-bottom: 14px;
    b {
        color: #334155;
    }
`;
const Notice = styled.div`
    padding: 14px 16px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
    color: #1d4ed8;
`;
const ErrBox = styled.div`
    padding: 14px 16px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #b91c1c;
`;
const PickBox = styled.div`
    padding: 14px 16px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 6px;
    color: #92400e;
    p {
        margin: 0 0 10px;
        line-height: 1.6;
    }
`;
const Candidates = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
`;
const CandBtn = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid #d97706;
    border-radius: 999px;
    background: #ffffff;
    color: #b45309;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    em {
        font-style: normal;
        color: #a8a29e;
        font-weight: 500;
    }
    &:hover {
        background: #fef3c7;
    }
`;
const Verdict = styled.div<{ $ok: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 8px;
    margin-bottom: 12px;
    background: ${({ $ok }) => ($ok ? "#f0fdf4" : "#fef2f2")};
    border: 1px solid ${({ $ok }) => ($ok ? "#bbf7d0" : "#fecaca")};
    color: ${({ $ok }) => ($ok ? "#15803d" : "#b91c1c")};
    div {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    b {
        font-size: 15px;
    }
    span {
        font-size: 12px;
        color: #64748b;
    }
`;
const Stats = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
`;
const Stat = styled.div<{ $bad?: boolean }>`
    flex: 1 1 150px;
    padding: 10px 12px;
    background: #ffffff;
    border: 1px solid ${({ $bad }) => ($bad ? "#fecaca" : "#e2e8f0")};
    border-radius: 6px;
    label {
        display: block;
        font-size: 11px;
        color: #94a3b8;
        margin-bottom: 4px;
    }
    strong {
        font-size: 17px;
        font-variant-numeric: tabular-nums;
        color: ${({ $bad }) => ($bad ? "#dc2626" : "#0f172a")};
    }
`;
const Section = styled.div`
    margin-bottom: 18px;
`;
const SecTitle = styled.div<{ $warn?: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    color: ${({ $warn }) => ($warn ? "#b45309" : "#0f172a")};
    margin-bottom: 6px;
`;
const Hint = styled.div`
    font-size: 11.5px;
    color: #94a3b8;
    margin-bottom: 6px;
    b {
        color: #64748b;
    }
`;
const CopyBtn = styled.button`
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 10px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #475569;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    &:hover {
        background: #f1f5f9;
    }
`;
const Scroll = styled.div`
    max-height: 420px;
    overflow: auto;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
`;
const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    background: #ffffff;
    font-size: 12.5px;
    thead th {
        position: sticky;
        top: 0;
        background: #f8fafc;
        color: #64748b;
        font-size: 11.5px;
        font-weight: 600;
        text-align: left;
        padding: 8px 10px;
        border-bottom: 1px solid #e2e8f0;
        z-index: 1;
    }
    tbody td {
        padding: 7px 10px;
        border-bottom: 1px solid #f1f5f9;
    }
    .name {
        font-weight: 600;
        color: #0f172a;
    }
    .num {
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
    .bad {
        color: #dc2626;
        font-weight: 700;
    }
    .dim {
        color: #94a3b8;
        font-size: 11.5px;
    }
    /* S001: 미매핑 극장 = 에러 데이터 표기 (스코어 업로드와 동일한 붉은 행) */
    tr.errorRow {
        background: #fef2f2;
    }
    .err {
        color: #dc2626;
        font-size: 11.5px;
        font-weight: 700;
    }
`;
/* S001: 행 안의 '극장 매핑' 버튼 — 스코어 업로드의 FixButton과 동일한 모양 */
const MapBtn = styled.button`
    margin-left: 6px;
    padding: 1px 6px;
    font-size: 11px;
    font-weight: 700;
    color: #ffffff;
    background: #dc2626;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
`;
const Tag = styled.span<{ $kind: IDiff["kind"] }>`
    display: inline-block;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    ${({ $kind }) =>
        $kind === "only_excel"
            ? "background:#fef2f2;color:#b91c1c;"
            : $kind === "only_clms"
            ? "background:#eff6ff;color:#1d4ed8;"
            : "background:#fffbeb;color:#b45309;"}
`;
