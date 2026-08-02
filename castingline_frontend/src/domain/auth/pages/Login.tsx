import React, { useState } from "react";
import axios from "axios";
import styled, { keyframes } from "styled-components";
import { useNavigate } from "react-router-dom";
import { useSetRecoilState } from "recoil";
import { BASE_URL } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast";
import { handleBackendErrors } from "../../../axios/handleBackendErrors";
import { AccountState } from "../../../atom/AccountState";
import LogoVerticalImg from "../../../assets/img/logo/logo_vertical.png";

const slideUpFade = keyframes`
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
`;

const PageWrapper = styled.div`
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #f1f5f9;
    font-family: "Pretendard", "Apple SD Gothic Neo", sans-serif;
    padding: 24px;
`;

const LoginCard = styled.div`
    width: 100%;
    max-width: 420px;
    background: #ffffff;
    border-radius: 6px;
    padding: 48px 40px;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
    border: 1px solid #e2e8f0;
    animation: ${slideUpFade} 0.5s ease-out both;
`;

const HeaderSection = styled.div`
    text-align: center;
    margin-bottom: 36px;
`;

const LogoContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
    height: 80px;
    overflow: hidden;

    img {
        height: 200px;
        object-fit: contain;
        margin: -60px;
    }
`;

const BrandIcon = styled.div`
    background: #0f172a;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: #ffffff;
    font-size: 20px;
    font-weight: 800;
`;

const BrandName = styled.h1`
    font-size: 22px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.5px;
    margin: 0;
`;

const Subtitle = styled.p`
    font-size: 14.5px;
    color: #475569;
    margin: 0;
    line-height: 1.5;
`;

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: 20px;
`;

const FormGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;

    label {
        font-size: 13px;
        font-weight: 600;
        color: #475569;
    }

    input {
        width: 100%;
        padding: 12px 14px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font-size: 14.5px;
        color: #0f172a;
        background: #ffffff;
        transition: all 0.2s ease;

        &::placeholder {
            color: #94a3b8;
        }

        &:focus {
            outline: none;
            border-color: #2563eb;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
    }
`;

const LoginButton = styled.button`
    margin-top: 8px;
    width: 100%;
    padding: 14px;
    background: #0f172a;
    color: white;
    border: 1px solid #0f172a;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);

    &:hover {
        background: #1e293b;
        transform: translateY(-1px);
    }
    
    &:active {
        transform: translateY(0);
    }
`;

const BackLink = styled.div`
    text-align: center;
    margin-top: 24px;
    font-size: 13px;
    color: #64748b;
    cursor: pointer;

    &:hover {
        color: #0f172a;
        text-decoration: underline;
    }
`;

export function Login() {
    const navigate = useNavigate();
    const toast = useToast();
    const setAccount = useSetRecoilState(AccountState);

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const response = await axios.post(`${BASE_URL}/login/`, {
                username,
                password,
            });

            const { token, user_data } = response.data;

            localStorage.setItem("token", token);
            localStorage.setItem("AccountState", JSON.stringify(user_data));

            setAccount(user_data);

            toast.success(`${user_data.username}님, 환영합니다!`);

            if (user_data.is_superuser) {
                navigate("/manage/manage_client");
            } else {
                navigate("/dashboard");
            }
        } catch (err: any) {
            console.error(err);
            toast.error(handleBackendErrors(err) || "로그인에 실패했습니다. 아이디나 비밀번호를 확인해주세요.");
        }
    };

    return (
        <PageWrapper>
            <LoginCard>
                <HeaderSection>
                    <LogoContainer>
                        <img src={LogoVerticalImg} alt="Castingline" />
                    </LogoContainer>
                    <Subtitle>통합 시스템에 접속하세요</Subtitle>
                </HeaderSection>

                <Form onSubmit={handleLogin}>
                    <FormGroup>
                        <label>아이디</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="아이디를 입력하세요"
                            required
                        />
                    </FormGroup>
                    <FormGroup>
                        <label>비밀번호</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="비밀번호를 입력하세요"
                            required
                        />
                    </FormGroup>
                    <LoginButton type="submit">시스템 접속</LoginButton>
                </Form>

                <BackLink onClick={() => navigate("/")}>
                    홈페이지로 돌아가기
                </BackLink>
            </LoginCard>
        </PageWrapper>
    );
}
