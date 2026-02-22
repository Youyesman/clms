import React, { useEffect, useState } from "react";
import styled, { keyframes } from "styled-components";
import { CalendarBlank, FilmStrip, Star, Newspaper, ArrowUpRight, Clock, Image, PencilLine, User } from "@phosphor-icons/react";
import axios from "axios";
import { BASE_URL } from "../../../axios/Axios";

/* ── Types ── */
interface TmdbMovie {
    id: number;
    title: string;
    original_title: string;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date: string;
    vote_average: number;
    vote_count: number;
    popularity: number;
}

interface NaverNewsItem {
    title: string;
    description: string;
    link: string;
    originallink: string;
    pub_date: string;
    image: string;
}

interface BlogItem {
    title: string;
    description: string;
    link: string;
    blogger_name: string;
    pub_date: string;
    image: string;
}

const TMDB_IMG = "https://image.tmdb.org/t/p";

/* ── Helpers ── */
function formatTimeAgo(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        if (diffMin < 60) return `${diffMin}분 전`;
        if (diffHour < 24) return `${diffHour}시간 전`;
        if (diffDay < 7) return `${diffDay}일 전`;
        return date.toLocaleDateString("ko-KR");
    } catch { return dateStr; }
}

function extractSource(url: string): string {
    try {
        const u = new URL(url);
        return u.hostname.replace("www.", "").replace(".co.kr", "").replace(".com", "");
    } catch { return ""; }
}

/* ── Animations ── */
const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
`;

const slideIn = keyframes`
    from { opacity: 0; transform: translateX(30px); }
    to   { opacity: 1; transform: translateX(0); }
`;

/* ── Layout ── */
const Section = styled.section`
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px 24px 0;
`;

const SectionHeader = styled.div`
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 28px; animation: ${fadeUp} 0.5s ease both;

    .icon-circle {
        width: 42px; height: 42px; border-radius: 12px;
        display: flex; align-items: center; justify-content: center;
        background: rgba(59, 130, 246, 0.12); color: #60a5fa;
    }
    h2 { font-size: 22px; font-weight: 800; color: #f1f5f9; margin: 0; }
    .subtitle { font-size: 13px; color: #64748b; margin-left: auto; }
`;

const Divider = styled.hr`
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    margin: 48px 0 0;
`;

/* ── Featured News (상단 큰 2개 카드) ── */
const FeaturedGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 20px;
    animation: ${fadeUp} 0.5s ease 0.1s both;

    @media (max-width: 768px) { grid-template-columns: 1fr; }
`;

const FeaturedCard = styled.a`
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    text-decoration: none;
    transition: all 0.35s ease;

    &:hover {
        border-color: rgba(59, 130, 246, 0.3);
        transform: translateY(-5px);
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
        background: rgba(255, 255, 255, 0.05);
    }
`;

const FeaturedThumb = styled.div`
    width: 100%;
    height: 220px;
    overflow: hidden;
    background: linear-gradient(135deg, #1e293b, #0f172a);
    position: relative;

    img {
        width: 100%; height: 100%;
        object-fit: cover;
        transition: transform 0.5s ease;
    }
    ${FeaturedCard}:hover & img { transform: scale(1.06); }
`;

const FeaturedNoImg = styled.div`
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #1a1a2e, #16213e);
    color: #334155;
`;

const FeaturedBody = styled.div`
    padding: 20px 22px;
    display: flex; flex-direction: column; gap: 10px; flex: 1;

    .f-title {
        font-size: 18px; font-weight: 800; color: #f1f5f9;
        line-height: 1.5; margin: 0;
        display: -webkit-box; -webkit-line-clamp: 2;
        -webkit-box-orient: vertical; overflow: hidden;
    }
    .f-desc {
        font-size: 13px; color: #94a3b8; line-height: 1.6; margin: 0;
        display: -webkit-box; -webkit-line-clamp: 2;
        -webkit-box-orient: vertical; overflow: hidden;
    }
    .f-meta {
        display: flex; align-items: center; gap: 10px; margin-top: auto;
    }
`;

const SourceTag = styled.span`
    padding: 3px 10px; border-radius: 6px;
    background: rgba(59, 130, 246, 0.12);
    color: #60a5fa; font-size: 11px; font-weight: 700;
`;

const TimeTag = styled.span`
    display: flex; align-items: center; gap: 4px;
    font-size: 11px; color: #64748b;
`;

/* ── Compact News Grid ── */
const CompactGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;

    @media (max-width: 768px) { grid-template-columns: 1fr; }
`;

const CompactCard = styled.a<{ $delay: number }>`
    display: flex;
    gap: 14px;
    padding: 16px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.05);
    text-decoration: none;
    transition: all 0.25s ease;
    animation: ${fadeUp} 0.4s ease ${({ $delay }) => 0.2 + $delay * 0.04}s both;

    &:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(99, 102, 241, 0.2);
        transform: translateY(-2px);
        box-shadow: 0 8px 28px rgba(0,0,0,0.25);
    }
`;

const CompactThumb = styled.div`
    flex-shrink: 0;
    width: 96px; height: 72px;
    border-radius: 10px;
    overflow: hidden;
    background: #1e293b;

    img { width: 100%; height: 100%; object-fit: cover; }
`;

const CompactNoThumb = styled.div`
    flex-shrink: 0;
    width: 96px; height: 72px;
    border-radius: 10px;
    background: linear-gradient(135deg, #1a1a2e, #16213e);
    display: flex; align-items: center; justify-content: center;
    color: #334155;
`;

const CompactBody = styled.div`
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; justify-content: center; gap: 8px;

    .c-title {
        font-size: 14px; font-weight: 600; color: #e2e8f0; line-height: 1.45; margin: 0;
        display: -webkit-box; -webkit-line-clamp: 2;
        -webkit-box-orient: vertical; overflow: hidden;
    }
    .c-meta { display: flex; align-items: center; gap: 8px; }
`;

/* ── Movie Card ── */
const ScrollContainer = styled.div`
    display: flex; gap: 20px; overflow-x: auto; padding-bottom: 16px;
    scroll-snap-type: x mandatory; scrollbar-width: thin; scrollbar-color: #334155 transparent;
    &::-webkit-scrollbar { height: 6px; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
`;

const MovieCard = styled.div<{ $delay: number }>`
    flex: 0 0 220px; scroll-snap-align: start;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px; overflow: hidden; transition: all 0.3s ease;
    animation: ${slideIn} 0.5s ease ${({ $delay }) => $delay * 0.08}s both;
    cursor: pointer;
    &:hover {
        background: rgba(255, 255, 255, 0.07); border-color: rgba(59, 130, 246, 0.3);
        transform: translateY(-6px); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
    }
`;

const PosterWrapper = styled.div`
    position: relative; width: 100%; aspect-ratio: 2 / 3; overflow: hidden; background: #1e293b;
    img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.4s ease; }
    ${MovieCard}:hover & img { transform: scale(1.05); }
`;

const RatingBadge = styled.div`
    position: absolute; top: 10px; right: 10px;
    display: flex; align-items: center; gap: 4px; padding: 4px 10px;
    background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(8px);
    border-radius: 20px; font-size: 12px; font-weight: 700; color: #fbbf24;
`;

const NoPoster = styled.div`
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #1e293b, #0f172a); color: #475569;
`;

const CardInfo = styled.div`
    padding: 14px;
    h4 { font-size: 14px; font-weight: 700; color: #e2e8f0; margin: 0 0 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b; }
`;

/* ── Skeletons / Error ── */
const SkeletonFeatured = styled.div`
    height: 380px; border-radius: 16px;
    background: linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.06));
    animation: pulse 1.5s ease-in-out infinite;
    @keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
`;
const SkeletonCompact = styled.div`
    height: 90px; border-radius: 12px;
    background: linear-gradient(135deg, rgba(255,255,255,0.025), rgba(255,255,255,0.05));
    animation: pulse 1.5s ease-in-out infinite;
`;

/* ── Blog Card ── */
const BlogScrollContainer = styled.div`
    display: flex; gap: 20px; overflow-x: auto; padding-bottom: 16px;
    scroll-snap-type: x mandatory; scrollbar-width: thin; scrollbar-color: #334155 transparent;
    &::-webkit-scrollbar { height: 6px; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
    animation: ${fadeUp} 0.5s ease 0.1s both;
`;

const BlogCard = styled.a<{ $delay: number }>`
    flex: 0 0 320px; scroll-snap-align: start;
    display: flex; flex-direction: column;
    border-radius: 14px; overflow: hidden;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    text-decoration: none; transition: all 0.3s ease;
    animation: ${slideIn} 0.5s ease ${({ $delay }) => $delay * 0.08}s both;

    &:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(168, 85, 247, 0.3);
        transform: translateY(-4px);
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.3);
    }
`;

const BlogThumb = styled.div`
    width: 100%; height: 160px; overflow: hidden;
    background: linear-gradient(135deg, #1a1a2e, #16213e);
    img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.4s ease; }
    ${BlogCard}:hover & img { transform: scale(1.05); }
`;

const BlogNoThumb = styled.div`
    width: 100%; height: 160px;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #1a1a2e 0%, #1e293b 50%, #0f172a 100%);
    color: #334155;
`;

const BlogBody = styled.div`
    padding: 16px; display: flex; flex-direction: column; gap: 8px; flex: 1;

    .b-title {
        font-size: 15px; font-weight: 700; color: #e2e8f0;
        line-height: 1.45; margin: 0;
        display: -webkit-box; -webkit-line-clamp: 2;
        -webkit-box-orient: vertical; overflow: hidden;
    }
    .b-desc {
        font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0;
        display: -webkit-box; -webkit-line-clamp: 2;
        -webkit-box-orient: vertical; overflow: hidden;
    }
    .b-meta {
        display: flex; align-items: center; gap: 8px; margin-top: auto;
    }
    .b-author {
        display: flex; align-items: center; gap: 4px;
        font-size: 11px; color: #a78bfa; font-weight: 600;
    }
    .b-date { font-size: 11px; color: #64748b; }
`;

const SkeletonBlog = styled.div`
    flex: 0 0 320px; height: 300px; border-radius: 14px;
    background: linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.06));
    animation: pulse 1.5s ease-in-out infinite;
`;
const SkeletonCard = styled.div`
    flex: 0 0 220px; height: 380px; border-radius: 16px;
    background: linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08));
    animation: pulse 1.5s ease-in-out infinite;
`;
const ErrorMsg = styled.div`
    color: #94a3b8; font-size: 14px; text-align: center; padding: 40px;
`;

/* ══════════════════════════════════ Component ══════════════════════════════════ */
export default function NewsSection() {
    const [upcoming, setUpcoming] = useState<TmdbMovie[]>([]);
    const [news, setNews] = useState<NaverNewsItem[]>([]);
    const [blogs, setBlogs] = useState<BlogItem[]>([]);
    const [loadingM, setLoadingM] = useState(true);
    const [loadingN, setLoadingN] = useState(true);
    const [loadingB, setLoadingB] = useState(true);
    const [errorM, setErrorM] = useState("");
    const [errorN, setErrorN] = useState("");
    const [errorB, setErrorB] = useState("");

    useEffect(() => {
        axios
            .get(`${BASE_URL}/tmdb/upcoming/`)
            .then((res) => setUpcoming(res.data.results?.slice(0, 10) || []))
            .catch(() => setErrorM("개봉 예정작을 불러올 수 없습니다."))
            .finally(() => setLoadingM(false));

        axios
            .get(`${BASE_URL}/news/naver/`, { params: { q: "영화 개봉 OR 박스오피스 OR 영화제 OR 할리우드 배우 OR 한국 배우", display: 12 } })
            .then((res) => setNews(res.data.results || []))
            .catch(() => setErrorN("뉴스를 불러올 수 없습니다."))
            .finally(() => setLoadingN(false));

        // 영화 칼럼/리뷰
        axios
            .get(`${BASE_URL}/blog/naver/`, { params: { q: "왕과사는남자 영화평 OR 휴민트 영화평", display: 10 } })
            .then((res) => setBlogs(res.data.results || []))
            .catch(() => setErrorB("블로그를 불러올 수 없습니다."))
            .finally(() => setLoadingB(false));
    }, []);

    // 이미지 있는 기사를 상단 featured로, 없으면 compact로
    const withImage = news.filter((n) => !!n.image);
    const withoutImage = news.filter((n) => !n.image);
    const featured = withImage.slice(0, 2);
    const compact = [...withImage.slice(2), ...withoutImage];

    return (
        <>
            {/* ═══ 영화 뉴스 (최상단) ═══ */}
            <Section>
                <SectionHeader>
                    <div className="icon-circle">
                        <Newspaper size={22} weight="bold" />
                    </div>
                    <h2>📰 영화 뉴스</h2>
                    <span className="subtitle">최신 영화 소식</span>
                </SectionHeader>

                {loadingN ? (
                    <>
                        <FeaturedGrid>
                            <SkeletonFeatured />
                            <SkeletonFeatured />
                        </FeaturedGrid>
                        <CompactGrid>
                            {[...Array(4)].map((_, i) => <SkeletonCompact key={i} />)}
                        </CompactGrid>
                    </>
                ) : errorN ? (
                    <ErrorMsg>{errorN}</ErrorMsg>
                ) : (
                    <>
                        {/* 주요 뉴스 (상단 2개, 이미지 큰 카드) */}
                        <FeaturedGrid>
                            {featured.map((item, i) => {
                                const source = extractSource(item.originallink);
                                return (
                                    <FeaturedCard
                                        key={i}
                                        href={item.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <FeaturedThumb>
                                            {item.image ? (
                                                <img src={item.image} alt="" loading="lazy" />
                                            ) : (
                                                <FeaturedNoImg>
                                                    <Image size={56} weight="thin" />
                                                </FeaturedNoImg>
                                            )}
                                        </FeaturedThumb>
                                        <FeaturedBody>
                                            <p className="f-title">{item.title}</p>
                                            {item.description && (
                                                <p className="f-desc">{item.description}</p>
                                            )}
                                            <div className="f-meta">
                                                <SourceTag>{source}</SourceTag>
                                                <TimeTag>
                                                    <Clock size={12} />
                                                    {formatTimeAgo(item.pub_date)}
                                                </TimeTag>
                                            </div>
                                        </FeaturedBody>
                                    </FeaturedCard>
                                );
                            })}
                        </FeaturedGrid>

                        {/* 나머지 뉴스 (썸네일 + 제목) */}
                        <CompactGrid>
                            {compact.map((item, i) => {
                                const source = extractSource(item.originallink);
                                return (
                                    <CompactCard
                                        key={i}
                                        $delay={i}
                                        href={item.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {item.image ? (
                                            <CompactThumb>
                                                <img src={item.image} alt="" loading="lazy" />
                                            </CompactThumb>
                                        ) : (
                                            <CompactNoThumb>
                                                <Image size={22} weight="thin" />
                                            </CompactNoThumb>
                                        )}
                                        <CompactBody>
                                            <p className="c-title">{item.title}</p>
                                            <div className="c-meta">
                                                <SourceTag>{source}</SourceTag>
                                                <TimeTag>
                                                    <Clock size={11} />
                                                    {formatTimeAgo(item.pub_date)}
                                                </TimeTag>
                                            </div>
                                        </CompactBody>
                                    </CompactCard>
                                );
                            })}
                        </CompactGrid>
                    </>
                )}

                <Divider />
            </Section>

            {/* ═══ 영화 칼럼 / 리뷰 ═══ */}
            <Section>
                <SectionHeader>
                    <div className="icon-circle" style={{ background: "rgba(168, 85, 247, 0.12)", color: "#a78bfa" }}>
                        <PencilLine size={22} weight="bold" />
                    </div>
                    <h2>✍️ 영화평</h2>
                    <span className="subtitle">블로거들의 영화 이야기</span>
                </SectionHeader>

                {loadingB ? (
                    <BlogScrollContainer>
                        {[...Array(4)].map((_, i) => <SkeletonBlog key={i} />)}
                    </BlogScrollContainer>
                ) : errorB ? (
                    <ErrorMsg>{errorB}</ErrorMsg>
                ) : (
                    <BlogScrollContainer>
                        {blogs.map((blog, i) => (
                            <BlogCard key={i} $delay={i} href={blog.link} target="_blank" rel="noopener noreferrer">
                                {blog.image ? (
                                    <BlogThumb>
                                        <img src={blog.image} alt="" loading="lazy" />
                                    </BlogThumb>
                                ) : (
                                    <BlogNoThumb>
                                        <PencilLine size={40} weight="thin" />
                                    </BlogNoThumb>
                                )}
                                <BlogBody>
                                    <p className="b-title">{blog.title}</p>
                                    {blog.description && <p className="b-desc">{blog.description}</p>}
                                    <div className="b-meta">
                                        <span className="b-author">
                                            <User size={12} />
                                            {blog.blogger_name}
                                        </span>
                                        <span className="b-date">{blog.pub_date}</span>
                                    </div>
                                </BlogBody>
                            </BlogCard>
                        ))}
                    </BlogScrollContainer>
                )}

                <Divider />
            </Section>

            {/* ═══ 개봉 예정작 ═══ */}
            <Section style={{ paddingTop: "48px", paddingBottom: "80px" }}>
                <SectionHeader>
                    <div className="icon-circle">
                        <CalendarBlank size={22} weight="bold" />
                    </div>
                    <h2>🎬 개봉 예정작</h2>
                    <span className="subtitle">곧 개봉하는 영화</span>
                </SectionHeader>

                {loadingM ? (
                    <div style={{ display: "flex", gap: 20 }}>
                        {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
                    </div>
                ) : errorM ? (
                    <ErrorMsg>{errorM}</ErrorMsg>
                ) : (
                    <ScrollContainer>
                        {upcoming.map((movie, i) => (
                            <MovieCard key={movie.id} $delay={i}>
                                <PosterWrapper>
                                    {movie.poster_path ? (
                                        <img
                                            src={`${TMDB_IMG}/w500${movie.poster_path}`}
                                            alt={movie.title}
                                            loading="lazy"
                                        />
                                    ) : (
                                        <NoPoster><FilmStrip size={48} weight="thin" /></NoPoster>
                                    )}
                                    <RatingBadge>
                                        <Star size={12} weight="fill" />
                                        {movie.vote_average.toFixed(1)}
                                    </RatingBadge>
                                </PosterWrapper>
                                <CardInfo>
                                    <h4 title={movie.title}>{movie.title}</h4>
                                    <div className="meta">
                                        <CalendarBlank size={12} />
                                        {movie.release_date || "미정"}
                                    </div>
                                </CardInfo>
                            </MovieCard>
                        ))}
                    </ScrollContainer>
                )}
            </Section>
        </>
    );
}
