/**
 * @filename : TabState.ts
 * 탭 상태 관리 (관리자 탭 네비게이션)
 */
import { atom } from "recoil";
import { recoilPersist } from "recoil-persist";

const { persistAtom } = recoilPersist({
    key: "TabState",
    storage: localStorage,
    converter: JSON,
});

export interface Tab {
    id: string;       // path 기반 고유 ID
    label: string;    // 탭에 표시할 이름
    path: string;     // 라우트 경로
    closable: boolean; // 닫기 가능 여부
}

export const OpenTabsState = atom<Tab[]>({
    key: "OpenTabsState",
    default: [],
    effects_UNSTABLE: [persistAtom],
});

export const ActiveTabIdState = atom<string | null>({
    key: "ActiveTabIdState",
    default: null,
    effects_UNSTABLE: [persistAtom],
});

/**
 * 경로 → 탭 라벨 매핑
 */
export const PATH_TO_TAB_LABEL: Record<string, string> = {
    "/manage": "대시보드",
    "/manage/crawler": "크롤러 관리",
    "/manage/crawler/schedules": "시간표 수집 현황",
    "/manage/manage_client": "거래처 관리",
    "/manage/manage_user": "사용자 관리",
    "/manage/my_profile": "내 정보 수정",
    "/manage/manage_movie": "영화 관리",
    "/manage/manage_order": "오더 관리",
    "/manage/manage_rate": "부율 관리",
    "/manage/manage_score": "스코어 관리",
    "/manage/manage_fund": "기금 관리",
    "/manage/manage_theater_map": "극장명 매핑",
    "/manage/manage_settlement": "부금 정산",
    "/manage/manage_special_settlement": "지정 부금",
    "/manage/score": "스코어 현황",
    "/manage/time_table": "시간표 조회",
    "/manage/dashboard/score": "스코어 개요",
    "/manage/dashboard/ranking": "누적 순위",
};
