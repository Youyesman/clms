import { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import axios from "axios";
import { BASE_URL } from "../../../axios/Axios";

/* ── 스타일 ── */
const FilterWrap = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 16px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    align-items: flex-end;
`;

const FilterItem = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 140px;

    label {
        font-size: 12px;
        font-weight: 600;
        color: #374151;
    }

    select, input {
        padding: 8px 10px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 13px;
        background: #fff;
        color: #111827;
        min-width: 120px;

        &:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px rgba(59,130,246,0.1);
        }
    }
`;

const MultiSelectWrap = styled.div`
    position: relative;
    min-width: 180px;
`;

const MultiSelectButton = styled.div`
    padding: 8px 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fff;
    color: #111827;
    min-height: 35px;

    &:hover { border-color: #9ca3af; }

    span.count {
        background: #3b82f6;
        color: #fff;
        border-radius: 10px;
        padding: 1px 8px;
        font-size: 11px;
        margin-left: 6px;
    }
`;

const MultiSelectDropdown = styled.div`
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    z-index: 100;
    max-height: 200px;
    overflow-y: auto;
    margin-top: 4px;

    label {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        font-size: 13px;
        cursor: pointer;

        &:hover { background: #f3f4f6; }
    }
`;

const SearchBtn = styled.button`
    padding: 8px 24px;
    background: #111827;
    color: #fff;
    border: 1px solid #111827;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    height: 35px;
    transition: background 0.2s;

    &:hover { background: #1f2937; }
    &:disabled {
        background: #9ca3af;
        border-color: #9ca3af;
        cursor: not-allowed;
    }
`;

/* ── 지역/멀티/극장유형 상수 ── */
const REGIONS = ["서울", "경강", "경남", "경북", "충청", "호남"];
const MULTIS = ["CGV", "롯데", "메가박스", "씨네큐", "일반극장", "자동차극장"];
const THEATER_TYPES = ["직영", "위탁", "기타"];

/* ── 연도 목록 생성 (현재~2015) ── */
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 2014 }, (_, i) => currentYear - i);

/* ── 타입 ── */
interface MovieOption {
    id: number;
    title_ko: string;
    movie_code: string;
    release_date: string;
}

interface FormatOption {
    id: number;
    label: string;
    movie_code: string;
}

interface ScoreFilterProps {
    filters: any;
    setFilters: (fn: any) => void;
    handleSearch: () => void;
}

export function ScoreFilter({ filters, setFilters, handleSearch }: ScoreFilterProps) {
    const [movies, setMovies] = useState<MovieOption[]>([]);
    const [formats, setFormats] = useState<FormatOption[]>([]);
    const [formatOpen, setFormatOpen] = useState(false);
    const [selectedFormats, setSelectedFormats] = useState<number[]>([]);
    const formatRef = useRef<HTMLDivElement>(null);

    // 스크롤 시 드롭다운 닫기
    useEffect(() => {
        if (!formatOpen) return;
        const close = () => setFormatOpen(false);
        window.addEventListener("scroll", close, true);
        return () => window.removeEventListener("scroll", close, true);
    }, [formatOpen]);

    // 외부 클릭 시 드롭다운 닫기
    useEffect(() => {
        if (!formatOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (formatRef.current && !formatRef.current.contains(e.target as Node)) {
                setFormatOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [formatOpen]);

    // 연도 변경 시 영화 목록 로드
    useEffect(() => {
        if (!filters.year) return;
        const token = localStorage.getItem("token");
        axios.get(`${BASE_URL}/score/movies-by-year/`, {
            params: { year: filters.year },
            headers: token ? { Authorization: `token ${token}` } : {},
        }).then(res => {
            setMovies(res.data);
            // 기존 선택 초기화
            setFilters((prev: any) => ({ ...prev, movie: null }));
            setFormats([]);
            setSelectedFormats([]);
        }).catch(() => setMovies([]));
    }, [filters.year]);

    // 영화 선택 시 포맷(서브 영화) 목록 로드
    useEffect(() => {
        if (!filters.movie?.id) {
            setFormats([]);
            setSelectedFormats([]);
            return;
        }
        axios.get(`${BASE_URL}/score/movie-formats/`, {
            params: { movie_id: filters.movie.id },
        }).then(res => {
            setFormats(res.data);
            setSelectedFormats([]);
        }).catch(() => setFormats([]));
    }, [filters.movie?.id]);

    // 포맷 선택 시 filters에 반영
    useEffect(() => {
        setFilters((prev: any) => ({ ...prev, format_ids: selectedFormats }));
    }, [selectedFormats]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters((prev: any) => ({ ...prev, [name]: value }));
    };

    const handleMovieChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const movieId = parseInt(e.target.value);
        const movie = movies.find(m => m.id === movieId) || null;
        setFilters((prev: any) => ({ ...prev, movie }));
    };

    const toggleFormat = (id: number) => {
        setSelectedFormats(prev =>
            prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
        );
    };

    // 필수 항목 미입력 시 검색 비활성화
    const canSearch = !!(filters.year && filters.movie?.id && filters.date);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && canSearch) handleSearch();
    };

    return (
        <FilterWrap onKeyDown={handleKeyDown}>
            {/* 연도 */}
            <FilterItem>
                <label>연도 *</label>
                <select name="year" value={filters.year || ""} onChange={handleChange}>
                    <option value="">연도 선택</option>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </FilterItem>

            {/* 영화 선택 */}
            <FilterItem>
                <label>영화 선택 *</label>
                <select value={filters.movie?.id || ""} onChange={handleMovieChange}>
                    <option value="">영화 선택</option>
                    {movies.map(m => (
                        <option key={m.id} value={m.id}>{m.title_ko}</option>
                    ))}
                </select>
            </FilterItem>

            {/* 포맷 (멀티 셀렉트) */}
            <FilterItem>
                <label>포맷</label>
                <MultiSelectWrap ref={formatRef}>
                    <MultiSelectButton onClick={() => setFormatOpen(!formatOpen)}>
                        {selectedFormats.length === 0
                            ? "전체"
                            : <>선택됨 <span className="count">{selectedFormats.length}</span></>
                        }
                        ▾
                    </MultiSelectButton>
                    {formatOpen && (
                        <MultiSelectDropdown>
                            {formats.length === 0 && (
                                <label style={{ color: "#9ca3af" }}>포맷 없음</label>
                            )}
                            {formats.map(f => (
                                <label key={f.id}>
                                    <input
                                        type="checkbox"
                                        checked={selectedFormats.includes(f.id)}
                                        onChange={() => toggleFormat(f.id)}
                                    />
                                    {f.label}
                                </label>
                            ))}
                        </MultiSelectDropdown>
                    )}
                </MultiSelectWrap>
            </FilterItem>

            {/* 지역 */}
            <FilterItem>
                <label>지역</label>
                <select name="region" value={filters.region || ""} onChange={handleChange}>
                    <option value="">전체</option>
                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
            </FilterItem>

            {/* 멀티 */}
            <FilterItem>
                <label>멀티</label>
                <select name="multi" value={filters.multi || ""} onChange={handleChange}>
                    <option value="">전체</option>
                    {MULTIS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
            </FilterItem>

            {/* 극장유형 */}
            <FilterItem>
                <label>극장유형</label>
                <select name="theater_type" value={filters.theater_type || ""} onChange={handleChange}>
                    <option value="">전체</option>
                    {THEATER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </FilterItem>

            {/* 날짜 */}
            <FilterItem>
                <label>날짜 *</label>
                <input type="date" name="date" value={filters.date || ""} onChange={handleChange} />
            </FilterItem>

            {/* 검색 버튼 */}
            <SearchBtn onClick={handleSearch} disabled={!canSearch}>
                검색
            </SearchBtn>
        </FilterWrap>
    );
}
