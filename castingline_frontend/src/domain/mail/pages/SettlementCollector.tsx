import { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import {
    Plus,
    Trash,
    DownloadSimple,
    MagnifyingGlass,
    ArrowClockwise,
    FloppyDisk,
    Paperclip,
    ArrowSquareOut,
    CaretLeft,
    CaretRight,
    CaretDown,
    CheckCircle,
    EnvelopeSimple,
} from "@phosphor-icons/react";
import { useToast } from "../../../components/common/CustomToast";
import { useAppAlert } from "../../../atom/alertUtils";
import {
    fetchFolders,
    fetchMessages,
    fetchMessageDetail,
    downloadAttachment,
    IMailFolder,
    IMailListItem,
    IMailDetail,
    IMailAttachment,
} from "../api";
import {
    searchMovies,
    fetchTargets,
    createTarget,
    updateTarget,
    deleteTarget,
    runScan,
    collectAttachment,
    fetchCollected,
    fetchMonthSummary,
    deleteCollected,
    bulkDeleteCollected,
    downloadCollected,
    downloadMovieZip,
    downloadSelectedZip,
    markCollectedViewed,
    IMovieSearchItem,
    ISettlementTarget,
    ICollectedSettlement,
    IScanResult,
    IMonthSummary,
} from "../settlementApi";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";
import { CustomInput } from "../../../components/common/CustomInput";

type SubTab = "mailbox" | "browse" | "targets";

const PAGE_SIZE = 30;

const fmtSize = (n: number) => {
    if (!n) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const fmtDateTime = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
    const p = (x: number) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
        d.getHours()
    )}:${p(d.getMinutes())}`;
};

const fmtDate = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    const p = (x: number) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const WHERE_LABEL: Record<string, string> = {
    subject: "제목",
    body: "본문",
    filename: "첨부명",
};

const todayStr = () => {
    const d = new Date();
    const p = (x: number) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const daysAgoStr = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const p = (x: number) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const guessFolder = (folders: IMailFolder[]) =>
    folders.find((f) => f.display.includes("부금") && f.display.includes("위탁")) ||
    folders.find((f) => f.display.includes("부금계산서")) ||
    folders.find((f) => f.display.includes("부금")) ||
    folders[0];

export const SettlementCollector = () => {
    const toast = useToast();
    const [tab, setTab] = useState<SubTab>("mailbox");
    const [folders, setFolders] = useState<IMailFolder[]>([]);
    const [folder, setFolder] = useState<string>("");
    // 출처 이동 요청: 특정 메일을 메일함 탭에서 열도록 함
    const [pendingOpen, setPendingOpen] = useState<{
        folder: string;
        uid: number;
    } | null>(null);

    useEffect(() => {
        fetchFolders()
            .then((fs) => {
                setFolders(fs);
                const g = guessFolder(fs);
                if (g) setFolder((cur) => cur || g.name);
            })
            .catch(() => toast.error("메일함 폴더를 불러오지 못했습니다."));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openMail = useCallback((mailFolder: string, uid: number) => {
        setFolder(mailFolder);
        setPendingOpen({ folder: mailFolder, uid });
        setTab("mailbox");
    }, []);

    return (
        <Wrapper>
            <Header>
                <h2>부금계산서(정산서) 수집</h2>
                <p>
                    메일함 전체를 보면서 <b>대상 영화</b>의 첨부를 수집합니다. 수집된
                    메일은 표시되고, 수집 파일의 <b>출처</b>로 원본 메일을 열 수 있습니다.
                </p>
            </Header>

            <Tabs>
                <TabBtn $active={tab === "mailbox"} onClick={() => setTab("mailbox")}>
                    메일함 · 수집
                </TabBtn>
                <TabBtn $active={tab === "browse"} onClick={() => setTab("browse")}>
                    수집 파일
                </TabBtn>
                <TabBtn $active={tab === "targets"} onClick={() => setTab("targets")}>
                    대상 영화 설정
                </TabBtn>
            </Tabs>

            {/* 메일함 탭은 폴링 상태 유지를 위해 항상 마운트 */}
            <div style={{ display: tab === "mailbox" ? "block" : "none" }}>
                <MailboxTab
                    folders={folders}
                    folder={folder}
                    pendingOpen={pendingOpen}
                    clearPendingOpen={() => setPendingOpen(null)}
                />
            </div>
            {tab === "browse" && <BrowseTab openMail={openMail} />}
            {tab === "targets" && <TargetsTab />}
        </Wrapper>
    );
};

/* ──────────────────────────────────────────────────────────
 * 1) 메일함 · 수집 탭
 * ────────────────────────────────────────────────────────── */
const MailboxTab = ({
    folders,
    folder,
    pendingOpen,
    clearPendingOpen,
}: {
    folders: IMailFolder[];
    folder: string;
    pendingOpen: { folder: string; uid: number } | null;
    clearPendingOpen: () => void;
}) => {
    const toast = useToast();

    const [list, setList] = useState<IMailListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [listLoading, setListLoading] = useState(false);
    const [filter, setFilter] = useState<"all" | "collected" | "uncollected">("all");

    const [selectedUid, setSelectedUid] = useState<number | null>(null);
    const [detail, setDetail] = useState<IMailDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // uid -> 수집 레코드[]
    const [collectedByUid, setCollectedByUid] = useState<
        Map<number, ICollectedSettlement[]>
    >(new Map());

    // 수집 컨트롤
    const [since, setSince] = useState(daysAgoStr(30));
    const [until, setUntil] = useState(todayStr());
    const [month, setMonth] = useState("");
    const [scanning, setScanning] = useState(false);
    const [lastScan, setLastScan] = useState<string>("");
    const [lastResult, setLastResult] = useState<IScanResult | null>(null);

    // 수동 수집 모달
    const [manualAtt, setManualAtt] = useState<IMailAttachment | null>(null);
    const [targetsQuick, setTargetsQuick] = useState<ISettlementTarget[]>([]);
    const [mvQuery, setMvQuery] = useState("");
    const [mvResults, setMvResults] = useState<IMovieSearchItem[]>([]);
    const [mvChosen, setMvChosen] = useState<{ id: number; title: string }[]>([]);
    const [manualMonth, setManualMonth] = useState("");
    const [manualSaving, setManualSaving] = useState(false);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // 수동 수집용 대상영화 빠른선택 목록
    useEffect(() => {
        fetchTargets()
            .then(setTargetsQuick)
            .catch(() => {});
    }, []);

    const loadCollected = useCallback(async () => {
        if (!folder) return;
        try {
            const recs = await fetchCollected({ folder });
            const map = new Map<number, ICollectedSettlement[]>();
            for (const r of recs) {
                if (!map.has(r.mail_uid)) map.set(r.mail_uid, []);
                map.get(r.mail_uid)!.push(r);
            }
            setCollectedByUid(map);
        } catch {
            /* 무시 */
        }
    }, [folder]);

    const loadList = useCallback(
        async (p: number) => {
            if (!folder) return;
            setListLoading(true);
            try {
                const res = await fetchMessages(folder, p, PAGE_SIZE);
                setList(res.results);
                setTotal(res.total);
            } catch {
                toast.error("메일 목록을 불러오지 못했습니다.");
            } finally {
                setListLoading(false);
            }
        },
        [folder, toast]
    );

    // 폴더 변경 시 초기화 + 로드
    useEffect(() => {
        if (!folder) return;
        setPage(1);
        setSelectedUid(null);
        setDetail(null);
        loadList(1);
        loadCollected();
    }, [folder, loadList, loadCollected]);

    // 페이지 변경
    useEffect(() => {
        if (folder) loadList(page);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    // 메일 선택 → 상세
    useEffect(() => {
        if (selectedUid == null || !folder) {
            setDetail(null);
            return;
        }
        setDetailLoading(true);
        fetchMessageDetail(folder, selectedUid)
            .then(setDetail)
            .catch(() => toast.error("메일을 불러오지 못했습니다."))
            .finally(() => setDetailLoading(false));
    }, [selectedUid, folder, toast]);

    // 출처 이동 처리
    useEffect(() => {
        if (pendingOpen && pendingOpen.folder === folder) {
            setSelectedUid(pendingOpen.uid);
            clearPendingOpen();
        }
    }, [pendingOpen, folder, clearPendingOpen]);

    const runScanNow = async () => {
        if (!folder) {
            toast.error("메일함을 선택하세요.");
            return;
        }
        setScanning(true);
        try {
            const r = await runScan({
                folder,
                since: since || undefined,
                until: until || undefined,
                month: month || undefined,
            });
            setLastResult(r);
            setLastScan(fmtDateTime(new Date().toISOString()));
            if (r.error) {
                toast.error(r.error);
            } else {
                const extra: string[] = [];
                if (r.saved_unassigned) extra.push(`미지정 영화 ${r.saved_unassigned}건`);
                if (r.skipped_already_collected)
                    extra.push(`수집완료 메일 ${r.skipped_already_collected}건 건너뜀`);
                toast.success(
                    `수집 완료 · 신규 ${r.saved}건 (매칭 ${r.matched}건)` +
                    (extra.length ? ` · ${extra.join(" · ")}` : "")
                );
            }
            await loadCollected();
            await loadList(page);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "수집 실패");
        } finally {
            setScanning(false);
        }
    };

    // ── 수동 수집 (한 첨부 → 여러 영화 선택 가능) ──
    const openManual = (att: IMailAttachment) => {
        setManualAtt(att);
        // 이미 수집된 영화는 미리 선택 상태로 표시(추가만 가능)
        const existing = (selectedRecsByIdx.get(att.index) || [])
            .filter((r) => r.movie_id != null)
            .map((r) => ({ id: r.movie_id as number, title: r.movie_title }));
        setMvChosen(existing);
        setMvQuery("");
        setMvResults([]);
        const d = detail?.date ? new Date(detail.date) : null;
        setManualMonth(
            d && !isNaN(d.getTime())
                ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
                : ""
        );
    };
    const toggleMovie = (id: number, title: string) => {
        setMvChosen((prev) =>
            prev.some((m) => m.id === id)
                ? prev.filter((m) => m.id !== id)
                : [...prev, { id, title }]
        );
    };
    const mvSearch = async () => {
        if (!mvQuery.trim()) {
            setMvResults([]);
            return;
        }
        try {
            setMvResults(await searchMovies(mvQuery.trim()));
        } catch {
            toast.error("영화 검색에 실패했습니다.");
        }
    };
    const saveManual = async () => {
        if (!manualAtt || mvChosen.length === 0 || !detail) return;
        setManualSaving(true);
        try {
            const res = await collectAttachment({
                folder,
                uid: detail.uid,
                index: manualAtt.index,
                movies: mvChosen.map((m) => m.id),
                month: manualMonth || undefined,
            });
            const n = res.saved.length;
            if (n > 0)
                toast.success(
                    `'${manualAtt.filename}' ${n}개 영화로 수집됨` +
                        (res.duplicated ? ` (중복 ${res.duplicated} 제외)` : "")
                );
            else toast.error("이미 수집된 영화입니다.");
            setManualAtt(null);
            await loadCollected();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "수집에 실패했습니다.");
        } finally {
            setManualSaving(false);
        }
    };

    const filteredList = useMemo(() => {
        if (filter === "collected")
            return list.filter((m) => collectedByUid.has(m.uid));
        if (filter === "uncollected")
            return list.filter((m) => !collectedByUid.has(m.uid));
        return list;
    }, [list, filter, collectedByUid]);

    // 목록(최신순)에서 가장 최근에 수집(다운로드)까지 완료된 메일 —
    // '여기까지 다운로드 완료' 구분선 표시 위치 (C001)
    const lastCollectedUid = useMemo(
        () =>
            filteredList.find((m) => m.collected || collectedByUid.has(m.uid))
                ?.uid,
        [filteredList, collectedByUid]
    );

    const selectedRecs = selectedUid ? collectedByUid.get(selectedUid) || [] : [];
    // 첨부 index -> 수집 레코드[] (한 첨부가 여러 영화로 수집될 수 있음)
    const selectedRecsByIdx = new Map<number, ICollectedSettlement[]>();
    for (const r of selectedRecs) {
        if (!selectedRecsByIdx.has(r.attachment_index))
            selectedRecsByIdx.set(r.attachment_index, []);
        selectedRecsByIdx.get(r.attachment_index)!.push(r);
    }

    // 본문 iframe
    const bodySrcDoc = useMemo(() => {
        if (!detail) return "";
        const wrap = (inner: string) =>
            `<!doctype html><html><head><meta charset="utf-8">` +
            `<base target="_blank">` +
            `<style>body{margin:8px;font-family:'Apple SD Gothic Neo','SUIT',sans-serif;font-size:14px;color:#1e293b;word-break:break-word;} a{color:#2563eb;}</style>` +
            `</head><body>${inner}</body></html>`;
        if (detail.html) return wrap(detail.html);
        if (detail.text)
            return wrap(
                `<pre style="white-space:pre-wrap;word-break:break-word;font-family:inherit;margin:0;">${detail.text
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")}</pre>`
            );
        return wrap(`<p style="color:#94a3b8;">본문이 없습니다.</p>`);
    }, [detail]);

    return (
        <div>
            {/* 컨트롤 바 */}
            <CommonFilterBar
                actions={
                    <PrimaryBtn onClick={runScanNow} disabled={scanning}>
                        {scanning ? (
                            <>
                                <ArrowClockwise className="spin" /> 수집 중…
                            </>
                        ) : (
                            <>
                                <MagnifyingGlass /> 지금 수집
                            </>
                        )}
                    </PrimaryBtn>
                }>
                {/* 메일함은 고정값이라 입력이 아닌 표시용 칩 */}
                <ReadonlyChip>
                    <span className="label">메일함</span>
                    <span className="value">
                        {folders.find((f) => f.name === folder)?.display || "*부금계산서*/위탁,기타"}
                    </span>
                </ReadonlyChip>
                <CustomInput label="시작일" inputType="date" value={since} setValue={setSince} />
                <CustomInput label="종료일" inputType="date" value={until} setValue={setUntil} />
                <CustomInput label="저장 월(비우면 수신월)" inputType="month" value={month} setValue={setMonth} />
            </CommonFilterBar>

            <StatusLine>
                {lastScan && (
                    <span>
                        마지막 수집 <b>{lastScan}</b>
                    </span>
                )}
                {lastResult && !lastResult.error && (
                    <span>
                        스캔 {lastResult.scanned} · 매칭 {lastResult.matched} · 신규{" "}
                        <b className="ok">{lastResult.saved}</b>
                        {lastResult.saved_unassigned > 0 && (
                            <> (미지정 영화 {lastResult.saved_unassigned})</>
                        )}
                        {" · "}중복제외 {lastResult.skipped_duplicate}
                        {lastResult.skipped_already_collected > 0 && (
                            <> · 수집완료 건너뜀 {lastResult.skipped_already_collected}</>
                        )}
                    </span>
                )}
            </StatusLine>

            <Body>
                {/* 메일 목록 */}
                <ListPane>
                    <ListHeader>
                        <span>
                            전체 <b>{total.toLocaleString()}</b>통
                        </span>
                        <FilterChips>
                            <Chip
                                $active={filter === "all"}
                                onClick={() => setFilter("all")}
                            >
                                전체
                            </Chip>
                            <Chip
                                $active={filter === "collected"}
                                onClick={() => setFilter("collected")}
                            >
                                수집됨
                            </Chip>
                            <Chip
                                $active={filter === "uncollected"}
                                onClick={() => setFilter("uncollected")}
                            >
                                미수집
                            </Chip>
                        </FilterChips>
                        <RefreshMini
                            onClick={() => {
                                loadList(page);
                                loadCollected();
                            }}
                            title="새로고침"
                        >
                            <ArrowClockwise size={14} weight="bold" />
                        </RefreshMini>
                    </ListHeader>

                    <MailList>
                        {listLoading && <div className="info">불러오는 중…</div>}
                        {!listLoading && filteredList.length === 0 && (
                            <div className="info">표시할 메일이 없습니다.</div>
                        )}
                        {!listLoading &&
                            filteredList.map((m) => {
                                const recs = collectedByUid.get(m.uid);
                                return (
                                    <div key={m.uid}>
                                    {/* 가장 최근 수집 완료 메일 위 구분선 (C001) */}
                                    {m.uid === lastCollectedUid && (
                                        <CollectedDivider>
                                            여기까지 다운로드 완료
                                        </CollectedDivider>
                                    )}
                                    <MailRow
                                        $active={selectedUid === m.uid}
                                        onClick={() => setSelectedUid(m.uid)}
                                    >
                                        <div className="top">
                                            <span className="subj">{m.subject}</span>
                                            {recs && (
                                                <CollectedTag title="수집된 첨부 수">
                                                    <CheckCircle
                                                        size={13}
                                                        weight="fill"
                                                    />
                                                    {recs.length}
                                                </CollectedTag>
                                            )}
                                        </div>
                                        <div className="bottom">
                                            <span className="from">{m.from}</span>
                                            <span className="date">
                                                {fmtDate(m.date)}
                                            </span>
                                        </div>
                                    </MailRow>
                                    </div>
                                );
                            })}
                    </MailList>

                    <Pager>
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                            <CaretLeft size={14} weight="bold" />
                        </button>
                        <span>
                            {page} / {totalPages}
                        </span>
                        <button
                            disabled={page >= totalPages}
                            onClick={() =>
                                setPage((p) => Math.min(totalPages, p + 1))
                            }
                        >
                            <CaretRight size={14} weight="bold" />
                        </button>
                    </Pager>
                </ListPane>

                {/* 상세 */}
                <DetailPane>
                    {!selectedUid && (
                        <div className="placeholder">
                            <EnvelopeSimple size={40} weight="thin" />
                            <p>메일을 선택하세요.</p>
                        </div>
                    )}
                    {selectedUid && detailLoading && (
                        <div className="placeholder">불러오는 중…</div>
                    )}
                    {selectedUid && detail && !detailLoading && (
                        <>
                            <DetailHead>
                                <div className="subj">{detail.subject}</div>
                                <div className="meta">
                                    <span>{detail.from}</span>
                                    <span>{fmtDateTime(detail.date)}</span>
                                </div>
                            </DetailHead>

                            {detail.attachments.length > 0 && (
                                <AttachWrap>
                                    <div className="atitle">
                                        <Paperclip size={14} weight="bold" /> 첨부{" "}
                                        {detail.attachments.length}개
                                    </div>
                                    {detail.attachments.map((a) => {
                                        const recs =
                                            selectedRecsByIdx.get(a.index) || [];
                                        return (
                                            <AttachRow key={a.index}>
                                                <span className="fn">
                                                    {a.filename}
                                                </span>
                                                <span className="sz">
                                                    {fmtSize(a.size)}
                                                </span>
                                                {recs.map((rec) => (
                                                    <span
                                                        key={rec.id}
                                                        className="ctag"
                                                        title={`${rec.month} · ${rec.movie_title} (으)로 수집됨`}
                                                    >
                                                        <CheckCircle
                                                            size={13}
                                                            weight="fill"
                                                        />
                                                        {rec.month} ·{" "}
                                                        {rec.movie_title}
                                                    </span>
                                                ))}
                                                <CollectBtn
                                                    onClick={() => openManual(a)}
                                                    title="이 첨부를 영화 지정하여 수집(여러 영화 가능)"
                                                >
                                                    <Plus weight="bold" />
                                                    {recs.length > 0
                                                        ? "영화 추가"
                                                        : "수집"}
                                                </CollectBtn>
                                                <IconBtn
                                                    onClick={() =>
                                                        downloadAttachment(
                                                            folder,
                                                            detail.uid,
                                                            a
                                                        ).catch(() =>
                                                            toast.error(
                                                                "다운로드 실패"
                                                            )
                                                        )
                                                    }
                                                    title="다운로드"
                                                >
                                                    <DownloadSimple />
                                                </IconBtn>
                                            </AttachRow>
                                        );
                                    })}
                                </AttachWrap>
                            )}

                            <BodyFrame
                                title="mail-body"
                                sandbox="allow-popups allow-popups-to-escape-sandbox"
                                srcDoc={bodySrcDoc}
                            />
                        </>
                    )}
                </DetailPane>
            </Body>

            {/* 수동 수집 모달 */}
            {manualAtt && (
                <ModalOverlay onClick={() => setManualAtt(null)}>
                    <ModalCard onClick={(e) => e.stopPropagation()}>
                        <h3>첨부 수동 수집</h3>
                        <div className="fn">
                            <Paperclip size={14} weight="bold" />
                            {manualAtt.filename}
                        </div>

                        <label>영화 선택 (여러 개 선택 가능)</label>
                        {targetsQuick.length > 0 && (
                            <div className="quick">
                                {targetsQuick.map((t) => (
                                    <button
                                        key={t.id}
                                        className={
                                            mvChosen.some((c) => c.id === t.movie)
                                                ? "on"
                                                : ""
                                        }
                                        onClick={() =>
                                            toggleMovie(t.movie, t.movie_title)
                                        }
                                    >
                                        {t.movie_title}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="search">
                            <input
                                placeholder="다른 영화 검색"
                                value={mvQuery}
                                onChange={(e) => setMvQuery(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && mvSearch()}
                            />
                            <button onClick={mvSearch}>
                                <MagnifyingGlass /> 검색
                            </button>
                        </div>
                        {mvResults.length > 0 && (
                            <div className="results">
                                {mvResults.map((m) => (
                                    <button
                                        key={m.id}
                                        className={
                                            mvChosen.some((c) => c.id === m.id)
                                                ? "on"
                                                : ""
                                        }
                                        onClick={() =>
                                            toggleMovie(m.id, m.title_ko)
                                        }
                                    >
                                        {m.title_ko}
                                        <em>{m.release_date || ""}</em>
                                    </button>
                                ))}
                            </div>
                        )}
                        {mvChosen.length > 0 && (
                            <div className="chosen">
                                선택됨:{" "}
                                {mvChosen.map((c) => (
                                    <button
                                        key={c.id}
                                        className="picked"
                                        onClick={() => toggleMovie(c.id, c.title)}
                                        title="클릭하여 제외"
                                    >
                                        {c.title} ✕
                                    </button>
                                ))}
                            </div>
                        )}

                        <label>저장 월</label>
                        <input
                            type="month"
                            value={manualMonth}
                            onChange={(e) => setManualMonth(e.target.value)}
                        />

                        <div className="actions">
                            <button
                                className="cancel"
                                onClick={() => setManualAtt(null)}
                            >
                                취소
                            </button>
                            <button
                                className="save"
                                disabled={mvChosen.length === 0 || manualSaving}
                                onClick={saveManual}
                            >
                                {manualSaving ? "저장 중…" : "수집 저장"}
                            </button>
                        </div>
                    </ModalCard>
                </ModalOverlay>
            )}
        </div>
    );
};

/* ──────────────────────────────────────────────────────────
 * 2) 수집 파일 탭
 * ────────────────────────────────────────────────────────── */
const BrowseTab = ({
    openMail,
}: {
    openMail: (folder: string, uid: number) => void;
}) => {
    const toast = useToast();
    const { showAlert } = useAppAlert();
    const [months, setMonths] = useState<IMonthSummary[]>([]);
    const [activeMonth, setActiveMonth] = useState<string>("");
    const [items, setItems] = useState<ICollectedSettlement[]>([]);
    const [loading, setLoading] = useState(false);
    // 어떤 그룹의 zip 을 준비 중인지: 영화 그룹은 movie_id, '미지정 영화' 그룹은 그룹명
    const [zipLoading, setZipLoading] = useState<number | string | null>(null);
    // 다중 선택(일괄 삭제용)
    const [selected, setSelected] = useState<Set<number>>(new Set());
    // 접힌 영화 그룹 (기본은 모두 펼침 — 접은 것만 담아둔다)
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    // 원본메일 미리보기 모달
    const [mailModal, setMailModal] = useState<{
        folder: string;
        uid: number;
    } | null>(null);

    const loadMonths = useCallback(async () => {
        try {
            const ms = await fetchMonthSummary();
            setMonths(ms);
            setActiveMonth((cur) => cur || (ms[0]?.month ?? ""));
        } catch {
            toast.error("월 목록을 불러오지 못했습니다.");
        }
    }, [toast]);

    const loadItems = useCallback(async () => {
        setLoading(true);
        try {
            setItems(await fetchCollected({ month: activeMonth || undefined }));
            setSelected(new Set());
        } catch {
            toast.error("수집 목록을 불러오지 못했습니다.");
        } finally {
            setLoading(false);
        }
    }, [activeMonth, toast]);

    const toggleSelect = (id: number) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const toggleSelectGroup = (ids: number[], on: boolean) =>
        setSelected((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
            return next;
        });

    // 다운로드/원본 메일 조회한 파일을 목록에서 회색으로 표시 (C002)
    const markViewedLocal = (ids: number[]) => {
        const now = new Date().toISOString();
        const idSet = new Set(ids);
        setItems((prev) =>
            prev.map((it) =>
                idSet.has(it.id) && !it.viewed_at ? { ...it, viewed_at: now } : it
            )
        );
    };

    const [bulkDownloading, setBulkDownloading] = useState(false);
    const onBulkDownload = async () => {
        const ids = Array.from(selected);
        if (ids.length === 0) return;
        setBulkDownloading(true);
        try {
            await downloadSelectedZip(ids);
            markViewedLocal(ids);
        } catch {
            toast.error("선택 다운로드에 실패했습니다.");
        } finally {
            setBulkDownloading(false);
        }
    };

    const onBulkDelete = () => {
        const ids = Array.from(selected);
        if (ids.length === 0) return;
        showAlert(
            "일괄 삭제",
            `선택한 ${ids.length}건의 첨부를 삭제하시겠습니까?`,
            "warning",
            async () => {
                try {
                    const { deleted } = await bulkDeleteCollected(ids);
                    toast.success(`${deleted}건을 삭제했습니다.`);
                    setSelected(new Set());
                    loadItems();
                    loadMonths();
                } catch {
                    toast.error("일괄 삭제에 실패했습니다.");
                }
            },
            true
        );
    };

    useEffect(() => {
        loadMonths();
    }, [loadMonths]);

    useEffect(() => {
        if (activeMonth) loadItems();
    }, [activeMonth, loadItems]);

    const grouped = useMemo(() => {
        const map = new Map<string, ICollectedSettlement[]>();
        for (const it of items) {
            const key = it.movie_title || "(미지정)";
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(it);
        }
        return Array.from(map.entries());
    }, [items]);

    // zip 진행 표시용 그룹 키 (영화 미지정 그룹은 movie_id 가 없어 그룹명으로 구분)
    const groupZipKey = (list: ICollectedSettlement[]) =>
        list[0]?.movie_id ?? `t:${list[0]?.movie_title || ""}`;

    const toggleGroup = (movie: string) =>
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(movie)) next.delete(movie);
            else next.add(movie);
            return next;
        });

    const allCollapsed = grouped.length > 0 && collapsed.size >= grouped.length;

    const toggleAllGroups = () =>
        setCollapsed(allCollapsed ? new Set() : new Set(grouped.map(([m]) => m)));

    const onDelete = (it: ICollectedSettlement) => {
        showAlert(
            "첨부 삭제",
            `'${it.filename}' 을(를) 삭제하시겠습니까?`,
            "warning",
            async () => {
                try {
                    await deleteCollected(it.id);
                    toast.success("삭제했습니다.");
                    loadItems();
                    loadMonths();
                } catch {
                    toast.error("삭제에 실패했습니다.");
                }
            },
            true
        );
    };

    return (
        <BrowseWrap>
            <MonthSide>
                <div className="head">월별</div>
                {months.length === 0 && <div className="empty">수집 내역 없음</div>}
                {months.map((m) => (
                    <MonthItem
                        key={m.month}
                        $active={m.month === activeMonth}
                        onClick={() => setActiveMonth(m.month)}
                    >
                        <span>{m.month}</span>
                        <em>{m.count}</em>
                    </MonthItem>
                ))}
                <RefreshBtn
                    onClick={() => {
                        loadMonths();
                        loadItems();
                    }}
                >
                    <ArrowClockwise /> 새로고침
                </RefreshBtn>
            </MonthSide>

            <BrowseMain>
                {loading && <div className="loading">불러오는 중…</div>}
                {!loading && grouped.length === 0 && (
                    <div className="empty">
                        {activeMonth
                            ? `${activeMonth} 에 수집된 첨부가 없습니다.`
                            : "수집된 첨부가 없습니다."}
                    </div>
                )}
                {!loading && selected.size > 0 && (
                    <BulkBar>
                        <span>
                            <b>{selected.size}</b>건 선택됨
                        </span>
                        <BulkDownBtn
                            disabled={bulkDownloading}
                            onClick={onBulkDownload}
                        >
                            <DownloadSimple weight="bold" />{" "}
                            {bulkDownloading ? "준비 중…" : "선택 다운로드(zip)"}
                        </BulkDownBtn>
                        <BulkDelBtn onClick={onBulkDelete}>
                            <Trash weight="bold" /> 일괄 삭제
                        </BulkDelBtn>
                        <BulkClearBtn onClick={() => setSelected(new Set())}>
                            선택 해제
                        </BulkClearBtn>
                    </BulkBar>
                )}
                {!loading && grouped.length > 0 && (
                    <GroupToolbar>
                        <span>영화 {grouped.length}개</span>
                        <CollapseAllBtn type="button" onClick={toggleAllGroups}>
                            <CaretDown
                                weight="bold"
                                className={allCollapsed ? "caret closed" : "caret"}
                            />
                            {allCollapsed ? "전체 펼치기" : "전체 접기"}
                        </CollapseAllBtn>
                    </GroupToolbar>
                )}
                {!loading &&
                    grouped.map(([movie, list]) => (
                        <MovieGroup key={movie}>
                            <div className="gtitle">
                                <GroupToggle
                                    type="button"
                                    onClick={() => toggleGroup(movie)}
                                    aria-expanded={!collapsed.has(movie)}
                                    title={collapsed.has(movie) ? "펼치기" : "접기"}
                                >
                                    <CaretDown
                                        weight="bold"
                                        className={collapsed.has(movie) ? "caret closed" : "caret"}
                                    />
                                    {movie} <em>{list.length}건</em>
                                </GroupToggle>
                                {list.length > 0 && (
                                    <ZipBtn
                                        disabled={
                                            zipLoading === groupZipKey(list)
                                        }
                                        onClick={async () => {
                                            const mid = list[0].movie_id;
                                            setZipLoading(groupZipKey(list));
                                            try {
                                                // 영화가 지정된 그룹은 영화(+월) 단위로,
                                                // '미지정 영화' 그룹은 movie_id 가 없으므로 항목 id 목록으로 묶는다.
                                                if (mid != null) {
                                                    await downloadMovieZip(
                                                        mid,
                                                        activeMonth || undefined
                                                    );
                                                } else {
                                                    await downloadSelectedZip(
                                                        list.map((it) => it.id)
                                                    );
                                                }
                                                markViewedLocal(
                                                    list.map((it) => it.id)
                                                );
                                            } catch {
                                                toast.error(
                                                    "일괄 다운로드 실패"
                                                );
                                            } finally {
                                                setZipLoading(null);
                                            }
                                        }}
                                        title={`${movie} 파일 일괄 다운로드(zip)`}
                                    >
                                        {zipLoading === groupZipKey(list) ? (
                                            <>
                                                <ArrowClockwise
                                                    weight="bold"
                                                    className="spin"
                                                />{" "}
                                                준비 중…
                                            </>
                                        ) : (
                                            <>
                                                <DownloadSimple weight="bold" />{" "}
                                                일괄 다운로드
                                            </>
                                        )}
                                    </ZipBtn>
                                )}
                            </div>
                            {!collapsed.has(movie) && (
                            <Table>
                                <thead>
                                    <tr>
                                        <th style={{ width: 34 }}>
                                            <input
                                                type="checkbox"
                                                checked={list.every((it) =>
                                                    selected.has(it.id)
                                                )}
                                                onChange={(e) =>
                                                    toggleSelectGroup(
                                                        list.map((it) => it.id),
                                                        e.target.checked
                                                    )
                                                }
                                                title="그룹 전체 선택"
                                            />
                                        </th>
                                        <th>첨부파일</th>
                                        <th style={{ width: 110 }}>메일 날짜</th>
                                        <th style={{ width: 80 }}>매칭</th>
                                        <th>메일 제목</th>
                                        <th style={{ width: 70 }}>크기</th>
                                        <th style={{ width: 130 }}>관리</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {list.map((it) => (
                                        <tr
                                            key={it.id}
                                            className={
                                                it.viewed_at ? "viewed" : undefined
                                            }
                                            title={
                                                it.viewed_at
                                                    ? "다운로드/원본 조회한 파일"
                                                    : undefined
                                            }
                                        >
                                            <td className="center">
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(it.id)}
                                                    onChange={() =>
                                                        toggleSelect(it.id)
                                                    }
                                                />
                                            </td>
                                            <td className="name">{it.filename}</td>
                                            <td>{fmtDate(it.mail_date)}</td>
                                            <td>
                                                {WHERE_LABEL[it.matched_in] ||
                                                    it.matched_in}
                                            </td>
                                            <td
                                                className="subj"
                                                title={it.mail_subject}
                                            >
                                                {it.mail_subject}
                                            </td>
                                            <td>{fmtSize(it.size)}</td>
                                            <td className="center">
                                                <IconActions>
                                                    <SourceBtn
                                                        onClick={() => {
                                                            setMailModal({
                                                                folder: it.mail_folder,
                                                                uid: it.mail_uid,
                                                            });
                                                            // 원본 메일 조회도 회색 표시 대상 (C002)
                                                            markCollectedViewed([
                                                                it.id,
                                                            ]).catch(() => {});
                                                            markViewedLocal([it.id]);
                                                        }}
                                                        title="원본 메일 보기"
                                                    >
                                                        <ArrowSquareOut />
                                                    </SourceBtn>
                                                    <IconBtn
                                                        onClick={() =>
                                                            downloadCollected(it)
                                                                .then(() =>
                                                                    markViewedLocal([
                                                                        it.id,
                                                                    ])
                                                                )
                                                                .catch(() =>
                                                                    toast.error(
                                                                        "다운로드 실패"
                                                                    )
                                                                )
                                                        }
                                                        title="다운로드"
                                                    >
                                                        <DownloadSimple />
                                                    </IconBtn>
                                                    <IconBtn
                                                        $variant="del"
                                                        onClick={() =>
                                                            onDelete(it)
                                                        }
                                                        title="삭제"
                                                    >
                                                        <Trash />
                                                    </IconBtn>
                                                </IconActions>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                            )}
                        </MovieGroup>
                    ))}
            </BrowseMain>

            {mailModal && (
                <MailPreviewModal
                    folder={mailModal.folder}
                    uid={mailModal.uid}
                    onClose={() => setMailModal(null)}
                    onOpenMailbox={() => {
                        openMail(mailModal.folder, mailModal.uid);
                        setMailModal(null);
                    }}
                />
            )}
        </BrowseWrap>
    );
};

/* ──────────────────────────────────────────────────────────
 * 원본메일 미리보기 모달
 * ────────────────────────────────────────────────────────── */
// 한 번 불러온 메일은 세션 내 재사용 (재오픈 시 재요청 방지)
const mailPreviewCache = new Map<string, IMailDetail>();

const MailPreviewModal = ({
    folder,
    uid,
    onClose,
    onOpenMailbox,
}: {
    folder: string;
    uid: number;
    onClose: () => void;
    onOpenMailbox: () => void;
}) => {
    const cacheKey = `${folder}|${uid}`;
    const [detail, setDetail] = useState<IMailDetail | null>(
        mailPreviewCache.get(cacheKey) || null
    );
    const [error, setError] = useState("");

    useEffect(() => {
        const key = `${folder}|${uid}`;
        const cached = mailPreviewCache.get(key);
        if (cached) {
            setDetail(cached);
            return;
        }
        setDetail(null);
        setError("");
        let alive = true;
        fetchMessageDetail(folder, uid)
            .then((d) => {
                if (!alive) return;
                mailPreviewCache.set(key, d);
                setDetail(d);
            })
            .catch(() => {
                if (alive) setError("메일을 불러오지 못했습니다.");
            });
        return () => {
            alive = false;
        };
    }, [folder, uid]);

    const srcDoc = useMemo(() => {
        if (!detail) return "";
        const wrap = (inner: string) =>
            `<!doctype html><html><head><meta charset="utf-8">` +
            `<base target="_blank">` +
            `<style>body{margin:8px;font-family:'Apple SD Gothic Neo','SUIT',sans-serif;font-size:13px;color:#1e293b;word-break:break-word;} a{color:#2563eb;}</style>` +
            `</head><body>${inner}</body></html>`;
        if (detail.html) return wrap(detail.html);
        if (detail.text)
            return wrap(
                `<pre style="white-space:pre-wrap;word-break:break-word;font-family:inherit;margin:0;">${detail.text
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")}</pre>`
            );
        return wrap(`<p style="color:#94a3b8;">본문이 없습니다.</p>`);
    }, [detail]);

    return (
        <ModalOverlay onClick={onClose}>
            <MailModalCard onClick={(e) => e.stopPropagation()}>
                <div className="mhead">
                    <div className="minfo">
                        <div className="subject" title={detail?.subject}>
                            {detail?.subject || "메일 미리보기"}
                        </div>
                        {detail && (
                            <div className="meta">
                                {detail.from} · {fmtDateTime(detail.date)}
                            </div>
                        )}
                    </div>
                    <div className="mactions">
                        <button className="tomail" onClick={onOpenMailbox}>
                            <ArrowSquareOut weight="bold" /> 메일함에서 열기
                        </button>
                        <button className="close" onClick={onClose} title="닫기">
                            ✕
                        </button>
                    </div>
                </div>

                {detail && detail.attachments.length > 0 && (
                    <div className="atts">
                        {detail.attachments.map((att) => (
                            <button
                                key={att.index}
                                onClick={() =>
                                    downloadAttachment(folder, uid, att)
                                }
                                title={`${att.filename} 다운로드`}
                            >
                                <Paperclip size={12} weight="bold" />
                                {att.filename}
                                <em>{fmtSize(att.size)}</em>
                            </button>
                        ))}
                    </div>
                )}

                {!detail && !error && (
                    <div className="state">메일 불러오는 중…</div>
                )}
                {error && <div className="state">{error}</div>}
                {detail && (
                    <PreviewFrame
                        title="메일 미리보기"
                        sandbox="allow-popups allow-popups-to-escape-sandbox"
                        srcDoc={srcDoc}
                    />
                )}
            </MailModalCard>
        </ModalOverlay>
    );
};

/* ──────────────────────────────────────────────────────────
 * 3) 대상 영화 설정 탭
 * ────────────────────────────────────────────────────────── */
const TargetsTab = () => {
    const toast = useToast();
    const { showAlert } = useAppAlert();
    const [targets, setTargets] = useState<ISettlementTarget[]>([]);
    const [loading, setLoading] = useState(false);

    const [q, setQ] = useState("");
    const [searchResults, setSearchResults] = useState<IMovieSearchItem[]>([]);
    const [searching, setSearching] = useState(false);

    const [editId, setEditId] = useState<number | null>(null);
    const [editAliases, setEditAliases] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setTargets(await fetchTargets());
        } catch {
            toast.error("대상 영화 목록을 불러오지 못했습니다.");
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
    }, [load]);

    const onSearch = async () => {
        if (!q.trim()) {
            setSearchResults([]);
            return;
        }
        setSearching(true);
        try {
            setSearchResults(await searchMovies(q.trim()));
        } catch {
            toast.error("영화 검색에 실패했습니다.");
        } finally {
            setSearching(false);
        }
    };

    const onAdd = async (m: IMovieSearchItem) => {
        try {
            await createTarget(m.id);
            toast.success(`'${m.title_ko}' 추가됨`);
            setSearchResults((prev) => prev.filter((x) => x.id !== m.id));
            load();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "추가에 실패했습니다.");
        }
    };

    const toggleActive = async (t: ISettlementTarget) => {
        try {
            await updateTarget(t.id, { is_active: !t.is_active });
            load();
        } catch {
            toast.error("상태 변경에 실패했습니다.");
        }
    };

    const startEdit = (t: ISettlementTarget) => {
        setEditId(t.id);
        setEditAliases(t.aliases);
    };

    const saveAliases = async (id: number) => {
        try {
            await updateTarget(id, { aliases: editAliases });
            toast.success("별칭을 저장했습니다.");
            setEditId(null);
            load();
        } catch {
            toast.error("저장에 실패했습니다.");
        }
    };

    const onDelete = (t: ISettlementTarget) => {
        showAlert(
            "대상 영화 삭제",
            `'${t.movie_title}' 을(를) 대상에서 제거하시겠습니까? (수집된 파일은 유지됩니다)`,
            "warning",
            async () => {
                try {
                    await deleteTarget(t.id);
                    toast.success("삭제했습니다.");
                    load();
                } catch {
                    toast.error("삭제에 실패했습니다.");
                }
            },
            true
        );
    };

    return (
        <Panel>
            <SearchRow>
                <input
                    placeholder="영화 제목 검색 후 대상에 추가"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onSearch()}
                />
                <PrimaryBtn onClick={onSearch} disabled={searching}>
                    <MagnifyingGlass /> 검색
                </PrimaryBtn>
            </SearchRow>

            {searchResults.length > 0 && (
                <SearchResults>
                    {searchResults.map((m) => (
                        <li key={m.id}>
                            <span className="t">{m.title_ko}</span>
                            <span className="sub">
                                {m.title_en ? `${m.title_en} · ` : ""}
                                {m.release_date || "개봉일 미정"}
                            </span>
                            <AddBtn onClick={() => onAdd(m)}>
                                <Plus /> 추가
                            </AddBtn>
                        </li>
                    ))}
                </SearchResults>
            )}

            <Table>
                <thead>
                    <tr>
                        <th style={{ width: 60 }}>활성</th>
                        <th>영화</th>
                        <th>별칭 (한 줄에 하나)</th>
                        <th style={{ width: 90 }}>관리</th>
                    </tr>
                </thead>
                <tbody>
                    {targets.length === 0 && !loading && (
                        <tr>
                            <td colSpan={4} className="empty">
                                등록된 대상 영화가 없습니다. 위에서 검색해 추가하세요.
                            </td>
                        </tr>
                    )}
                    {targets.map((t) => (
                        <tr key={t.id} className={t.is_active ? "" : "off"}>
                            <td className="center">
                                <Toggle
                                    $on={t.is_active}
                                    onClick={() => toggleActive(t)}
                                />
                            </td>
                            <td>
                                <div className="name">{t.movie_title}</div>
                                <div className="sub">
                                    {t.movie_code}
                                    {t.release_date ? ` · ${t.release_date}` : ""}
                                </div>
                            </td>
                            <td>
                                {editId === t.id ? (
                                    <div className="aliasEdit">
                                        <textarea
                                            value={editAliases}
                                            onChange={(e) =>
                                                setEditAliases(e.target.value)
                                            }
                                            rows={3}
                                            placeholder={"예시\n영문제목\n약칭"}
                                        />
                                        <div className="aliasBtns">
                                            <IconBtn
                                                $variant="ok"
                                                onClick={() => saveAliases(t.id)}
                                                title="저장"
                                            >
                                                <FloppyDisk />
                                            </IconBtn>
                                            <IconBtn
                                                onClick={() => setEditId(null)}
                                                title="취소"
                                            >
                                                ✕
                                            </IconBtn>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        className="aliasView"
                                        onClick={() => startEdit(t)}
                                        title="클릭하여 편집"
                                    >
                                        {t.aliases ? (
                                            t.aliases
                                                .split("\n")
                                                .filter(Boolean)
                                                .map((a, i) => (
                                                    <span className="chip" key={i}>
                                                        {a}
                                                    </span>
                                                ))
                                        ) : (
                                            <span className="addAlias">
                                                + 별칭 추가
                                            </span>
                                        )}
                                    </div>
                                )}
                            </td>
                            <td className="center">
                                <IconBtn
                                    $variant="del"
                                    onClick={() => onDelete(t)}
                                    title="삭제"
                                >
                                    <Trash />
                                </IconBtn>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </Table>
            <FootNote>
                활성 {targets.filter((t) => t.is_active).length} / 전체 {targets.length}편
            </FootNote>
        </Panel>
    );
};

/* ───── styles ───── */
const Wrapper = styled.div`
    font-family: "SUIT", sans-serif;
    padding: 16px 18px;
`;
const Header = styled.div`
    margin-bottom: 14px;
    h2 {
        margin: 0 0 6px;
        font-size: 18px;
        color: #0f172a;
    }
    p {
        margin: 0;
        font-size: 13px;
        color: #475569;
        b {
            color: #0f172a;
        }
    }
`;
const Tabs = styled.div`
    display: flex;
    gap: 6px;
    border-bottom: 1px solid #e2e8f0;
    margin-bottom: 16px;
`;
const TabBtn = styled.button<{ $active: boolean }>`
    border: 0;
    background: none;
    padding: 9px 14px;
    font-size: 14px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    color: ${({ $active }) => ($active ? "#2563eb" : "#64748b")};
    border-bottom: 2px solid
        ${({ $active }) => ($active ? "#2563eb" : "transparent")};
    margin-bottom: -1px;
`;
const Panel = styled.div``;
/* 값이 고정된 항목을 필터 칩과 같은 모양으로 보여줍니다 (입력은 불가) */
const ReadonlyChip = styled.div`
    display: inline-flex;
    align-items: center;
    height: 30px;
    padding: 0 10px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #f8fafc;
    white-space: nowrap;

    .label {
        font-size: 12.5px;
        line-height: 20px;
        color: #64748b;
        padding-right: 8px;
        border-right: 1px solid #e2e8f0;
    }
    .value {
        font-size: 12.5px;
        line-height: 20px;
        font-weight: 600;
        color: #0f172a;
        padding-left: 8px;
    }
`;
const PrimaryBtn = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 14px;
    border: 1px solid #2563eb;
    background: #2563eb;
    color: #ffffff;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    &:hover {
        background: #1d4ed8;
    }
    &:disabled {
        opacity: 0.6;
        cursor: default;
    }
    .spin {
        animation: spin 0.9s linear infinite;
    }
    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
`;
const StatusLine = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 12px;
    color: #64748b;
    margin-bottom: 12px;
    min-height: 16px;
    b {
        color: #0f172a;
    }
    b.ok {
        color: #16a34a;
    }
    .auto {
        color: #16a34a;
        font-weight: 600;
    }
`;
const Body = styled.div`
    display: flex;
    gap: 14px;
    align-items: stretch;
    height: calc(100vh - 280px);
    min-height: 420px;
`;
const ListPane = styled.div`
    width: 380px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    background: #ffffff;
`;
const ListHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
    font-size: 12px;
    color: #64748b;
    b {
        color: #0f172a;
    }
`;
const FilterChips = styled.div`
    display: flex;
    gap: 4px;
    margin-left: auto;
`;
const Chip = styled.button<{ $active: boolean }>`
    border: 1px solid ${({ $active }) => ($active ? "#2563eb" : "#cbd5e1")};
    background: ${({ $active }) => ($active ? "#eff6ff" : "#ffffff")};
    color: ${({ $active }) => ($active ? "#2563eb" : "#64748b")};
    font-weight: ${({ $active }) => ($active ? 700 : 500)};
    font-size: 12px;
    font-family: inherit;
    border-radius: 999px;
    padding: 3px 10px;
    cursor: pointer;
`;
const RefreshMini = styled.button`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    border-radius: 6px;
    color: #475569;
    cursor: pointer;
    &:hover {
        background: #f1f5f9;
    }
`;
const MailList = styled.div`
    flex: 1;
    overflow-y: auto;
    .info {
        padding: 30px 0;
        text-align: center;
        color: #94a3b8;
        font-size: 13px;
    }
`;
/* 가장 최근 수집 완료 메일 위에 표시되는 구분선 (C001) */
const CollectedDivider = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 700;
    color: #16a34a;
    background: #f0fdf4;
    border-bottom: 1px solid #dcfce7;
    &::before,
    &::after {
        content: "";
        flex: 1;
        border-top: 1px dashed #dcfce7;
    }
`;

const MailRow = styled.div<{ $active: boolean }>`
    padding: 9px 12px;
    border-bottom: 1px solid #f1f5f9;
    cursor: pointer;
    background: ${({ $active }) => ($active ? "#eff6ff" : "#ffffff")};
    &:hover {
        background: ${({ $active }) => ($active ? "#eff6ff" : "#f8fafc")};
    }
    .top {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .subj {
        flex: 1;
        font-size: 13px;
        font-weight: 600;
        color: #0f172a;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .bottom {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-top: 3px;
        font-size: 12.5px;
        color: #94a3b8;
    }
    .from {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 220px;
    }
`;
const CollectedTag = styled.span`
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: #dcfce7;
    color: #15803d;
    font-size: 11px;
    font-weight: 700;
    border-radius: 999px;
    padding: 1px 7px 1px 5px;
`;
const Pager = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 8px;
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
    font-size: 12px;
    color: #475569;
    button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        border-radius: 6px;
        cursor: pointer;
        &:disabled {
            opacity: 0.4;
            cursor: default;
        }
        &:not(:disabled):hover {
            background: #f1f5f9;
        }
    }
`;
const DetailPane = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    background: #ffffff;
    .placeholder {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: #94a3b8;
        font-size: 14px;
    }
`;
const DetailHead = styled.div`
    padding: 14px 16px;
    border-bottom: 1px solid #e2e8f0;
    .subj {
        font-size: 16px;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 6px;
    }
    .meta {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-size: 12px;
        color: #64748b;
    }
`;
const AttachWrap = styled.div`
    padding: 10px 16px;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
    .atitle {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        font-weight: 700;
        color: #475569;
        margin-bottom: 6px;
    }
`;
const AttachRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    .fn {
        flex: 1;
        font-size: 12.5px;
        color: #475569;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .sz {
        font-size: 12.5px;
        color: #94a3b8;
    }
    .ctag {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        flex-shrink: 0;
        white-space: nowrap;
        font-size: 11px;
        font-weight: 700;
        color: #15803d;
        background: #dcfce7;
        border-radius: 999px;
        padding: 1px 8px;
    }
    .ntag {
        font-size: 11px;
        font-weight: 600;
        color: #94a3b8;
        background: #f1f5f9;
        border-radius: 999px;
        padding: 1px 8px;
    }
`;
const BodyFrame = styled.iframe`
    flex: 1;
    width: 100%;
    border: 0;
    background: #ffffff;
`;
const SearchRow = styled.div`
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    input {
        flex: 1;
        max-width: 360px;
        height: 36px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 0 12px;
        font-size: 13px;
        font-family: inherit;
        &:focus {
            outline: none;
            border-color: #2563eb;
        }
    }
`;
const SearchResults = styled.ul`
    list-style: none;
    margin: 0 0 16px;
    padding: 6px;
    border: 1px solid #bfdbfe;
    background: #eff6ff;
    border-radius: 8px;
    max-height: 280px;
    overflow: auto;
    li {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 8px;
        border-radius: 6px;
        &:hover {
            background: #bfdbfe;
        }
    }
    .t {
        font-weight: 600;
        color: #0f172a;
        font-size: 13px;
    }
    .sub {
        flex: 1;
        color: #64748b;
        font-size: 12px;
    }
`;
const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
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
        padding: 8px 12px;
        border-bottom: 1px solid #f1f5f9;
        color: #475569;
        vertical-align: middle;
    }
    tbody td.center {
        text-align: center;
    }
    tbody tr.off td {
        color: #94a3b8;
    }
    /* 다운로드/원본 조회한 파일은 회색 표시 (C002) */
    tbody tr.viewed td,
    tbody tr.viewed td.name {
        color: #94a3b8;
    }
    tbody tr.viewed td.name {
        font-weight: 500;
    }
    .name {
        font-weight: 600;
        color: #0f172a;
    }
    .sub {
        font-size: 12.5px;
        color: #94a3b8;
        margin-top: 2px;
    }
    .subj {
        max-width: 280px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #64748b;
    }
    .empty {
        text-align: center;
        color: #94a3b8;
        padding: 28px 0;
    }
    .aliasView {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        cursor: pointer;
        min-height: 24px;
        align-items: center;
    }
    .chip {
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 2px 8px;
        font-size: 12px;
        color: #475569;
    }
    .addAlias {
        color: #94a3b8;
        font-size: 12px;
    }
    .aliasEdit {
        display: flex;
        gap: 6px;
        align-items: flex-start;
        textarea {
            flex: 1;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 6px 8px;
            font-size: 12.5px;
            font-family: inherit;
            resize: vertical;
            &:focus {
                outline: none;
                border-color: #2563eb;
            }
        }
    }
    .aliasBtns {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
`;
const Toggle = styled.button<{ $on: boolean }>`
    width: 36px;
    height: 20px;
    border-radius: 999px;
    border: 0;
    cursor: pointer;
    position: relative;
    background: ${({ $on }) => ($on ? "#16a34a" : "#cbd5e1")};
    transition: background 0.15s;
    &::after {
        content: "";
        position: absolute;
        top: 2px;
        left: ${({ $on }) => ($on ? "18px" : "2px")};
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #f8fafc;
        transition: left 0.15s;
    }
`;
const IconActions = styled.div`
    display: flex;
    gap: 6px;
    justify-content: center;
    align-items: center;
`;
const IconBtn = styled.button<{ $variant?: "del" | "ok" }>`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    border: 1px solid
        ${({ $variant }) =>
            $variant === "del"
                ? "#fecaca"
                : $variant === "ok"
                ? "#16a34a"
                : "#cbd5e1"};
    background: ${({ $variant }) => ($variant === "ok" ? "#16a34a" : "#ffffff")};
    color: ${({ $variant }) =>
        $variant === "del" ? "#dc2626" : $variant === "ok" ? "#ffffff" : "#475569"};
    &:hover {
        background: ${({ $variant }) =>
            $variant === "del"
                ? "#fef2f2"
                : $variant === "ok"
                ? "#15803d"
                : "#f1f5f9"};
    }
`;
const SourceBtn = styled.button`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid #bfdbfe;
    background: #eff6ff;
    color: #2563eb;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    &:hover {
        background: #eff6ff;
    }
`;
const AddBtn = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    padding: 0 12px;
    border: 1px solid #16a34a;
    background: #16a34a;
    color: #ffffff;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    &:hover {
        background: #15803d;
    }
`;
const CollectBtn = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 26px;
    padding: 0 8px;
    border: 1px solid #16a34a;
    background: #f0fdf4;
    color: #15803d;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    &:hover {
        background: #dcfce7;
    }
`;
const ModalOverlay = styled.div`
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(15, 23, 42, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
`;
const ModalCard = styled.div`
    width: 440px;
    max-width: 92vw;
    max-height: 86vh;
    overflow: auto;
    background: #ffffff;
    border-radius: 6px;
    padding: 20px 22px;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
    h3 {
        margin: 0 0 12px;
        font-size: 16px;
        color: #0f172a;
    }
    .fn {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: #475569;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 8px 10px;
        margin-bottom: 14px;
        word-break: break-all;
    }
    label {
        display: block;
        font-size: 12px;
        font-weight: 700;
        color: #475569;
        margin: 12px 0 6px;
    }
    .quick {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
    }
    .quick button {
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #475569;
        border-radius: 999px;
        padding: 4px 12px;
        font-size: 12.5px;
        font-family: inherit;
        cursor: pointer;
    }
    .quick button.on {
        border-color: #2563eb;
        background: #eff6ff;
        color: #2563eb;
        font-weight: 700;
    }
    .search {
        display: flex;
        gap: 6px;
    }
    .search input {
        flex: 1;
        height: 34px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 0 10px;
        font-size: 13px;
        font-family: inherit;
        &:focus {
            outline: none;
            border-color: #2563eb;
        }
    }
    .search button {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 34px;
        padding: 0 12px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #475569;
        border-radius: 6px;
        font-size: 12.5px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        &:hover {
            background: #f1f5f9;
        }
    }
    .results {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 8px;
        max-height: 200px;
        overflow: auto;
    }
    .results button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        border: 1px solid #e2e8f0;
        background: #ffffff;
        border-radius: 6px;
        padding: 7px 10px;
        font-size: 13px;
        font-family: inherit;
        color: #0f172a;
        cursor: pointer;
        text-align: left;
        &:hover {
            background: #f8fafc;
        }
        em {
            font-style: normal;
            font-size: 12.5px;
            color: #94a3b8;
        }
    }
    .results button.on {
        border-color: #2563eb;
        background: #eff6ff;
    }
    .chosen {
        margin-top: 10px;
        font-size: 13px;
        color: #475569;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
    }
    .chosen .picked {
        border: 1px solid #2563eb;
        background: #eff6ff;
        color: #2563eb;
        font-weight: 700;
        border-radius: 999px;
        padding: 3px 10px;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
    }
    input[type="month"] {
        width: 180px;
        height: 34px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 0 10px;
        font-size: 13px;
        font-family: inherit;
        &:focus {
            outline: none;
            border-color: #2563eb;
        }
    }
    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 20px;
    }
    .actions button {
        height: 36px;
        padding: 0 18px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
    }
    .actions .cancel {
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #475569;
    }
    .actions .save {
        border: 1px solid #2563eb;
        background: #2563eb;
        color: #ffffff;
        &:disabled {
            opacity: 0.5;
            cursor: default;
        }
    }
`;
const FootNote = styled.div`
    margin-top: 12px;
    font-size: 12px;
    color: #64748b;
    text-align: right;
`;
const BrowseWrap = styled.div`
    display: flex;
    gap: 16px;
    align-items: flex-start;
`;
const MonthSide = styled.div`
    width: 160px;
    flex-shrink: 0;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 8px;
    .head {
        font-size: 12px;
        font-weight: 700;
        color: #475569;
        padding: 4px 6px 8px;
    }
    .empty {
        font-size: 12px;
        color: #94a3b8;
        padding: 10px 6px;
    }
`;
const MonthItem = styled.button<{ $active: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    border: 0;
    background: ${({ $active }) => ($active ? "#eff6ff" : "transparent")};
    color: ${({ $active }) => ($active ? "#2563eb" : "#475569")};
    font-weight: ${({ $active }) => ($active ? 700 : 500)};
    font-family: inherit;
    font-size: 13px;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    &:hover {
        background: #f1f5f9;
    }
    em {
        font-style: normal;
        font-size: 11px;
        color: #94a3b8;
        background: #f1f5f9;
        border-radius: 6px;
        padding: 1px 7px;
    }
`;
const RefreshBtn = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: 100%;
    margin-top: 8px;
    height: 32px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #475569;
    font-family: inherit;
    cursor: pointer;
    &:hover {
        background: #f1f5f9;
    }
`;
const BrowseMain = styled.div`
    flex: 1;
    min-width: 0;
    .loading,
    .empty {
        color: #94a3b8;
        font-size: 14px;
        padding: 40px 0;
        text-align: center;
    }
`;
const MovieGroup = styled.div`
    margin-bottom: 20px;
    .gtitle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 8px;
        em {
            font-style: normal;
            font-size: 12px;
            color: #94a3b8;
            margin-left: 6px;
        }
    }
`;
// 영화 그룹 제목 = 접기/펼치기 토글 버튼
const GroupToggle = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px 2px 2px;
    margin-left: -2px;
    background: none;
    border: none;
    border-radius: 6px;
    font: inherit;
    color: inherit;
    cursor: pointer;
    text-align: left;

    &:hover {
        background: #f1f5f9;
    }

    .caret {
        flex: none;
        color: #64748b;
        transition: transform 0.15s ease;
    }
    .caret.closed {
        transform: rotate(-90deg);
    }
`;
// 그룹 목록 위 도구줄 (영화 개수 + 전체 접기/펼치기)
const GroupToolbar = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
    font-size: 12px;
    color: #64748b;

    .caret {
        color: #64748b;
        transition: transform 0.15s ease;
    }
    .caret.closed {
        transform: rotate(-90deg);
    }
`;
// 전체 접기/펼치기 (그룹 목록 위)
const CollapseAllBtn = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 10px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #475569;
    cursor: pointer;

    &:hover {
        background: #f8fafc;
        border-color: #94a3b8;
    }
`;
const BulkBar = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    margin-bottom: 12px;
    background: #fffbeb;
    border: 1px solid #fdba74;
    border-radius: 8px;
    font-size: 13px;
    color: #9a3412;
    b {
        font-weight: 800;
    }
`;
const BulkDownBtn = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 12px;
    border: 1px solid #2563eb;
    background: #eff6ff;
    color: #2563eb;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    &:hover {
        background: #bfdbfe;
    }
    &:disabled {
        opacity: 0.7;
        cursor: default;
    }
`;
const BulkDelBtn = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 12px;
    border: 1px solid #dc2626;
    background: #fef2f2;
    color: #dc2626;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    &:hover {
        background: #fecaca;
    }
`;
const BulkClearBtn = styled.button`
    height: 30px;
    padding: 0 10px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #64748b;
    border-radius: 6px;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    &:hover {
        background: #f8fafc;
    }
`;
const MailModalCard = styled.div`
    width: 860px;
    max-width: 94vw;
    height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #ffffff;
    border-radius: 6px;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
    .mhead {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 1px solid #e2e8f0;
        background: #f8fafc;
    }
    .minfo {
        min-width: 0;
    }
    .subject {
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .meta {
        font-size: 12.5px;
        color: #64748b;
        margin-top: 3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .mactions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }
    .mactions .tomail {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 30px;
        padding: 0 12px;
        border: 1px solid #2563eb;
        background: #eff6ff;
        color: #2563eb;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
        white-space: nowrap;
        &:hover {
            background: #bfdbfe;
        }
    }
    .mactions .close {
        width: 30px;
        height: 30px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #64748b;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
        &:hover {
            background: #f1f5f9;
        }
    }
    .atts {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 10px 16px;
        border-bottom: 1px solid #e2e8f0;
    }
    .atts button {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #475569;
        border-radius: 999px;
        padding: 4px 12px;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        max-width: 320px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        &:hover {
            border-color: #2563eb;
            color: #2563eb;
        }
        em {
            font-style: normal;
            color: #94a3b8;
            font-size: 11px;
        }
    }
    .state {
        color: #94a3b8;
        font-size: 13px;
        padding: 40px 0;
        text-align: center;
    }
`;
const PreviewFrame = styled.iframe`
    flex: 1;
    width: 100%;
    border: 0;
    background: #ffffff;
`;
const ZipBtn = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 12px;
    border: 1px solid #2563eb;
    background: #eff6ff;
    color: #2563eb;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    &:hover {
        background: #bfdbfe;
    }
    &:disabled {
        opacity: 0.7;
        cursor: default;
    }
    .spin {
        animation: zipspin 0.9s linear infinite;
    }
    @keyframes zipspin {
        to {
            transform: rotate(360deg);
        }
    }
`;
