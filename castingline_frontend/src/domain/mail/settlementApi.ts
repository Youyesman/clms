import { AxiosGet, AxiosPost, AxiosPatch, AxiosDelete } from "../../axios/Axios";

// ── 타입 ──
export interface IMovieSearchItem {
    id: number;
    title_ko: string;
    title_en: string | null;
    movie_code: string;
    release_date: string | null;
}

export interface ISettlementTarget {
    id: number;
    movie: number;
    movie_title: string;
    movie_code: string;
    release_date: string | null;
    aliases: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface ICollectedSettlement {
    id: number;
    movie_id: number | null;
    movie_title: string;
    month: string;
    matched_keyword: string;
    matched_in: string;
    mail_folder: string;
    mail_uid: number;
    mail_subject: string;
    mail_from: string;
    mail_date: string | null;
    attachment_index: number;
    filename: string;
    content_type: string;
    size: number;
    created_at: string;
}

export interface IScanResult {
    folder: string;
    scanned: number;
    matched: number;
    saved: number;
    skipped_duplicate: number;
    matched_no_attachment: number;
    saved_items: {
        id: number;
        movie_title: string;
        month: string;
        filename: string;
        matched_in: string;
        matched_keyword: string;
    }[];
    error?: string;
}

export interface IMonthSummary {
    month: string;
    count: number;
}

// ── 영화 검색(대상 등록용) ──
export const searchMovies = (q: string) =>
    AxiosGet(`settlement/movie-search/?q=${encodeURIComponent(q)}`).then(
        (r) => r.data.results as IMovieSearchItem[]
    );

// ── 대상 영화 CRUD ──
export const fetchTargets = () =>
    AxiosGet("settlement/targets/").then((r) => r.data as ISettlementTarget[]);

export const createTarget = (movie: number, aliases = "") =>
    AxiosPost("settlement/targets", { movie, aliases }).then(
        (r) => r.data as ISettlementTarget
    );

export const updateTarget = (
    id: number,
    patch: Partial<Pick<ISettlementTarget, "aliases" | "is_active">>
) => AxiosPatch("settlement/targets", patch, id).then((r) => r.data as ISettlementTarget);

export const deleteTarget = (id: number) =>
    AxiosDelete("settlement/targets", id);

// ── 수집 실행 ──
export const runScan = (params: {
    folder: string;
    since?: string;
    until?: string;
    month?: string;
}) => AxiosPost("settlement/scan", params).then((r) => r.data as IScanResult);

// ── 수동 수집 (메일을 직접 읽고 첨부 1개를 여러 영화로 저장 가능) ──
export const collectAttachment = (params: {
    folder: string;
    uid: number;
    index: number;
    movies: number[];
    month?: string;
}) =>
    AxiosPost("settlement/collect-attachment", params).then(
        (r) =>
            r.data as { saved: ICollectedSettlement[]; duplicated: number }
    );

// ── 수집 결과 조회 ──
export const fetchCollected = (
    opts: { month?: string; movie?: number; folder?: string } = {}
) => {
    const qs = new URLSearchParams();
    if (opts.month) qs.set("month", opts.month);
    if (opts.movie) qs.set("movie", String(opts.movie));
    if (opts.folder) qs.set("folder", opts.folder);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return AxiosGet(`settlement/collected/${suffix}`).then(
        (r) => r.data as ICollectedSettlement[]
    );
};

export const fetchMonthSummary = () =>
    AxiosGet("settlement/summary/").then(
        (r) => r.data.months as IMonthSummary[]
    );

export const deleteCollected = (id: number) =>
    AxiosDelete("settlement/collected", id);

/** 영화(+월) 단위로 수집 파일을 zip 으로 일괄 다운로드. */
export const downloadMovieZip = async (movie: number, month?: string) => {
    const qs = new URLSearchParams({ movie: String(movie) });
    if (month) qs.set("month", month);
    const res = await AxiosGet(`settlement/download-zip/?${qs.toString()}`, {
        responseType: "blob",
    });
    let filename = "정산서.zip";
    const cd = res.headers?.["content-disposition"] as string | undefined;
    const m = cd && /filename\*=UTF-8''([^;]+)/i.exec(cd);
    if (m) {
        try {
            filename = decodeURIComponent(m[1]);
        } catch {
            /* keep default */
        }
    }
    const blob = new Blob([res.data], { type: "application/zip" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
};

/** 수집 첨부를 blob 으로 받아 브라우저 다운로드 트리거. */
export const downloadCollected = async (item: ICollectedSettlement) => {
    const res = await AxiosGet(`settlement/collected/${item.id}/`, {
        responseType: "blob",
    });
    const blob = new Blob([res.data], {
        type: item.content_type || "application/octet-stream",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
};
