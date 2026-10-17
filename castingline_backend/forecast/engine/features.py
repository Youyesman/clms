"""개봉 후 예측 피처 — CLMS·KOBIS 공통으로 계산 가능한 것만 사용
입력 daily: columns [pkey, d(datetime), v(관객), th(극장/스크린 수)], rel: Series pkey→개봉일
극장 수는 CLMS(극장 수)와 KOBIS(스크린 수) 단위가 달라서 '증감 비율'만 사용
좌판율(occ*)은 CLMS만 계산 가능 (daily에 seats·v_seat 열이 있을 때) — KOBIS는 NaN
"""
import numpy as np, pandas as pd


def build_features(daily, rel):
    x = daily.merge(rel.rename("rel"), left_on="pkey", right_index=True)
    x["dn"] = (x.d - x.rel).dt.days + 1
    x["wd"] = x.d.dt.weekday                      # 0=월 … 5=토 6=일
    g = lambda m, col="v": x[m].groupby("pkey")[col].sum()
    out = pd.DataFrame(index=rel.index)
    out["pre"] = g(x.dn < 1)
    out["d1_3"] = g(x.dn.between(1, 3))
    out["d5_7"] = g(x.dn.between(5, 7))
    out["w1"] = g(x.dn.between(1, 7))
    out["w2"] = g(x.dn.between(8, 14))
    out["w3"] = g(x.dn.between(15, 21))
    out = out.fillna(0)

    # 개봉 후 첫 주말(토·일) / 둘째 주말
    first_sat = x[(x.dn >= 1) & (x.wd == 5)].groupby("pkey").dn.min()
    x = x.merge(first_sat.rename("sat1"), left_on="pkey", right_index=True, how="left")
    we1 = g(x.dn.between(x.sat1, x.sat1 + 1)); we2 = g(x.dn.between(x.sat1 + 7, x.sat1 + 8))
    out["we2_we1"] = np.log((we2 + 1) / (we1 + 1)).reindex(out.index)        # 2주차 주말 유지율 (D+14부터 사용)
    # 첫 주말 앞 평일 vs 첫 주말 뒤 평일(월~) 일평균 — D+7 안에서 보이는 입소문 신호
    pre_wk = x[(x.dn >= 1) & (x.dn < x.sat1) & (x.wd <= 4)].groupby("pkey").v.mean()
    post_wk = x[(x.dn > x.sat1 + 1) & (x.dn <= 7) & (x.wd <= 4)].groupby("pkey").v.mean()
    out["wk_hold"] = np.log((post_wk + 1) / (pre_wk + 1)).reindex(out.index)  # 개봉 요일에 따라 결측 가능
    out["we1_share"] = (we1 / out.w1.replace(0, np.nan)).reindex(out.index)   # 1주차 중 주말 비중(쏠림)

    th = x.pivot_table(index="pkey", columns="dn", values="th", aggfunc="sum")
    def col(d): return th[d] if d in th.columns else pd.Series(np.nan, index=th.index)
    out["th_grow7"] = np.log((col(7) + 1) / (col(1) + 1)).reindex(out.index)
    out["th_grow14"] = np.log((col(14) + 1) / (col(7) + 1)).reindex(out.index)

    out["decay"] = np.log((out.d5_7 + 1) / (out.d1_3 + 1))
    out["decay2"] = np.log((out.w2 + 1) / (out.w1 + 1))
    out["cum7"] = out.pre + out.w1
    out["cum14"] = out.cum7 + out.w2
    out["cum21"] = out.cum14 + out.w3
    out["decay3"] = np.log((out.w3 + 1) / (out.w2 + 1))
    out["pre_share"] = out.pre / out.cum7.replace(0, np.nan)

    # 좌판율 = 좌석수 등록된 관의 관객 / 공급 좌석
    if "seats" in x:
        def occ(lo, hi):
            m = x.dn.between(lo, hi)
            return (g(m, "v_seat") / g(m, "seats").replace(0, np.nan)).reindex(out.index)
        out["occ7"] = occ(1, 7)
        out["occ_trend"] = np.log((occ(5, 7) + 1e-3) / (occ(1, 3) + 1e-3))   # 1주차 안 좌판율 유지 (입소문)
        out["occ14"] = occ(8, 14)
        out["occ21"] = occ(15, 21)
    else:
        for c in ["occ7", "occ_trend", "occ14", "occ21"]:
            out[c] = np.nan
    return out
