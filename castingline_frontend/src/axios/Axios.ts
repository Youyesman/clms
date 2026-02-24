import axios from "axios";

// export const BASE_URL = "https://api.simfullo.com/Api";
// export const WEBSOCKET_URL = "wss://api.simfullo.com";

// export const BASE_URL = "http://127.0.0.1:8000/Api";
// export const WEBSOCKET_URL = "ws://127.0.0.1:8000";
const apiPort = process.env.REACT_APP_API_PORT || '8000';

export const BASE_URL = process.env.NODE_ENV === 'development'
    ? `http://localhost:${apiPort}/Api`
    : '/Api';

export const WEBSOCKET_URL = process.env.NODE_ENV === 'development'
    ? `ws://localhost:${apiPort}`
    : (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.hostname;

//모바일 웹뷰테스트용
// export const BASE_URL = "http://192.168.0.7:8000/Api";

//401에러처리 intercepter
// 로딩 상태 관리를 위한 전역 변수 및 콜백
let activeRequests = 0;
let updateLoadingCallback: (isLoading: boolean) => void = () => { };

export const setUpdateLoadingCallback = (callback: (isLoading: boolean) => void) => {
    updateLoadingCallback = callback;
};

const updateLoadingState = (delta: number) => {
    activeRequests += delta;
    updateLoadingCallback(activeRequests > 0);
};

let isUnauthorized = false;

/* ── 세션 만료 모달 (React 트리 외부이므로 순수 DOM으로 생성합니다) ── */
function showSessionExpiredModal() {
    // 이미 모달이 존재하면 중복 생성 방지
    if (document.getElementById("session-expired-modal")) return;

    const overlay = document.createElement("div");
    overlay.id = "session-expired-modal";
    Object.assign(overlay.style, {
        position: "fixed", inset: "0", zIndex: "99999",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        fontFamily: '"Pretendard", "Apple SD Gothic Neo", sans-serif',
        animation: "fadeInModal 0.25s ease-out",
    });

    const card = document.createElement("div");
    Object.assign(card.style, {
        background: "#fff", borderRadius: "12px", padding: "40px 36px",
        maxWidth: "400px", width: "90%", textAlign: "center",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        border: "1px solid #e5e7eb",
    });

    const title = document.createElement("div");
    title.textContent = "세션이 만료되었습니다";
    Object.assign(title.style, {
        fontSize: "20px", fontWeight: "700", color: "#111827",
        marginBottom: "12px",
    });

    const desc = document.createElement("div");
    desc.textContent = "보안을 위해 자동으로 로그아웃 되었습니다. 다시 로그인 해주세요.";
    Object.assign(desc.style, {
        fontSize: "14px", color: "#6b7280", lineHeight: "1.6",
        marginBottom: "32px", wordBreak: "keep-all",
    });

    const btn = document.createElement("button");
    btn.textContent = "로그인 페이지로 이동";
    Object.assign(btn.style, {
        width: "100%", padding: "14px", border: "1px solid #111827",
        borderRadius: "6px", background: "#111827", color: "#fff",
        fontSize: "15px", fontWeight: "600", cursor: "pointer",
        transition: "background 0.2s",
    });
    btn.onmouseenter = () => { btn.style.background = "#1f2937"; };
    btn.onmouseleave = () => { btn.style.background = "#111827"; };
    btn.onclick = () => { window.location.href = "/login"; };

    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(btn);
    overlay.appendChild(card);

    // 간단한 fadeIn 애니메이션 추가
    const style = document.createElement("style");
    style.textContent = `@keyframes fadeInModal { from { opacity: 0; } to { opacity: 1; } }`;
    document.head.appendChild(style);

    document.body.appendChild(overlay);
}

const axiosInstance = axios.create();

axiosInstance.interceptors.request.use(
    (config) => {
        updateLoadingState(1);
        return config;
    },
    (error) => {
        updateLoadingState(-1);
        return Promise.reject(error);
    }
);

axiosInstance.interceptors.response.use(
    (response) => {
        updateLoadingState(-1);
        return response;
    },
    (error) => {
        updateLoadingState(-1);
        if (error.response && error.response.status === 401) {
            if (!isUnauthorized) {
                //인터셉터가 여러 번 호출되는 것을 방지하기 위한 실행플래그 값 설정
                isUnauthorized = true;
                localStorage.removeItem("token");
                localStorage.removeItem("AccountBtnStte");
                localStorage.removeItem("AccountState");
                localStorage.removeItem("TableColumnState");
                showSessionExpiredModal();
                return Promise.reject(error);
            }
        }
        // else if (error.response && error.response.status === 403) {
        //   isUnauthorized = true;
        //   window.location.href = "/login";
        // }
        else {
            return Promise.reject(error);
        }
    }
);

export function AxiosDelete(url: string | number, id: number) {
    let token = localStorage.getItem("token");
    return axiosInstance.delete(`${BASE_URL}/${url}/${id}/`, {
        headers: {
            Authorization: `token ${token}`,
        },
    });
}

export function AxiosGet(url: string | number, options = {}) {
    let token = localStorage.getItem("token");
    return axiosInstance.get(`${BASE_URL}/${url}`, {
        headers: {
            Authorization: `token ${token}`,
        },
        ...options,
    });
}

export function AxiosPatch(url: string | number, data: any, id: number | null = null, param: string | null = null) {
    let token = localStorage.getItem("token");
    let fullUrl = `${BASE_URL}/${url}/`;
    if (id) {
        fullUrl += `${id}/`;
    }
    if (param) {
        fullUrl += `?${param}`;
    }
    return axiosInstance.patch(fullUrl, data, {
        headers: {
            Authorization: `token ${token}`,
        },
    });
}

export function AxiosPost(url: string | number, data: any, configOrParam: string | Record<string, any> | null = null) {
    let token = localStorage.getItem("token");
    let fullUrl = `${BASE_URL}/${url}/`;

    let config: any = {
        headers: {
            Authorization: `token ${token}`,
        },
    };

    if (typeof configOrParam === "string") {
        fullUrl += `?${configOrParam}`;
    } else if (typeof configOrParam === "object" && configOrParam !== null) {
        config = {
            ...configOrParam,
            headers: {
                ...configOrParam.headers,
                Authorization: `token ${token}`,
            },
        };
    }

    return axiosInstance.post(fullUrl, data, config);
}

export function AxiosLinkPost(url: string | number, data: any, param: string | null = null) {
    let fullUrl = `${BASE_URL}/${url}/`;
    if (param) {
        fullUrl += `?${param}`;
    }
    return axiosInstance.post(fullUrl, data);
}
