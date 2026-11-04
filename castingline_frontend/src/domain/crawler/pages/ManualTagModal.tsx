import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { X, Spinner, Tag } from "@phosphor-icons/react";
import { AxiosDelete, AxiosGet, AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";

/**
 * C001(1104): 특수포맷 회차 수동 태깅(강제 지정).
 * 메가박스 등 시간표에 프리미어·무대인사·GV 표기가 없는 극장의 회차를
 * [영화 / 날짜 / 계열사 / 극장 / 관 / 상영시간] 으로 골라 특수포맷을 강제 지정한다.
 * 지정한 회차는 특수상영 엑셀 다운로드에서 그 키워드로 분류되어 출력된다.
 */

interface CrawlTarget {
    id: number;
    title: string;
    clean_title?: string;
    movie_type: "main" | "competitor";
    is_active: boolean;
}

interface Showing {
    brand: string;
    theater_name: string;
    screen_name: string;
    start_time: string;
    time: string;
    movie_title: string;
    tags: string[];
    manual_tags: { id: number; tag: string }[];
}

interface Props {
    onClose: () => void;
    crawlTargets: CrawlTarget[];
    initialMovieId: number | null;
    initialDate: string;
}

const BRANDS = [
    { value: "", label: "전체" },
    { value: "CGV", label: "CGV" },
    { value: "LOTTE", label: "롯데" },
    { value: "MEGABOX", label: "메가박스" },
    { value: "일반극장", label: "일반극장" },
];
const BRAND_LABEL: Record<string, string> = { CGV: "CGV", LOTTE: "롯데", MEGABOX: "메가박스", 일반극장: "일반극장" };

// 자주 쓰는 특수포맷 — 직접 입력도 가능
const PRESET_TAGS = ["프리미어 상영회", "무대인사", "GV", "시사회"];

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    background-color: rgba(15, 23, 42, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1100;
`;

const Container = styled.div`
    background: #ffffff;
    border-radius: 8px;
    width: 920px;
    max-width: 94%;
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 20px rgba(15, 23, 42, 0.15);
    font-family: "SUIT", sans-serif;
`;

const Head = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 22px 12px;
    h2 {
        font-size: 16px;
        font-weight: 700;
        color: #1e293b;
        margin: 0;
    }
    button {
        background: none;
        border: none;
        cursor: pointer;
        color: #64748b;
    }
`;

const Hint = styled.div`
    font-size: 11px;
    color: #64748b;
    padding: 0 22px 12px;
    line-height: 1.5;
`;

const Filters = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 22px 12px;
    align-items: flex-end;
`;

const Field = styled.label`
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    color: #64748b;
    select,
    input {
        height: 32px;
        padding: 0 10px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font-size: 13px;
        color: #334155;
        background: #ffffff;
        font-family: inherit;
    }
`;

const ListWrap = styled.div`
    flex: 1;
    min-height: 200px;
    overflow: auto;
    margin: 0 22px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 12px;
    th,
    td {
        padding: 6px 8px;
        border-bottom: 1px solid #f1f5f9;
        text-align: left;
        white-space: nowrap;
    }
    th {
        position: sticky;
        top: 0;
        background: #f8fafc;
        color: #475569;
        font-weight: 700;
        z-index: 1;
    }
    tr.picked td {
        background: #eff6ff;
    }
`;

const Chip = styled.span<{ $manual?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 8px;
    margin: 1px 4px 1px 0;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    border: 1px solid ${({ $manual }) => ($manual ? "#f59e0b" : "#e2e8f0")};
    background: ${({ $manual }) => ($manual ? "#fffbeb" : "#f8fafc")};
    color: ${({ $manual }) => ($manual ? "#b45309" : "#64748b")};
    button {
        border: none;
        background: none;
        padding: 0;
        cursor: pointer;
        color: inherit;
        font-size: 12px;
        line-height: 1;
    }
`;

const Foot = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 14px 22px 18px;
`;

const PresetBtn = styled.button<{ $active: boolean }>`
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    border: 1px solid ${({ $active }) => ($active ? "#f59e0b" : "#cbd5e1")};
    background: ${({ $active }) => ($active ? "#fffbeb" : "#ffffff")};
    color: ${({ $active }) => ($active ? "#b45309" : "#64748b")};
`;

const ApplyBtn = styled.button`
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 9px 16px;
    border: none;
    border-radius: 6px;
    background: #d97706;
    color: #ffffff;
    font-size: 13px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    &:disabled {
        background: #fde68a;
        cursor: not-allowed;
    }
`;

const showingKey = (s: Showing) => `${s.brand}|${s.theater_name}|${s.screen_name}|${s.start_time}`;

export const ManualTagModal: React.FC<Props> = ({ onClose, crawlTargets, initialMovieId, initialDate }) => {
    const toast = useToast();
    const [movieId, setMovieId] = useState<number | null>(initialMovieId);
    const [date, setDate] = useState(initialDate);
    const [brand, setBrand] = useState("");
    const [theater, setTheater] = useState("");
    const [screen, setScreen] = useState("");
    const [showings, setShowings] = useState<Showing[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [tag, setTag] = useState(PRESET_TAGS[0]);

    const movie = crawlTargets.find((m) => m.id === movieId) || null;
    const movieTitle = movie ? movie.clean_title || movie.title : "";

    // 조건을 연달아 바꾸면 이전 조회 응답이 늦게 도착해 최신 결과를 덮어쓸 수 있다 —
    // 마지막 요청의 응답만 반영한다
    const reqSeq = useRef(0);
    const load = useCallback(() => {
        const seq = ++reqSeq.current;
        if (!movieTitle || !date) {
            setShowings([]);
            return;
        }
        setLoading(true);
        AxiosGet("crawler/manual-tags/showings/", {
            params: { movie_title: movieTitle, date, ...(brand ? { brand } : {}) },
        })
            .then((res: any) => {
                if (seq === reqSeq.current) setShowings(res.data || []);
            })
            .catch(() => {
                if (seq !== reqSeq.current) return;
                setShowings([]);
                toast.error("시간표를 불러오지 못했습니다.");
            })
            .finally(() => {
                if (seq === reqSeq.current) setLoading(false);
            });
    }, [movieTitle, date, brand, toast]);

    // 조건이 바뀌면 다시 조회하고 극장·관·선택 회차 초기화
    useEffect(() => {
        load();
        setTheater("");
        setScreen("");
        setPicked(new Set());
    }, [load]);

    const theaterOptions = useMemo(() => {
        const set = new Map<string, string>();
        showings.forEach((s) => set.set(`${s.brand}|${s.theater_name}`, `${BRAND_LABEL[s.brand] || s.brand} ${s.theater_name}`));
        return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1], "ko"));
    }, [showings]);

    const screenOptions = useMemo(() => {
        if (!theater) return [];
        return Array.from(
            new Set(showings.filter((s) => `${s.brand}|${s.theater_name}` === theater).map((s) => s.screen_name))
        ).sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
    }, [showings, theater]);

    const visible = useMemo(
        () =>
            showings.filter(
                (s) =>
                    (!theater || `${s.brand}|${s.theater_name}` === theater) && (!screen || s.screen_name === screen)
            ),
        [showings, theater, screen]
    );

    const togglePick = (s: Showing) =>
        setPicked((prev) => {
            const next = new Set(prev);
            const k = showingKey(s);
            if (next.has(k)) next.delete(k);
            else next.add(k);
            return next;
        });

    const allVisiblePicked = visible.length > 0 && visible.every((s) => picked.has(showingKey(s)));
    const toggleAllVisible = () =>
        setPicked((prev) => {
            const next = new Set(prev);
            if (allVisiblePicked) visible.forEach((s) => next.delete(showingKey(s)));
            else visible.forEach((s) => next.add(showingKey(s)));
            return next;
        });

    const handleApply = async () => {
        const t = tag.trim();
        if (!t) {
            toast.warning("지정할 특수포맷을 입력해주세요.");
            return;
        }
        const targets = showings.filter((s) => picked.has(showingKey(s)));
        if (targets.length === 0) {
            toast.warning("태깅할 회차를 선택해주세요.");
            return;
        }
        setSaving(true);
        try {
            const res: any = await AxiosPost("crawler/manual-tags", {
                tag: t,
                movie_title: movieTitle,
                showings: targets.map((s) => ({
                    brand: s.brand,
                    theater_name: s.theater_name,
                    screen_name: s.screen_name,
                    start_time: s.start_time,
                })),
            });
            const n = res.data?.created ?? 0;
            toast.success(n > 0 ? `${n}개 회차를 '${t}'(으)로 지정했습니다.` : "이미 지정된 회차입니다.");
            setPicked(new Set());
            load();
        } catch (e: any) {
            toast.error(e.response?.data?.error || "지정에 실패했습니다.");
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async (id: number) => {
        try {
            await AxiosDelete("crawler/manual-tags", id);
            setShowings((prev) =>
                prev.map((s) => ({ ...s, manual_tags: s.manual_tags.filter((m) => m.id !== id) }))
            );
        } catch {
            toast.error("해제에 실패했습니다.");
        }
    };

    return (
        <Overlay onClick={onClose}>
            <Container onClick={(e) => e.stopPropagation()}>
                <Head>
                    <h2>특수포맷 회차 수동 태깅</h2>
                    <button onClick={onClose} title="닫기">
                        <X size={20} />
                    </button>
                </Head>
                <Hint>
                    시간표에 프리미어·무대인사·GV 표기가 없는 회차(메가박스 등)를 직접 지정합니다. 지정한 회차는{" "}
                    <b>특수상영 다운로드</b>에서 같은 키워드(예: 프리미어)로 검색하면 해당 포맷으로 분류되어 출력됩니다.
                    <br />
                    <span style={{ color: "#b45309", fontWeight: 700 }}>주황색</span> 태그 = 수동 지정(× 로 해제) · 회색
                    태그 = 시간표에서 수집된 표기
                </Hint>
                <Filters>
                    <Field>
                        영화
                        <select
                            value={movieId ?? ""}
                            onChange={(e) => setMovieId(e.target.value ? Number(e.target.value) : null)}
                            style={{ width: 240 }}
                        >
                            <option value="">크롤 대상 영화 선택</option>
                            {crawlTargets.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.title}
                                    {m.movie_type === "competitor" ? " (경쟁작)" : ""}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field>
                        날짜
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    </Field>
                    <Field>
                        계열사
                        <select value={brand} onChange={(e) => setBrand(e.target.value)}>
                            {BRANDS.map((b) => (
                                <option key={b.value} value={b.value}>
                                    {b.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field>
                        극장명
                        <select
                            value={theater}
                            onChange={(e) => {
                                setTheater(e.target.value);
                                setScreen("");
                            }}
                            style={{ width: 180 }}
                        >
                            <option value="">전체</option>
                            {theaterOptions.map(([k, label]) => (
                                <option key={k} value={k}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field>
                        관
                        <select value={screen} onChange={(e) => setScreen(e.target.value)} disabled={!theater}>
                            <option value="">전체</option>
                            {screenOptions.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                    </Field>
                </Filters>

                <ListWrap>
                    <Table>
                        <thead>
                            <tr>
                                <th style={{ width: 32 }}>
                                    <input
                                        type="checkbox"
                                        checked={allVisiblePicked}
                                        onChange={toggleAllVisible}
                                        disabled={visible.length === 0}
                                        title="보이는 회차 전체 선택"
                                    />
                                </th>
                                <th>계열사</th>
                                <th>극장명</th>
                                <th>관</th>
                                <th>상영시간</th>
                                <th>태그</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((s) => {
                                const k = showingKey(s);
                                return (
                                    <tr key={k} className={picked.has(k) ? "picked" : ""}>
                                        <td>
                                            <input type="checkbox" checked={picked.has(k)} onChange={() => togglePick(s)} />
                                        </td>
                                        <td>{BRAND_LABEL[s.brand] || s.brand}</td>
                                        <td>{s.theater_name}</td>
                                        <td>{s.screen_name}</td>
                                        <td style={{ fontWeight: 700 }}>{s.time}</td>
                                        <td style={{ whiteSpace: "normal" }}>
                                            {s.manual_tags.map((m) => (
                                                <Chip key={m.id} $manual title="수동 지정">
                                                    {m.tag}
                                                    <button onClick={() => handleRemove(m.id)} title="지정 해제">
                                                        ×
                                                    </button>
                                                </Chip>
                                            ))}
                                            {s.tags.map((t) => (
                                                <Chip key={t}>{t}</Chip>
                                            ))}
                                        </td>
                                    </tr>
                                );
                            })}
                            {!loading && visible.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
                                        {movieTitle
                                            ? "해당 날짜에 수집된 회차가 없습니다."
                                            : "영화와 날짜를 선택하면 수집된 회차가 표시됩니다."}
                                    </td>
                                </tr>
                            )}
                            {loading && (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
                                        <Spinner className="spin" size={20} />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </Table>
                </ListWrap>

                <Foot>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>특수포맷</span>
                    {PRESET_TAGS.map((p) => (
                        <PresetBtn key={p} type="button" $active={tag === p} onClick={() => setTag(p)}>
                            {p}
                        </PresetBtn>
                    ))}
                    <input
                        value={tag}
                        onChange={(e) => setTag(e.target.value)}
                        placeholder="직접 입력"
                        style={{
                            height: 30,
                            width: 150,
                            padding: "0 10px",
                            border: "1px solid #cbd5e1",
                            borderRadius: 6,
                            fontSize: 12,
                            fontFamily: "inherit",
                        }}
                    />
                    <ApplyBtn onClick={handleApply} disabled={saving || picked.size === 0 || !tag.trim()}>
                        {saving ? <Spinner className="spin" size={16} /> : <Tag size={16} weight="bold" />}
                        선택 회차 {picked.size}개 지정
                    </ApplyBtn>
                </Foot>
            </Container>
        </Overlay>
    );
};
