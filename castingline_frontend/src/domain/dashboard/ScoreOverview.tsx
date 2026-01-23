// components/dashboard/ScoreOverview.tsx

import { useState } from "react";
import styled from "styled-components";
import { ScoreFilter } from "../score/components/ScoreFilter";
import { ScoreTable } from "../score/components/ScoreTable";
import axios from "axios";
import { BASE_URL } from "../../axios/Axios";
import { ScoreChart } from "../score/components/ScoreChart";

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
`;

export function ScoreOverview() {
    const [chartData, setChartData] = useState([]);
    const [filters, setFilters] = useState<any>({
        sortBy: "region",
        year: new Date().getFullYear(),
        movie: null,
        region: "",
        multi: "",
        theater_type: "",
        dateFrom: "",
        dateTo: "",
    });
    const handleSearch = async () => {
        if (!filters.movie?.id) {
            console.warn("영화를 선택하세요");
            return;
        }

        try {
            const params = new URLSearchParams();

            params.append("movie_id", filters.movie.id);
            params.append("sort_by", filters.sortBy);
            if (filters.dateFrom) params.append("date_from", filters.dateFrom);
            if (filters.dateTo) params.append("date_to", filters.dateTo);
            if (filters.region) params.append("region", filters.region);
            if (filters.multi) params.append("multi", filters.multi);
            if (filters.theater_type) params.append("theater_type", filters.theater_type);
            // 나중에 필요한 조건 추가 가능

            const endpoint = `${BASE_URL}/score/summary/`


            const res = await axios.get(`${endpoint}?${params.toString()}`);
            setChartData(res.data);
        } catch (err) {
            console.error("차트 데이터 로딩 실패", err);
            setChartData([]);
        }
    };


    return (
        <Wrapper>
            <ScoreFilter
                filters={filters}
                setFilters={setFilters}
                handleSearch={handleSearch}
            />
            <ScoreTable data={chartData} />
            <ScoreChart data={chartData} sortBy={filters.sortBy} />
        </Wrapper>
    );
}
