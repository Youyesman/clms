/**
 * UI 토큰 — 화면 전반의 색·간격·타이포를 한 곳에서 정의합니다.
 *
 * 기존 화면에서 실제로 쓰이던 slate/blue 계열을 그대로 유지하되,
 * 비슷한 값이 여러 개로 갈라져 있던 것을 하나로 통합했습니다.
 * 톤을 바꾸고 싶으면 이 파일의 값만 고치면 됩니다.
 *
 * styled-components에서는 `ui.color.border` 처럼,
 * 인라인 style에서는 `var(--c-border)` 처럼 쓸 수 있습니다. (GlobalStyles에서 주입)
 */

export const ui = {
    color: {
        /* 배경 */
        canvas: "#f8fafc", // 페이지 바탕
        surface: "#ffffff", // 카드·패널
        surfaceMuted: "#f8fafc", // 테이블 헤더, 비활성 영역
        surfaceHover: "#f1f5f9", // hover 배경
        surfaceSunken: "#f1f5f9", // 입력 비활성 배경

        /* 테두리 */
        borderSubtle: "#f1f5f9", // 표 내부 세로선처럼 아주 약한 구분
        border: "#e2e8f0", // 기본 테두리
        borderStrong: "#cbd5e1", // 입력 요소 테두리
        borderFocus: "#0f172a", // 포커스 테두리

        /* 텍스트 — 진한 쪽에서 옅은 쪽으로 5단계 */
        textStrong: "#0f172a", // 제목·강조
        text: "#1e293b", // 본문
        textMutedStrong: "#475569", // 부제목·표 안 보조 텍스트
        textMuted: "#64748b", // 라벨·보조
        textSubtle: "#94a3b8", // placeholder·비활성

        /* 주색 */
        primary: "#2563eb",
        primaryHover: "#1d4ed8",
        primarySoft: "#eff6ff", // 선택 행, 강조 배경
        primaryBorder: "#bfdbfe",

        /* 상태 */
        danger: "#dc2626",
        dangerSoft: "#fef2f2",
        success: "#16a34a",
        successSoft: "#f0fdf4",
        warning: "#d97706",
        warningSoft: "#fffbeb",

        /* 어두운 셸 (사이드바) */
        shellBg: "#0f172a",
        shellBgHover: "#1e293b",
        shellBorder: "#1e293b",
        shellText: "#94a3b8",
        shellTextActive: "#e2e8f0",
        shellTextMuted: "#64748b",
        shellAccent: "#3b82f6",
    },

    radius: {
        sm: "4px", // 배지·작은 아이콘 버튼
        md: "6px", // 입력·버튼·칩·카드
        lg: "8px", // 드롭다운·팝오버
        xl: "12px", // 모달 등 큰 표면
        pill: "999px",
    },

    /** 4px 배수 간격 스케일 */
    space: {
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        5: "20px",
        6: "24px",
        8: "32px",
    },

    /** 그림자는 최소한으로 — 카드가 떠 보이지 않게 */
    shadow: {
        xs: "0 1px 2px rgba(15, 23, 42, 0.04)",
        sm: "0 1px 3px rgba(15, 23, 42, 0.06)",
        md: "0 4px 12px rgba(15, 23, 42, 0.08)",
        lg: "0 12px 32px rgba(15, 23, 42, 0.12)",
    },

    font: {
        family: `"SUIT", -apple-system, sans-serif`,
        size: {
            xs: "11px", // 캡션·배지
            sm: "12px", // 라벨
            md: "12.5px", // 표 본문
            base: "13px", // 입력·기본
            lg: "14px", // 본문 강조
            xl: "16px",
            "2xl": "20px", // 페이지 제목
        },
        weight: {
            regular: 400,
            medium: 500,
            semibold: 600,
            bold: 700,
        },
    },

    /** 입력 요소 표준 높이 — 필터바에서 높이가 어긋나지 않도록 */
    control: {
        xs: 26,
        sm: 32,
        md: 36,
        lg: 40,
    },

    /** 표 밀도 */
    table: {
        rowHeight: 34,
        headHeight: 38,
    },
} as const;

/** 인라인 style에서도 토큰을 쓸 수 있도록 :root에 주입할 CSS 변수 */
export const uiCssVars = `
    --c-canvas: ${ui.color.canvas};
    --c-surface: ${ui.color.surface};
    --c-surface-muted: ${ui.color.surfaceMuted};
    --c-surface-hover: ${ui.color.surfaceHover};

    --c-border-subtle: ${ui.color.borderSubtle};
    --c-border: ${ui.color.border};
    --c-border-strong: ${ui.color.borderStrong};

    --c-text-strong: ${ui.color.textStrong};
    --c-text: ${ui.color.text};
    --c-text-muted-strong: ${ui.color.textMutedStrong};
    --c-text-muted: ${ui.color.textMuted};
    --c-text-subtle: ${ui.color.textSubtle};

    --c-primary: ${ui.color.primary};
    --c-primary-hover: ${ui.color.primaryHover};
    --c-primary-soft: ${ui.color.primarySoft};
    --c-primary-border: ${ui.color.primaryBorder};

    --c-danger: ${ui.color.danger};
    --c-danger-soft: ${ui.color.dangerSoft};
    --c-success: ${ui.color.success};
    --c-success-soft: ${ui.color.successSoft};
    --c-warning: ${ui.color.warning};
    --c-warning-soft: ${ui.color.warningSoft};

    --r-sm: ${ui.radius.sm};
    --r-md: ${ui.radius.md};
    --r-lg: ${ui.radius.lg};
    --r-xl: ${ui.radius.xl};

    --sh-xs: ${ui.shadow.xs};
    --sh-sm: ${ui.shadow.sm};
    --sh-md: ${ui.shadow.md};
    --sh-lg: ${ui.shadow.lg};
`;
