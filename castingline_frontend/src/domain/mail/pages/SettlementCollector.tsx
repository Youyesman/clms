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
    downloadCollected,
    downloadMovieZip,
    IMovieSearchItem,
    ISettlementTarget,
    ICollectedSettlement,
    IScanResult,
    IMonthSummary,
} from "../settlementApi";

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
                toast.success(
                    `수집 완료 · 신규 ${r.saved}건 (매칭 ${r.matched}건)`
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
            <Controls>
                <Field>
                    <label>메일함</label>
                    <FolderFixed>
                        {folders.find((f) => f.name === folder)?.display ||
                            "*부금계산서*/위탁,기타"}
                    </FolderFixed>
                </Field>
                <Field>
                    <label>시작일</label>
                    <input
                        type="date"
                        value={since}
                        onChange={(e) => setSince(e.target.value)}
                    />
                </Field>
                <Field>
                    <label>종료일</label>
                    <input
                        type="date"
                        value={until}
                        onChange={(e) => setUntil(e.target.value)}
                    />
                </Field>
                <Field>
                    <label>저장 월(비우면 수신월)</label>
                    <input
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                    />
                </Field>
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
            </Controls>

            <StatusLine>
                {lastScan && (
                    <span>
                        마지막 수집 <b>{lastScan}</b>
                    </span>
                )}
                {lastResult && !lastResult.error && (
                    <span>
                        스캔 {lastResult.scanned} · 매칭 {lastResult.matched} · 신규{" "}
                        <b className="ok">{lastResult.saved}</b> · 중복제외{" "}
                        {lastResult.skipped_duplicate}
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
                                    <MailRow
                                        key={m.uid}
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
    const [zipLoading, setZipLoading] = useState<number | null>(null);

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
        } catch {
            toast.error("수집 목록을 불러오지 못했습니다.");
        } finally {
            setLoading(false);
        }
    }, [activeMonth, toast]);

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
                {!loading &&
                    grouped.map(([movie, list]) => (
                        <MovieGroup key={movie}>
                            <div className="gtitle">
                                <span>
                                    {movie} <em>{list.length}건</em>
                                </span>
                                {list[0]?.movie_id != null && (
                                    <ZipBtn
                                        disabled={
                                            zipLoading === list[0].movie_id
                                        }
                                        onClick={async () => {
                                            const mid = list[0]
                                                .movie_id as number;
                                            setZipLoading(mid);
                                            try {
                                                await downloadMovieZip(
                                                    mid,
                                                    activeMonth || undefined
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
                                        {zipLoading === list[0].movie_id ? (
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
                            <Table>
                                <thead>
                                    <tr>
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
                                        <tr key={it.id}>
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
                                                        onClick={() =>
                                                            openMail(
                                                                it.mail_folder,
                                                                it.mail_uid
                                                            )
                                                        }
                                                        title="원본 메일 열기"
                                                    >
                                                        <ArrowSquareOut />
                                                    </SourceBtn>
                                                    <IconBtn
                                                        onClick={() =>
                                                            downloadCollected(
                                                                it
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
                        </MovieGroup>
                    ))}
            </BrowseMain>
        </BrowseWrap>
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
const Controls = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 10px;
    margin-bottom: 8px;
`;
const Field = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    label {
        font-size: 11.5px;
        font-weight: 600;
        color: #475569;
    }
    select,
    input {
        height: 34px;
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        padding: 0 9px;
        font-size: 13px;
        font-family: inherit;
        background: #fff;
        &:focus {
            outline: none;
            border-color: #2563eb;
        }
    }
`;
const FolderFixed = styled.div`
    display: inline-flex;
    align-items: center;
    height: 34px;
    padding: 0 12px;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    background: #f8fafc;
    color: #0f172a;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
`;
const PrimaryBtn = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 14px;
    border: 1px solid #2563eb;
    background: #2563eb;
    color: #fff;
    border-radius: 7px;
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
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
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
    background: ${({ $active }) => ($active ? "#eff6ff" : "#fff")};
    color: ${({ $active }) => ($active ? "#2563eb" : "#64748b")};
    font-weight: ${({ $active }) => ($active ? 700 : 500)};
    font-size: 11.5px;
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
    background: #fff;
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
const MailRow = styled.div<{ $active: boolean }>`
    padding: 9px 12px;
    border-bottom: 1px solid #f1f5f9;
    cursor: pointer;
    background: ${({ $active }) => ($active ? "#eff6ff" : "#fff")};
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
        font-size: 11.5px;
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
        background: #fff;
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
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
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
        color: #334155;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .sz {
        font-size: 11.5px;
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
    background: #fff;
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
        border-radius: 7px;
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
    border: 1px solid #dbeafe;
    background: #eff6ff;
    border-radius: 10px;
    max-height: 280px;
    overflow: auto;
    li {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 8px;
        border-radius: 7px;
        &:hover {
            background: #dbeafe;
        }
    }
    .t {
        font-weight: 600;
        color: #0f172a;
        font-size: 13.5px;
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
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
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
        color: #334155;
        vertical-align: middle;
    }
    tbody td.center {
        text-align: center;
    }
    tbody tr.off td {
        color: #94a3b8;
    }
    .name {
        font-weight: 600;
        color: #0f172a;
    }
    .sub {
        font-size: 11.5px;
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
        background: #fff;
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
    border-radius: 7px;
    cursor: pointer;
    font-size: 13px;
    border: 1px solid
        ${({ $variant }) =>
            $variant === "del"
                ? "#fecaca"
                : $variant === "ok"
                ? "#16a34a"
                : "#cbd5e1"};
    background: ${({ $variant }) => ($variant === "ok" ? "#16a34a" : "#fff")};
    color: ${({ $variant }) =>
        $variant === "del" ? "#dc2626" : $variant === "ok" ? "#fff" : "#334155"};
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
    border: 1px solid #c7d2fe;
    background: #eef2ff;
    color: #4338ca;
    border-radius: 7px;
    font-size: 13px;
    cursor: pointer;
    &:hover {
        background: #e0e7ff;
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
    color: #fff;
    border-radius: 7px;
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
    height: 24px;
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
    background: rgba(15, 23, 42, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
`;
const ModalCard = styled.div`
    width: 440px;
    max-width: 92vw;
    max-height: 86vh;
    overflow: auto;
    background: #fff;
    border-radius: 12px;
    padding: 20px 22px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.3);
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
        color: #334155;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
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
        background: #fff;
        color: #334155;
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
        border-radius: 7px;
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
        background: #fff;
        color: #475569;
        border-radius: 7px;
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
        background: #fff;
        border-radius: 7px;
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
            font-size: 11.5px;
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
        border-radius: 7px;
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
        border-radius: 8px;
        font-size: 13px;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
    }
    .actions .cancel {
        border: 1px solid #cbd5e1;
        background: #fff;
        color: #475569;
    }
    .actions .save {
        border: 1px solid #2563eb;
        background: #2563eb;
        color: #fff;
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
    border-radius: 10px;
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
    color: ${({ $active }) => ($active ? "#2563eb" : "#334155")};
    font-weight: ${({ $active }) => ($active ? 700 : 500)};
    font-family: inherit;
    font-size: 13px;
    padding: 8px 10px;
    border-radius: 7px;
    cursor: pointer;
    &:hover {
        background: #f1f5f9;
    }
    em {
        font-style: normal;
        font-size: 11px;
        color: #94a3b8;
        background: #f1f5f9;
        border-radius: 10px;
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
    background: #fff;
    border-radius: 7px;
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
const ZipBtn = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 12px;
    border: 1px solid #2563eb;
    background: #eff6ff;
    color: #2563eb;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    &:hover {
        background: #dbeafe;
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
