import { useEffect, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { useRecoilValue } from "recoil";
import { AccountState } from "../atom/AccountState";
import { BASE_URL } from "../axios/Axios";
import axios from "axios";

const PrivateRouter = (): JSX.Element | null => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const account = useRecoilValue(AccountState);
    const navigate = useNavigate();

    useEffect(() => {
        const checkTokenValidity = async (token: string) => {
            try {
                const result = await axios.post(`${BASE_URL}/checktoken/`, { token });
                return result.data.result;
            } catch (error) {
                console.error("토큰 검증 에러:", error);
                return false;
            }
        };

        const authenticateUser = async () => {
            let token = localStorage.getItem("token");

            if (!token) {
                navigate("/login");
                return;
            }

            try {
                const isValidToken = await checkTokenValidity(token);
                if (isValidToken) {
                    setIsAuthenticated(true);
                } else {
                    localStorage.removeItem("token");
                    localStorage.removeItem("AccountState");
                    navigate("/login");
                }
            } catch (error) {
                localStorage.removeItem("token");
                navigate("/login");
            }
        };

        authenticateUser();
    }, [navigate]);

    if (isAuthenticated) {
        // ✅ account 정보가 있고, is_superuser가 true인 경우에만 Outlet 리턴
        if (account && account.is_superuser === true) {
            return <Outlet />;
        } else {
            // 권한이 없는 경우 (일반 유저 등)
            alert("관리자 권한이 필요한 페이지입니다.");
            navigate("/login");
            return null;
        }
    }

    return null; // 인증 확인 중에는 빈 화면 유지
};

export default PrivateRouter;
