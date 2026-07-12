import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { CloudArrowUp, WarningCircle, CheckCircle, FunnelIcon, MinusCircle } from "@phosphor-icons/react";
import { AxiosPost } from "../../../axios/Axios";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { useToast } from "../../../components/common/CustomToast";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { useAppAlert } from "../../../atom/alertUtils";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { AutocompleteInputMovie } from "../../../components/common/AutocompleteInputMovie";
import { TheaterQuickEdit } from "./TheaterQuickEdit";
import { ClientMappingQuickEdit } from "./ClientMappingQuickEdit";

/* ---------------- Styled Components ---------------- */

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 10px;
    position: relative;
`;

const DropZone = styled.div<{ $isDragging: boolean }>`
    height: 180px;
    border: 2px dashed ${({ $isDragging }) => ($isDragging ? "#2563eb" : "#cbd5e1")};
    background-color: ${({ $isDragging }) => ($isDragging ? "#eff6ff" : "#f8fafc")};
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    cursor: pointer;
    &:hover {
        border-color: #94a3b8;
    }
`;

const PreviewWrapper = styled.div`
    max-height: 450px;
    overflow-y: auto;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
`;

const PreviewTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    thead {
        position: sticky;
        top: 0;
        background: #f1f5f9;
        z-index: 10;
    }
    th, td {
        padding: 8px;
        border: 1px solid #e2e8f0;
        text-align: left;
    }
    /* 매칭 에러 행 */
    tr.error {
        background-color: #fff1f2;
    }
    /* ✅ 마이너스 관객 행 강조 */
    tr.minus-error {
        background-color: #fef2f2; 
        border-left: 4px solid #ef4444; 
    }
`;

const FilterBar = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 4px;
    margin-bottom: 8px;
    font-size: 13px;
    color: #475569;

    .filter-group {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    input[type="checkbox"] {
        cursor: pointer;
        width: 16px;
        height: 16px;
    }

    label {
        cursor: pointer;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 4px;
    }
`;

const ActionFooter = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 10px;
`;

const ErrorText = styled.span`
    color: #ef4444;
    font-size: 11px;
    font-weight: 700;
`;

const FixButton = styled.button`
    margin-left: 6px;
    padding: 1px 6px;
    font-size: 10.5px;
    font-weight: 800;
    color: #ffffff;
    background: #ef4444;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
    &:hover { background: #dc2626; }
`;

const ErrorBanner = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #fef2f2;
    border: 1px solid #fca5a5;
    border-left: 4px solid #ef4444;
    border-radius: 4px;
    color: #dc2626;
    font-size: 13px;
    font-weight: 800;
`;

const TotalRow = styled.tr`
    background-color: #f8fafc;
    font-weight: 800;
    td {
        border-top: 2px solid #64748b !important;
        color: #0f172a;
    }
`;

const OrderSection = styled.div`
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    overflow: hidden;
`;

const OrderHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    font-size: 13px;
    font-weight: 800;
    color: #0f172a;

    .counts {
        display: flex;
        gap: 8px;
        font-size: 11px;
        font-weight: 700;
    }
`;

const OrderBadge = styled.span<{ $kind: "create" | "update" | "unchanged" }>`
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 800;
    white-space: nowrap;
    background: ${({ $kind }) =>
        $kind === "create" ? "#ecfdf5" : $kind === "update" ? "#eff6ff" : "#f1f5f9"};
    color: ${({ $kind }) =>
        $kind === "create" ? "#059669" : $kind === "update" ? "#2563eb" : "#64748b"};
    border: 1px solid
        ${({ $kind }) =>
            $kind === "create" ? "#a7f3d0" : $kind === "update" ? "#bfdbfe" : "#e2e8f0"};
`;

const OrderTableWrap = styled.div`
    max-height: 220px;
    overflow-y: auto;
`;

const StyledButton = styled.button<{ $primary?: boolean; $disabled?: boolean }>`
    padding: 8px ${({ $primary }) => ($primary ? "24px" : "16px")};
    background: ${({ $primary, $disabled }) => ($disabled ? "#cbd5e1" : $primary ? "#2563eb" : "#ffffff")};
    color: ${({ $primary }) => ($primary ? "#ffffff" : "#475569")};
    border: ${({ $primary }) => ($primary ? "none" : "1px solid #cbd5e1")};
    border-radius: 4px;
    font-weight: 800;
    font-size: 13px;
    cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
    transition: all 0.2s;
    &:hover:not(:disabled) {
        opacity: 0.9;
    }
`;

const ALLOWED_EXTENSIONS = [".xlsx", ".xls"];

/* ---------------- Main Component ---------------- */

export function ScoreExcelUploader({
    onUploadSuccess,
    initialFile = null,
}: {
    onUploadSuccess: () => void;
    initialFile?: File | null;
}) {
    const toast = useToast();
    const { closeModal } = useGlobalModal();
    const { showAlert } = useAppAlert();
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [dragging, setDragging] = useState(false);
    const [loading, setLoading] = useState(false);

    // 재검사를 위해 업로드한 파일 보관 + 관 정보 인라인 수정 대상
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [editingTheater, setEditingTheater] = useState<
        { clientId: number; clientName: string; rawAud: string } | null
    >(null);
    // 등록 안 된 극장 매핑(영진위 극장명 등록) 대상
    const [editingClient, setEditingClient] = useState<{ rawClientName: string } | null>(null);

    // 영진위(일반극장) 업로드용 영화 선택 (파일에 영화명이 없어 직접 지정)
    const [movieForm, setMovieForm] = useState<{ movie: { id?: string; title_ko: string } }>({
        movie: { title_ko: "" },
    });
    const [movieInput, setMovieInput] = useState("");

    // 필터 상태
    const [showOnlyErrors, setShowOnlyErrors] = useState(false);
    const [showMinusOnly, setShowMinusOnly] = useState(false);

    // ✅ 필터링된 데이터 계산 (관객수 마이너스 기준)
    const visibleData = useMemo(() => {
        let filtered = previewData;
        if (showOnlyErrors) filtered = filtered.filter((d) => !d.is_matched);
        if (showMinusOnly) filtered = filtered.filter((d) => (parseInt(d.visitor) || 0) < 0);
        return filtered;
    }, [previewData, showOnlyErrors, showMinusOnly]);

    // ✅ 전체 합계 계산
    const totals = useMemo(() => {
        return previewData.reduce(
            (acc, cur) => ({
                visitor: acc.visitor + (parseInt(cur.visitor) || 0),
                fare: acc.fare + (parseInt(cur.fare) || 0) * (parseInt(cur.visitor) || 0),
            }),
            { visitor: 0, fare: 0 }
        );
    }, [previewData]);

    // ✅ 마이너스 관객 데이터 개수
    const minusCount = useMemo(() =>
        previewData.filter(d => (parseInt(d.visitor) || 0) < 0).length
        , [previewData]);

    const validateFile = (file: File): boolean => {
        const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            toast.error("엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.");
            return false;
        }
        return true;
    };

    const handleFileProcess = async (file: File) => {
        if (!validateFile(file)) return;
        setUploadedFile(file); // 재검사용 보관
        const formData = new FormData();
        formData.append("file", file);
        // 영진위(일반극장) 파일은 영화를 함께 전달 (선택된 경우에만)
        if (movieForm.movie?.id) {
            formData.append("movie_id", String(movieForm.movie.id));
        }
        setLoading(true);
        try {
            const res = await AxiosPost("score/preview_upload", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setPreviewData(res.data.data);
            toast.info("분석이 완료되었습니다. 마이너스 관객 및 에러를 확인하세요.");
        } catch (err) {
            toast.error(handleBackendErrors(err));
        } finally {
            setLoading(false);
        }
    };

    // 외부(메일함 등)에서 전달된 파일이 있으면 마운트 시 자동 미리보기
    useEffect(() => {
        if (initialFile) {
            handleFileProcess(initialFile);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleConfirmSave = () => {
        showAlert(
            `${previewData.length}건의 데이터를 저장하시겠습니까?`,
            "저장 후에는 기존 데이터에 반영됩니다.",
            "warning",
            async () => {
                setLoading(true);
                try {
                    const res = await AxiosPost("score/confirm_save", { data: previewData });
                    toast.success(res.data?.message || "데이터가 성공적으로 저장되었습니다.");
                    const skippedMovies: string[] = res.data?.rates_skipped_no_country || [];
                    if (skippedMovies.length > 0) {
                        toast.error(
                            `국가 미지정으로 부율이 생성되지 않은 영화: ${skippedMovies.join(", ")} — 영화관리에서 국가 입력 후 다시 확정 저장하면 생성됩니다.`
                        );
                    }
                    onUploadSuccess();
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

    // 매칭된(영화+극장) 행 수
    const matchedCount = useMemo(() => previewData.filter((d) => d.is_matched).length, [previewData]);

    // 오더 생성 대상 = 매칭된 행의 고유 (극장+영화) 조합 수 (오더는 조합당 1건)
    const orderTargetCount = useMemo(() => {
        const keys = new Set<string>();
        previewData.forEach((d) => {
            if (d.is_matched && d.client_id && d.movie_id) keys.add(`${d.client_id}_${d.movie_id}`);
        });
        return keys.size;
    }, [previewData]);

    // 오더 생성 미리보기 (어떤 오더가 신규/갱신될지 dry-run으로 조회)
    const [orderPlan, setOrderPlan] = useState<any[]>([]);
    const [orderPlanLoading, setOrderPlanLoading] = useState(false);

    useEffect(() => {
        if (previewData.length === 0) {
            setOrderPlan([]);
            return;
        }
        let cancelled = false;
        setOrderPlanLoading(true);
        AxiosPost("score/preview_order_save", { data: previewData })
            .then((res) => {
                if (!cancelled) setOrderPlan(res.data?.data || []);
            })
            .catch(() => {
                if (!cancelled) setOrderPlan([]);
            })
            .finally(() => {
                if (!cancelled) setOrderPlanLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [previewData]);

    const orderPlanCounts = useMemo(() => {
        return orderPlan.reduce(
            (acc, o) => {
                if (o.status === "create") acc.create += 1;
                else if (o.status === "update") acc.update += 1;
                else acc.unchanged += 1;
                return acc;
            },
            { create: 0, update: 0, unchanged: 0 }
        );
    }, [orderPlan]);

    // 스코어 저장 전, 업로드 내역을 바탕으로 오더(OrderList/Order)만 생성/갱신
    const handleConfirmOrders = () => {
        if (orderTargetCount === 0) {
            toast.warning("오더를 생성할 매칭된 데이터가 없습니다.");
            return;
        }
        showAlert(
            `매칭된 ${matchedCount}건으로 극장·영화 ${orderTargetCount}개 오더를 생성하시겠습니까?`,
            "극장·영화별로 오더(상영기간)가 생성/갱신됩니다. (이미 있으면 기간만 갱신) 스코어는 저장되지 않습니다.",
            "warning",
            async () => {
                setLoading(true);
                try {
                    const res = await AxiosPost("score/confirm_order_save", { data: previewData });
                    toast.success(res.data?.message || "오더가 생성되었습니다.");
                } catch (err) {
                    toast.error(handleBackendErrors(err));
                } finally {
                    setLoading(false);
                }
            },
            true
        );
    };

    const hasMatchError = previewData.some((d) => !d.is_matched);
    const errorCount = useMemo(() => previewData.filter((d) => !d.is_matched).length, [previewData]);

    // 관 정보 수정 패널 닫기: 변경이 있었으면 파일을 다시 분석해 재매칭
    const handleTheaterEditClose = (changed: boolean) => {
        setEditingTheater(null);
        if (changed && uploadedFile) {
            toast.info("관 정보가 변경되어 다시 분석합니다.");
            handleFileProcess(uploadedFile);
        }
    };

    // 극장 매핑 패널 닫기: 영진위 극장명이 등록됐으면 파일을 다시 분석해 재매칭
    const handleClientEditClose = (changed: boolean) => {
        setEditingClient(null);
        if (changed && uploadedFile) {
            toast.info("극장 매핑이 등록되어 다시 분석합니다.");
            handleFileProcess(uploadedFile);
        }
    };

    return (
        <Container>
            {previewData.length === 0 ? (
              <>
                {/* 영진위(일반극장) 파일은 영화명 컬럼이 없어 영화를 먼저 선택해야 함 */}
                <div>
                    <div style={{ width: "100%", maxWidth: "420px" }}>
                        <AutocompleteInputMovie
                            label="영화 선택"
                            formData={movieForm}
                            setFormData={setMovieForm}
                            inputValue={movieInput}
                            setInputValue={setMovieInput}
                            placeholder="영진위(일반극장) 업로드 시 영화 검색 (포맷별로 표시)"
                            labelWidth="70px"
                        />
                    </div>
                    <div style={{ marginTop: "6px", fontSize: "11px", color: "#94a3b8" }}>
                        ※ 영진위 일반극장 파일은 영화를 먼저 선택하세요. (CGV·메가박스·롯데는 자동 제외됩니다.)
                    </div>
                </div>
                <DropZone
                    $isDragging={dragging}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragging(false);
                        const file = e.dataTransfer.files[0];
                        if (file) handleFileProcess(file);
                    }}
                    onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = ".xlsx,.xls";
                        input.onchange = (e: Event) => {
                            const target = e.target as HTMLInputElement;
                            const file = target.files?.[0];
                            if (file) handleFileProcess(file);
                        };
                        input.click();
                    }}>
                    <CloudArrowUp size={48} weight="duotone" color="#2563eb" />
                    <div style={{ fontWeight: 700 }}>
                        {loading ? "분석 중..." : "엑셀 파일을 드래그하거나 클릭하여 업로드하세요."}
                    </div>
                </DropZone>
              </>
            ) : (
                <>
                    {errorCount > 0 && (
                        <ErrorBanner>
                            <WarningCircle size={20} weight="fill" />
                            에러 데이터 {errorCount}건이 있습니다. 에러를 해결해야 저장할 수 있습니다.
                        </ErrorBanner>
                    )}
                    <FilterBar>
                        <div className="filter-group">
                            {/* ✅ 마이너스 관객수 확인 필터 (왼쪽 배치) */}
                            <label style={{ color: showMinusOnly ? "#ef4444" : "inherit" }}>
                                <input
                                    type="checkbox"
                                    checked={showMinusOnly}
                                    onChange={(e) => setShowMinusOnly(e.target.checked)}
                                />
                                <MinusCircle size={18} weight={showMinusOnly ? "fill" : "bold"} />
                                마이너스 관객 확인 ({minusCount}건)
                            </label>

                            <label style={{ color: showOnlyErrors ? "#ef4444" : "inherit" }}>
                                <input
                                    type="checkbox"
                                    checked={showOnlyErrors}
                                    onChange={(e) => setShowOnlyErrors(e.target.checked)}
                                />
                                <FunnelIcon size={16} weight={showOnlyErrors ? "fill" : "bold"} />
                                에러 데이터만 보기 ({previewData.filter((d) => !d.is_matched).length}건)
                            </label>
                        </div>
                    </FilterBar>

                    <PreviewWrapper>
                        <PreviewTable>
                            <thead>
                                <tr>
                                    <th>상태</th>
                                    <th>사유</th>
                                    <th>상영일자</th>
                                    <th>영화명</th>
                                    <th>극장명</th>
                                    <th>상영관</th>
                                    <th>회차</th>
                                    <th>요금</th>
                                    <th>관객수</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleData.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                                            표시할 데이터가 없습니다.
                                        </td>
                                    </tr>
                                ) : (
                                    visibleData.map((row, idx) => {
                                        const isMinusVisitor = (parseInt(row.visitor) || 0) < 0;
                                        const isError = !row.is_matched;
                                        // 극장은 매칭됐으나 관(상영관)이 없어서 난 에러 → 인라인 관 등록 가능
                                        const isAudMissing =
                                            isError && row.client_id && String(row.match_error || "").includes("관 정보 없음");
                                        // 극장 자체가 등록 안 됨(매칭 실패) → 인라인 극장 매핑 가능
                                        const isClientMissing =
                                            isError && !row.client_id && String(row.match_error || "").includes("등록안된");

                                        return (
                                            <tr key={idx} className={`${isError ? "error" : ""} ${isMinusVisitor ? "minus-error" : ""}`}>
                                                <td style={{ textAlign: "center" }}>
                                                    {isError ? (
                                                        <WarningCircle size={18} color="#ef4444" />
                                                    ) : isMinusVisitor ? (
                                                        <MinusCircle size={18} color="#ef4444" weight="fill" />
                                                    ) : (
                                                        <CheckCircle size={18} color="#10b981" />
                                                    )}
                                                </td>
                                                <td>
                                                    <ErrorText>
                                                        {isMinusVisitor && "[마이너스 관객] "}
                                                        {row.match_error}
                                                    </ErrorText>
                                                    {isAudMissing && (
                                                        <FixButton
                                                            type="button"
                                                            onClick={() =>
                                                                setEditingTheater({
                                                                    clientId: row.client_id,
                                                                    clientName: row.client_name,
                                                                    rawAud: row.auditorium || row.display_auditorium,
                                                                })
                                                            }>
                                                            관 등록
                                                        </FixButton>
                                                    )}
                                                    {isClientMissing && (
                                                        <FixButton
                                                            type="button"
                                                            onClick={() =>
                                                                setEditingClient({ rawClientName: row.client_name })
                                                            }>
                                                            극장 매핑
                                                        </FixButton>
                                                    )}
                                                </td>
                                                <td>{row.entry_date}</td>
                                                <td>{row.movie_name}</td>
                                                <td>{row.client_name}</td>
                                                <td>{row.display_auditorium}</td>
                                                <td>{row.show_count}</td>
                                                <td>{(parseInt(row.fare) || 0).toLocaleString()}</td>
                                                {/* ✅ 관객수 텍스트 빨간색 강조 */}
                                                <td style={{
                                                    fontWeight: 700,
                                                    color: isMinusVisitor ? "#ef4444" : "#2563eb"
                                                }}>
                                                    {row.visitor}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                            <tfoot>
                                <TotalRow>
                                    <td colSpan={7} style={{ textAlign: "center" }}>전체 합계</td>
                                    <td style={{ textAlign: "right", color: "#2563eb" }}>{totals.fare.toLocaleString()}</td>
                                    <td style={{ textAlign: "right" }}>{totals.visitor.toLocaleString()}</td>
                                </TotalRow>
                            </tfoot>
                        </PreviewTable>
                    </PreviewWrapper>

                    {/* 오더 저장 미리보기: 어떤 오더가 신규/갱신될지 표시 */}
                    <OrderSection>
                        <OrderHeader>
                            <span>
                                오더 저장 미리보기
                                {orderPlanLoading ? " (계산 중...)" : ` · 총 ${orderPlan.length}건`}
                            </span>
                            <div className="counts">
                                <OrderBadge $kind="create">신규 {orderPlanCounts.create}</OrderBadge>
                                <OrderBadge $kind="update">갱신 {orderPlanCounts.update}</OrderBadge>
                                <OrderBadge $kind="unchanged">유지 {orderPlanCounts.unchanged}</OrderBadge>
                            </div>
                        </OrderHeader>
                        <OrderTableWrap>
                            <PreviewTable>
                                <thead>
                                    <tr>
                                        <th style={{ width: "70px" }}>구분</th>
                                        <th>영화명</th>
                                        <th>극장명</th>
                                        <th style={{ width: "110px" }}>시작일</th>
                                        <th style={{ width: "110px" }}>종료일</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orderPlan.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} style={{ textAlign: "center", padding: "24px", color: "#94a3b8" }}>
                                                {orderPlanLoading ? "오더 미리보기를 계산하는 중입니다..." : "생성/갱신할 오더가 없습니다."}
                                            </td>
                                        </tr>
                                    ) : (
                                        orderPlan.map((o, idx) => (
                                            <tr key={idx}>
                                                <td style={{ textAlign: "center" }}>
                                                    <OrderBadge $kind={o.status}>
                                                        {o.status === "create" ? "신규" : o.status === "update" ? "갱신" : "유지"}
                                                    </OrderBadge>
                                                </td>
                                                <td>{o.movie_name}</td>
                                                <td>{o.client_name}</td>
                                                <td>{o.start_date}</td>
                                                <td>{o.end_date}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </PreviewTable>
                        </OrderTableWrap>
                    </OrderSection>

                    <ActionFooter>
                        <StyledButton onClick={() => { setPreviewData([]); setUploadedFile(null); setEditingTheater(null); setEditingClient(null); }}>
                            다시 업로드
                        </StyledButton>
                        <StyledButton
                            $disabled={loading || orderTargetCount === 0}
                            disabled={loading || orderTargetCount === 0}
                            onClick={handleConfirmOrders}
                            title="매칭된 내역의 극장·영화 조합으로 오더(상영기간)만 생성/갱신합니다.">
                            {loading ? "처리 중..." : `오더 저장 (${orderTargetCount}건)`}
                        </StyledButton>
                        <StyledButton
                            $primary
                            $disabled={loading || hasMatchError}
                            disabled={loading || hasMatchError}
                            onClick={handleConfirmSave}>
                            {loading ? "저장 중..." : `${previewData.length}건 확정 저장`}
                        </StyledButton>
                    </ActionFooter>
                    {hasMatchError && (
                        <div style={{ color: "#ef4444", fontSize: "12px", textAlign: "right" }}>
                            ※ 매칭되지 않은 데이터(빨간색 행)가 있으면 저장할 수 없습니다.
                        </div>
                    )}
                </>
            )}

            {/* 관 정보 없음 에러 행에서 '관 등록' 클릭 시 인라인 수정 패널 */}
            {editingTheater && (
                <TheaterQuickEdit
                    clientId={editingTheater.clientId}
                    clientName={editingTheater.clientName}
                    rawAud={editingTheater.rawAud}
                    onClose={handleTheaterEditClose}
                />
            )}

            {/* 등록 안 된 극장 행에서 '극장 매핑' 클릭 시 영진위 극장명 등록 패널 */}
            {editingClient && (
                <ClientMappingQuickEdit
                    rawClientName={editingClient.rawClientName}
                    onClose={handleClientEditClose}
                />
            )}
        </Container>
    );
}