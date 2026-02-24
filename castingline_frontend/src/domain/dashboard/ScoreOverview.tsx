// 스코어 종합 현황 페이지
import { useState } from "react";
import styled from "styled-components";
import { ScoreFilter } from "../score/components/ScoreFilter";
import { ScoreTable } from "../score/components/ScoreTable";
import { ScoreChart } from "../score/components/ScoreChart";
import axios from "axios";
import { BASE_URL } from "../../axios/Axios";

const Wrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
`;

export function ScoreOverview() {
    const [chartData, setChartData] = useState<any[]>([]);
    const [movieInfo, setMovieInfo] = useState<{ title: string; releaseDate: string } | null>(null);
    const [filters, setFilters] = useState<any>({
        year: new Date().getFullYear(),
        movie: null,
        format_ids: [],
        region: "",
        multi: "",
        theater_type: "",
        date: "",
    });

    // 검색 실행
    const handleSearch = async () => {
        if (!filters.movie?.id || !filters.date) {
            return;
        }

        try {
            const token = localStorage.getItem("token");
            const params = new URLSearchParams();

            params.append("movie_id", filters.movie.id);
            params.append("sort_by", "region");
            params.append("date_from", filters.date);
            params.append("date_to", filters.date);

            // 포맷 필터 (서브 영화 IDs)
            if (filters.format_ids && filters.format_ids.length > 0) {
                filters.format_ids.forEach((id: number) => {
                    params.append("format_ids", String(id));
                });
            }

            // 선택적 필터
            if (filters.region) params.append("region", filters.region);
            if (filters.multi) params.append("multi", filters.multi);
            if (filters.theater_type) params.append("theater_type", filters.theater_type);

            const res = await axios.get(`${BASE_URL}/score/summary/?${params.toString()}`, {
                headers: token ? { Authorization: `token ${token}` } : {},
            });
            setChartData(res.data);

            // 영화 정보 세팅
            setMovieInfo({
                title: filters.movie.title_ko,
                releaseDate: filters.movie.release_date || "",
            });
        } catch (err) {
            console.error("스코어 데이터 로딩 실패", err);
            setChartData([]);
        }
    };

    // 엑셀 다운로드
    const handleExcelDownload = async () => {
        if (!filters.movie?.id || !filters.date) return;

        try {
            const token = localStorage.getItem("token");
            const params = new URLSearchParams();

            params.append("movie_id", filters.movie.id);
            params.append("sort_by", "region");
            params.append("date_from", filters.date);
            params.append("date_to", filters.date);

            if (filters.region) params.append("region", filters.region);
            if (filters.multi) params.append("multi", filters.multi);
            if (filters.theater_type) params.append("theater_type", filters.theater_type);

            const res = await axios.get(`${BASE_URL}/score/summary/excel/?${params.toString()}`, {
                responseType: "blob",
                headers: token ? { Authorization: `token ${token}` } : {},
            });

            // Blob으로 파일 다운로드
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement("a");
            link.href = url;
            const safeTitle = filters.movie.title_ko?.replace(/\s/g, "_") || "score";
            link.setAttribute("download", `score_${safeTitle}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("엑셀 다운로드 실패", err);
        }
    };

    return (
        <Wrapper>
            <ScoreFilter
                filters={filters}
                setFilters={setFilters}
                handleSearch={handleSearch}
            />
            <ScoreTable
                data={chartData}
                movieTitle={movieInfo?.title}
                releaseDate={movieInfo?.releaseDate}
                onExcelDownload={handleExcelDownload}
            />
            <ScoreChart data={chartData} />
        </Wrapper>
    );
}
