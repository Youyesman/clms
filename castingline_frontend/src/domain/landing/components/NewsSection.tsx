import React, { useEffect, useState } from "react";
import styled, { keyframes } from "styled-components";
import { CalendarBlank, FilmStrip, Star, Newspaper, ArrowSquareOut } from "@phosphor-icons/react";
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

interface NewsItem {
    title: string;
    link: string;
    pub_date: string;
    source: string;
}

const TMDB_IMG = "https://image.tmdb.org/t/p";

/* ── Animations ── */
const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(30px); }
    to   { opacity: 1; transform: translateY(0); }
`;

const slideIn = keyframes`
    from { opacity: 0; transform: translateX(40px); }
    to   { opacity: 1; transform: translateX(0); }
`;

/* ── Styled Components ── */
const Section = styled.section`
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 60px 24px 80px;
    animation: ${fadeUp} 0.6s ease 0.3s both;
`;

const SectionHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 32px;

    .icon-circle {
        width: 42px;
        height: 42px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(59, 130, 246, 0.12);
        color: #60a5fa;
    }

    h2 {
        font-size: 22px;
        font-weight: 800;
        color: #f1f5f9;
        margin: 0;
    }

    .subtitle {
        font-size: 13px;
        color: #64748b;
        margin-left: auto;
    }
`;

const ScrollContainer = styled.div`
    display: flex;
    gap: 20px;
    overflow-x: auto;
    padding-bottom: 16px;
    scroll-snap-type: x mandatory;

    scrollbar-width: thin;
    scrollbar-color: #334155 transparent;

    &::-webkit-scrollbar {
        height: 6px;
    }
    &::-webkit-scrollbar-track {
        background: transparent;
    }
    &::-webkit-scrollbar-thumb {
        background: #334155;
        border-radius: 3px;
    }
`;

const MovieCard = styled.div<{ $delay: number }>`
    flex: 0 0 220px;
    scroll-snap-align: start;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    overflow: hidden;
    transition: all 0.3s ease;
    animation: ${slideIn} 0.5s ease ${({ $delay }) => $delay * 0.08}s both;
    cursor: pointer;

    &:hover {
        background: rgba(255, 255, 255, 0.07);
        border-color: rgba(59, 130, 246, 0.3);
        transform: translateY(-6px);
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
    }
`;

const PosterWrapper = styled.div`
    position: relative;
    width: 100%;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    background: #1e293b;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.4s ease;
    }

    ${MovieCard}:hover & img {
        transform: scale(1.05);
    }
`;

const RatingBadge = styled.div`
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    border-radius: 20px;
    font-size: 12px;
    font-weight: 700;
    color: #fbbf24;
`;

const NoPoster = styled.div`
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #1e293b, #0f172a);
    color: #475569;
`;

const CardInfo = styled.div`
    padding: 14px;

    h4 {
        font-size: 14px;
        font-weight: 700;
        color: #e2e8f0;
        margin: 0 0 6px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #64748b;
    }
`;

const Divider = styled.hr`
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    margin: 10px 0 48px;
`;

/* ── News Styled Components ── */
const NewsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 16px;

    @media (max-width: 768px) {
        grid-template-columns: 1fr;
    }
`;

const NewsCard = styled.a<{ $delay: number }>`
    display: flex;
    gap: 16px;
    padding: 18px 20px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 14px;
    text-decoration: none;
    transition: all 0.3s ease;
    animation: ${fadeUp} 0.4s ease ${({ $delay }) => $delay * 0.06}s both;

    &:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(59, 130, 246, 0.25);
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    }

    .news-icon {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(99, 102, 241, 0.1);
        color: #818cf8;
    }

    .news-content {
        flex: 1;
        min-width: 0;
    }

    .news-title {
        font-size: 14px;
        font-weight: 600;
        color: #e2e8f0;
        line-height: 1.5;
        margin: 0 0 8px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .news-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: #64748b;
    }

    .news-source {
        padding: 2px 8px;
        background: rgba(59, 130, 246, 0.1);
        border-radius: 4px;
        color: #60a5fa;
        font-weight: 600;
    }

    .news-link-icon {
        flex-shrink: 0;
        color: #475569;
        align-self: center;
        transition: color 0.2s;
    }

    &:hover .news-link-icon {
        color: #60a5fa;
    }
`;

const LoadingState = styled.div`
    display: flex;
    gap: 20px;
`;

const SkeletonCard = styled.div`
    flex: 0 0 220px;
    height: 380px;
    border-radius: 16px;
    background: linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08));
    animation: pulse 1.5s ease-in-out infinite;

    @keyframes pulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
    }
`;

const SkeletonNews = styled.div`
    height: 80px;
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.06));
    animation: pulse 1.5s ease-in-out infinite;

    @keyframes pulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
    }
`;

const ErrorMsg = styled.div`
    color: #94a3b8;
    font-size: 14px;
    text-align: center;
    padding: 40px;
`;

/* ── Helper ── */
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
    } catch {
        return dateStr;
    }
}

/* ── Component ── */
export default function NewsSection() {
    const [upcoming, setUpcoming] = useState<TmdbMovie[]>([]);
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loadingM, setLoadingM] = useState(true);
    const [loadingN, setLoadingN] = useState(true);
    const [errorM, setErrorM] = useState("");
    const [errorN, setErrorN] = useState("");

    useEffect(() => {
        // 개봉 예정작
        axios
            .get(`${BASE_URL}/tmdb/upcoming/`)
            .then((res) => setUpcoming(res.data.results?.slice(0, 10) || []))
            .catch(() => setErrorM("개봉 예정작을 불러올 수 없습니다."))
            .finally(() => setLoadingM(false));

        // 영화 뉴스
        axios
            .get(`${BASE_URL}/news/movies/`)
            .then((res) => setNews(res.data.results || []))
            .catch(() => setErrorN("뉴스를 불러올 수 없습니다."))
            .finally(() => setLoadingN(false));
    }, []);

    return (
        <Section>
            {/* 개봉 예정작 */}
            <SectionHeader>
                <div className="icon-circle">
                    <CalendarBlank size={22} weight="bold" />
                </div>
                <h2>🎬 개봉 예정작</h2>
                <span className="subtitle">곧 개봉하는 영화</span>
            </SectionHeader>

            {loadingM ? (
                <LoadingState>
                    {[...Array(5)].map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </LoadingState>
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
                                    <NoPoster>
                                        <FilmStrip size={48} weight="thin" />
                                    </NoPoster>
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

            <Divider />

            {/* 영화 뉴스 */}
            <SectionHeader>
                <div className="icon-circle">
                    <Newspaper size={22} weight="bold" />
                </div>
                <h2>📰 영화 뉴스</h2>
                <span className="subtitle">최신 영화 소식</span>
            </SectionHeader>

            {loadingN ? (
                <NewsGrid>
                    {[...Array(6)].map((_, i) => (
                        <SkeletonNews key={i} />
                    ))}
                </NewsGrid>
            ) : errorN ? (
                <ErrorMsg>{errorN}</ErrorMsg>
            ) : (
                <NewsGrid>
                    {news.map((item, i) => (
                        <NewsCard
                            key={i}
                            $delay={i}
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <div className="news-icon">
                                <Newspaper size={20} weight="duotone" />
                            </div>
                            <div className="news-content">
                                <p className="news-title">{item.title}</p>
                                <div className="news-meta">
                                    {item.source && (
                                        <span className="news-source">{item.source}</span>
                                    )}
                                    <span>{formatTimeAgo(item.pub_date)}</span>
                                </div>
                            </div>
                            <ArrowSquareOut size={18} className="news-link-icon" />
                        </NewsCard>
                    ))}
                </NewsGrid>
            )}
        </Section>
    );
}
