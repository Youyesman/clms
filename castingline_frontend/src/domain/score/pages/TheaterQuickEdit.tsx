import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { AxiosGet, AxiosPost, AxiosPatch } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { X, FloppyDisk, Plus } from "@phosphor-icons/react";

/* ---------------- Types ---------------- */
interface TheaterRow {
    id?: number;
    client: number;
    auditorium: string;
    seat_count: string | number;
    auditorium_name: string;
    kofic_auditorium_name?: string;
}

interface Props {
    clientId: number;
    clientName: string;
    rawAud: string; // 파일에 들어있는 관 이름 (매칭 대상)
    onClose: (changed: boolean) => void;
}

/* ---------------- Styled ---------------- */
const Overlay = styled.div`
    position: absolute;
    inset: 0;
    background: #ffffff;
    z-index: 50;
    display: flex;
    flex-direction: column;
    border-radius: 6px;
`;

const Head = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #e2e8f0;

    .title {
        font-size: 14px;
        font-weight: 800;
        color: #0f172a;
    }
    .sub {
        font-size: 12px;
        color: #64748b;
        margin-top: 2px;
    }
    .hint {
        margin-top: 4px;
        font-size: 11px;
        color: #2563eb;
    }
    .raw {
        background: #eff6ff;
        color: #1d4ed8;
        border: 1px solid #bfdbfe;
        border-radius: 4px;
        padding: 1px 6px;
        font-weight: 800;
    }
`;

const Body = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    th, td {
        border: 1px solid #e2e8f0;
        padding: 4px 6px;
        text-align: left;
    }
    thead th {
        background: #f8fafc;
        color: #475569;
        font-weight: 700;
        white-space: nowrap;
    }
    input {
        width: 100%;
        border: 1px solid #cbd5e1;
        border-radius: 3px;
        padding: 3px 5px;
        font-size: 12px;
        outline: none;
        &:focus { border-color: #2563eb; }
    }
`;

const MiniBtn = styled.button<{ $primary?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
    border: 1px solid ${({ $primary }) => ($primary ? "transparent" : "#cbd5e1")};
    background: ${({ $primary }) => ($primary ? "#2563eb" : "#ffffff")};
    color: ${({ $primary }) => ($primary ? "#ffffff" : "#475569")};
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const Foot = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #e2e8f0;
`;

const SectionLabel = styled.div`
    font-size: 12px;
    font-weight: 800;
    color: #334155;
    margin: 14px 0 6px;
`;

/* ---------------- Component ---------------- */
export function TheaterQuickEdit({ clientId, clientName, rawAud, onClose }: Props) {
    const toast = useToast();
    const [rows, setRows] = useState<TheaterRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [changed, setChanged] = useState(false);

    // 새 관 기본값: 관이름/영진위관이름을 '파일의 관 이름'과 동일하게 -> 재검사 시 매칭됨
    const numMatch = rawAud.match(/(\d+)/);
    const defaultCode = numMatch ? numMatch[1].padStart(3, "0") : "";
    const [newRow, setNewRow] = useState<TheaterRow>({
        client: clientId,
        auditorium: defaultCode,
        seat_count: 0,
        auditorium_name: rawAud,
        kofic_auditorium_name: rawAud,
    });

    const loadRows = () => {
        setLoading(true);
        AxiosGet(`theaters?client_id=${clientId}`)
            .then((res) => setRows(res.data?.results || res.data || []))
            .catch((err) => toast.error(handleBackendErrors(err)))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadRows();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId]);

    const updateRow = (idx: number, field: keyof TheaterRow, value: string) =>
        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));

    const saveRow = async (row: TheaterRow) => {
        setSaving(true);
        try {
            await AxiosPatch(`theaters/${row.id}`, row);
            toast.success("관 정보가 수정되었습니다.");
            setChanged(true);
        } catch (e) {
            toast.error(handleBackendErrors(e));
        } finally {
            setSaving(false);
        }
    };

    const addRow = async () => {
        if (!newRow.auditorium_name?.trim()) {
            toast.warning("관 이름을 입력하세요.");
            return;
        }
        setSaving(true);
        try {
            await AxiosPost("theaters", newRow);
            toast.success("관이 추가되었습니다.");
            setChanged(true);
            setNewRow({
                client: clientId,
                auditorium: defaultCode,
                seat_count: 0,
                auditorium_name: rawAud,
                kofic_auditorium_name: rawAud,
            });
            loadRows();
        } catch (e) {
            toast.error(handleBackendErrors(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Overlay>
            <Head>
                <div>
                    <div className="title">상영관(관) 정보 수정 — {clientName}</div>
                    <div className="sub">
                        파일의 관 이름: <span className="raw">{rawAud}</span>
                    </div>
                    <div className="hint">
                        ※ 관이름 또는 영진위관이름을 위 "파일의 관 이름"과 같게 등록/수정하면 다시 검사 시 매칭됩니다.
                    </div>
                </div>
                <MiniBtn onClick={() => onClose(changed)}>
                    <X size={14} weight="bold" /> 닫기
                </MiniBtn>
            </Head>

            <Body>
                <SectionLabel>등록된 관 ({rows.length})</SectionLabel>
                <Table>
                    <thead>
                        <tr>
                            <th style={{ width: "70px" }}>관코드</th>
                            <th style={{ width: "60px" }}>좌석</th>
                            <th>관이름</th>
                            <th>영진위관이름</th>
                            <th style={{ width: "60px" }}>저장</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={5} style={{ textAlign: "center", padding: "16px", color: "#94a3b8" }}>
                                    불러오는 중...
                                </td>
                            </tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={5} style={{ textAlign: "center", padding: "16px", color: "#94a3b8" }}>
                                    등록된 관이 없습니다. 아래에서 추가하세요.
                                </td>
                            </tr>
                        ) : (
                            rows.map((r, idx) => (
                                <tr key={r.id}>
                                    <td>
                                        <input value={r.auditorium || ""} onChange={(e) => updateRow(idx, "auditorium", e.target.value)} />
                                    </td>
                                    <td>
                                        <input value={String(r.seat_count ?? "")} onChange={(e) => updateRow(idx, "seat_count", e.target.value)} />
                                    </td>
                                    <td>
                                        <input value={r.auditorium_name || ""} onChange={(e) => updateRow(idx, "auditorium_name", e.target.value)} />
                                    </td>
                                    <td>
                                        <input
                                            value={r.kofic_auditorium_name || ""}
                                            placeholder="영진위 표기"
                                            onChange={(e) => updateRow(idx, "kofic_auditorium_name", e.target.value)}
                                        />
                                    </td>
                                    <td style={{ textAlign: "center" }}>
                                        <MiniBtn $primary disabled={saving} onClick={() => saveRow(r)}>
                                            <FloppyDisk size={13} weight="bold" />
                                        </MiniBtn>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </Table>

                <SectionLabel>새 관 추가</SectionLabel>
                <Table>
                    <thead>
                        <tr>
                            <th style={{ width: "70px" }}>관코드</th>
                            <th style={{ width: "60px" }}>좌석</th>
                            <th>관이름</th>
                            <th>영진위관이름</th>
                            <th style={{ width: "60px" }}>추가</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <input value={newRow.auditorium} onChange={(e) => setNewRow({ ...newRow, auditorium: e.target.value })} />
                            </td>
                            <td>
                                <input value={String(newRow.seat_count)} onChange={(e) => setNewRow({ ...newRow, seat_count: e.target.value })} />
                            </td>
                            <td>
                                <input value={newRow.auditorium_name} onChange={(e) => setNewRow({ ...newRow, auditorium_name: e.target.value })} />
                            </td>
                            <td>
                                <input
                                    value={newRow.kofic_auditorium_name || ""}
                                    onChange={(e) => setNewRow({ ...newRow, kofic_auditorium_name: e.target.value })}
                                />
                            </td>
                            <td style={{ textAlign: "center" }}>
                                <MiniBtn $primary disabled={saving} onClick={addRow}>
                                    <Plus size={13} weight="bold" />
                                </MiniBtn>
                            </td>
                        </tr>
                    </tbody>
                </Table>
            </Body>

            <Foot>
                <MiniBtn onClick={() => onClose(false)}>취소</MiniBtn>
                <MiniBtn $primary onClick={() => onClose(changed)}>
                    닫고 다시 검사
                </MiniBtn>
            </Foot>
        </Overlay>
    );
}
