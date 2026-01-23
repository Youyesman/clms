/**
 * 에러 응답 데이터를 형식화하여 반환
 * @param error AxiosError 객체
 * @returns 형식화된 에러 메시지
 */

import { AxiosError } from "axios";

export const handleBackendErrors = (error: AxiosError): string => {
    console.log(error);
    if (!error.response) {
        return `${error}`;
    }

    const { status, data } = error.response;

    if (status === 400 || status == 404) {
        const backendErrors = data as Record<string, unknown>;

        return (
            Object.entries(backendErrors)
                .map(([key, value]) => {
                    if (Array.isArray(value)) {
                        // 배열인 경우: 문자열로 합침
                        return `${key}: ${value.join(", ")}`;
                    } else if (typeof value === "object" && value !== null) {
                        // 객체인 경우: 문자열로 변환
                        return `${key}: ${JSON.stringify(value)}`;
                    } else {
                        // 기타 타입인 경우
                        return `${key}: ${String(value)}`;
                    }
                })
                .join("\n") || "400 : An unexpected error occurred."
        );
    } else if (status === 500) {
        return "500 : An unexpected error occurred.";
    }

    return "An unexpected error occurred.";
};
