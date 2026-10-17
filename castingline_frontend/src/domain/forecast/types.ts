export interface ForecastMovie {
    movie_id: number;
    title: string;
    release: string;
    total: number;
    completed: boolean;
    distributor: string;
}

export interface ForecastSignal {
    on: boolean;
    late_vs_early: number;
    rate_sig: number | null;
    n_sig: number;
    rate_all: number;
    n_all: number;
}

export interface ForecastItem {
    h: number;
    base: number;
    pred: number;
    lo: number;
    hi: number;
    model: string;
    signal?: ForecastSignal;
}

export interface ForecastComp {
    title: string;
    year: number;
    total: number;
    mult: number;
    genre: string;
    nation: string;
    curve: [number, number][];
    [key: string]: unknown;
}

export interface ForecastTrackHorizon {
    n: number;
    hit30: number;
    hit50: number;
    median_err: number;
    cover80: number;
}

export interface ForecastPayload {
    as_of: string;
    dn_now: number;
    film: {
        movie_id: number;
        title: string;
        release: string;
        genre: string;
        nation: string;
        director: string;
        actors: string[];
        distributor: string;
        rerelease: boolean;
        pre: number;
        cum_now: number;
        th_peak: number;
    };
    daily: [number, number, number, number][]; // [일차, 당일 관객, 극장 수, 누적]
    weekly: { week: number; v: number; days: number; th: number; chg: number | null }[];
    forecasts: ForecastItem[];
    comps?: ForecastComp[];
    comp_basis?: number;
    actual_after?: { total: number; curve: [number, number][] };
    track?: { years: number[]; horizons: Record<string, ForecastTrackHorizon> };
    available_days: number[];
    score_note?: string;
}

/** 관객수 → "65.9만" 표기 (100만 이상은 정수) */
export const man = (n: number) => {
    const v = n / 10000;
    if (v >= 100) return Math.round(v).toLocaleString();
    return (Math.round(v * 10) / 10).toLocaleString();
};
export const pct = (v: number) => `${Math.round(v * 100)}%`;
