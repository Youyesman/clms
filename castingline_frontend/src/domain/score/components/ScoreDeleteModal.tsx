import React, { useState } from "react";
import styled from "styled-components";
import { AxiosPost } from "../../../axios/Axios";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { useToast } from "../../../components/common/CustomToast";
import { useAppAlert } from "../../../atom/alertUtils";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { CustomInput } from "../../../components/common/CustomInput";
import { AutocompleteInputMovie } from "../../../components/common/AutocompleteInputMovie";

/**
 * 스코어 일괄 삭제 박스 (A001).
 * 상영일(시작~종료)과 영화를 고르면, 해당 수집처의 멀티에 등록된 스코어만 삭제한다.
 * 예) [씨네큐 스코어]에서 열면 씨네큐 극장들의 스코어만 지운다.
 */

const Box = styled.div`
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 420px;
`;

const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
`;

const Notice = styled.div`
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 12px;
    color: #b91c1c;
    line-height: 1.6;
`;

const Footer = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
`;

const Button = styled.button<{ $danger?: boolean }>`
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid ${(p) => (p.$danger ? "#dc2626" : "#cbd5e1")};
    background: ${(p) => (p.$danger ? "#dc2626" : "#fff")};
    color: ${(p) => (p.$danger ? "#fff" : "#334155")};
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

export function ScoreDeleteModal({
    multis = [],
    excludeMultis = [],
    scopeLabel,
    sourceLabel,
    onDeleted,
}: {
    /** 이 화면이 담당하는 멀티(theater_kind) 목록. 비우면 전체 멀티 */
    multis?: string[];
    /** 반대로 제외할 멀티 (KOBIS·일반극장 화면: 체인 4사 제외) */
    excludeMultis?: string[];
    /** 안내 문구에 쓸 대상 표기 (예: "메가박스", "체인 제외 일반극장") */
    scopeLabel?: string;
    /** 안내 문구에 쓰는 수집처 이름 (예: "씨네큐 스코어") */
    sourceLabel: string;
    onDeleted?: () => void;
}) {
    const toast = useToast();
    const { showAlert } = useAppAlert();
    const { closeModal } = useGlobalModal();

    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [movieForm, setMovieForm] = useState<any>({ movie: null });
    const [movieInput, setMovieInput] = useState("");
    const [loading, setLoading] = useState(false);

    const movie = movieForm.movie;
    const canDelete = !!(dateFrom && dateTo && movie?.id);
    const targetLabel =
        scopeLabel ||
        (multis.length
            ? multis.join(", ")
            : excludeMultis.length
                ? `${excludeMultis.join("·")} 제외 극장`
                : "전체 멀티");

    const handleDelete = () => {
        if (!canDelete) {
            toast.warning("상영일(시작·종료)과 영화를 모두 선택해주세요.");
            return;
        }
        const scopeText = `[${targetLabel}]`;
        showAlert(
            "스코어를 삭제할까요?",
            `${scopeText} ${movie.title_ko} — ${dateFrom} ~ ${dateTo} 의 등록된 스코어가 삭제됩니다. ` +
            `삭제된 데이터는 복구할 수 없습니다.`,
            "warning",
            async () => {
                setLoading(true);
                try {
                    const res = await AxiosPost("score/delete", {
                        movie_id: movie.id,
                        date_from: dateFrom,
                        date_to: dateTo,
                        multis,
                        exclude_multis: excludeMultis,
                    });
                    toast.success(res.data?.message || "삭제되었습니다.");
                    onDeleted?.();
                    closeModal();
                } catch (err) {
                    toast.error(handleBackendErrors(err));
                } finally {
                    setLoading(false);
                }
            },
            true
        );
    };

    return (
        <Box>
            <Notice>
                {sourceLabel}이(가) 담당하는 <b>{targetLabel}</b>의 스코어만 삭제합니다.
                아래 상영일 구간과 영화에 해당하는 CLMS 등록 스코어가 모두 지워집니다.
            </Notice>

            <Row>
                <CustomInput
                    label="상영일 시작"
                    inputType="date"
                    value={dateFrom}
                    setValue={setDateFrom}
                />
                <CustomInput
                    label="상영일 종료"
                    inputType="date"
                    value={dateTo}
                    setValue={setDateTo}
                />
            </Row>

            <Row>
                <AutocompleteInputMovie
                    label="영화"
                    placeholder="영화명 검색..."
                    formData={movieForm}
                    setFormData={setMovieForm}
                    inputValue={movieInput}
                    setInputValue={setMovieInput}
                />
            </Row>

            <Footer>
                <Button onClick={closeModal} disabled={loading}>취소</Button>
                <Button $danger onClick={handleDelete} disabled={loading || !canDelete}>
                    {loading ? "삭제 중..." : "스코어 삭제"}
                </Button>
            </Footer>
        </Box>
    );
}

export default ScoreDeleteModal;
