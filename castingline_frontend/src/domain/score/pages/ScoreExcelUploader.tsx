import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { CloudArrowUp, WarningCircle, CheckCircle, FunnelIcon, MinusCircle } from "@phosphor-icons/react";
import { AxiosPost } from "../../../axios/Axios";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { useToast } from "../../../components/common/CustomToast";
import { useGlobalModal } from "../../../hooks/useGlobalModal";

/* ---------------- Styled Components ---------------- */

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 10px;
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

const TotalRow = styled.tr`
    background-color: #f8fafc;
    font-weight: 800;
    td {
        border-top: 2px solid #64748b !important;
        color: #0f172a;
    }
`;

/* ---------------- Main Component ---------------- */

export function ScoreExcelUploader({ onUploadSuccess }: { onUploadSuccess: () => void }) {
    const toast = useToast();
    const { closeModal } = useGlobalModal()
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [dragging, setDragging] = useState(false);
    const [loading, setLoading] = useState(false);

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

    const handleFileProcess = async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        setLoading(true);
        try {
            const res = await AxiosPost("score/preview_upload", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setPreviewData(res.data.data);
            toast.info("분석이 완료되었습니다. 마이너스 관객 및 에러를 확인하세요.");
        } catch (err: any) {
            toast.error(handleBackendErrors(err));
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmSave = async () => {
        setLoading(true);
        try {
            await AxiosPost("score/confirm_save", { data: previewData });
            toast.success("데이터가 성공적으로 저장되었습니다.");
            onUploadSuccess();
            closeModal()
        } catch (err: any) {
            toast.error(handleBackendErrors(err));
        } finally {
            setLoading(false);
        }
    };

    const hasMatchError = previewData.some((d) => !d.is_matched);

    return (
        <Container>
            {previewData.length === 0 ? (
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
                        input.onchange = (e: any) => handleFileProcess(e.target.files[0]);
                        input.click();
                    }}>
                    <CloudArrowUp size={48} weight="duotone" color="#2563eb" />
                    <div style={{ fontWeight: 700 }}>
                        {loading ? "분석 중..." : "엑셀 파일을 드래그하거나 클릭하여 업로드하세요."}
                    </div>
                </DropZone>
            ) : (
                <>
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

                    <ActionFooter>
                        <button onClick={() => setPreviewData([])} style={{ padding: "8px 16px", cursor: "pointer" }}>
                            다시 업로드
                        </button>
                        <button
                            disabled={loading || hasMatchError}
                            onClick={handleConfirmSave}
                            style={{
                                padding: "8px 24px",
                                background: hasMatchError ? "#cbd5e1" : "#2563eb",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                fontWeight: 800,
                                cursor: hasMatchError ? "not-allowed" : "pointer",
                            }}>
                            {loading ? "저장 중..." : `${previewData.length}건 확정 저장`}
                        </button>
                    </ActionFooter>
                    {hasMatchError && (
                        <div style={{ color: "#ef4444", fontSize: "12px", textAlign: "right" }}>
                            ※ 매칭되지 않은 데이터(빨간색 행)가 있으면 저장할 수 없습니다.
                        </div>
                    )}
                </>
            )}
        </Container>
    );
}