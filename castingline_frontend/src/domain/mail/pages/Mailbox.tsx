import { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import {
    DownloadSimple,
    EnvelopeSimple,
    EnvelopeSimpleOpen,
    Paperclip,
    ArrowClockwise,
    CaretLeft,
    CaretRight,
    FileXls,
    UploadSimple,
} from "@phosphor-icons/react";
import { useToast } from "../../../components/common/CustomToast";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { ScoreExcelUploader } from "../../score/pages/ScoreExcelUploader";
import {
    fetchFolders,
    fetchMessages,
    fetchMessageDetail,
    downloadAttachment,
    fetchAttachmentFile,
    downloadLotteReport,
    fetchLotteReportFile,
    IMailFolder,
    IMailListItem,
    IMailDetail,
    IMailAttachment,
} from "../api";

/** 스코어 업로드 가능한 엑셀 첨부인지 (.xlsx/.xls) */
const isScoreExcel = (filename: string) =>
    /\.(xlsx|xls)$/i.test(filename || "");

const PAGE_SIZE = 30;

/** 바이트 → 읽기 쉬운 크기 */
const fmtSize = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

/** ISO 날짜 → YYYY-MM-DD HH:mm */
const fmtDate = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
    const p = (x: number) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
        d.getHours()
    )}:${p(d.getMinutes())}`;
};

export const Mailbox = () => {
    const toast = useToast();
    const { openModal } = useGlobalModal();
    const [folders, setFolders] = useState<IMailFolder[]>([]);
    const [folder, setFolder] = useState<string>("INBOX");
    const [list, setList] = useState<IMailListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [listLoading, setListLoading] = useState(false);

    const [selectedUid, setSelectedUid] = useState<number | null>(null);
    const [detail, setDetail] = useState<IMailDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [downloading, setDownloading] = useState<number | null>(null);
    const [reportLoading, setReportLoading] = useState<string | null>(null);
    const [scoreLoading, setScoreLoading] = useState<string | null>(null);
    const [attScoreLoading, setAttScoreLoading] = useState<number | null>(null);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // ── 폴더 목록 ──
    useEffect(() => {
        fetchFolders()
            .then(setFolders)
            .catch((e) =>
                toast.error(
                    e?.response?.data?.error || "메일 폴더를 불러오지 못했습니다."
                )
            );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── 메일 목록 ──
    const loadList = useCallback(
        (f: string, p: number) => {
            setListLoading(true);
            fetchMessages(f, p, PAGE_SIZE)
                .then((res) => {
                    setList(res.results);
                    setTotal(res.total);
                })
                .catch((e) =>
                    toast.error(
                        e?.response?.data?.error || "메일 목록을 불러오지 못했습니다."
                    )
                )
                .finally(() => setListLoading(false));
        },
        [toast]
    );

    useEffect(() => {
        loadList(folder, page);
    }, [folder, page, loadList]);

    // ── 메일 상세 ──
    const openMessage = (uid: number) => {
        setSelectedUid(uid);
        setDetail(null);
        setDetailLoading(true);
        fetchMessageDetail(folder, uid)
            .then(setDetail)
            .catch((e) =>
                toast.error(
                    e?.response?.data?.error || "메일을 불러오지 못했습니다."
                )
            )
            .finally(() => setDetailLoading(false));
    };

    const onDownload = async (att: IMailDetail["attachments"][number]) => {
        if (selectedUid == null) return;
        setDownloading(att.index);
        try {
            await downloadAttachment(folder, selectedUid, att);
        } catch (e: any) {
            toast.error("첨부파일 다운로드에 실패했습니다.");
        } finally {
            setDownloading(null);
        }
    };

    const onDownloadReport = async (reportUrl: string, playDate: string) => {
        if (selectedUid == null) return;
        setReportLoading(reportUrl);
        try {
            await downloadLotteReport(reportUrl, selectedUid, folder, playDate);
            toast.success("회차별 판매현황 엑셀을 추출했습니다.");
        } catch (e: any) {
            toast.error(
                e?.response?.data?.error || "엑셀 추출에 실패했습니다."
            );
        } finally {
            setReportLoading(null);
        }
    };

    // 추출/첨부 엑셀을 스코어 업로더 모달에 주입 → 미리보기/매칭/저장 진행
    const openScoreUploader = (file: File) => {
        openModal(
            <ScoreExcelUploader
                initialFile={file}
                onUploadSuccess={() => { /* 저장 완료 시 처리 (메일함 갱신 불필요) */ }}
            />,
            { title: "스코어 엑셀 업로드", width: "1600px" }
        );
    };

    const onUploadToScore = async (reportUrl: string, playDate: string) => {
        if (selectedUid == null) return;
        setScoreLoading(reportUrl);
        try {
            const file = await fetchLotteReportFile(
                reportUrl,
                selectedUid,
                folder,
                playDate
            );
            openScoreUploader(file);
        } catch (e: any) {
            toast.error(
                e?.response?.data?.error || "스코어 업로드 준비에 실패했습니다."
            );
        } finally {
            setScoreLoading(null);
        }
    };

    const onUploadAttachmentToScore = async (att: IMailAttachment) => {
        if (selectedUid == null) return;
        setAttScoreLoading(att.index);
        try {
            const file = await fetchAttachmentFile(folder, selectedUid, att);
            openScoreUploader(file);
        } catch (e: any) {
            toast.error("스코어 업로드 준비에 실패했습니다.");
        } finally {
            setAttScoreLoading(null);
        }
    };

    const changeFolder = (f: string) => {
        setFolder(f);
        setPage(1);
        setSelectedUid(null);
        setDetail(null);
    };

    // HTML 본문은 보안을 위해 sandbox iframe(srcDoc)으로 격리 렌더.
    // <base target="_blank"> 로 본문 내 모든 링크를 새 창에서 열도록 한다.
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
        <Wrapper>
            <Header>
                <div>
                    <h2>메일함</h2>
                    <p>관리자 전용 메일 조회 (castingline@naver.com)</p>
                </div>
                <RefreshBtn onClick={() => loadList(folder, page)} title="새로고침">
                    <ArrowClockwise size={16} weight="bold" />
                    새로고침
                </RefreshBtn>
            </Header>

            <FolderBar>
                {folders.map((f) => (
                    <FolderPill
                        key={f.name}
                        $active={folder === f.name}
                        onClick={() => changeFolder(f.name)}
                    >
                        {f.display}
                    </FolderPill>
                ))}
            </FolderBar>

            <Body>
                {/* ── 메일 목록 ── */}
                <ListPane>
                    <ListHeader>
                        <span>
                            전체 <b>{total.toLocaleString()}</b>통
                        </span>
                        <Pager>
                            <PagerBtn
                                disabled={page <= 1 || listLoading}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                            >
                                <CaretLeft size={14} weight="bold" />
                            </PagerBtn>
                            <span>
                                {page} / {totalPages}
                            </span>
                            <PagerBtn
                                disabled={page >= totalPages || listLoading}
                                onClick={() =>
                                    setPage((p) => Math.min(totalPages, p + 1))
                                }
                            >
                                <CaretRight size={14} weight="bold" />
                            </PagerBtn>
                        </Pager>
                    </ListHeader>

                    <ListScroll>
                        {listLoading ? (
                            <Empty>불러오는 중…</Empty>
                        ) : list.length === 0 ? (
                            <Empty>메일이 없습니다.</Empty>
                        ) : (
                            list.map((m) => (
                                <Row
                                    key={m.uid}
                                    $active={selectedUid === m.uid}
                                    $unread={!m.seen}
                                    onClick={() => openMessage(m.uid)}
                                >
                                    <RowIcon>
                                        {m.seen ? (
                                            <EnvelopeSimpleOpen size={18} />
                                        ) : (
                                            <EnvelopeSimple size={18} weight="fill" />
                                        )}
                                    </RowIcon>
                                    <RowMain>
                                        <RowTop>
                                            <span className="from">{m.from}</span>
                                            <span className="date">
                                                {fmtDate(m.date)}
                                            </span>
                                        </RowTop>
                                        <RowSubject>{m.subject || "(제목 없음)"}</RowSubject>
                                    </RowMain>
                                </Row>
                            ))
                        )}
                    </ListScroll>
                </ListPane>

                {/* ── 메일 상세 ── */}
                <DetailPane>
                    {detailLoading ? (
                        <Empty>메일을 여는 중…</Empty>
                    ) : !detail ? (
                        <Empty>왼쪽에서 메일을 선택하세요.</Empty>
                    ) : (
                        <>
                            <DetailHead>
                                <h3>{detail.subject || "(제목 없음)"}</h3>
                                <dl>
                                    <div>
                                        <dt>보낸사람</dt>
                                        <dd>{detail.from}</dd>
                                    </div>
                                    <div>
                                        <dt>받는사람</dt>
                                        <dd>{detail.to}</dd>
                                    </div>
                                    {detail.cc && (
                                        <div>
                                            <dt>참조</dt>
                                            <dd>{detail.cc}</dd>
                                        </div>
                                    )}
                                    <div>
                                        <dt>날짜</dt>
                                        <dd>{fmtDate(detail.date)}</dd>
                                    </div>
                                </dl>

                                {detail.attachments.length > 0 && (
                                    <AttachBox>
                                        <div className="title">
                                            <Paperclip size={15} weight="bold" />
                                            첨부 {detail.attachments.length}개
                                        </div>
                                        <div className="items">
                                            {detail.attachments.map((a) => (
                                                <span
                                                    key={a.index}
                                                    className="att-row"
                                                >
                                                    <AttachItem
                                                        onClick={() => onDownload(a)}
                                                        disabled={
                                                            downloading === a.index
                                                        }
                                                        title="다운로드"
                                                    >
                                                        <DownloadSimple size={15} />
                                                        <span className="name">
                                                            {a.filename}
                                                        </span>
                                                        <span className="size">
                                                            {fmtSize(a.size)}
                                                        </span>
                                                    </AttachItem>
                                                    {isScoreExcel(a.filename) && (
                                                        <ReportBtn
                                                            $variant="upload"
                                                            onClick={() =>
                                                                onUploadAttachmentToScore(
                                                                    a
                                                                )
                                                            }
                                                            disabled={
                                                                attScoreLoading ===
                                                                a.index
                                                            }
                                                        >
                                                            <UploadSimple size={15} />
                                                            {attScoreLoading ===
                                                            a.index
                                                                ? "준비 중…"
                                                                : "스코어 업로드"}
                                                        </ReportBtn>
                                                    )}
                                                </span>
                                            ))}
                                        </div>
                                    </AttachBox>
                                )}

                                {detail.report_links.length > 0 && (
                                    <ReportBox>
                                        <div className="title">
                                            <FileXls size={15} weight="bold" />
                                            롯데 회차별 판매현황
                                        </div>
                                        <div className="items">
                                            {detail.report_links.map((rl) => (
                                                <ReportBtn
                                                    key={rl.url}
                                                    onClick={() =>
                                                        onDownloadReport(
                                                            rl.url,
                                                            rl.play_date
                                                        )
                                                    }
                                                    disabled={
                                                        reportLoading === rl.url
                                                    }
                                                >
                                                    <DownloadSimple size={15} />
                                                    {reportLoading === rl.url
                                                        ? "추출 중…"
                                                        : "엑셀로 추출"}
                                                </ReportBtn>
                                            ))}
                                            {detail.report_links.map((rl) => (
                                                <ReportBtn
                                                    key={`up-${rl.url}`}
                                                    $variant="upload"
                                                    onClick={() =>
                                                        onUploadToScore(
                                                            rl.url,
                                                            rl.play_date
                                                        )
                                                    }
                                                    disabled={
                                                        scoreLoading === rl.url
                                                    }
                                                >
                                                    <UploadSimple size={15} />
                                                    {scoreLoading === rl.url
                                                        ? "준비 중…"
                                                        : "스코어 업로드"}
                                                </ReportBtn>
                                            ))}
                                        </div>
                                        <p className="hint">
                                            링크의 리포트를 메일 첨부와 동일한 양식의
                                            엑셀로 변환합니다. (스코어 업로드에 바로
                                            사용 가능)
                                        </p>
                                    </ReportBox>
                                )}
                            </DetailHead>

                            <BodyFrame
                                title="mail-body"
                                sandbox="allow-popups allow-popups-to-escape-sandbox"
                                srcDoc={bodySrcDoc}
                            />
                        </>
                    )}
                </DetailPane>
            </Body>
        </Wrapper>
    );
};

/* ───────── styles ───────── */
const Wrapper = styled.div`
    display: flex;
    flex-direction: column;
    height: calc(100vh - 96px);
    padding: 24px 28px 16px;
    background: #f8fafc;
    font-family: "SUIT", sans-serif;
`;
const Header = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 14px;
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
const RefreshBtn = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid #cbd5e1;
    background: #fff;
    color: #334155;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    &:hover {
        background: #f1f5f9;
    }
`;
const FolderBar = styled.div`
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 14px;
`;
const FolderPill = styled.button<{ $active: boolean }>`
    border: 1px solid ${({ $active }) => ($active ? "#2563eb" : "#cbd5e1")};
    background: ${({ $active }) => ($active ? "#2563eb" : "#fff")};
    color: ${({ $active }) => ($active ? "#fff" : "#475569")};
    font-size: 13px;
    font-weight: 600;
    padding: 6px 14px;
    border-radius: 999px;
    cursor: pointer;
    &:hover {
        border-color: #2563eb;
    }
`;
const Body = styled.div`
    flex: 1;
    display: grid;
    grid-template-columns: 380px 1fr;
    gap: 16px;
    min-height: 0;
`;
const ListPane = styled.div`
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
`;
const ListHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #f1f5f9;
    font-size: 13px;
    color: #64748b;
    b {
        color: #0f172a;
    }
`;
const Pager = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #475569;
`;
const PagerBtn = styled.button`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 1px solid #e2e8f0;
    background: #fff;
    border-radius: 6px;
    cursor: pointer;
    color: #334155;
    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    &:not(:disabled):hover {
        background: #f1f5f9;
    }
`;
const ListScroll = styled.div`
    flex: 1;
    overflow-y: auto;
`;
const Row = styled.div<{ $active: boolean; $unread: boolean }>`
    display: flex;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid #f1f5f9;
    cursor: pointer;
    background: ${({ $active }) => ($active ? "#eff6ff" : "#fff")};
    border-left: 3px solid
        ${({ $active }) => ($active ? "#2563eb" : "transparent")};
    &:hover {
        background: ${({ $active }) => ($active ? "#eff6ff" : "#f8fafc")};
    }
`;
const RowIcon = styled.div`
    color: #94a3b8;
    padding-top: 2px;
    flex-shrink: 0;
`;
const RowMain = styled.div`
    min-width: 0;
    flex: 1;
`;
const RowTop = styled.div`
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 3px;
    .from {
        font-size: 13px;
        font-weight: 600;
        color: #1e293b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .date {
        font-size: 11px;
        color: #94a3b8;
        white-space: nowrap;
        flex-shrink: 0;
    }
`;
const RowSubject = styled.div`
    font-size: 13px;
    color: #475569;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;
const DetailPane = styled.div`
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
`;
const DetailHead = styled.div`
    padding: 20px 24px 16px;
    border-bottom: 1px solid #f1f5f9;
    h3 {
        font-size: 17px;
        font-weight: 700;
        color: #0f172a;
        margin: 0 0 14px;
        line-height: 1.4;
    }
    dl {
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
    }
    dl > div {
        display: flex;
        gap: 10px;
        font-size: 13px;
    }
    dt {
        width: 64px;
        flex-shrink: 0;
        color: #94a3b8;
        font-weight: 600;
    }
    dd {
        margin: 0;
        color: #334155;
        word-break: break-all;
    }
`;
const AttachBox = styled.div`
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px dashed #e2e8f0;
    .title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 700;
        color: #475569;
        margin-bottom: 8px;
    }
    .items {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .att-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }
`;
const AttachItem = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    border-radius: 8px;
    padding: 7px 10px;
    cursor: pointer;
    color: #334155;
    max-width: 280px;
    &:hover:not(:disabled) {
        background: #eff6ff;
        border-color: #2563eb;
        color: #2563eb;
    }
    &:disabled {
        opacity: 0.5;
        cursor: wait;
    }
    .name {
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .size {
        font-size: 11px;
        color: #94a3b8;
        flex-shrink: 0;
    }
`;
const ReportBox = styled.div`
    margin-top: 14px;
    padding: 12px 14px;
    border: 1px solid #bbf7d0;
    background: #f0fdf4;
    border-radius: 10px;
    .title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 700;
        color: #15803d;
        margin-bottom: 8px;
    }
    .items {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    .hint {
        margin: 8px 0 0;
        font-size: 11px;
        color: #64748b;
    }
`;
const ReportBtn = styled.button<{ $variant?: "extract" | "upload" }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid
        ${({ $variant }) => ($variant === "upload" ? "#2563eb" : "#16a34a")};
    background: ${({ $variant }) =>
        $variant === "upload" ? "#2563eb" : "#16a34a"};
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    border-radius: 8px;
    padding: 8px 14px;
    cursor: pointer;
    &:hover:not(:disabled) {
        background: ${({ $variant }) =>
            $variant === "upload" ? "#1d4ed8" : "#15803d"};
    }
    &:disabled {
        opacity: 0.6;
        cursor: wait;
    }
`;
const BodyFrame = styled.iframe`
    flex: 1;
    width: 100%;
    border: 0;
    background: #fff;
`;
const Empty = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 200px;
    color: #94a3b8;
    font-size: 14px;
`;
