"""개봉 후 최종 관객 예측 + 리포트 payload.

예측 대상: log(최종관객 / 기준시점 누적관객) = 배수.  HistGradientBoosting(중앙값)
- 7일차: CLMS 기본 피처
- 14일차: 입소문 피처 + KOBIS 대형작 보강
- 21일차: CLMS 기본 피처
범위: 과거 연도별 '학습에 안 쓴' 예측 오차의 5~95% 분위 → 실제 포함률 약 80% (백테스트 2023~2025)
미래 정보 차단: 기준일 이전에 상영이 끝난 작품만 학습에 쓴다.
"""
import warnings

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

warnings.filterwarnings("ignore", category=RuntimeWarning)

MODEL_VERSION = "v2.2-2026-10"
META = ["pre_share", "rerelease", "animation", "n_한국", "n_미국", "n_일본"]
FS = {
    7: ["cum7", "decay", "release_wd"] + META,
    14: ["cum14", "decay", "decay2", "we2_we1", "wk_hold", "we1_share", "th_grow7", "th_grow14"] + META,
    21: ["cum21", "decay", "decay2", "decay3"] + META,
}
USE_KOBIS = {7: False, 14: True, 21: False}
HORIZONS = [7, 14, 21]
LEGGY_THR = float(np.log(1.18))     # 5~7일차 관객이 1~3일차보다 18%+ → 입소문 상승 신호
MIN_W1 = 1000
COVID_YEARS = (2020, 2021)


def _X(d, h):
    z = d[FS[h]].astype(float).copy()
    z[f"cum{h}"] = np.log1p(z[f"cum{h}"])
    return z


def _fit(tr, h):
    m = HistGradientBoostingRegressor(loss="quantile", quantile=0.5, max_depth=3, learning_rate=0.05, max_iter=200,
                                      min_samples_leaf=8, l2_regularization=1.0, random_state=0)
    return m.fit(_X(tr, h), np.log(tr.total / tr[f"cum{h}"]))


class Forecaster:
    def __init__(self, clms, kobis, run_daily):
        self.clms = clms
        self.kobis = kobis if kobis is not None else pd.DataFrame()
        self.run_daily = run_daily
        self.pool = clms[(~clms.excluded) & clms.completed & (clms.w1 >= MIN_W1)]
        self.kpool = self.kobis[self.kobis.completed & (self.kobis.w1 >= MIN_W1)] if not self.kobis.empty else self.kobis
        # 작품 × 개봉 N일차 관객 (7·14·21일차 사이 기준일 예측용)
        rd = run_daily.merge(clms[["release_date"]], left_on="pkey", right_index=True)
        rd["dn"] = (rd.d - rd.release_date).dt.days + 1
        self.pre = rd[rd.dn < 1].groupby("pkey").v.sum()
        self.dnmat = rd[rd.dn.between(1, 150)].pivot_table(index="pkey", columns="dn", values="v", aggfunc="sum").fillna(0)

    def _train(self, clms_part, h, before_year=None, before_date=None):
        parts = [clms_part]
        if USE_KOBIS[h] and not self.kpool.empty:
            k = self.kpool
            if before_year is not None: k = k[k.y < before_year]
            if before_date is not None: k = k[k.end < before_date]
            parts.append(k)
        return pd.concat(parts)

    # ---------- 검증 실적 ----------
    def track(self, years=None):
        years = years or [y for y in range(2023, pd.Timestamp.today().year) if (self.pool.y == y).any()]
        out = {}
        for h in HORIZONS:
            res, n = [], 0
            for vy in years:
                va = self.pool[self.pool.y == vy]
                tr = self._train(self.pool[self.pool.y < vy], h, before_year=vy)
                if len(va) == 0 or len(tr) < 30: continue
                r = np.log(va.total / va[f"cum{h}"]).values - _fit(tr, h).predict(_X(va, h))
                res.append(r)
            if not res: continue
            r = np.concatenate(res)
            # 같은 연도 롤링으로 범위 포함률도 계산 (직전 최대 9개 연도 오차로 보정)
            cover = []
            for vy in years:
                va = self.pool[self.pool.y == vy]
                if len(va) == 0: continue
                lo, hi = self._calib(h, int(vy), self.pool[self.pool.y < vy], before_year=vy)
                med = _fit(self._train(self.pool[self.pool.y < vy], h, before_year=vy), h).predict(_X(va, h))
                yv = np.log(va.total / va[f"cum{h}"]).values
                cover.append((yv >= med + lo) & (yv <= med + hi))
            pe = np.abs(np.exp(-r) - 1)
            out[str(h)] = {"n": int(len(r)), "hit30": round(float((pe <= .3).mean()), 3), "hit50": round(float((pe <= .5).mean()), 3),
                           "median_err": round(float(np.median(pe)), 3), "cover80": round(float(np.concatenate(cover).mean()), 3)}
        return {"years": [int(y) for y in years], "horizons": out, "model": MODEL_VERSION}

    def _calib(self, h, upto_year, pool, before_year=None, before_date=None):
        res = []
        for vy in range(max(2016, upto_year - 9), upto_year):
            va = pool[pool.y == vy]
            tr = self._train(pool[pool.y < vy], h, before_year=vy, before_date=before_date)
            if len(va) == 0 or len(tr) < 30: continue
            res.append(np.log(va.total / va[f"cum{h}"]).values - _fit(tr, h).predict(_X(va, h)))
        if not res:
            return np.log(0.7), np.log(1.6)
        r = np.concatenate(res)
        return float(np.quantile(r, 0.05)), float(np.quantile(r, 0.95))

    # ---------- 7·14·21일차 사이 기준일 모델 ----------
    def _feat_at(self, dn, idx):
        """dn일차 시점 피처 — 누적, 최근 3일 관객 수준(개봉 첫 3일 대비), 최근 1주/직전 1주, 기준일 요일"""
        m = self.dnmat.reindex(index=idx, columns=range(1, dn + 1), fill_value=0)
        df = self.clms.loc[idx]
        out = pd.DataFrame(index=idx)
        out["cumD"] = m.sum(1) + self.pre.reindex(idx).fillna(0)
        recent = m[[c for c in range(max(1, dn - 2), dn + 1)]].mean(1)
        out["lvl"] = np.log((recent + 1) / (m[[1, 2, 3]].mean(1) + 1))
        out["wk"] = np.log((m[[c for c in range(dn - 6, dn + 1)]].sum(1) + 1) / (m[[c for c in range(dn - 13, dn - 6)]].sum(1) + 1)) if dn >= 14 else np.nan
        out["as_wd"] = (df.release_wd + dn - 1) % 7
        for c in ["decay"] + META:
            out[c] = df[c]
        out["total"] = df.total
        out["y"] = df.y
        return out

    GEN = ["cumD", "lvl", "wk", "decay", "as_wd"] + META

    def _gcols(self, d):
        return [c for c in self.GEN if not (c == "wk" and d["wk"].isna().all())]

    def _gfit(self, tr):
        z = tr[self._gcols(tr)].astype(float).copy(); z["cumD"] = np.log1p(z.cumD)
        m = HistGradientBoostingRegressor(loss="quantile", quantile=0.5, max_depth=3, learning_rate=0.05, max_iter=200,
                                          min_samples_leaf=8, l2_regularization=1.0, random_state=0)
        return m.fit(z, np.log(tr.total / tr.cumD))

    def _gX(self, d):
        z = d[self._gcols(d)].astype(float).copy(); z["cumD"] = np.log1p(z.cumD); return z

    def _generic(self, pkey, dn, pool_f):
        F = self._feat_at(dn, list(pool_f.index) + [pkey])
        tr = F.loc[pool_f.index]; tr = tr[tr.cumD > 0]
        if len(tr) < 30:
            return None, F
        res = []
        t_y = int(self.clms.loc[pkey, "y"])
        for vy in range(max(2016, t_y - 8), t_y + 1):
            a, b = tr[tr.y < vy], tr[tr.y == vy]
            if len(b) == 0 or len(a) < 30: continue
            res.append(np.log(b.total / b.cumD).values - self._gfit(a).predict(self._gX(b)))
        lo, hi = (float(np.quantile(np.concatenate(res), q)) for q in (0.05, 0.95)) if res else (np.log(0.8), np.log(1.5))
        med = self._gfit(tr).predict(self._gX(F.loc[[pkey]]))[0]
        base = float(F.loc[pkey, "cumD"])
        item = {"h": dn, "base": int(base), "pred": int(max(base, base * np.exp(med))),
                "lo": int(max(base, base * np.exp(med + lo))), "hi": int(max(base, base * np.exp(med + hi))), "model": "기준일"}
        return item, F

    # ---------- 리포트 ----------
    def report(self, pkey, dn):
        t = self.clms.loc[pkey]
        as_of = t.release_date + pd.Timedelta(days=dn - 1)
        pool_f = self.pool[(self.pool.index != pkey) & (self.pool.end < as_of)]
        fcs = []
        for h in HORIZONS:
            if dn < h or pd.isna(t.get(f"cum{h}")) or t[f"cum{h}"] <= 0: continue
            tr = self._train(pool_f, h, before_date=as_of)
            if len(tr) < 30: continue
            lo, hi = self._calib(h, int(t.y) + 1, pool_f, before_date=as_of)
            med = _fit(tr, h).predict(_X(self.clms.loc[[pkey]], h))[0]
            base = float(t[f"cum{h}"])
            item = {"h": h, "base": int(base), "pred": int(base * np.exp(med)),
                    "lo": int(max(base, base * np.exp(med + lo))), "hi": int(base * np.exp(med + hi)),
                    "model": "입소문+대형작 보강" if USE_KOBIS[h] else "기본"}
            if h == 7:
                hist = self._train(pool_f, 14, before_date=as_of)
                mult = hist.total / hist.cum7
                big = mult >= 2 * mult.median()
                sig = hist.decay >= LEGGY_THR
                item["signal"] = {"on": bool(t.decay >= LEGGY_THR), "late_vs_early": round(float(np.exp(t.decay) - 1), 3),
                                  "rate_sig": round(float(big[sig].mean()), 3) if sig.any() else None, "n_sig": int(sig.sum()),
                                  "rate_all": round(float(big.mean()), 3), "n_all": int(len(hist))}
            fcs.append(item)

        gen_F = None
        if dn not in HORIZONS and dn > 7:
            item, gen_F = self._generic(pkey, dn, pool_f)
            if item: fcs.append(item)

        cur = self._curve(pkey)
        upto = cur[cur.dn <= dn]
        payload = {
            "pkey": pkey, "as_of": as_of.strftime("%Y-%m-%d"), "dn_now": int(dn),
            "film": {"movie_id": int(t.id), "title": t.title_ko, "release": t.release_date.strftime("%Y-%m-%d"),
                     "genre": t.genre1 or "", "nation": t.nation, "director": str(t.directors or "").split(",")[0],
                     "actors": [a for a in str(t.actors or "").split(",")[:3] if a and a != "nan"],
                     "distributor": t.distributor or "", "rerelease": bool(t.rerelease),
                     "pre": int(cur.attrs["pre"]), "cum_now": int(upto.cum.iloc[-1]) if len(upto) else 0,
                     "th_peak": int(upto.th.max()) if len(upto) else 0},
            "daily": [[int(a), int(b), int(c), int(e)] for a, b, c, e in zip(upto.dn, upto.v, upto.th, upto.cum)],
            "weekly": self._weekly(upto), "forecasts": fcs, "n_train": int(len(pool_f)),
            "excluded": bool(t.excluded),
        }
        if fcs:
            payload.update(self._comps(pkey, fcs[-1]["h"], pool_f, int(upto.cum.iloc[-1]),
                                       gen_F if fcs[-1].get("model") == "기준일" else None))
        last_dn = int(cur.dn.max()) if len(cur) else dn
        if bool(t.completed) and last_dn > dn:   # 과거 시점 재현: 이후 실제 결과(검증용)
            payload["actual_after"] = {"total": int(t.total), "curve": [[int(a), int(b)] for a, b in zip(cur.dn, cur.cum)]}
        return payload

    def _curve(self, pkey, upto=None):
        s = self.run_daily[self.run_daily.pkey == pkey].copy()
        s["dn"] = (s.d - self.clms.loc[pkey, "release_date"]).dt.days + 1
        pre = int(s[s.dn < 1].v.sum())
        s = s[s.dn >= 1].sort_values("dn")
        s["cum"] = s.v.cumsum() + pre
        if upto: s = s[s.dn <= upto]
        s.attrs["pre"] = pre
        return s

    @staticmethod
    def _weekly(s):
        if s.empty: return []
        wk = s.assign(week=(s.dn - 1) // 7 + 1).groupby("week").agg(v=("v", "sum"), days=("dn", "nunique"), th=("th", "max")).reset_index()
        wk["chg"] = (wk.v / wk.days).pct_change()   # 하루 평균끼리 비교 — 집계 중인 주가 작게 보이지 않도록
        return [{"week": int(r.week), "v": int(r.v), "days": int(r.days), "th": int(r.th),
                 "chg": None if pd.isna(r.chg) else round(float(r.chg), 3)} for r in wk.itertuples()]

    def _comps(self, pkey, h, pool_f, base, gen_F=None):
        t = self.clms.loc[pkey]
        if gen_F is not None:
            src = self.clms[["title_ko", "total", "y", "genre1", "nation", "n_한국", "animation", "rerelease", "decay"]].join(
                gen_F[["cumD", "lvl"]].rename(columns={"cumD": f"cum{h}"}), how="inner")
            cols = [f"cum{h}", "lvl", "decay", "n_한국", "animation", "rerelease"]
            pool_f = src.loc[src.index.intersection(pool_f.index)]
            row = src.loc[[pkey]]
        else:
            cols = [f"cum{h}", "decay", "decay2"] + (["decay3"] if h == 21 else []) + ["n_한국", "animation", "rerelease"]
            cols = [c for c in cols if c in pool_f]
            row = self.clms.loc[[pkey]]
        cpool = pool_f[~pool_f.y.isin(COVID_YEARS)]
        if len(cpool) < 5:
            return {"comps": [], "comp_basis": h}
        Z = cpool[cols].astype(float).fillna(0).copy(); Z[f"cum{h}"] = np.log1p(Z[f"cum{h}"])
        zt = row[cols].astype(float).fillna(0); zt[f"cum{h}"] = np.log1p(zt[f"cum{h}"])
        mu, sd = Z.mean(), Z.std().replace(0, 1)
        w = pd.Series(1.0, index=cols); w[f"cum{h}"] = 2.0
        dist = ((((Z - mu) / sd - ((zt.iloc[0] - mu) / sd)) ** 2) * w).sum(1)
        dist = dist + 0.03 * (t.y - cpool.y).clip(lower=0)      # 오래된 작품일수록 소폭 불리
        out = []
        for pk in dist.sort_values().index[:5]:
            s = self._curve(pk, 70)
            r = cpool.loc[pk]
            out.append({"title": r.title_ko, "year": int(r.y), "total": int(r.total), f"cum{h}": int(r[f"cum{h}"]),
                        "mult": round(float(r.total / r[f"cum{h}"]), 2), "genre": r.genre1 or "", "nation": r.nation,
                        "curve": [[int(a), int(b)] for a, b in zip(s.dn, s.cum)]})
        return {"comps": out, "comp_basis": h}
