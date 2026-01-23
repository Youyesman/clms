import { useState, useRef, useEffect, useCallback } from "react";
import { Editor } from "@toast-ui/react-editor";
import "@toast-ui/editor/dist/toastui-editor.css";
import styled from "styled-components";
import { AddOrderModal } from "./AddOrderModal";
import { AxiosDelete, AxiosGet, AxiosPatch, AxiosPost } from "../../../axios/Axios";
import { GenericTable } from "../../../components/GenericTable";
import { Modal } from "../../../components/common/Modal";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { Plus, Trash, PencilSimpleLine } from "@phosphor-icons/react";
import { useToast } from "../../../components/common/CustomToast";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { CustomInput } from "../../../components/common/CustomInput";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { AutocompleteInputMovie } from "../../../components/common/AutocompleteInputMovie";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";

/** 1. 스타일 정의 **/

const FilterGroup = styled.div`
    display: flex; align-items: center; gap: 8px;
    .label { font-size: 12px; font-weight: 700; color: #475569; white-space: nowrap; }
`;


const ContentWrapper = styled.div`
    display: flex;
    flex: 1;
    overflow: hidden;
`;

const TableSection = styled.div`
    flex: 1;
    border-right: 1px solid #e2e8f0;
    overflow: hidden;
`;

const RemarkSection = styled.div`
    width: 400px;
    display: flex;
    flex-direction: column;
    background-color: #f8fafc;

    .remark-header {
        padding: 10px 16px;
        font-size: 12px;
        font-weight: 800;
        color: #475569;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: #ffffff;
    }

    .remark-content {
        flex: 1;
        padding: 16px;
        font-size: 13px;
        color: #1e293b;
        line-height: 1.6;
        overflow-y: auto;

        /* HTML 콘텐츠 스타일 초기화 */
        p {
            margin-bottom: 8px;
        }
    }
`;

/** 2. 메인 컴포넌트 **/
export function OrderList({ orderList, setOrderList, selectedOrderList, setSelectedOrderList, handleSelectOrderList }) {
    const toast = useToast();
    const { openModal, closeModal } = useGlobalModal();
    const [filterYear, setFilterYear] = useState("");
    const [searchMovie, setSearchMovie] = useState<any>({ movie: null });
    const [movieInputValue, setMovieInputValue] = useState("");
    const [formData, setFormData] = useState({
        start_date: "",
        movie: { title_ko: "" },
    });
    const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const editorRef = useRef<Editor>(null);

    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [totalCount, setTotalCount] = useState(0);

    const headers = [
        { key: "start_date", label: "기준일자", editable: true },
        { key: "movie", label: "영화" },
        { key: "distributor", label: "배급사" },
        { key: "production_company", label: "제작사" },
        { key: "release_date", label: "개봉일" },
        { key: "end_date", label: "종영일" },
        { key: "movie_code", label: "영화코드" },
    ];

    useEffect(() => {
        fetchSortedOrderList(sortKey, sortOrder, page);
    }, [sortKey, sortOrder, page]);

    const onClickSearch = () => {
        setPage(1);
        fetchSortedOrderList(sortKey, sortOrder, 1);
    };

    const fetchSortedOrderList = useCallback((key: string | null, order: "asc" | "desc", currentPage: number) => {
        const ordering = key ? `${order === "asc" ? "" : "-"}${key}` : "";

        // 검색 파라미터 구성
        const params = new URLSearchParams({
            ordering,
            page: String(currentPage),
            page_size: String(pageSize),
            year_after: filterYear, // 백엔드 필터셋에 정의된 이름
            movie_id: searchMovie.movie?.id || "", // 오토컴플리트에서 선택된 ID
        });

        AxiosGet(`orderlist/?${params.toString()}`)
            .then((res) => {
                setOrderList(res.data.results);
                setTotalCount(res.data.count);
            })
            .catch((error: any) => {
                toast.error(handleBackendErrors(error));
            });
    }, [filterYear, searchMovie.movie?.id]); // 필터 값이 변하면 함수 재생성
    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > Math.ceil(totalCount / pageSize)) return;
        setPage(newPage);
        fetchSortedOrderList(sortKey, sortOrder, newPage);
    };

    const handleSortChange = (key: string) => {
        let newOrder: "asc" | "desc" = sortKey === key && sortOrder === "asc" ? "desc" : "asc";
        setSortKey(key);
        setSortOrder(newOrder);
        fetchSortedOrderList(key, newOrder, 1);
    };

    const handleAddOrderList = (newOrder: any) => {
        const payload = { start_date: newOrder.start_date, movie: newOrder.movie.id };
        AxiosPost("orderlist", payload)
            .then((res) => {
                setOrderList((prev: any[]) => [res.data, ...prev]);
                setSelectedOrderList(res.data);
                toast.success("오더가 추가되었습니다.");
                setIsModalOpen(false);
            })
            .catch((error: any) => {
                const errorMessage = handleBackendErrors(error);
                toast.error(`${errorMessage}`);
            });
    };

    const handleDeleteOrderList = (id: number) => {
        if (!window.confirm("정말 삭제하시겠습니까?")) return;
        AxiosDelete(`orderlist`, id)
            .then(() => {
                setOrderList((prev: any[]) => prev.filter((item) => item.id !== id));
                setSelectedOrderList(null);
                toast.success("삭제되었습니다.");
            })
            .catch((error: any) => {
                const errorMessage = handleBackendErrors(error);
                toast.error(`${errorMessage}`);
            });
    };

    const handleUpdateCell = (item: any, key: string, value: any) => {
        AxiosPatch("orderlist", { [key]: value }, item.id)
            .then((res) => {
                setOrderList((prev: any[]) => prev.map((order) => (order.id === item.id ? res.data : order)));
                if (selectedOrderList?.id === item.id) setSelectedOrderList(res.data);
                toast.success("저장되었습니다.");
            })
            .catch((error: any) => {
                const errorMessage = handleBackendErrors(error);
                toast.error(`${errorMessage}`);
            });
    };

    const handleEditorSave = () => {
        if (editorRef.current && selectedOrderList) {
            const updatedRemark = editorRef.current.getInstance().getHTML();
            handleUpdateCell(selectedOrderList, "remark", updatedRemark);
        }
        setIsEditorModalOpen(false);
    };

    return (
        <>
            <CommonFilterBar onSearch={onClickSearch}>
                <FilterGroup>
                    <div className="label">개봉년도 (이상):</div>
                    <CustomInput
                        size="sm"
                        placeholder="YYYY"
                        value={filterYear}
                        setValue={setFilterYear}
                        style={{ width: "80px" }}
                    />
                </FilterGroup>
                <FilterGroup style={{ flex: 1, maxWidth: "400px" }}>
                    <div className="label">영화명 검색:</div>
                    <AutocompleteInputMovie
                        placeholder="영화 제목 검색..."
                        formData={searchMovie}
                        setFormData={setSearchMovie}
                        inputValue={movieInputValue}
                        setInputValue={setMovieInputValue}
                    />
                </FilterGroup>
            </CommonFilterBar>

            <CommonSectionCard>
                <CommonListHeader
                    title="오더 목록"
                    actions={
                        <>
                            <CustomIconButton
                                color="blue"
                                onClick={() =>
                                    openModal(
                                        <AddOrderModal
                                            onSave={(submittedData) => {
                                                handleAddOrderList(submittedData); // 저장 로직 실행
                                                closeModal(); // 모달 닫기
                                            }}
                                            onClose={closeModal} // 취소 버튼용
                                        />,
                                        { width: "500px", title: "오더 목록 추가" }
                                    )
                                }
                                title="추가">
                                <Plus weight="bold" />
                            </CustomIconButton>
                            <CustomIconButton
                                color="red"
                                disabled={!selectedOrderList}
                                onClick={() => handleDeleteOrderList(selectedOrderList.id)}
                                title="삭제">
                                <Trash weight="bold" />
                            </CustomIconButton>
                        </>
                    }
                />
            <ContentWrapper>
                <TableSection>
                    <GenericTable
                        headers={headers}
                        data={orderList}
                        selectedItem={selectedOrderList}
                        onSelectItem={handleSelectOrderList}
                        getRowKey={(item) => item.id}
                        formatCell={(key, value, row) => {
                            const movie = row.movie;
                            if (key === "distributor") return movie?.distributor?.client_name ?? "";
                            if (key === "production_company") return movie?.production_company?.client_name ?? "";
                            if (key === "movie") return movie?.title_ko ?? "";
                            if (key === "movie_code") return movie?.movie_code ?? "";
                            if (key === "release_date") return movie?.release_date ?? "";
                            if (key === "end_date") return movie?.end_date ?? "";
                            return value ?? "";
                        }}
                        onUpdateCell={handleUpdateCell}
                        onSortChange={handleSortChange}
                        sortKey={sortKey}
                        sortOrder={sortOrder}
                        page={page}
                        pageSize={pageSize}
                        totalCount={totalCount}
                        onPageChange={handlePageChange}
                    />
                </TableSection>

                <RemarkSection>
                    <div className="remark-header">
                        비고 (REMARK)
                        <CustomIconButton
                            size={14}
                            disabled={!selectedOrderList}
                            onClick={() => setIsEditorModalOpen(true)}>
                            <PencilSimpleLine weight="bold" />
                        </CustomIconButton>
                    </div>
                    <div className="remark-content">
                        {selectedOrderList ? (
                            <div dangerouslySetInnerHTML={{ __html: selectedOrderList.remark || "<i>내용 없음</i>" }} />
                        ) : (
                            <span style={{ color: "#94a3b8" }}>목록을 선택하세요.</span>
                        )}
                    </div>
                </RemarkSection>
            </ContentWrapper>

            <Modal
                isOpen={isEditorModalOpen}
                onClose={() => setIsEditorModalOpen(false)}
                width="800px"
                title="Remark 편집">
                <Editor
                    ref={editorRef}
                    initialValue={selectedOrderList?.remark || ""}
                    previewStyle="vertical"
                    height="400px"
                    initialEditType="wysiwyg"
                    useCommandShortcut={true}
                />
                <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                    <button className="button" onClick={handleEditorSave}>
                        저장
                    </button>
                    <button className="button gray" onClick={() => setIsEditorModalOpen(false)}>
                        취소
                    </button>
                </div>
            </Modal>
            </CommonSectionCard>
        </>
    );
}
