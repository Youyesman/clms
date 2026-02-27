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

export interface Account {
    id: number;
    username: string;
    nickname: string;
    local_name: string;
    email: string;
    branch: string;
    team: string;
    direct_call: string;
    kakao_id: string;
    client_id: number | null;
    is_superuser: boolean;
}

export const AccountState = atom<Account>({
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
        client_id: null,
        is_superuser: false,
    },
    effects_UNSTABLE: [persistAtom],
});
