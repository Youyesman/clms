import axios from "axios";

// export const BASE_URL = "https://api.simfullo.com/Api";
// export const WEBSOCKET_URL = "wss://api.simfullo.com";

// export const BASE_URL = "http://127.0.0.1:8000/Api";
// export const WEBSOCKET_URL = "ws://127.0.0.1:8000";
export const BASE_URL = window.location.protocol + "//" + window.location.hostname + "/Api";
export const WEBSOCKET_URL = (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.hostname;

//모바일 웹뷰테스트용
// export const BASE_URL = "http://192.168.0.7:8000/Api";

//401에러처리 intercepter
// 로딩 상태 관리를 위한 전역 변수 및 콜백
let activeRequests = 0;
let updateLoadingCallback: (isLoading: boolean) => void = () => {};

export const setUpdateLoadingCallback = (callback: (isLoading: boolean) => void) => {
    updateLoadingCallback = callback;
};

const updateLoadingState = (delta: number) => {
    activeRequests += delta;
    updateLoadingCallback(activeRequests > 0);
};

let isUnauthorized = false;
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
                alert("Invalid user. Please log in.");
                window.location.href = "/login";
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
