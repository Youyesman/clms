import { atom, selector } from "recoil";

// 현재 활성화된 API 요청 수
export const ActiveApiCountState = atom<number>({
    key: "ActiveApiCountState",
    default: 0,
});

// 로딩 중인지 여부 (카운트가 0보다 크면 true)
export const IsLoadingState = selector<boolean>({
    key: "IsLoadingState",
    get: ({ get }) => {
        const count = get(ActiveApiCountState);
        return count > 0;
    },
});
