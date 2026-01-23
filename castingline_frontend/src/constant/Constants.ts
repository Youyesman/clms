// Constants.ts

/** 거래처 구분 */
export const CLIENT_TYPES = ["극장", "배급사", "제작사", "기타"]

/** 법인/개인 구분 */
export const LEGAL_ENTITY_TYPES = ["법인", "개인"]

/** 지역 구분 */
export const REGION_CODES = ["서울", "경강", "경남", "경북", "충청", "호남"]

/** 부금처 목록 */
export const SETTLEMENT_DEPARTMENTS = [
    "CGV 직영",
    "롯데 직영",
    "메가박스 직영",
    "시네마케이",
    "알엔알",
    "삼광필름",
    "포스시네마",
    "작은영화관 주식회사",
    "JT미디어",
    "지원"
]

/** 운영 상태 (Y/N) */
export const OPERATIONAL_STATUS_OPTIONS = [
    { label: "사용", value: "false" },
    { label: "폐관", value: "true" }
]

/** 직영/위탁 구분 */
export const MANAGEMENT_TYPES = ["직영", "위탁", "기타"]

/** 멀티종류 (브랜드) */
export const THEATER_KINDS = ["롯데", "CGV", "메가박스", "씨네큐", "일반극장"]

export const DISTRIBUTER_THEATER_NAME = ["배급사별 극장명", "극장명 공통 사용", "관리 제외(삭제)"];