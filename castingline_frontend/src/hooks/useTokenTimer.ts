import { useState, useEffect, useCallback } from "react";
import dayjs from "dayjs";
import { AxiosPost } from "../axios/Axios";

export const useTokenTimer = () => {
    const [timeLeft, setTimeLeft] = useState<string>("");
    const [isExpired, setIsExpired] = useState<boolean>(false);
    const [expiresAt, setExpiresAt] = useState<dayjs.Dayjs | null>(null);

    const fetchTokenStatus = useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token) {
            setIsExpired(true);
            return;
        }

        try {
            // 토큰 유효성 및 만료시간 확인 + 서버측 연장 처리
            const response = await AxiosPost("checktoken", { token });
            
            if (response.data.result && response.data.expires_at) {
                setExpiresAt(dayjs(response.data.expires_at));
                setIsExpired(false);
            } else {
                setTimeLeft("00:00");
                setIsExpired(true);
            }
        } catch (error) {
            console.error("Token check failed", error);
            setIsExpired(true);
        }
    }, []);

    // Initial check
    useEffect(() => {
        fetchTokenStatus();
    }, [fetchTokenStatus]);

    // Timer interval
    useEffect(() => {
        if (!expiresAt) return;

        const updateTimer = () => {
            const now = dayjs();
            const diff = expiresAt.diff(now, "second");

            if (diff <= 0) {
                setTimeLeft("00:00");
                setIsExpired(true);
            } else {
                const hours = Math.floor(diff / 3600);
                const minutes = Math.floor((diff % 3600) / 60);
                const seconds = diff % 60;

                let formatted = "";
                if (hours > 0) {
                    formatted += `${String(hours).padStart(2, "0")}:`;
                }
                formatted += `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

                setTimeLeft(formatted);
                setIsExpired(false);
            }
        };

        updateTimer();
        const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [expiresAt]);

    const refreshToken = () => {
        fetchTokenStatus();
    };

    return { timeLeft, isExpired, refreshToken };
};
