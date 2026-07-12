import React, { useRef, useState } from "react";
import styled from "styled-components";
import {
    CheckCircle,
    XCircle,
    Warning,
    FileXls,
    CircleNotch,
} from "@phosphor-icons/react";
import { AxiosPost, AxiosDelete } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { useAppAlert } from "../../../atom/alertUtils";

interface IMetric {
    system: number | null;
    file: number | null;
    diff: number;
}
interface IAdjustment {
    id: number;
    supply_delta: number;
    vat_delta: number;
    payout_delta: number;
    note: string;
    original: Record<string, number>;
}
interface ICompareRow {
    체인: string;
    구분: string; // 직영/위탁/기타 ("" = 미매칭 PDF 행)
    극장명: string;
    포맷: string; // 포맷 버킷("2D"/"4DX"/"ATMOS"…), 포맷 미분리 체인(롯데/메가박스)은 ""
    파일극장명: string | null;
    client_code: string | null;
    확인: boolean; // 극장 확인 처리 여부 (월×영화×극장 단위)
    status: "both" | "file_only" | "system_only";
    equal: boolean;
    missing_rate: boolean;
    adjustment: IAdjustment | null;
    metrics: Record<string, IMetric>;
}
interface ISummary {
    theater_count: number;
    equal: number;
    diff: number;
    file_only: number;
    system_only: number;
}
interface IMovieSection {
    movie_id: number;
    movie_title: string;
    file_movie_names: string[];
    rows: ICompareRow[];
    totals: Record<string, IMetric>;
    summary: ISummary;
}
interface IUnmatchedMovie {
    movie: string;
    인원: number;
    공급가액: number;
    부가세: number;
    "영화사 지급금": number;
}
interface IFileInfo {
    filename: string;
    chain: string; // 엑셀: 체인명, PDF: "AI·<추출체인>"
    row_count: number;
    source: "excel" | "ai";
    confidence?: "high" | "low"; // AI 추출 신뢰도 (PDF만)
    notes?: string; // AI 판독 특이사항 (PDF만)
}
interface ICompareResult {
    chains: string[];
    files: IFileInfo[];
    yyyyMm: string;
    yyyyMm_source: "file" | "request";
    file_row_count: number;
    movies: IMovieSection[];
    unmatched_file_movies: IUnmatchedMovie[];
    grand_totals: Record<string, IMetric>;
    grand_summary: ISummary & { movie_count: number };
}

const METRICS = ["인원", "공급가액", "부가세", "영화사 지급금"];
type FilterKey = "all" | "diff" | "equal" | "file_only" | "system_only";

const fmt = (v: number | null | undefined) =>
    v === null || v === undefined ? "-" : v.toLocaleString();

interface Props {
    yyyyMm: string;
}

const AMOUNT_METRICS = ["공급가액", "부가세", "영화사 지급금"];

/** rows에서 섹션 totals/summary를 다시 계산 (조정 반영용) */
const recomputeSections = (movies: IMovieSection[]) => {
    const newMovies = movies.map((sec) => {
        const totals: Record<string, IMetric> = {};
        METRICS.forEach((m) => {
            let sys = 0, file = 0;
            sec.rows.forEach((r) => {
                sys += r.metrics[m].system || 0;
                file += r.metrics[m].file || 0;
            });
            totals[m] = { system: sys, file, diff: file - sys };
        });
        const summary = {
            theater_count: sec.rows.length,
            equal: sec.rows.filter((r) => r.equal).length,
            diff: sec.rows.filter((r) => r.status === "both" && !r.equal).length,
            file_only: sec.rows.filter((r) => r.status === "file_only").length,
            system_only: sec.rows.filter((r) => r.status === "system_only").length,
        };
        return { ...sec, totals, summary };
    });
    const grand_totals: Record<string, IMetric> = {};
    METRICS.forEach((m) => {
        let sys = 0, file = 0;
        newMovies.forEach((s) => {
            sys += s.totals[m].system || 0;
            file += s.totals[m].file || 0;
        });
        grand_totals[m] = { system: sys, file, diff: file - sys };
    });
    const gs = { theater_count: 0, equal: 0, diff: 0, file_only: 0, system_only: 0 };
    newMovies.forEach((s) => {
        gs.theater_count += s.summary.theater_count;
        gs.equal += s.summary.equal;
        gs.diff += s.summary.diff;
        gs.file_only += s.summary.file_only;
        gs.system_only += s.summary.system_only;
    });
    return { newMovies, grand_totals, grand_summary: { ...gs, movie_count: newMovies.length } };
};

export const SettlementCompareModal = ({ yyyyMm }: Props) => {
    const toast = useToast();
    const { showAlert } = useAppAlert();
    const inputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [result, setResult] = useState<ICompareResult | null>(null);
    const [fileName, setFileName] = useState("");
    const [hasPdf, setHasPdf] = useState(false);
    const [filter, setFilter] = useState<FilterKey>("all");

    const runCompare = async (files: File[]) => {
        const valid = files.filter((f) => /\.(xlsx|xls|pdf)$/i.test(f.name));
        if (!valid.length) {
            toast.error("엑셀(.xlsx, .xls) 또는 PDF(.pdf) 파일만 업로드할 수 있습니다.");
            return;
        }
        setLoading(true);
        setResult(null);
        setHasPdf(valid.some((f) => /\.pdf$/i.test(f.name)));
        setFileName(valid.map((f) => f.name).join(", "));
        try {
            const fd = new FormData();
            valid.forEach((f) => fd.append("files", f));
            fd.append("yyyyMm", yyyyMm);
            const res = await AxiosPost("settlement-compare", fd);
            const data = res.data as ICompareResult;
            setResult(data);
            setFilter("all");
            const s = data.grand_summary;
            if (s.diff === 0 && s.file_only === 0) {
                toast.success(
                    `비교 완료 — 영화 ${s.movie_count}편 모두 일치합니다.`
                );
            } else {
                toast.info(
                    `비교 완료 — 영화 ${s.movie_count}편, 불일치 극장 ${s.diff}곳`
                );
            }
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "비교에 실패했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length) runCompare(files);
    };

    /** 특정 행(극장×포맷)을 갱신하고 섹션/전체 합계·요약을 재계산 */
    const updateRow = (movieId: number, target: ICompareRow, updater: (r: ICompareRow) => ICompareRow) => {
        setResult((prev) => {
            if (!prev) return prev;
            const movies = prev.movies.map((sec) =>
                sec.movie_id === movieId
                    ? {
                          ...sec,
                          rows: sec.rows.map((r) =>
                              r.체인 === target.체인 &&
                              r.구분 === target.구분 &&
                              r.극장명 === target.극장명 &&
                              r.포맷 === target.포맷
                                  ? updater(r)
                                  : r
                          ),
                      }
                    : sec
            );
            const { newMovies, grand_totals, grand_summary } = recomputeSections(movies);
            return { ...prev, movies: newMovies, grand_totals, grand_summary };
        });
    };

    /** 원 단위 잔차를 파일 값 기준으로 수동조정 저장 */
    const adjustRow = async (sec: IMovieSection, r: ICompareRow) => {
        if (!r.client_code || !result) {
            toast.error("거래처코드를 찾을 수 없어 조정할 수 없습니다.");
            return;
        }
        const ms = r.metrics;
        try {
            const res = await AxiosPost("settlement-adjustments", {
                yyyyMm: result.yyyyMm,
                movie_id: sec.movie_id,
                client_code: r.client_code,
                screen_format: r.포맷 || "",
                supply_delta: ms["공급가액"].diff,
                vat_delta: ms["부가세"].diff,
                payout_delta: ms["영화사 지급금"].diff,
                supply_original: ms["공급가액"].system,
                vat_original: ms["부가세"].system,
                payout_original: ms["영화사 지급금"].system,
                note: `부금 대사 조정 (${sec.movie_title})`,
            });
            const adj: IAdjustment = {
                id: res.data.id,
                supply_delta: res.data.supply_delta,
                vat_delta: res.data.vat_delta,
                payout_delta: res.data.payout_delta,
                note: res.data.note,
                original: {
                    공급가액: ms["공급가액"].system ?? 0,
                    부가세: ms["부가세"].system ?? 0,
                    "영화사 지급금": ms["영화사 지급금"].system ?? 0,
                },
            };
            updateRow(sec.movie_id, r, (row) => ({
                ...row,
                확인: true, // 조정 저장 = 확인 처리 (백엔드 자동)
                equal: row.metrics["인원"].diff === 0,
                adjustment: adj,
                metrics: {
                    ...row.metrics,
                    ...Object.fromEntries(
                        AMOUNT_METRICS.map((m) => [
                            m,
                            { system: row.metrics[m].file, file: row.metrics[m].file, diff: 0 },
                        ])
                    ),
                },
            }));
            toast.success("수동조정 저장 — 정산 조회 시 '(수동조정)' 행으로 반영됩니다.");
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "조정 저장에 실패했습니다.");
        }
    };

    /** 수동조정 해제 (원래 계산값으로 복귀) */
    const removeAdjustment = (sec: IMovieSection, r: ICompareRow) => {
        const adj = r.adjustment;
        if (!adj) return;
        showAlert(
            "수동조정 해제",
            `'${r.극장명}${r.포맷 ? ` (${r.포맷})` : ""}'의 수동조정을 해제하시겠습니까?`,
            "warning",
            async () => {
                try {
                    await AxiosDelete("settlement-adjustments", adj.id);
                    updateRow(sec.movie_id, r, (row) => {
                        const deltas: Record<string, number> = {
                            공급가액: adj.supply_delta,
                            부가세: adj.vat_delta,
                            "영화사 지급금": adj.payout_delta,
                        };
                        const metrics = { ...row.metrics };
                        AMOUNT_METRICS.forEach((m) => {
                            const orig = adj.original?.[m] ?? (metrics[m].system ?? 0) - deltas[m];
                            metrics[m] = {
                                system: orig,
                                file: metrics[m].file,
                                diff: (metrics[m].file ?? 0) - orig,
                            };
                        });
                        return {
                            ...row,
                            adjustment: null,
                            metrics,
                            equal: row.status === "both" && METRICS.every((m) => metrics[m].diff === 0),
                        };
                    });
                    toast.success("조정을 해제했습니다.");
                } catch {
                    toast.error("조정 해제에 실패했습니다.");
                }
            },
            true
        );
    };

    /** 극장 확인 토글 — 같은 극장(거래처)의 모든 포맷 행에 함께 반영 */
    const toggleConfirm = async (sec: IMovieSection, r: ICompareRow) => {
        if (!r.client_code || !result) return;
        const next = !r.확인;
        try {
            await AxiosPost("settlement-confirms", {
                yyyyMm: result.yyyyMm,
                movie_id: sec.movie_id,
                client_codes: [r.client_code],
                confirmed: next,
                source: "대사",
            });
            setResult((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    movies: prev.movies.map((s) =>
                        s.movie_id === sec.movie_id
                            ? {
                                  ...s,
                                  rows: s.rows.map((row) =>
                                      row.client_code === r.client_code
                                          ? { ...row, 확인: next }
                                          : row
                                  ),
                              }
                            : s
                    ),
                };
            });
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "확인 처리에 실패했습니다.");
        }
    };

    /** 전체 영화의 미확인 극장(시스템 매칭 행) 일괄 확인 */
    const bulkConfirm = () => {
        if (!result) return;
        const perMovie = new Map<number, Set<string>>();
        result.movies.forEach((sec) =>
            sec.rows.forEach((r) => {
                if (r.client_code && !r.확인) {
                    if (!perMovie.has(sec.movie_id)) perMovie.set(sec.movie_id, new Set());
                    perMovie.get(sec.movie_id)!.add(r.client_code);
                }
            })
        );
        const total = Array.from(perMovie.values()).reduce((a, s) => a + s.size, 0);
        if (!total) {
            toast.info("확인 처리할 미확인 극장이 없습니다.");
            return;
        }
        showAlert(
            "일괄 확인 처리",
            `대사 결과의 미확인 극장 ${total}곳을 모두 확인 처리하시겠습니까? (차이가 있는 극장 포함)`,
            "warning",
            async () => {
                try {
                    await AxiosPost("settlement-confirms", {
                        yyyyMm: result.yyyyMm,
                        confirmed: true,
                        source: "대사",
                        items: Array.from(perMovie.entries()).map(([movie_id, codes]) => ({
                            movie_id,
                            client_codes: Array.from(codes),
                        })),
                    });
                    setResult((prev) => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            movies: prev.movies.map((s) => ({
                                ...s,
                                rows: s.rows.map((row) =>
                                    row.client_code ? { ...row, 확인: true } : row
                                ),
                            })),
                        };
                    });
                    toast.success(`${total}곳을 확인 처리했습니다.`);
                } catch (e: any) {
                    toast.error(e?.response?.data?.error || "일괄 확인에 실패했습니다.");
                }
            },
            true
        );
    };

    /** 조정 가능 조건: 인원은 일치하고 금액만 차이 + 거래처코드 존재 + 미조정 */
    const canAdjust = (r: ICompareRow) =>
        r.status === "both" &&
        !r.equal &&
        r.metrics["인원"].diff === 0 &&
        !!r.client_code &&
        !r.adjustment;

    /** 일괄 조정 대상: 모든 금액 차이가 7원 미만(반올림 잔차 수준)인 행만.
     *  7원 이상 차이는 원인 확인이 필요하므로 행별 버튼으로만 조정 가능. */
    const canBulkAdjust = (r: ICompareRow) =>
        canAdjust(r) &&
        AMOUNT_METRICS.every((m) => Math.abs(r.metrics[m].diff) < 7);

    /** 전체 영화의 조정 대상 행(금액 차이 7원 미만)을 한 번에 파일 값으로 조정 */
    const bulkAdjust = () => {
        if (!result) return;
        const targets = result.movies.flatMap((sec) =>
            sec.rows.filter(canBulkAdjust).map((r) => ({ sec, r }))
        );
        if (!targets.length) {
            toast.info("일괄 조정할 대상이 없습니다. (금액 차이 7원 미만 행만 일괄 조정 가능)");
            return;
        }
        showAlert(
            "파일값으로 일괄 조정",
            `인원은 일치하고 금액 차이가 7원 미만인 ${targets.length}개 행(극장×포맷)을 전부 파일(정산서) 값으로 조정하시겠습니까? (7원 이상 차이는 행별로만 조정 가능)`,
            "warning",
            async () => {
                try {
                    const items = targets.map(({ sec, r }) => ({
                        movie_id: sec.movie_id,
                        client_code: r.client_code,
                        screen_format: r.포맷 || "",
                        supply_delta: r.metrics["공급가액"].diff,
                        vat_delta: r.metrics["부가세"].diff,
                        payout_delta: r.metrics["영화사 지급금"].diff,
                        supply_original: r.metrics["공급가액"].system,
                        vat_original: r.metrics["부가세"].system,
                        payout_original: r.metrics["영화사 지급금"].system,
                        note: `부금 대사 일괄 조정 (${sec.movie_title})`,
                    }));
                    const res = await AxiosPost("settlement-adjustments", {
                        yyyyMm: result.yyyyMm,
                        items,
                    });
                    const saved: any[] = res.data.results || [];
                    const errors: any[] = res.data.errors || [];
                    const idMap = new Map<string, any>();
                    saved.forEach((s) =>
                        idMap.set(`${s.movie_id}|${s.client_code}|${s.screen_format || ""}`, s)
                    );

                    setResult((prev) => {
                        if (!prev) return prev;
                        const movies = prev.movies.map((sec) => ({
                            ...sec,
                            rows: sec.rows.map((r) => {
                                const s = idMap.get(
                                    `${sec.movie_id}|${r.client_code}|${r.포맷 || ""}`
                                );
                                if (!s || !canBulkAdjust(r)) return r;
                                r = { ...r, 확인: true }; // 조정 저장 = 확인 처리 (백엔드 자동)
                                const adj: IAdjustment = {
                                    id: s.id,
                                    supply_delta: s.supply_delta,
                                    vat_delta: s.vat_delta,
                                    payout_delta: s.payout_delta,
                                    note: s.note,
                                    original: {
                                        공급가액: r.metrics["공급가액"].system ?? 0,
                                        부가세: r.metrics["부가세"].system ?? 0,
                                        "영화사 지급금": r.metrics["영화사 지급금"].system ?? 0,
                                    },
                                };
                                return {
                                    ...r,
                                    equal: true,
                                    adjustment: adj,
                                    metrics: {
                                        ...r.metrics,
                                        ...Object.fromEntries(
                                            AMOUNT_METRICS.map((m) => [
                                                m,
                                                {
                                                    system: r.metrics[m].file,
                                                    file: r.metrics[m].file,
                                                    diff: 0,
                                                },
                                            ])
                                        ),
                                    },
                                };
                            }),
                        }));
                        const { newMovies, grand_totals, grand_summary } =
                            recomputeSections(movies);
                        return { ...prev, movies: newMovies, grand_totals, grand_summary };
                    });
                    if (errors.length) {
                        toast.warning(`${saved.length}개 조정 완료, ${errors.length}개 실패`);
                    } else {
                        toast.success(`${saved.length}개 극장을 파일 값으로 일괄 조정했습니다.`);
                    }
                } catch (e: any) {
                    toast.error(e?.response?.data?.error || "일괄 조정에 실패했습니다.");
                }
            },
            true
        );
    };

    const filterRow = (r: ICompareRow) => {
        if (filter === "all") return true;
        if (filter === "diff") return r.status === "both" && !r.equal;
        if (filter === "equal") return r.equal;
        return r.status === filter;
    };

    const statusIcon = (r: ICompareRow) => {
        if (r.status === "both" && r.equal)
            return <CheckCircle size={17} weight="fill" color="#16a34a" />;
        if (r.status === "both")
            return <XCircle size={17} weight="fill" color="#dc2626" />;
        return <Warning size={17} weight="fill" color="#d97706" />;
    };

    const statusLabel = (r: ICompareRow) =>
        r.status === "file_only"
            ? "파일에만 있음"
            : r.status === "system_only"
            ? "시스템에만 있음"
            : "";

    return (
        <Wrapper>
            <Intro>
                <b>직영 엑셀</b>(CGV/롯데/메가박스)과 <b>위탁·일반극장 PDF</b>를
                올리면 체인·정산월·영화를 모두 자동 인식해 극장별
                인원/공급가액/부가세/영화사지급금을 한 번에 대사합니다. PDF는
                양식이 제각각이라 <b>AI가 분석</b>하며(파일당 수십 초, 재업로드는
                즉시), 극장·영화명이 달라도 자동 매칭합니다. (연월은 파일의
                상영일 기준)
            </Intro>

            <DropZone
                $active={dragOver}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls,.pdf"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length) runCompare(files);
                        e.target.value = "";
                    }}
                />
                {loading ? (
                    <>
                        <CircleNotch size={28} className="spin" />
                        <p>
                            {hasPdf
                                ? "AI가 PDF 정산서를 분석·대사 중입니다… (파일당 수십 초 소요)"
                                : "비교 중…"}{" "}
                            ({fileName})
                        </p>
                    </>
                ) : (
                    <>
                        <FileXls size={30} />
                        <p>
                            부금정산서를 <b>드래그앤드롭</b> 하거나 클릭해서 선택하세요
                            — 직영 엑셀(CGV·롯데·메가박스) + 위탁·일반극장 PDF,{" "}
                            <b>여러 파일 동시 업로드 가능</b> (전부 합산 비교)
                        </p>
                        {fileName && <span className="fname">{fileName}</span>}
                    </>
                )}
            </DropZone>

            {result && (
                <ScrollArea>
                    <SummaryBar>
                        {result.chains.map((c) => (
                            <Chain key={c}>{c}</Chain>
                        ))}
                        <span>
                            파일 <b>{result.files.length}</b>개
                        </span>
                        <span>
                            기준월 <b>{result.yyyyMm}</b>
                            {result.yyyyMm_source === "file" && (
                                <em className="src"> (파일에서 인식)</em>
                            )}
                        </span>
                        <span>
                            영화 <b>{result.grand_summary.movie_count}</b>편
                        </span>
                        <span>
                            일치 <b className="ok">{result.grand_summary.equal}</b>
                        </span>
                        <span>
                            불일치 <b className="bad">{result.grand_summary.diff}</b>
                        </span>
                        <span>
                            파일에만{" "}
                            <b className="warn">{result.grand_summary.file_only}</b>
                        </span>
                        <span>
                            시스템에만{" "}
                            <b className="warn">{result.grand_summary.system_only}</b>
                        </span>
                        <span className="grand">
                            지급금 합계 — 시스템{" "}
                            <b>{fmt(result.grand_totals["영화사 지급금"].system)}</b> /
                            파일 <b>{fmt(result.grand_totals["영화사 지급금"].file)}</b>{" "}
                            / 차이{" "}
                            <b
                                className={
                                    result.grand_totals["영화사 지급금"].diff !== 0
                                        ? "bad"
                                        : "ok"
                                }
                            >
                                {fmt(result.grand_totals["영화사 지급금"].diff)}
                            </b>
                        </span>
                    </SummaryBar>

                    {result.files.some((f) => f.source === "ai") && (
                        <FileList>
                            {result.files
                                .filter((f) => f.source === "ai")
                                .map((f) => (
                                    <li key={f.filename} className={f.confidence === "low" ? "low" : ""}>
                                        {f.confidence === "low" ? (
                                            <Warning size={14} weight="fill" color="#d97706" />
                                        ) : (
                                            <CheckCircle size={14} weight="fill" color="#16a34a" />
                                        )}
                                        <span className="ai">AI</span>
                                        <b>{f.filename}</b>
                                        <span>({f.chain.replace("AI·", "")} · {f.row_count}건)</span>
                                        {f.confidence === "low" && (
                                            <em className="notes" title={f.notes}>
                                                판독 주의: {f.notes || "숫자/이름 판독 불확실 — 원본 대조 필요"}
                                            </em>
                                        )}
                                    </li>
                                ))}
                        </FileList>
                    )}

                    <FilterBar>
                        {(
                            [
                                ["all", "전체"],
                                ["diff", "불일치"],
                                ["equal", "일치"],
                                ["file_only", "파일에만"],
                                ["system_only", "시스템에만"],
                            ] as [FilterKey, string][]
                        ).map(([k, label]) => (
                            <FilterBtn
                                key={k}
                                $on={filter === k}
                                onClick={() => setFilter(k)}
                            >
                                {label}
                            </FilterBtn>
                        ))}
                        {(() => {
                            const n = result.movies.reduce(
                                (acc, s) => acc + s.rows.filter(canBulkAdjust).length,
                                0
                            );
                            return n > 0 ? (
                                <BulkBtn
                                    onClick={bulkAdjust}
                                    title="인원은 일치하고 금액 차이가 7원 미만인 극장 전체를 파일 값으로 조정 (7원 이상 차이는 행별로만)"
                                >
                                    파일값으로 일괄 조정 ({n})
                                </BulkBtn>
                            ) : null;
                        })()}
                        {(() => {
                            const n = result.movies.reduce(
                                (acc, s) =>
                                    acc + s.rows.filter((r) => r.client_code && !r.확인).length,
                                0
                            );
                            return n > 0 ? (
                                <ConfirmAllBtn
                                    onClick={bulkConfirm}
                                    title="대사 결과의 미확인 극장을 전부 확인 처리 (정산 관리 테이블의 확인 상태와 공유)"
                                >
                                    일괄 확인 ({n})
                                </ConfirmAllBtn>
                            ) : null;
                        })()}
                    </FilterBar>

                    {result.movies.map((sec) => {
                        const rows = sec.rows.filter(filterRow);
                        return (
                            <MovieSection key={sec.movie_id}>
                                <MovieHeader>
                                    <h4>{sec.movie_title}</h4>
                                    <span className="stats">
                                        일치 <b className="ok">{sec.summary.equal}</b> ·
                                        불일치 <b className="bad">{sec.summary.diff}</b> ·
                                        파일에만{" "}
                                        <b className="warn">{sec.summary.file_only}</b> ·
                                        시스템에만{" "}
                                        <b className="warn">{sec.summary.system_only}</b>
                                    </span>
                                    <span
                                        className="filenames"
                                        title={sec.file_movie_names.join(", ")}
                                    >
                                        파일 표기: {sec.file_movie_names.join(", ")}
                                    </span>
                                </MovieHeader>
                                {rows.length > 0 ? (
                                    <TableScroll>
                                        <Table>
                                            <thead>
                                                <tr>
                                                    <th rowSpan={2} style={{ width: 36 }} />
                                                    <th rowSpan={2} className="left">
                                                        극장명
                                                    </th>
                                                    <th rowSpan={2} style={{ width: 64 }}>
                                                        포맷
                                                    </th>
                                                    {METRICS.map((m) => (
                                                        <th key={m} colSpan={3}>
                                                            {m === "영화사 지급금"
                                                                ? "영화사지급금"
                                                                : m}
                                                        </th>
                                                    ))}
                                                    <th rowSpan={2} style={{ width: 70 }}>
                                                        확인
                                                    </th>
                                                    <th rowSpan={2} style={{ width: 110 }}>
                                                        조정
                                                    </th>
                                                </tr>
                                                <tr>
                                                    {METRICS.map((m) => (
                                                        <React.Fragment key={m}>
                                                            <th className="sub">시스템</th>
                                                            <th className="sub">파일</th>
                                                            <th className="sub">차이</th>
                                                        </React.Fragment>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr className="total">
                                                    <td />
                                                    <td className="left">합계</td>
                                                    <td />
                                                    {METRICS.map((m) => {
                                                        const t = sec.totals[m];
                                                        return (
                                                            <React.Fragment key={m}>
                                                                <td>{fmt(t.system)}</td>
                                                                <td>{fmt(t.file)}</td>
                                                                <td
                                                                    className={
                                                                        t.diff !== 0
                                                                            ? "bad"
                                                                            : "ok"
                                                                    }
                                                                >
                                                                    {t.diff === 0
                                                                        ? "0"
                                                                        : fmt(t.diff)}
                                                                </td>
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                    <td />
                                                    <td />
                                                </tr>
                                                {rows.map((r) => (
                                                    <tr
                                                        key={`${r.체인}-${r.구분}-${r.극장명}-${r.포맷}`}
                                                        className={
                                                            r.status !== "both"
                                                                ? "warnrow"
                                                                : r.equal
                                                                ? ""
                                                                : "badrow"
                                                        }
                                                    >
                                                        <td className="center">
                                                            {statusIcon(r)}
                                                        </td>
                                                        <td className="left">
                                                            {r.극장명}
                                                            {r.구분 && r.구분 !== "직영" && (
                                                                <span className="tag cls">
                                                                    {r.구분}
                                                                </span>
                                                            )}
                                                            {r.파일극장명 &&
                                                                r.파일극장명 !== r.극장명 && (
                                                                    <span className="alias">
                                                                        (파일: {r.파일극장명})
                                                                    </span>
                                                                )}
                                                            {statusLabel(r) && (
                                                                <span className="tag">
                                                                    {statusLabel(r)}
                                                                </span>
                                                            )}
                                                            {r.missing_rate && (
                                                                <span className="tag rate">
                                                                    부율 미설정 포함
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="center">
                                                            {r.포맷 || "-"}
                                                        </td>
                                                        {METRICS.map((m) => {
                                                            const v = r.metrics[m];
                                                            return (
                                                                <React.Fragment key={m}>
                                                                    <td>{fmt(v.system)}</td>
                                                                    <td>{fmt(v.file)}</td>
                                                                    <td
                                                                        className={
                                                                            r.status ===
                                                                                "both" &&
                                                                            v.diff !== 0
                                                                                ? "bad"
                                                                                : "dim"
                                                                        }
                                                                    >
                                                                        {r.status === "both"
                                                                            ? v.diff === 0
                                                                                ? "0"
                                                                                : fmt(v.diff)
                                                                            : "-"}
                                                                    </td>
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                        <td className="center">
                                                            {r.client_code ? (
                                                                <ConfirmMini
                                                                    $on={r.확인}
                                                                    onClick={() =>
                                                                        toggleConfirm(sec, r)
                                                                    }
                                                                    title={
                                                                        r.확인
                                                                            ? "확인됨 — 클릭 시 해제"
                                                                            : "클릭하여 확인 처리"
                                                                    }
                                                                >
                                                                    {r.확인 ? "✓ 확인" : "미확인"}
                                                                </ConfirmMini>
                                                            ) : null}
                                                        </td>
                                                        <td className="center">
                                                            {r.adjustment ? (
                                                                <AdjWrap
                                                                    title={`원래값 — 공급가액 ${fmt(
                                                                        r.adjustment.original?.["공급가액"]
                                                                    )}, 부가세 ${fmt(
                                                                        r.adjustment.original?.["부가세"]
                                                                    )}, 지급금 ${fmt(
                                                                        r.adjustment.original?.["영화사 지급금"]
                                                                    )}`}
                                                                >
                                                                    <span className="adjtag">
                                                                        수동조정
                                                                    </span>
                                                                    <button
                                                                        className="undo"
                                                                        onClick={() =>
                                                                            removeAdjustment(sec, r)
                                                                        }
                                                                        title="조정 해제"
                                                                    >
                                                                        해제
                                                                    </button>
                                                                </AdjWrap>
                                                            ) : r.status === "both" &&
                                                              !r.equal &&
                                                              r.metrics["인원"].diff === 0 &&
                                                              r.client_code ? (
                                                                <AdjBtn
                                                                    onClick={() =>
                                                                        adjustRow(sec, r)
                                                                    }
                                                                    title="시스템 값을 파일(정산서) 값에 맞춰 수동조정 저장"
                                                                >
                                                                    파일값으로 조정
                                                                </AdjBtn>
                                                            ) : null}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </Table>
                                    </TableScroll>
                                ) : (
                                    <EmptyNote>현재 필터에 해당하는 극장이 없습니다.</EmptyNote>
                                )}
                            </MovieSection>
                        );
                    })}

                    {result.unmatched_file_movies.length > 0 && (
                        <UnmatchedBox>
                            <b>시스템 영화와 매칭되지 않은 파일 영화</b> (해당 월 실적
                            영화 중 매칭 실패 — 영화명 확인 필요)
                            <ul>
                                {result.unmatched_file_movies.map((u) => (
                                    <li key={u.movie}>
                                        {u.movie} — 인원 {fmt(u.인원)}, 지급금{" "}
                                        {fmt(u["영화사 지급금"])}
                                    </li>
                                ))}
                            </ul>
                        </UnmatchedBox>
                    )}
                </ScrollArea>
            )}
        </Wrapper>
    );
};

/* ───── styles ───── */
const Wrapper = styled.div`
    font-family: "SUIT", sans-serif;
    display: flex;
    flex-direction: column;
    gap: 12px;
`;
const Intro = styled.p`
    font-size: 13px;
    color: #475569;
    margin: 0;
    b {
        color: #0f172a;
    }
`;
const DropZone = styled.div<{ $active: boolean }>`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 22px 16px;
    border: 2px dashed ${({ $active }) => ($active ? "#2563eb" : "#cbd5e1")};
    background: ${({ $active }) => ($active ? "#eff6ff" : "#f8fafc")};
    border-radius: 12px;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
    p {
        margin: 0;
        font-size: 13px;
        b {
            color: #2563eb;
        }
    }
    .fname {
        font-size: 12px;
        color: #94a3b8;
    }
    .spin {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
`;
/* 자체 스크롤 없음 — 모달 본문(CustomModal)의 스크롤 하나만 사용 */
const ScrollArea = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;
const SummaryBar = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 13px;
    color: #475569;
    b.ok {
        color: #16a34a;
    }
    b.bad {
        color: #dc2626;
    }
    b.warn {
        color: #d97706;
    }
    .src {
        font-style: normal;
        font-size: 11px;
        color: #94a3b8;
    }
    .grand {
        margin-left: auto;
        font-size: 12px;
        color: #64748b;
    }
`;
const Chain = styled.span`
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 0 10px;
    border-radius: 6px;
    background: #0f172a;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
`;
const FilterBar = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
`;
const ConfirmMini = styled.button<{ $on: boolean }>`
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    border: 1px solid ${({ $on }) => ($on ? "#16a34a" : "#cbd5e1")};
    background: ${({ $on }) => ($on ? "#f0fdf4" : "#fff")};
    color: ${({ $on }) => ($on ? "#16a34a" : "#94a3b8")};
    &:hover {
        border-color: ${({ $on }) => ($on ? "#dc2626" : "#16a34a")};
        color: ${({ $on }) => ($on ? "#dc2626" : "#16a34a")};
    }
`;
const ConfirmAllBtn = styled.button`
    margin-left: 6px;
    height: 28px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid #16a34a;
    background: #16a34a;
    color: #fff;
    &:hover {
        background: #15803d;
    }
`;
const BulkBtn = styled.button`
    margin-left: 10px;
    height: 28px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid #7c3aed;
    background: #7c3aed;
    color: #fff;
    &:hover {
        background: #6d28d9;
    }
`;
const FilterBtn = styled.button<{ $on: boolean }>`
    height: 28px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid ${({ $on }) => ($on ? "#2563eb" : "#cbd5e1")};
    background: ${({ $on }) => ($on ? "#2563eb" : "#fff")};
    color: ${({ $on }) => ($on ? "#fff" : "#475569")};
`;
const MovieSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;
const MovieHeader = styled.div`
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
    h4 {
        margin: 0;
        font-size: 15px;
        color: #0f172a;
    }
    .stats {
        font-size: 12px;
        color: #64748b;
        b.ok {
            color: #16a34a;
        }
        b.bad {
            color: #dc2626;
        }
        b.warn {
            color: #d97706;
        }
    }
    .filenames {
        font-size: 11px;
        color: #94a3b8;
        max-width: 480px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;
const TableScroll = styled.div`
    overflow: auto;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    max-height: 420px;
`;
const Table = styled.table`
    width: 100%;
    /* sticky 헤더에서 border가 밀리지 않도록 separate 사용 */
    border-collapse: separate;
    border-spacing: 0;
    background: #fff;
    font-size: 12px;
    white-space: nowrap;
    thead th {
        position: sticky;
        background: #f1f5f9;
        color: #475569;
        font-weight: 700;
        height: 32px; /* 두 헤더 행이 틈 없이 붙도록 높이 고정 */
        box-sizing: border-box;
        padding: 0 10px;
        border-bottom: 1px solid #e2e8f0;
        border-right: 1px solid #e8edf3;
        text-align: center;
        top: 0;
        z-index: 1;
    }
    thead tr:nth-child(2) th.sub {
        top: 32px;
        height: 28px;
        font-weight: 600;
        color: #64748b;
        background: #f8fafc;
    }
    th.left,
    td.left {
        text-align: left;
    }
    tbody td {
        padding: 6px 10px;
        border-bottom: 1px solid #f1f5f9;
        border-right: 1px solid #f6f8fa;
        color: #334155;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
    tbody td.center {
        text-align: center;
    }
    tbody td.bad {
        color: #dc2626;
        font-weight: 700;
        background: #fef2f2;
    }
    tbody td.ok {
        color: #16a34a;
        font-weight: 700;
    }
    tbody td.dim {
        color: #cbd5e1;
    }
    tbody tr.badrow td.left {
        color: #b91c1c;
        font-weight: 600;
    }
    tbody tr.warnrow {
        background: #fffbeb;
    }
    tbody tr.total td {
        background: #f8fafc;
        font-weight: 700;
        border-bottom: 2px solid #e2e8f0;
    }
    .alias {
        margin-left: 6px;
        font-size: 11px;
        color: #94a3b8;
    }
    .tag {
        margin-left: 6px;
        padding: 1px 6px;
        border-radius: 4px;
        background: #fef3c7;
        color: #92400e;
        font-size: 11px;
    }
    .tag.rate {
        background: #fee2e2;
        color: #991b1b;
    }
    .tag.cls {
        background: #ede9fe;
        color: #5b21b6;
    }
`;
const FileList = styled.ul`
    margin: 0;
    padding: 8px 14px;
    list-style: none;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    font-size: 12px;
    color: #475569;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
    li {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
    }
    li.low {
        color: #92400e;
    }
    .ai {
        padding: 0 6px;
        border-radius: 4px;
        background: #ede9fe;
        color: #5b21b6;
        font-weight: 700;
        font-size: 11px;
    }
    .notes {
        font-style: normal;
        color: #b45309;
    }
`;
const AdjBtn = styled.button`
    height: 24px;
    padding: 0 8px;
    border: 1px solid #2563eb;
    background: #fff;
    color: #2563eb;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    &:hover {
        background: #eff6ff;
    }
`;
const AdjWrap = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    .adjtag {
        padding: 2px 6px;
        border-radius: 4px;
        background: #ede9fe;
        color: #6d28d9;
        font-size: 11px;
        font-weight: 700;
        cursor: help;
    }
    .undo {
        border: 1px solid #e2e8f0;
        background: #fff;
        color: #94a3b8;
        border-radius: 4px;
        font-size: 10px;
        padding: 1px 5px;
        cursor: pointer;
        &:hover {
            color: #dc2626;
            border-color: #fecaca;
        }
    }
`;
const EmptyNote = styled.div`
    font-size: 12px;
    color: #94a3b8;
    padding: 8px 4px;
`;
const UnmatchedBox = styled.div`
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 12px;
    color: #92400e;
    ul {
        margin: 6px 0 0;
        padding-left: 18px;
    }
`;
