import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { AxiosGet, AxiosPatch, AxiosPost } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { CustomInput } from "../../../components/common/CustomInput";
import { CustomButton } from "../../../components/common/CustomButton";
import { FloppyDisk } from "@phosphor-icons/react";

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40px 20px;
    background-color: #f8fafc;
    min-height: 100vh;
`;

const ProfileCard = styled.div`
    width: 100%;
    max-width: 600px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    overflow: hidden;
`;

const CardHeader = styled.div`
    padding: 20px 24px;
    background-color: #f1f5f9;
    border-bottom: 1px solid #cbd5e1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    h2 {
        font-size: 18px;
        font-weight: 800;
        color: #0f172a;
        margin: 0;
    }
`;

const CardBody = styled.div`
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
`;

const SectionTitle = styled.div`
    font-size: 13px;
    font-weight: 700;
    color: #64748b;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 8px;
    margin-bottom: 4px;
`;

export function MyProfile() {
    const toast = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [formData, setFormData] = useState<any>({
        username: "",
        nickname: "",
        email: "",
        team: "",
        direct_call: "",
        phone: "",
        country: "",
    });
    const [passwords, setPasswords] = useState({
        old_password: "",
        new_password: "",
        confirm_password: "",
    });

    useEffect(() => {
        // 내 정보 가져오기
        AxiosGet("userprofile/")
            .then((res) => {
                setFormData(res.data);
                setIsLoading(false);
            })
            .catch((err) => {
                toast.error("정보를 불러오지 못했습니다.");
            });
    }, []);

    const handleChange = (name: string, value: string) => {
        setFormData((prev: any) => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        try {
            await AxiosPatch("userprofile", formData);
            toast.success("정보가 저장되었습니다.");
        } catch (err: any) {
            toast.error(handleBackendErrors(err));
        }
    };

    const handlePasswordChange = async () => {
        if (!passwords.old_password || !passwords.new_password || !passwords.confirm_password) {
            toast.warning("비밀번호 변경을 위해 모든 필드를 입력해주세요.");
            return;
        }
        if (passwords.new_password !== passwords.confirm_password) {
            toast.error("새 비밀번호와 확인 비밀번호가 일치하지 않습니다.");
            return;
        }
        try {
            await AxiosPost("password_change/", passwords);
            toast.success("비밀번호가 성공적으로 변경되었습니다.");
            setPasswords({ old_password: "", new_password: "", confirm_password: "" });
        } catch (err: any) {
            toast.error(handleBackendErrors(err));
        }
    };

    if (isLoading) return <div>Loading...</div>;

    return (
        <PageContainer>
            <ProfileCard>
                <CardHeader>
                    <h2>내 정보 수정</h2>
                    <CustomButton color="blue" onClick={handleSave} style={{ gap: "6px" }}>
                        <FloppyDisk size={18} weight="bold" /> 저장하기
                    </CustomButton>
                </CardHeader>
                <CardBody>
                    <SectionTitle>계정 정보</SectionTitle>
                    <CustomInput label="아이디" value={formData.username} setValue={() => {}} disabled />
                    
                    <SectionTitle>기본 정보</SectionTitle>
                    <CustomInput label="닉네임" value={formData.nickname || ""} setValue={(v) => handleChange("nickname", v)} />
                    <CustomInput label="이메일" value={formData.email || ""} setValue={(v) => handleChange("email", v)} />
                    
                    <SectionTitle>연락처 및 소속</SectionTitle>
                    <CustomInput label="팀" value={formData.team || ""} setValue={(v) => handleChange("team", v)} />
                    <CustomInput label="직통전화" value={formData.direct_call || ""} setValue={(v) => handleChange("direct_call", v)} />
                    <CustomInput label="휴대전화" value={formData.phone || ""} setValue={(v) => handleChange("phone", v)} />
                    <CustomInput label="국가" value={formData.country || ""} setValue={(v) => handleChange("country", v)} />

                    <SectionTitle style={{ marginTop: "20px" }}>비밀번호 변경</SectionTitle>
                    <CustomInput
                        label="현재 비밀번호"
                        inputType="password"
                        value={passwords.old_password}
                        setValue={(v) => setPasswords((p) => ({ ...p, old_password: v }))}
                    />
                    <CustomInput
                        label="새 비밀번호"
                        inputType="password"
                        value={passwords.new_password}
                        setValue={(v) => setPasswords((p) => ({ ...p, new_password: v }))}
                    />
                    <CustomInput
                        label="비밀번호 확인"
                        inputType="password"
                        value={passwords.confirm_password}
                        setValue={(v) => setPasswords((p) => ({ ...p, confirm_password: v }))}
                    />
                    <CustomButton color="gray" onClick={handlePasswordChange} style={{ alignSelf: "flex-end" }}>
                        비밀번호 변경하기
                    </CustomButton>
                </CardBody>
            </ProfileCard>
        </PageContainer>
    );
}
