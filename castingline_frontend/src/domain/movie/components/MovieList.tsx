import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { AxiosGet } from "../../../axios/Axios";
import { GenericTable } from "../../../components/GenericTable";
import { Plus, Trash, Checks } from "@phosphor-icons/react";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { useToast } from "../../../components/common/CustomToast";
import { CommonListHeader } from "../../../components/common/CommonListHeader";

/** 1. 스타일 정의: 디자인 시스템 통일 **/
const ListContainer = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: #ffffff;
    border: 1px solid #94a3b8; /* Slate 400 */
    border-radius: 4px;
    overflow: hidden;
`;


const TableWrapper = styled.div`
    flex: 1;
    overflow: hidden;
`;

/** 2. 메인 컴포넌트 **/
export function MovieList({ movies, setMovies, selectedMovie, handleSelectMovie, handleAddMovie, handleBulkDelete, selectedMovieIds, onSelectionChange, filters }) {
    const toast = useToast();
    const [sortKey, setSortKey] = useState<string | null>("created_date");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);
    const [totalCount, setTotalCount] = useState(0);

    useEffect(() => {
        fetchSortedMovies(sortKey, sortOrder, page);
    }, []);

    useEffect(() => {
        fetchSortedMovies(sortKey, sortOrder, 1);
    }, [filters]);

    const fetchSortedMovies = (key: string | null, order: "asc" | "desc", currentPage = 1) => {
        const ordering = key ? `${order === "asc" ? "" : "-"}${key}` : "";

        // 검색 파라미터 조립
        const params = new URLSearchParams({
            ordering,
            page: String(currentPage),
            page_size: String(pageSize),
            distributor: filters?.distributor_id || "",
            search: filters?.title_ko || "", // DRF의 search 필터 혹은 title_ko 필터링
        });

        AxiosGet(`movies/?${params.toString()}`)
            .then((res) => {
                setMovies(res.data.results);
                setTotalCount(res.data.count);
            })
            .catch((error) => {
                console.error("Error:", error);
            });
    };

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > Math.ceil(totalCount / pageSize)) return;
        setPage(newPage);
        fetchSortedMovies(sortKey, sortOrder, newPage);
    };

    const handleSortChange = (key: string) => {
        let newOrder: "asc" | "desc" = "asc";
        if (sortKey === key) {
            newOrder = sortOrder === "asc" ? "desc" : "asc";
        }
        setSortKey(key);
        setSortOrder(newOrder);
        setPage(1);
        fetchSortedMovies(key, newOrder, 1);
    };

    const headers = [
        { key: "movie_code", label: "영화 코드" },
        { key: "is_primary_movie", label: "대표 영화" },
        { key: "title_ko", label: "한글 제목" },
        { key: "title_en", label: "영어 제목" },
        { key: "running_time_minutes", label: "상영 시간(분)" },
        { key: "distributor", label: "배급사" },
        { key: "production_company", label: "제작사" },
        { key: "rating", label: "관람 등급" },
        { key: "genre", label: "장르" },
        { key: "country", label: "국가" },
        { key: "director", label: "감독" },
        { key: "cast", label: "출연진" },
        { key: "release_date", label: "개봉일" },
        { key: "end_date", label: "종료일" },
        { key: "closure_completed_date", label: "폐관 완료일" },
        { key: "is_finalized", label: "확정 여부" },
        { key: "primary_movie_code", label: "대표 영화 코드" },
        { key: "media_type", label: "미디어 타입" },
        { key: "audio_mode", label: "오디오 모드" },
        { key: "viewing_dimension", label: "상영 차원" },
        { key: "screening_type", label: "상영 타입" },
        { key: "dx4_viewing_dimension", label: "4DX 상영 차원" },
        { key: "imax_l", label: "IMAX-L" },
        { key: "screen_x", label: "Screen X" },
    ];

    return (
        <ListContainer>
            <CommonListHeader
                title="영화 목록"
                actions={
                    <>
                        {selectedMovieIds.length > 0 && (
                            <CustomIconButton color="red" onClick={handleBulkDelete} title="선택 삭제">
                                <Trash size={18} weight="bold" />
                            </CustomIconButton>
                        )}
                        <CustomIconButton onClick={handleAddMovie} title="영화 추가">
                            <Plus size={18} weight="bold" />
                        </CustomIconButton>
                    </>
                }
            />

            <TableWrapper>
                <GenericTable
                    headers={headers}
                    data={movies}
                    selectedItem={selectedMovie}
                    onSelectItem={handleSelectMovie}
                    longTextFields={["cast"]}
                    getRowKey={(movie) => movie.id}
                    showCheckbox={true} // ✅ 체크박스 활성화
                    selectedIds={selectedMovieIds} // ✅ 선택 상태 연결
                    onSelectionChange={onSelectionChange} // ✅ 변경 핸들러
                    formatCell={(key, value) => {
                        if (key === "is_primary_movie" || key === "is_finalized" || key === "is_public")
                            return value ? "Y" : "N";
                        if ((key === "distributor" || key === "production_company") && value) {
                            return value.client_name || "";
                        }
                        return value ?? "";
                    }}
                    onSortChange={handleSortChange}
                    sortKey={sortKey}
                    sortOrder={sortOrder}
                    page={page}
                    pageSize={pageSize}
                    totalCount={totalCount}
                    onPageChange={handlePageChange}
                />
            </TableWrapper>
        </ListContainer>
    );
}
