import { useState } from "react";
import styled from "styled-components";
import { AutocompleteInputMovie } from "../../../components/common/AutocompleteInputMovie";

const FilterWrap = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 0;

  .filter-item {
    display: flex;
    align-items: center;
    min-width: 200px;
    gap: 8px;
    padding-right: 16px;
    position: relative;

    label {
      white-space: nowrap;
    }

    input, select {
      flex: 1;
      padding: 4px 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
    }

    /* 오른쪽 세로 구분선 */
    &::after {
      content: "";
      position: absolute;
      right: 0;
      top: 8px;
      bottom: 8px;
      width: 1px;
      background-color: #ddd;
    }

    /* 마지막 항목에는 선 제거 */
    &:last-of-type::after {
      display: none;
    }
  }
`;
export function ScoreFilter({ filters, setFilters, handleSearch, }) {
    const [movieInputValue, setMovieInputValue] = useState("");
    const handleExcelDownload = () => { }
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    return (
        <FilterWrap className="window" style={{ padding: "10px", marginBottom: "10px" }}>
            <div className="filter-item">
                <label>정렬기준</label>
                <select
                    className="select"
                    name="sortBy"
                    value={filters.sortBy}
                    onChange={handleChange}
                >
                    <option value="region">지역별</option>
                    <option value="multi">멀티별</option>
                    <option value="version">버전별</option>
                </select>
            </div>
            <div className="filter-item">
                <label>연도</label>
                <input
                    type="number"
                    name="year"
                    value={filters.year}
                    onChange={handleChange}
                />
            </div>

            <div className="filter-item">
                <label>영화 선택</label>
                <AutocompleteInputMovie
                    formData={filters}
                    setFormData={setFilters}
                    placeholder="영화명을 입력하세요"
                    inputValue={movieInputValue}
                    setInputValue={setMovieInputValue}
                />
            </div>

            <div className="filter-item">
                <label>지역</label>
                <select
                    className="select"
                    name="region"
                    value={filters.region}
                    onChange={handleChange}
                >
                    <option value="">전체</option>
                    <option value="서울">서울</option>
                    <option value="경기">경기</option>
                    <option value="경북">경북</option>
                    <option value="충청">충청</option>
                    <option value="전남">전남</option>
                </select>
            </div>

            <div className="filter-item">
                <label>멀티</label>
                <select
                    className="select"
                    name="multi"
                    value={filters.multi}
                    onChange={handleChange}
                >
                    <option value="">전체</option>
                    <option value="CGV">CGV</option>
                    <option value="롯데">롯데</option>
                    <option value="메가박스">메가박스</option>
                    <option value="씨네큐">씨네큐</option>
                    <option value="기타">기타</option>
                </select>
            </div>

            <div className="filter-item">
                <label>극장유형</label>
                <select
                    className="select"
                    name="theater_type"
                    value={filters.theater_type}
                    onChange={handleChange}
                >
                    <option value="">전체</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                </select>
            </div>

            <div className="filter-item">
                <label>날짜 from</label>
                <input
                    type="date"
                    name="dateFrom"
                    value={filters.dateFrom}
                    onChange={handleChange}
                />
            </div>

            <div className="filter-item">
                <label>날짜 to</label>
                <input
                    type="date"
                    name="dateTo"
                    value={filters.dateTo}
                    onChange={handleChange}
                />
            </div>

            <div className="filter-item">
                <button className="button" onClick={handleSearch}>SEARCH</button>
            </div>

            <div className="filter-item">
                <button className="button" onClick={handleExcelDownload}>EXCEL</button>
            </div>


        </FilterWrap>
    );
}
