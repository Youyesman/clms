import { useState, useEffect } from "react";
import styled from "styled-components";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomSelect } from "../../../components/common/CustomSelect";
import { CustomButton } from "../../../components/common/CustomButton";
import { AutocompleteInputClient } from "../../../components/common/AutocompleteInputClient";
import { FloppyDisk, Printer } from "@phosphor-icons/react";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { CommonListHeader } from "../../../components/common/CommonListHeader";

/** 1. 스타일 정의 **/
const DetailContainer = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: #ffffff;
    border: 1px solid #94a3b8;
    border-radius: 4px;
    overflow: hidden;
`;


// ... (rest of styled components)
const ScrollBody = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px; /* 필드 간 간격 */

    &::-webkit-scrollbar {
        width: 6px;
    }
    &::-webkit-scrollbar-track {
        background: #f8fafc;
    }
    &::-webkit-scrollbar-thumb {
        background: #94a3b8;
        border-radius: 10px;
    }
`;

const FormGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
`;

const SectionTitle = styled.div`
    font-size: 13px;
    font-weight: 800;
    color: #475569;
    margin-top: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e2e8f0;
`;

const EmptyState = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    color: #94a3b8;
    font-weight: 600;
    font-size: 14px;
    margin-top: 100px;
`;

/** 2. 메인 컴포넌트 **/
export function MovieDetail({
    selectedMovie,
    formData,
    setFormData,
    handleInputChange,
    handleUpdateMovie,
    onMovieCreated,
}) {
    const toast = useToast();
    const [distributorInput, setDistributorInput] = useState("");
    const [productionCompanyInput, setProductionCompanyInput] = useState("");

    // 공통 필드 업데이트 함수
    const updateField = (name: string, value: any) => {
        handleInputChange({ target: { name, value } });
    };

    /** ✅ 한글 제목 자동 생성 로직 (괄호 속성 추가) **/
    useEffect(() => {
        if (!formData.title_ko && !selectedMovie) return;

        // 순서: 1.필름/디지털 2.자막/더빙 3.2D/3D/4D 5.4DX 4.IMAX/LASER 6.IMAX-L 7.SCREEN X
        const suffixParts = [
            formData.media_type, // 1
            formData.audio_mode, // 2
            formData.viewing_dimension, // 3
            formData.dx4_viewing_dimension, // 5 (4DX)
            formData.screening_type, // 4 (IMAX/LASER)
            formData.imax_l, // 6
            formData.screen_x, // 7
        ].filter(Boolean);

        const baseTitle = (formData.title_ko || "").split("(")[0].trim();
        if (!baseTitle) return;

        const suffix = suffixParts.length > 0 ? ` (${suffixParts.join(" ")})` : "";
        const newTitleKo = `${baseTitle}${suffix}`;

        if (newTitleKo !== formData.title_ko) {
            setFormData((prev) => ({
                ...prev,
                title_ko: newTitleKo,
            }));
        }
    }, [
        formData.media_type,
        formData.audio_mode,
        formData.viewing_dimension,
        formData.dx4_viewing_dimension,
        formData.screening_type,
        formData.imax_l,
        formData.screen_x,
    ]);

    const handleCreatePrintMovie = () => {
        if (!formData.movie_code) {
            toast.error("대표 영화의 영화 코드가 필요합니다.");
            return;
        }

        // 새 영화 객체 생성
        const newPrintMovie = {
            ...formData,
            id: undefined,
            is_primary_movie: false,
            primary_movie_code: formData.movie_code,
            movie_code: `${formData.movie_code}_${Date.now().toString().slice(-4)}`,
            distributor: formData.distributor?.id || null,
            production_company: formData.production_company?.id || null,
        };

        AxiosPost("movies", newPrintMovie)
            .then((res) => {
                toast.success(`프린트 영화 '${formData.title_ko}'가 생성되었습니다.`);
                if (onMovieCreated) onMovieCreated(res.data);
            })
            .catch((error) => toast.error(handleBackendErrors(error)));
    };

    if (!selectedMovie) {
        return (
            <DetailContainer>
                <CommonListHeader title="영화 정보" />
                <EmptyState>목록에서 영화를 선택하세요.</EmptyState>
            </DetailContainer>
        );
    }

    const LABEL_WIDTH = "90px"; // 라벨 정렬 너비 통일

    return (
        <DetailContainer>
            <CommonListHeader
                title="영화 상세 정보"
                actions={
                    <>
                        {formData.is_primary_movie && (
                            <CustomButton onClick={handleCreatePrintMovie} size="sm">프린트 영화 생성</CustomButton>
                        )}
                        <CustomIconButton onClick={handleUpdateMovie} title="저장">
                            <FloppyDisk size={16} />
                        </CustomIconButton>
                    </>
                }
            />

            <ScrollBody>
                <SectionTitle>기본 정보</SectionTitle>
                <FormGrid>
                    <CustomInput
                        label="영화 코드"
                        value={formData.movie_code || ""}
                        setValue={(v) => updateField("movie_code", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                    <CustomSelect
                        label="대표 영화"
                        options={[
                            { label: "Y", value: true },
                            { label: "N", value: false },
                        ]}
                        value={formData.is_primary_movie}
                        onChange={(v) => updateField("is_primary_movie", v)}
                        labelWidth={LABEL_WIDTH}
                        allowClear={false}
                    />
                </FormGrid>

                <FormGrid>
                    <CustomInput
                        label="대표 영화 코드"
                        value={formData.primary_movie_code || ""}
                        setValue={(v) => updateField("primary_movie_code", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                </FormGrid>

                <CustomInput
                    label="한글 제목"
                    value={formData.title_ko || ""}
                    setValue={(v) => updateField("title_ko", v)}
                    labelWidth={LABEL_WIDTH}
                />
                <CustomInput
                    label="영어 제목"
                    value={formData.title_en || ""}
                    setValue={(v) => updateField("title_en", v)}
                    labelWidth={LABEL_WIDTH}
                />

                <FormGrid>
                    <CustomInput
                        label="상영 시간(분)"
                        inputType="number"
                        value={formData.running_time_minutes || ""}
                        setValue={(v) => updateField("running_time_minutes", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                    <CustomInput
                        label="관람 등급"
                        value={formData.rating || ""}
                        setValue={(v) => updateField("rating", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                </FormGrid>

                <SectionTitle>제작 및 출연</SectionTitle>
                {/* 오토컴플리트 필드는 래퍼가 필요할 수 있음 (기존 컴포넌트 유지) */}
                <FormGrid>
                    <AutocompleteInputClient
                        label="배급사"
                        type="distributor"
                        formData={formData}
                        setFormData={setFormData}
                        placeholder="배급사 검색"
                        inputValue={distributorInput}
                        setInputValue={setDistributorInput}
                    />

                    <AutocompleteInputClient
                        label="제작사"
                        type="production_company"
                        formData={formData}
                        setFormData={setFormData}
                        placeholder="제작사 검색"
                        inputValue={productionCompanyInput}
                        setInputValue={setProductionCompanyInput}
                    />
                </FormGrid>

                <FormGrid>
                    <CustomInput
                        label="장르"
                        value={formData.genre || ""}
                        setValue={(v) => updateField("genre", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                    <CustomInput
                        label="국가"
                        value={formData.country || ""}
                        setValue={(v) => updateField("country", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                </FormGrid>
                <FormGrid>
                    <CustomInput
                        label="감독"
                        value={formData.director || ""}
                        setValue={(v) => updateField("director", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                    <CustomInput
                        label="배우"
                        value={formData.cast || ""}
                        setValue={(v) => updateField("cast", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                </FormGrid>

                <SectionTitle>상영 및 일정</SectionTitle>
                <FormGrid>
                    <CustomInput
                        label="개봉일"
                        inputType="date"
                        value={formData.release_date || ""}
                        setValue={(v) => updateField("release_date", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                    <CustomInput
                        label="종료일"
                        inputType="date"
                        value={formData.end_date || ""}
                        setValue={(v) => updateField("end_date", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                </FormGrid>

                <FormGrid>
                    <CustomSelect
                        label="필름/디지털"
                        options={["필름", "디지털"]}
                        value={formData.media_type}
                        onChange={(v) => updateField("media_type", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                    <CustomSelect
                        label="자막/더빙"
                        options={["자막", "더빙", "영어자막", "한글자막"]}
                        value={formData.audio_mode}
                        onChange={(v) => updateField("audio_mode", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                </FormGrid>

                <FormGrid>
                    <CustomSelect
                        label="2D/3D/4D"
                        options={["2D", "3D", "4D"]}
                        value={formData.viewing_dimension}
                        onChange={(v) => updateField("viewing_dimension", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                    <CustomSelect
                        label="IMAX/LASER"
                        options={["IMAX", "ATMOS"]}
                        value={formData.screening_type}
                        onChange={(v) => updateField("screening_type", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                </FormGrid>
                <FormGrid>
                    <CustomSelect
                        label="4DX"
                        options={["4-DX", "Super-4D", "Dolby", "광음시네마", "MX4D"]}
                        value={formData.dx4_viewing_dimension}
                        onChange={(v) => updateField("dx4_viewing_dimension", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                    <CustomSelect
                        label="IMAX-L"
                        options={["LASER"]}
                        value={formData.imax_l}
                        onChange={(v) => updateField("imax_l", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                </FormGrid>
                <FormGrid>
                    <CustomSelect
                        label="Screen X"
                        options={["ScreenX"]}
                        value={formData.screen_x}
                        onChange={(v) => updateField("screen_x", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                </FormGrid>

                <FormGrid>
                    <CustomSelect
                        label="마감 여부"
                        options={[
                            { label: "Y", value: true },
                            { label: "N", value: false },
                        ]}
                        value={formData.is_finalized}
                        onChange={(v) => updateField("is_finalized", v)}
                        labelWidth={LABEL_WIDTH}
                        allowClear={false}
                    />
                    <CustomInput
                        label="마감 완료일"
                        inputType="date"
                        value={formData.closure_completed_date || ""}
                        setValue={(v) => updateField("closure_completed_date", v)}
                        labelWidth={LABEL_WIDTH}
                    />
                </FormGrid>
            </ScrollBody>
        </DetailContainer>
    );
}
