import React, { useState } from "react";
import styled from "styled-components";
import { AxiosPost, AxiosPatch, AxiosDelete } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";

// 공통 컴포넌트
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { AutocompleteInputClient } from "../../../components/common/AutocompleteInputClient";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";

// 도메인 컴포넌트
import { MovieDetail } from "../components/MovieDetail";
import { MovieList } from "../components/MovieList";
import { AutocompleteInputMovie } from "../../../components/common/AutocompleteInputMovie";

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background-color: #f8fafc;
    min-height: 100vh;
    font-family: "SUIT", sans-serif;
`;


const MainGrid = styled.div`
    display: flex;
    gap: 16px;
    flex: 1;
    align-items: flex-start;
`;

const LeftSection = styled.div`
    flex: 1.2;
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: calc(100vh - 150px);
`;

const RightSection = styled.div`
    flex: 0.8;
    min-width: 0;
    height: calc(100vh - 150px);
`;

export function ManageMovie() {
    const toast = useToast();

    // 데이터 상태
    const [movies, setMovies] = useState<any[]>([]);
    const [selectedMovie, setSelectedMovie] = useState<any>(null);
    const [formData, setFormData] = useState<any>({});
    const [selectedMovieIds, setSelectedMovieIds] = useState<number[]>([]); // ✅ 체크박스 선택용

    /** ✅ 검색 필터 상태 **/
    const [searchParams, setSearchParams] = useState({
        distributor: null as any,
        movieName: "",
    });
    const [distributorInput, setDistributorInput] = useState("");
    const [activeFilters, setActiveFilters] = useState<any>({}); // 실제 검색 버튼 클릭 시 적용될 필터

    // 검색 실행 핸들러
    const handleSearch = () => {
        // 입력창(distributorInput)이 비어있으면 배급사 선택이 취소된 것으로 간주
        const currentDistributorId = distributorInput.trim() === "" ? "" : searchParams.distributor?.id || "";

        setActiveFilters({
            distributor_id: currentDistributorId,
            title_ko: searchParams.movieName,
        });
    };
    const handleSelectMovie = (movie: any) => {
        setSelectedMovie(movie);
        setFormData({ ...movie });
    };

    const handleInputChange = (e: any) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev: any) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    const handleAddMovie = () => {
        const newMovie = { title_ko: "신규 영화명", is_finalized: false };
        AxiosPost("movies", newMovie)
            .then((res) => {
                setMovies((prev) => [res.data, ...prev]); // 최상단에 추가
                handleSelectMovie(res.data);
                toast.success("새 영화가 추가되었습니다.");
            })
            .catch((error) => toast.error(handleBackendErrors(error)));
    };

    const handleUpdateMovie = () => {
        if (!selectedMovie) return;
        AxiosPatch(`movies/${selectedMovie.id}`, formData)
            .then((res) => {
                setMovies((prev) => prev.map((m) => (m.id === selectedMovie.id ? res.data : m)));
                setSelectedMovie(res.data);
                toast.success("영화 정보가 수정되었습니다.");
            })
            .catch((error) => toast.error(handleBackendErrors(error)));
    };

    const handleBulkDelete = () => {
        if (selectedMovieIds.length === 0) {
            toast.error("삭제할 영화를 선택해주세요.");
            return;
        }
        if (!window.confirm(`선택한 ${selectedMovieIds.length}개의 영화를 삭제하시겠습니까?`)) return;

        Promise.all(selectedMovieIds.map((id) => AxiosDelete("movies", id)))
            .then(() => {
                setMovies((prev) => prev.filter((m) => !selectedMovieIds.includes(m.id)));
                setSelectedMovieIds([]);
                if (selectedMovie && selectedMovieIds.includes(selectedMovie.id)) {
                    setSelectedMovie(null);
                    setFormData({});
                }
                toast.success("선택한 영화가 삭제되었습니다.");
            })
            .catch((error) => toast.error(handleBackendErrors(error)));
    };

    const handleMovieCreated = (newMovie: any) => {
        setMovies((prev) => [newMovie, ...prev]);
        handleSelectMovie(newMovie);
    };

    return (
        <PageContainer>
            {/** ✅ 상단 필터바 **/}
            <CommonFilterBar onSearch={handleSearch}>
                <AutocompleteInputClient
                    type="distributor"
                    label="배급사"
                    formData={searchParams}
                    setFormData={setSearchParams}
                    inputValue={distributorInput}
                    setInputValue={setDistributorInput}
                    placeholder="배급사 선택"
                    labelWidth="50px"
                />
                <AutocompleteInputMovie
                    label="영화"
                    formData={formData}
                    setFormData={setFormData}
                    placeholder="영화명 검색"
                    inputValue={searchParams.movieName}
                    setInputValue={(v) => setSearchParams((prev: any) => ({ ...prev, movieName: v }))}
                />
            </CommonFilterBar>

            <MainGrid>
                <LeftSection>
                    <MovieList
                        movies={movies}
                        setMovies={setMovies}
                        selectedMovie={selectedMovie}
                        handleSelectMovie={handleSelectMovie}
                        handleAddMovie={handleAddMovie}
                        handleBulkDelete={handleBulkDelete} // ✅ 일괄 삭제
                        selectedMovieIds={selectedMovieIds}
                        onSelectionChange={setSelectedMovieIds}
                        filters={activeFilters} // ✅ 필터 전달
                    />
                </LeftSection>

                <RightSection>
                    <MovieDetail
                        selectedMovie={selectedMovie}
                        formData={formData}
                        setFormData={setFormData}
                        handleInputChange={handleInputChange}
                        handleUpdateMovie={handleUpdateMovie}
                        onMovieCreated={handleMovieCreated}
                    />
                </RightSection>
            </MainGrid>
        </PageContainer>
    );
}
