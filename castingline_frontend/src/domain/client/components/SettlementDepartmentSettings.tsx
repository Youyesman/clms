import { useEffect, useState } from "react";
import styled from "styled-components";
import { Plus, Trash } from "@phosphor-icons/react";
import { AxiosGet, AxiosPost, AxiosDelete } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { useAppAlert } from "../../../atom/alertUtils";

interface IDepartment {
    id: number;
    name: string;
    sort_order: number;
    client_count: number;
}

/** 부금처 목록 관리 (거래처 관리 > 부금 정보 드롭다운의 항목을 추가/삭제) */
export const SettlementDepartmentSettings = ({ onChanged }: { onChanged?: () => void }) => {
    const toast = useToast();
    const { showAlert } = useAppAlert();

    const [departments, setDepartments] = useState<IDepartment[]>([]);
    const [loading, setLoading] = useState(false);
    const [newName, setNewName] = useState("");

    const load = async () => {
        setLoading(true);
        try {
            const res = await AxiosGet("settlement-departments/");
            setDepartments(res.data as IDepartment[]);
        } catch {
            toast.error("부금처 목록을 불러오지 못했습니다.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const addDepartment = async () => {
        if (!newName.trim()) {
            toast.error("부금처명을 입력하세요.");
            return;
        }
        try {
            await AxiosPost("settlement-departments", { name: newName.trim() });
            toast.success("부금처를 추가했습니다.");
            setNewName("");
            load();
            onChanged?.();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "추가에 실패했습니다.");
        }
    };

    const removeDepartment = (d: IDepartment) => {
        const usage = d.client_count > 0 ? `\n현재 ${d.client_count}개 거래처에서 사용 중이며, 거래처에 저장된 값은 유지됩니다.` : "";
        showAlert(
            "부금처 삭제",
            `'${d.name}' 부금처를 목록에서 삭제하시겠습니까?${usage}`,
            "warning",
            async () => {
                try {
                    await AxiosDelete("settlement-departments", d.id);
                    toast.success("삭제했습니다.");
                    load();
                    onChanged?.();
                } catch {
                    toast.error("삭제에 실패했습니다.");
                }
            },
            true
        );
    };

    return (
        <Wrapper>
            <Intro>
                거래처 상세의 <b>부금처</b> 드롭다운과 검색 필터에 표시될 목록을 관리합니다.
            </Intro>

            <Table>
                <thead>
                    <tr>
                        <th>부금처명</th>
                        <th style={{ width: 110 }}>사용 거래처</th>
                        <th style={{ width: 80 }}>작업</th>
                    </tr>
                </thead>
                <tbody>
                    {/* 신규 추가 행 */}
                    <tr className="addrow">
                        <td>
                            <input
                                placeholder="추가할 부금처명 입력"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addDepartment()}
                            />
                        </td>
                        <td className="center">-</td>
                        <td>
                            <AddBtn onClick={addDepartment}>
                                <Plus size={14} weight="bold" /> 추가
                            </AddBtn>
                        </td>
                    </tr>

                    {departments.map((d) => (
                        <tr key={d.id}>
                            <td className="name">{d.name}</td>
                            <td className="center">{d.client_count > 0 ? `${d.client_count}개` : "-"}</td>
                            <td>
                                <IconBtn onClick={() => removeDepartment(d)} title="삭제">
                                    <Trash size={15} />
                                </IconBtn>
                            </td>
                        </tr>
                    ))}

                    {!loading && departments.length === 0 && (
                        <tr>
                            <td colSpan={3} className="empty">
                                등록된 부금처가 없습니다. 위에서 추가하세요.
                            </td>
                        </tr>
                    )}
                </tbody>
            </Table>

            <FootNote>전체 {departments.length}개</FootNote>
        </Wrapper>
    );
};

/* ───── styles ───── */
const Wrapper = styled.div`
    font-family: "SUIT", sans-serif;
    padding: 4px 2px;
`;
const Intro = styled.p`
    font-size: 13px;
    color: #475569;
    margin: 0 0 14px 0;
    b {
        color: #0f172a;
    }
`;
const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    font-size: 13px;
    thead th {
        background: #f1f5f9;
        color: #475569;
        font-weight: 700;
        text-align: left;
        padding: 10px 12px;
        border-bottom: 1px solid #e2e8f0;
    }
    tbody td {
        padding: 7px 12px;
        border-bottom: 1px solid #f1f5f9;
        color: #475569;
        vertical-align: middle;
    }
    tbody td.center {
        text-align: center;
        color: #64748b;
    }
    tbody tr.addrow {
        background: #f0fdf4;
    }
    .name {
        font-weight: 600;
        color: #0f172a;
    }
    .empty {
        text-align: center;
        color: #94a3b8;
        padding: 28px 0;
    }
    input {
        width: 100%;
        height: 32px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 0 8px;
        font-size: 13px;
        font-family: inherit;
        box-sizing: border-box;
        &:focus {
            outline: none;
            border-color: #2563eb;
        }
    }
`;
const IconBtn = styled.button`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid #fecaca;
    background: #f8fafc;
    color: #dc2626;
    &:hover {
        background: #fef2f2;
    }
`;
const AddBtn = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    padding: 0 12px;
    border: 1px solid #16a34a;
    background: #16a34a;
    color: #ffffff;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    &:hover {
        background: #15803d;
    }
`;
const FootNote = styled.div`
    margin-top: 12px;
    font-size: 12px;
    color: #64748b;
    text-align: right;
`;
