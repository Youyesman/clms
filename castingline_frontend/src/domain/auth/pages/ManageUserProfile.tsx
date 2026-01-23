import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { AxiosGet, AxiosPost, AxiosPatch, AxiosDelete } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { GenericTable } from "../../../components/GenericTable";
import { CustomIconButton } from "../../../components/common/CustomIconButton";
import { Plus, Trash, PencilSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { useGlobalModal } from "../../../hooks/useGlobalModal";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomButton } from "../../../components/common/CustomButton";
import { CustomSelect } from "../../../components/common/CustomSelect";
import { CommonFilterBar } from "../../../components/common/CommonFilterBar";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";

/* --- Styled Components --- */
const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background-color: #f8fafc;
    min-height: 100vh;
`;


/** 스타일 정의 **/


/* --- User Form Modal Component --- */
const FormContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background: #fff;
`;

const ButtonGroup = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
`;

function UserFormModal({ user, onSuccess, onClose }: any) {
    const toast = useToast();
    const [groups, setGroups] = useState<any[]>([]);
    const [formData, setFormData] = useState({
        username: "",
        password: "",
        nickname: "",
        email: "",
        team: "",
        direct_call: "",
        phone: "",
        country: "KR",
        groups: [] as number[],
        is_superuser: false,
    });

    useEffect(() => {
        // 사용 가능한 그룹(권한) 목록 조회
        AxiosGet("groups/").then((res) => setGroups(res.data));

        if (user) {
            setFormData({
                ...user,
                password: "",
                groups: user.groups || [],
                is_superuser: user.is_superuser || false,
            });
        }
    }, [user]);

    const handleChange = (name: string, value: any) => {
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async () => {
        try {
            if (user) {
                const payload: any = { ...formData };
                if (!payload.password) delete payload.password;
                await AxiosPatch(`users`, payload, user.id);
                toast.success("수정되었습니다.");
            } else {
                await AxiosPost(`users`, formData);
                toast.success("생성되었습니다.");
            }
            onSuccess();
            onClose();
        } catch (err: any) {
            toast.error(handleBackendErrors(err));
        }
    };

    return (
        <FormContainer>
            <CustomInput
                label="아이디"
                value={formData.username}
                setValue={(v) => handleChange("username", v)}
                disabled={!!user}
            />
            <CustomInput
                label="비밀번호"
                inputType="password"
                value={formData.password}
                setValue={(v) => handleChange("password", v)}
                placeholder={user ? "변경시에만 입력" : ""}
            />
            <CustomInput label="닉네임" value={formData.nickname} setValue={(v) => handleChange("nickname", v)} />
            <CustomInput label="이메일" value={formData.email || ""} setValue={(v) => handleChange("email", v)} />

            <CustomSelect
                label="관리자 여부"
                options={[{ label: "고객", value: "false" }, { label: "관리자", value: "true" }]}
                value={String(formData.is_superuser)}
                onChange={(v) => handleChange("is_superuser", v === "true")}
            />

            <CustomSelect
                label="권한(그룹)"
                options={groups.map((g) => ({ label: g.name, value: g.id }))}
                value={formData.groups[0] ? String(formData.groups[0]) : ""}
                onChange={(v) => handleChange("groups", [Number(v)])}
            />

            <CustomInput label="팀" value={formData.team || ""} setValue={(v) => handleChange("team", v)} />
            <CustomInput
                label="직통전화"
                value={formData.direct_call || ""}
                setValue={(v) => handleChange("direct_call", v)}
            />
            <CustomInput label="휴대전화" value={formData.phone || ""} setValue={(v) => handleChange("phone", v)} />
            <CustomInput label="국가" value={formData.country || "KR"} setValue={(v) => handleChange("country", v)} />

            <ButtonGroup>
                <CustomButton onClick={onClose} color="gray">
                    취소
                </CustomButton>
                <CustomButton onClick={handleSubmit} color="blue">
                    저장
                </CustomButton>
            </ButtonGroup>
        </FormContainer>
    );
}

/* --- Main Page Component --- */
export function ManageUserProfile() {
    const toast = useToast();
    const { openModal, closeModal } = useGlobalModal();
    const [users, setUsers] = useState<any[]>([]);
    const [search, setSearch] = useState("");
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const pageSize = 20;

    const fetchUsers = async () => {
        try {
            const params = new URLSearchParams();
            if (search) params.append("search", search);
            params.append("page", String(page));
            params.append("page_size", String(pageSize));

            const res = await AxiosGet(`users/?${params.toString()}`);
            setUsers(res.data.results);
            setTotalCount(res.data.count);
        } catch (err: any) {
            toast.error("사용자 목록 조회 실패");
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [page]);

    const handleSearch = () => {
        setPage(1);
        fetchUsers();
    };

    const handleAdd = () => {
        openModal(<UserFormModal user={null} onSuccess={fetchUsers} onClose={closeModal} />, {
            title: "사용자 추가",
            width: "500px",
        });
    };

    const handleEdit = (user: any) => {
        openModal(<UserFormModal user={user} onSuccess={fetchUsers} onClose={closeModal} />, {
            title: "사용자 수정",
            width: "500px",
        });
    };

    const handleDelete = async () => {
        if (!selectedUser) return;
        if (!window.confirm("정말 삭제하시겠습니까?")) return;
        try {
            await AxiosDelete("users", selectedUser.id);
            toast.success("삭제되었습니다.");
            fetchUsers();
            setSelectedUser(null);
        } catch (err: any) {
            toast.error(handleBackendErrors(err));
        }
    };

    const headers = [
        { key: "is_superuser", label: "계정 유형" },
        { key: "username", label: "아이디" },
        { key: "nickname", label: "닉네임" },
        { key: "email", label: "이메일" },
        { key: "team", label: "팀" },
        { key: "direct_call", label: "직통전화" },
        { key: "phone", label: "휴대전화" },
        { key: "country", label: "국가" },
    ];

    return (
        <PageContainer>
            <CommonFilterBar onSearch={handleSearch}>
                <div style={{ width: "300px" }}>
                    <CustomInput
                        label="검색"
                        placeholder="아이디, 닉네임, 이메일"
                        value={search}
                        setValue={setSearch}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    />
                </div>
            </CommonFilterBar>

            <CommonSectionCard flex={1} height="calc(100vh - 160px)">
                <CommonListHeader
                    title="사용자 목록"
                    actions={
                        <>
                            <CustomIconButton onClick={handleAdd} color="blue" title="추가">
                                <Plus weight="bold" />
                            </CustomIconButton>
                            <CustomIconButton
                                onClick={() => handleEdit(selectedUser)}
                                disabled={!selectedUser}
                                color="gray"
                                title="수정">
                                <PencilSimple weight="bold" />
                            </CustomIconButton>
                            <CustomIconButton onClick={handleDelete} disabled={!selectedUser} color="red" title="삭제">
                                <Trash weight="bold" />
                            </CustomIconButton>
                        </>
                    }
                />
                <GenericTable
                    headers={headers}
                    data={users}
                    selectedItem={selectedUser}
                    onSelectItem={setSelectedUser}
                    getRowKey={(u: any) => u.id}
                    page={page}
                    pageSize={pageSize}
                    totalCount={totalCount}
                    onPageChange={setPage}
                    formatCell={(k: string, v: any) => {
                        if (k === "is_superuser") return v === true ? "관리자" : "고객";
                        return v ?? "";
                    }}
                />
            </CommonSectionCard>
        </PageContainer>
    );
}
