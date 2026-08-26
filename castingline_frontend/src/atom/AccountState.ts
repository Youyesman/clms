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
    // U001: [시간표 조회] 메뉴 접근 권한 (false면 메뉴 숨김)
    timetable_access?: boolean;
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
        timetable_access: true,
    },
    effects_UNSTABLE: [persistAtom],
});
