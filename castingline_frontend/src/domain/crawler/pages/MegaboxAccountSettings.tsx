import { useEffect, useState } from "react";
import styled from "styled-components";
import { Plus, Trash, PencilSimple, Check, X, Eye, EyeSlash } from "@phosphor-icons/react";
import { AxiosGet, AxiosPost, AxiosPatch, AxiosDelete } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { useAppAlert } from "../../../atom/alertUtils";

interface IAccount {
    id: number;
    name: string;
    user: string;
    password: string;
    is_active: boolean;
    sort_order: number;
}

interface IDraft {
    name: string;
    user: string;
    password: string;
}

const emptyDraft: IDraft = { name: "", user: "", password: "" };

export const MegaboxAccountSettings = () => {
    const toast = useToast();
    const { showAlert } = useAppAlert();

    const [accounts, setAccounts] = useState<IAccount[]>([]);
    const [loading, setLoading] = useState(false);
    const [showPw, setShowPw] = useState(false);

    // 신규 추가용
    const [newDraft, setNewDraft] = useState<IDraft>(emptyDraft);
    // 인라인 편집용 (편집 중인 행 id)
    const [editId, setEditId] = useState<number | null>(null);
    const [editDraft, setEditDraft] = useState<IDraft>(emptyDraft);

    const load = async () => {
        setLoading(true);
        try {
            const res = await AxiosGet("crawler/megabox_accounts/");
            setAccounts(res.data as IAccount[]);
        } catch {
            toast.error("계정 목록을 불러오지 못했습니다.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const addAccount = async () => {
        const { name, user, password } = newDraft;
        if (!name.trim() || !user.trim() || !password.trim()) {
            toast.error("배급사명/아이디/비밀번호를 모두 입력하세요.");
            return;
        }
        try {
            await AxiosPost("crawler/megabox_accounts", newDraft);
            toast.success("배급사 계정을 추가했습니다.");
            setNewDraft(emptyDraft);
            load();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "추가에 실패했습니다.");
        }
    };

    const startEdit = (a: IAccount) => {
        setEditId(a.id);
        setEditDraft({ name: a.name, user: a.user, password: a.password });
    };

    const cancelEdit = () => {
        setEditId(null);
        setEditDraft(emptyDraft);
    };

    const saveEdit = async (id: number) => {
        const { name, user, password } = editDraft;
        if (!name.trim() || !user.trim() || !password.trim()) {
            toast.error("배급사명/아이디/비밀번호를 모두 입력하세요.");
            return;
        }
        try {
            await AxiosPatch("crawler/megabox_accounts", editDraft, id);
            toast.success("수정했습니다.");
            cancelEdit();
            load();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "수정에 실패했습니다.");
        }
    };

    const toggleActive = async (a: IAccount) => {
        try {
            await AxiosPatch("crawler/megabox_accounts", { is_active: !a.is_active }, a.id);
            load();
        } catch {
            toast.error("상태 변경에 실패했습니다.");
        }
    };

    const removeAccount = (a: IAccount) => {
        showAlert(
            "배급사 계정 삭제",
            `'${a.name}' 계정을 삭제하시겠습니까?`,
            "warning",
            async () => {
                try {
                    await AxiosDelete("crawler/megabox_accounts", a.id);
                    toast.success("삭제했습니다.");
                    load();
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
                <p>
                    메가박스 스코어 크롤에 사용할 배급사 로그인 계정을 관리합니다.
                    <b> 활성화</b>된 계정만 크롤 대상에 포함됩니다.
                </p>
                <ShowPwBtn type="button" onClick={() => setShowPw((v) => !v)}>
                    {showPw ? <EyeSlash size={15} /> : <Eye size={15} />}
                    비밀번호 {showPw ? "숨기기" : "표시"}
                </ShowPwBtn>
            </Intro>

            <Table>
                <thead>
                    <tr>
                        <th style={{ width: 60 }}>활성</th>
                        <th>배급사명</th>
                        <th style={{ width: 150 }}>아이디</th>
                        <th style={{ width: 180 }}>비밀번호</th>
                        <th style={{ width: 110 }}>작업</th>
                    </tr>
                </thead>
                <tbody>
                    {/* 신규 추가 행 */}
                    <tr className="addrow">
                        <td className="center">
                            <Plus size={16} color="#16a34a" weight="bold" />
                        </td>
                        <td>
                            <input
                                placeholder="배급사명"
                                value={newDraft.name}
                                onChange={(e) =>
                                    setNewDraft({ ...newDraft, name: e.target.value })
                                }
                            />
                        </td>
                        <td>
                            <input
                                placeholder="아이디"
                                value={newDraft.user}
                                onChange={(e) =>
                                    setNewDraft({ ...newDraft, user: e.target.value })
                                }
                            />
                        </td>
                        <td>
                            <input
                                type={showPw ? "text" : "password"}
                                placeholder="비밀번호"
                                value={newDraft.password}
                                onChange={(e) =>
                                    setNewDraft({ ...newDraft, password: e.target.value })
                                }
                                onKeyDown={(e) => e.key === "Enter" && addAccount()}
                            />
                        </td>
                        <td>
                            <AddBtn onClick={addAccount}>
                                <Plus size={14} weight="bold" /> 추가
                            </AddBtn>
                        </td>
                    </tr>

                    {accounts.map((a) =>
                        editId === a.id ? (
                            <tr key={a.id} className="editing">
                                <td className="center">
                                    <Toggle
                                        $on={a.is_active}
                                        title="활성/비활성"
                                        onClick={() => toggleActive(a)}
                                    />
                                </td>
                                <td>
                                    <input
                                        value={editDraft.name}
                                        onChange={(e) =>
                                            setEditDraft({ ...editDraft, name: e.target.value })
                                        }
                                    />
                                </td>
                                <td>
                                    <input
                                        value={editDraft.user}
                                        onChange={(e) =>
                                            setEditDraft({ ...editDraft, user: e.target.value })
                                        }
                                    />
                                </td>
                                <td>
                                    <input
                                        type={showPw ? "text" : "password"}
                                        value={editDraft.password}
                                        onChange={(e) =>
                                            setEditDraft({
                                                ...editDraft,
                                                password: e.target.value,
                                            })
                                        }
                                        onKeyDown={(e) => e.key === "Enter" && saveEdit(a.id)}
                                    />
                                </td>
                                <td>
                                    <IconActions>
                                        <IconBtn $variant="ok" onClick={() => saveEdit(a.id)}>
                                            <Check size={15} weight="bold" />
                                        </IconBtn>
                                        <IconBtn onClick={cancelEdit}>
                                            <X size={15} weight="bold" />
                                        </IconBtn>
                                    </IconActions>
                                </td>
                            </tr>
                        ) : (
                            <tr key={a.id} className={!a.is_active ? "off" : ""}>
                                <td className="center">
                                    <Toggle
                                        $on={a.is_active}
                                        title="활성/비활성"
                                        onClick={() => toggleActive(a)}
                                    />
                                </td>
                                <td className="name">{a.name}</td>
                                <td>{a.user}</td>
                                <td className="pw">
                                    {showPw ? a.password : "•".repeat(8)}
                                </td>
                                <td>
                                    <IconActions>
                                        <IconBtn onClick={() => startEdit(a)} title="수정">
                                            <PencilSimple size={15} />
                                        </IconBtn>
                                        <IconBtn
                                            $variant="del"
                                            onClick={() => removeAccount(a)}
                                            title="삭제"
                                        >
                                            <Trash size={15} />
                                        </IconBtn>
                                    </IconActions>
                                </td>
                            </tr>
                        )
                    )}

                    {!loading && accounts.length === 0 && (
                        <tr>
                            <td colSpan={5} className="empty">
                                등록된 배급사 계정이 없습니다. 위에서 추가하세요.
                            </td>
                        </tr>
                    )}
                </tbody>
            </Table>

            <FootNote>
                활성 계정 {accounts.filter((a) => a.is_active).length} / 전체{" "}
                {accounts.length}개
            </FootNote>
        </Wrapper>
    );
};

/* ───── styles ───── */
const Wrapper = styled.div`
    font-family: "SUIT", sans-serif;
    padding: 4px 2px;
`;
const Intro = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
    p {
        font-size: 13px;
        color: #475569;
        margin: 0;
        b {
            color: #0f172a;
        }
    }
`;
const ShowPwBtn = styled.button`
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 12px;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    background: #fff;
    color: #475569;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    &:hover {
        background: #f1f5f9;
    }
`;
const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
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
        color: #334155;
        vertical-align: middle;
    }
    tbody td.center {
        text-align: center;
    }
    tbody tr.off td {
        color: #94a3b8;
    }
    tbody tr.addrow {
        background: #f0fdf4;
    }
    tbody tr.editing {
        background: #eff6ff;
    }
    .name {
        font-weight: 600;
        color: #0f172a;
    }
    .pw {
        font-variant-numeric: tabular-nums;
        letter-spacing: 1px;
        color: #64748b;
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
const Toggle = styled.button<{ $on: boolean }>`
    width: 36px;
    height: 20px;
    border-radius: 999px;
    border: 0;
    cursor: pointer;
    position: relative;
    background: ${({ $on }) => ($on ? "#16a34a" : "#cbd5e1")};
    transition: background 0.15s;
    &::after {
        content: "";
        position: absolute;
        top: 2px;
        left: ${({ $on }) => ($on ? "18px" : "2px")};
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #fff;
        transition: left 0.15s;
    }
`;
const IconActions = styled.div`
    display: flex;
    gap: 6px;
`;
const IconBtn = styled.button<{ $variant?: "del" | "ok" }>`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 7px;
    cursor: pointer;
    border: 1px solid
        ${({ $variant }) =>
            $variant === "del"
                ? "#fecaca"
                : $variant === "ok"
                ? "#16a34a"
                : "#cbd5e1"};
    background: ${({ $variant }) => ($variant === "ok" ? "#16a34a" : "#fff")};
    color: ${({ $variant }) =>
        $variant === "del" ? "#dc2626" : $variant === "ok" ? "#fff" : "#334155"};
    &:hover {
        background: ${({ $variant }) =>
            $variant === "del"
                ? "#fef2f2"
                : $variant === "ok"
                ? "#15803d"
                : "#f1f5f9"};
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
    color: #fff;
    border-radius: 7px;
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
