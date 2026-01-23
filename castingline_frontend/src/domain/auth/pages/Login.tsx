import React, { useState } from "react";
import axios from "axios";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { useSetRecoilState } from "recoil";
import { BASE_URL } from "../../../axios/Axios";
import { useToast } from "../../../components/common/CustomToast"; // ✅ useToast 임포트
import { handleBackendErrors } from "../../../axios/handleBackendErrors"; // 에러 처리 유틸
import { AccountState } from "../../../atom/AccountState";

/** 스타일 정의 (이전과 동일) **/
const LoginWrapper = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    background-color: #f1f5f9;
`;

const LoginCard = styled.div`
    width: 100%;
    max-width: 400px;
    padding: 40px;
    background: #ffffff;
    border-radius: 8px;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
`;

const Brand = styled.h1`
    font-size: 24px;
    font-weight: 900;
    color: #0f172a;
    text-align: center;
    margin-bottom: 8px;
`;

const Subtitle = styled.p`
    text-align: center;
    color: #64748b;
    margin-bottom: 32px;
    font-size: 14px;
`;

const FormGroup = styled.div`
    margin-bottom: 20px;
    label {
        display: block;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 6px;
        color: #334155;
    }
    input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        font-size: 14px;
        &:focus {
            outline: none;
            border-color: #2563eb;
            box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }
    }
`;

const LoginButton = styled.button`
    width: 100%;
    padding: 12px;
    background-color: #0f172a;
    color: white;
    border: none;
    border-radius: 4px;
    font-weight: 700;
    cursor: pointer;
    transition: background-color 0.2s;
    &:hover {
        background-color: #1e293b;
    }
`;

export function Login() {
    const navigate = useNavigate();
    const toast = useToast(); // ✅ snackbar 대신 toast 사용
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

            // 1. LocalStorage 저장
            localStorage.setItem("token", token);
            localStorage.setItem("AccountState", JSON.stringify(user_data));

            // 2. Recoil 상태 저장
            setAccount(user_data);

            // ✅ 성공 토스트 표시
            toast.success(`${user_data.username}님, 환영합니다!`);

            // 3. 권한에 따른 리다이렉트
            if (user_data.is_superuser) {
                navigate("/manage/manage_client");
            } else {
                navigate("/");
            }
        } catch (err: any) {
            console.error(err);
            // ✅ 백엔드 에러 메시지 처리 유틸 사용
            toast.error(handleBackendErrors(err) || "로그인 실패. 정보를 확인하세요.");
        }
    };

    return (
        <LoginWrapper>
            <LoginCard>
                <Brand>캐스팅라인</Brand>
                <Subtitle>Castingline Management System</Subtitle>

                <form onSubmit={handleLogin}>
                    <FormGroup>
                        <label>아이디222</label>
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
                    <LoginButton type="submit">로그인</LoginButton>
                </form>
            </LoginCard>
        </LoginWrapper>
    );
}
