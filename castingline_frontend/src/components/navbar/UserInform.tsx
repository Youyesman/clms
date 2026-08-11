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
                color: #dc2626;
            }
        }
    }
`;

function UserInform({ }) {
    const token = localStorage.getItem("token");
    const nowAccount = useRecoilValue(AccountState);
    const navigate = useNavigate();

    const resetAccount = useResetRecoilState(AccountState);

    // 관리자는 /manage 하위(탭 시스템) 경로, 고객은 일반 경로 사용
    // (/manage/*는 PrivateRouter가 superuser만 통과시키므로 고객은 진입 불가)
    const profilePath = nowAccount?.is_superuser ? "/manage/my_profile" : "/my_profile";

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
                        onClick={() => navigate(profilePath)}
                    />
                    <div className="user-inform" onClick={() => navigate(profilePath)}>
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
