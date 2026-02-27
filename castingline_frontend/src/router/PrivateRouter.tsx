import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRecoilValue } from "recoil";
import { AccountState } from "../atom/AccountState";
import { BASE_URL } from "../axios/Axios";
import axios from "axios";
import { TabContentArea } from "../components/navbar/TabContentArea";
import { useToast } from "../components/common/CustomToast";
import { GlobalSkeleton } from "../components/common/GlobalSkeleton";

const PrivateRouter = (): JSX.Element | null => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const account = useRecoilValue(AccountState);
    const navigate = useNavigate();
    const toast = useToast();

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
            const token = localStorage.getItem("token");

            if (!token) {
                navigate("/login");
                setIsChecking(false);
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
            } finally {
                setIsChecking(false);
            }
        };

        authenticateUser();
    }, [navigate]);

    if (isChecking) {
        return <GlobalSkeleton />;
    }

    if (isAuthenticated) {
        if (account && account.is_superuser === true) {
            return <TabContentArea />;
        } else {
            toast.error("관리자 권한이 필요한 페이지입니다.");
            navigate("/login");
            return null;
        }
    }

    return null;
};

export default PrivateRouter;
