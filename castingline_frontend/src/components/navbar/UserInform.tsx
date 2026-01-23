/**
 * @filename : UserInform.tsx
 * @description : Sidebar 계정정보 표현 및 UserInform 페이지 연결되는 Component
 *
 */

import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import Tooltip from "@mui/material/Tooltip";
//api
import { AxiosGet } from "../../axios/Axios";
//recoil
import { useRecoilValue, useResetRecoilState } from "recoil";
import { AccountState } from "../../atom/AccountState";
//icons (Phosphor Icons로 교체)
import { UserCircle, SignOut } from "@phosphor-icons/react";

const UserInformContainer = styled.section`
    .content-wrap {
        display: flex;
        align-items: center;
        gap: 12px;

        .user-inform {
            display: flex;
            flex-direction: column;
            cursor: pointer;
            h1 {
                font-size: 14px;
                font-weight: 700;
                color: #1e293b;
                margin: 0;
            }
            h6 {
                font-size: 11px;
                color: #64748b;
                margin: 0;
            }
        }

        .icon-btn {
            background: none;
            border: none;
            color: #64748b;
            cursor: pointer;
            display: flex;
            align-items: center;
            padding: 6px;
            border-radius: 6px;
            transition: all 0.2s;
            &:hover {
                background-color: #f1f5f9;
                color: #ef4444;
            }
        }
    }
`;

function UserInform({ }) {
    const token = localStorage.getItem("token");
    const nowAccount = useRecoilValue(AccountState);
    const navigate = useNavigate();

    const resetAccount = useResetRecoilState(AccountState);

    const logout = async () => {
        if (token) {
            resetAccount();
            try {
                await AxiosGet("logout");
            } catch (error) {
                console.error(error);
            }
            localStorage.clear();
            navigate("/login");
        }
    };

    return (
        <UserInformContainer>
            {nowAccount?.username ? (
                <div className="content-wrap">
                    <UserCircle 
                        size={32} 
                        weight="duotone" 
                        color="#2563eb"
                        style={{ cursor: "pointer" }}
                        onClick={() => navigate("/manage/my_profile")} 
                    />
                    <div className="user-inform" onClick={() => navigate("/manage/my_profile")}>
                        <h1>{nowAccount.username}</h1>
                        {nowAccount.team && <h6>{nowAccount.team}</h6>}
                    </div>

                    <Tooltip title="로그아웃" placement="bottom">
                        <button className="icon-btn" onClick={logout}>
                            <SignOut size={22} weight="bold" />
                        </button>
                    </Tooltip>
                </div>
            ) : (
                <div className="content-wrap" onClick={() => navigate("/login")} style={{ cursor: "pointer" }}>
                    <UserCircle size={32} weight="light" color="#94a3b8" />
                    <div className="user-inform">
                        <h1>Login</h1>
                    </div>
                </div>
            )}
        </UserInformContainer>
    );
}

export default UserInform;
