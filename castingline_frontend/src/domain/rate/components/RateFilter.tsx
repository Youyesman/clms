import { useState } from "react";
import styled from "styled-components";
import { AutocompleteInputMovie } from "../../../components/common/AutocompleteInputMovie";
import { AutocompleteInputClient } from "../../../components/common/AutocompleteInputClient";
import { CustomSelect } from "../../../components/common/CustomSelect";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";


/** 2. 메인 컴포넌트 **/
export function RateFilter({ formData, setFormData, handleSearch }) {
    const [movieInputValue, setMovieInputValue] = useState("");
    const [clientInputValue, setClientInputValue] = useState("");

    const updateField = (name: string, value: any) => {
        setFormData((prev: any) => ({
            ...prev,
            [name]: value,
        }));
    };

    const LABEL_WIDTH = "50px";

    return (
        <CommonFilterBar onSearch={handleSearch}>
            {/* 1. 유형 선택 — 부율은 극장에만 등록하므로 극장/배급사/제작사 대신 직영/위탁 구분으로 필터 */}
            <CustomSelect
                label="유형"
                options={[
                    { label: "전체", value: "전체" },
                    { label: "직영", value: "직영" },
                    { label: "위탁", value: "위탁" },
                    { label: "기타", value: "기타" },
                ]}
                value={formData.classification}
                onChange={(val) => updateField("classification", val)}
                labelWidth={LABEL_WIDTH}
            />

            {/* 2. 영화명 검색 */}
            <AutocompleteInputMovie
                label="영화"
                formData={formData}
                setFormData={setFormData}
                placeholder="영화명 검색"
                inputValue={movieInputValue}
                setInputValue={setMovieInputValue}
                labelWidth={LABEL_WIDTH}
            />

            {/* 3. 멀티 선택 */}
            <CustomSelect
                label="멀티"
                options={["전체", "롯데", "CGV", "메가박스", "씨네큐", "기타"]}
                value={formData.theater_kind}
                onChange={(val) => updateField("theater_kind", val)}
                labelWidth={LABEL_WIDTH}
            />

            {/* 4. 극장명 검색 */}
            <AutocompleteInputClient
                type="client"
                label="극장"
                formData={formData}
                setFormData={setFormData}
                placeholder="극장명 검색"
                inputValue={clientInputValue}
                setInputValue={setClientInputValue}
                labelWidth={LABEL_WIDTH}
            />
        </CommonFilterBar>
    );
}