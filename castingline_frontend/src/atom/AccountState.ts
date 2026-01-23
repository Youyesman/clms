/**
 * @filename : AccountState.tsx
 */
import { atom } from "recoil";
import { recoilPersist } from "recoil-persist";

const { persistAtom } = recoilPersist({
    key: "AccountState",
    storage: localStorage,
    converter: JSON,
});

export const AccountState = atom({
    key: "AccountState",
    default: {
        id: 0,
        username: "",
        nickname: "",
        local_name: "",
        email: "",
        branch: "",
        team: "",
        direct_call: "",
        kakao_id: "",
    },
    effects_UNSTABLE: [persistAtom],
});