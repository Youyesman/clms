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
        border-radius: 4px;
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
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
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
    color: #475569;
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
    // S002(1020): 관코드는 관이름 속 숫자(예: '부티크 102호' → 102)가 아니라
    // 해당 극장의 다음 순번(기존 최대 코드+1, 3자리)으로 채운다. 배급사 전송 규격(2자리 이하)
    // 을 넘는 100단위 코드가 생기지 않게 한다. 극장 관 목록을 불러온 뒤 채워진다.
    const [newRow, setNewRow] = useState<TheaterRow>({
        client: clientId,
        auditorium: "",
        seat_count: 0,
        auditorium_name: rawAud,
        kofic_auditorium_name: rawAud,
    });

    // 기존 관코드 중 숫자 최대값 + 1 (없으면 001)
    const nextAuditoriumCode = (list: TheaterRow[]) => {
        const nums = list
            .map((r) => parseInt(String(r.auditorium || ""), 10))
            .filter((n) => !isNaN(n) && n < 100);
        const next = (nums.length ? Math.max(...nums) : 0) + 1;
        return String(next).padStart(3, "0");
    };

    const loadRows = () => {
        setLoading(true);
        AxiosGet(`theaters?client_id=${clientId}`)
            .then((res) => {
                const list: TheaterRow[] = res.data?.results || res.data || [];
                setRows(list);
                // 사용자가 아직 코드를 입력하지 않았을 때만 다음 순번으로 채운다
                setNewRow((prev) => (prev.auditorium ? prev : { ...prev, auditorium: nextAuditoriumCode(list) }));
            })
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
                auditorium: "", // 재조회 후 다음 순번으로 다시 채워진다
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
