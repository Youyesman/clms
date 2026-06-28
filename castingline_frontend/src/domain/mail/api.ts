import { AxiosGet } from "../../axios/Axios";

export interface IMailFolder {
    name: string; // IMAP 원본(utf7) — 표시용 아님
    display: string; // 디코딩된 폴더명
    flags: string;
}

export interface IMailListItem {
    uid: number;
    subject: string;
    from: string;
    to: string;
    date: string;
    seen: boolean;
    size: number;
}

export interface IMailListResponse {
    folder: string;
    page: number;
    page_size: number;
    total: number;
    results: IMailListItem[];
}

export interface IMailAttachment {
    index: number;
    filename: string;
    content_type: string;
    size: number;
}

export interface IMailReportLink {
    url: string;
    label: string;
    play_date: string;
}

export interface IMailDetail {
    uid: number;
    subject: string;
    from: string;
    to: string;
    cc: string;
    date: string;
    html: string | null;
    text: string | null;
    attachments: IMailAttachment[];
    report_links: IMailReportLink[];
}

const enc = encodeURIComponent;

export const fetchFolders = () =>
    AxiosGet("mail/folders/").then((r) => r.data.folders as IMailFolder[]);

export const fetchMessages = (folder: string, page: number, pageSize = 30) =>
    AxiosGet(
        `mail/messages/?folder=${enc(folder)}&page=${page}&page_size=${pageSize}`
    ).then((r) => r.data as IMailListResponse);

export const fetchMessageDetail = (folder: string, uid: number) =>
    AxiosGet(`mail/messages/${uid}/?folder=${enc(folder)}`).then(
        (r) => r.data as IMailDetail
    );

const fetchAttachmentBlob = async (
    folder: string,
    uid: number,
    att: IMailAttachment
): Promise<Blob> => {
    const res = await AxiosGet(
        `mail/messages/${uid}/attachments/${att.index}/?folder=${enc(folder)}`,
        { responseType: "blob" }
    );
    return new Blob([res.data], {
        type: att.content_type || "application/octet-stream",
    });
};

/** 첨부파일을 blob 으로 받아 브라우저 다운로드를 트리거한다. */
export const downloadAttachment = async (
    folder: string,
    uid: number,
    att: IMailAttachment
) => {
    const blob = await fetchAttachmentBlob(folder, uid, att);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
};

/** 첨부파일을 File 객체로 받는다 (스코어 업로드에 바로 투입). */
export const fetchAttachmentFile = async (
    folder: string,
    uid: number,
    att: IMailAttachment
): Promise<File> => {
    const blob = await fetchAttachmentBlob(folder, uid, att);
    return new File([blob], att.filename, {
        type: att.content_type || "application/octet-stream",
    });
};

/** 롯데 리포트 링크 → 회차별 판매현황 엑셀로 변환해 다운로드.
 *  날짜는 서버가 메일(uid)에서 도출하므로 uid/folder 를 함께 보낸다. */
const XLSX_MIME =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** 롯데 리포트를 추출해 (파일명, Blob) 으로 반환. 날짜는 서버가 uid 로 도출. */
const fetchLotteReportBlob = async (
    reportUrl: string,
    uid: number,
    folder: string,
    playDate = ""
): Promise<{ filename: string; blob: Blob }> => {
    const params = new URLSearchParams({
        url: reportUrl,
        uid: String(uid),
        folder,
    });
    if (playDate) params.set("play_date", playDate);
    const res = await AxiosGet(`mail/lotte-report/?${params.toString()}`, {
        responseType: "blob",
    });
    let filename = "롯데_회차별판매현황.xlsx";
    const cd = res.headers?.["content-disposition"] as string | undefined;
    const m = cd && /filename\*=UTF-8''([^;]+)/i.exec(cd);
    if (m) {
        try {
            filename = decodeURIComponent(m[1]);
        } catch {
            /* keep default */
        }
    }
    return { filename, blob: new Blob([res.data], { type: XLSX_MIME }) };
};

/** 롯데 리포트 링크 → 회차별 판매현황 엑셀로 변환해 브라우저 다운로드. */
export const downloadLotteReport = async (
    reportUrl: string,
    uid: number,
    folder: string,
    playDate = ""
) => {
    const { filename, blob } = await fetchLotteReportBlob(
        reportUrl,
        uid,
        folder,
        playDate
    );
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
};

/** 롯데 리포트 링크 → 추출한 엑셀을 File 객체로 반환 (스코어 업로드에 바로 투입). */
export const fetchLotteReportFile = async (
    reportUrl: string,
    uid: number,
    folder: string,
    playDate = ""
): Promise<File> => {
    const { filename, blob } = await fetchLotteReportBlob(
        reportUrl,
        uid,
        folder,
        playDate
    );
    return new File([blob], filename, { type: XLSX_MIME });
};
