import { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import axios from "axios";
import { BASE_URL } from "../../../axios/Axios";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomSelect } from "../../../components/common/CustomSelect";

/* ── 스타일 ── */


const MultiSelectWrap = styled.div`
    position: relative;
    min-width: 180px;
`;

/* 포맷은 복수 선택이라 드롭다운을 유지하되 겉모습은 필터 칩과 동일하게 */
const MultiSelectButton = styled.button`
    display: inline-flex;
    align-items: center;
    height: 30px;
    padding: 0 10px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #ffffff;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 0.12s ease;

    &:hover { border-color: #cbd5e1; }

    .chip-label {
        font-size: 12.5px;
        line-height: 20px;
        color: #64748b;
        padding-right: 8px;
        border-right: 1px solid #e2e8f0;
    }
    .chip-value {
        font-size: 12.5px;
        line-height: 20px;
        font-weight: 600;
        color: #0f172a;
        padding-left: 8px;
    }
    .chip-caret {
        margin-left: 5px;
        font-size: 11px;
        color: #94a3b8;
    }
`;

const MultiSelectDropdown = styled.div`
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.1);
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

        &:hover { background: #f1f5f9; }
    }
`;

const SearchBtn = styled.button`
    padding: 8px 24px;
    background: #2563eb;
    color: #ffffff;
    border: 1px solid #0f172a;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    height: 30px;
    transition: background 0.2s;

    &:hover { background: #1e293b; }
    &:disabled {
        background: #94a3b8;
        border-color: #94a3b8;
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
        <CommonFilterBar
            actions={
                <SearchBtn onClick={handleSearch} disabled={!canSearch}>
                    검색
                </SearchBtn>
            }>
            <CustomSelect
                label="연도"
                required
                options={YEARS.map((y) => y.toString())}
                value={filters.year || ""}
                onChange={(v) => setFilters((prev: any) => ({ ...prev, year: v }))}
                allowClear={false}
            />
            <CustomSelect
                label="영화 선택"
                required
                options={movies.map((mv: any) => ({ label: mv.title_ko, value: mv.id.toString() }))}
                value={filters.movie?.id ? filters.movie.id.toString() : ""}
                onChange={(v) => handleMovieChange({ target: { value: v } } as any)}
                allowClear={false}
            />
            {/* 포맷은 복수 선택이라 기존 드롭다운을 유지하되 칩과 같은 규격으로 보입니다 */}
            <MultiSelectWrap ref={formatRef}>
                <MultiSelectButton onClick={() => setFormatOpen(!formatOpen)}>
                    <span className="chip-label">포맷</span>
                    <span className="chip-value">
                        {selectedFormats.length === 0 ? "전체" : `${selectedFormats.length}개 선택`}
                    </span>
                    <span className="chip-caret">▾</span>
                </MultiSelectButton>
                {formatOpen && (
                    <MultiSelectDropdown>
                        {formats.length === 0 && <label style={{ color: "#94a3b8" }}>포맷 없음</label>}
                        {formats.map((f) => (
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
            <CustomSelect
                label="지역"
                options={["전체", ...REGIONS]}
                value={filters.region || "전체"}
                onChange={(v) => setFilters((prev: any) => ({ ...prev, region: v === "전체" ? "" : v }))}
                allowClear={false}
            />
            <CustomSelect
                label="멀티"
                options={["전체", ...MULTIS]}
                value={filters.multi || "전체"}
                onChange={(v) => setFilters((prev: any) => ({ ...prev, multi: v === "전체" ? "" : v }))}
                allowClear={false}
            />
            <CustomSelect
                label="극장유형"
                options={["전체", ...THEATER_TYPES]}
                value={filters.theater_type || "전체"}
                onChange={(v) => setFilters((prev: any) => ({ ...prev, theater_type: v === "전체" ? "" : v }))}
                allowClear={false}
            />
            <CustomInput
                label="날짜"
                required
                inputType="date"
                value={filters.date || ""}
                setValue={(v) => setFilters((prev: any) => ({ ...prev, date: v }))}
            />
        </CommonFilterBar>
    );
}
