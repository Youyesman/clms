# -*- coding: utf-8 -*-
"""흥행 전망 PDF (A4 가로 1장).

- 단독 리포트: build_forecast_pdf(payload, out_path)
- 상영현황 보고서(P001)에 붙일 때: forecast_page(payload, title_prefix) → flowable 목록
폰트·로고·표 스타일은 상영현황 보고서와 같은 것을 쓴다.
"""
import math

from reportlab.graphics.shapes import Drawing, Line, PolyLine, Polygon, Rect, String, Circle
from reportlab.lib import colors
from reportlab.platypus import (BaseDocTemplate, Frame, KeepInFrame, PageTemplate, Paragraph, Spacer, Table,
                                TableStyle)

from crawler.report.pdf_renderer import (_FONT, _FONT_B, CONTENT_W, M_BOTTOM, M_LEFT, M_RIGHT, M_TOP, PAGE_SIZE,
                                         _base_table_style, _draw_logo, _ensure_fonts, _header_cells, _p,
                                         _page_header, _styles)

BLUE = colors.HexColor("#2a78d6")
BAND = colors.Color(42 / 255, 120 / 255, 214 / 255, alpha=0.16)
ORANGE = colors.HexColor("#eb6834")
GREY = colors.HexColor("#a6a9ad")
BAND_SOLID = colors.HexColor("#c7d7f5")
INK = colors.HexColor("#14171c")
MUTED = colors.HexColor("#83868d")
GRIDC = colors.HexColor("#e2e3df")


def man(n):
    v = n / 10000
    if v >= 100:
        return f"{round(v):,}"
    return f"{v:.1f}".rstrip("0").rstrip(".")


def _value_at(curve, d):
    v = None
    for day, val in curve:
        if day > d:
            break
        v = val
    return v


def _projection(payload):
    """기준일 이후 예상 흐름 — 유사 작품들이 (기준일→최종) 사이에서 d일차까지 채운 비율의 중앙값을 따라 이어 그림.
    화면(ForecastChart.tsx)과 같은 규칙."""
    cut = payload["dn_now"]
    base = payload["film"]["cum_now"]
    last = payload["forecasts"][-1]
    comps = []
    for c in payload.get("comps", []):
        ref = _value_at(c["curve"], payload.get("comp_basis", cut)) or base or 1
        comps.append([(d, v * base / ref) for d, v in c["curve"]])
    comp_end = max([c[-1][0] for c in comps if c] or [0])
    end = max(cut + 21, min(comp_end or cut + 42, cut + 70))
    proj, prev = [], 0.0
    for d in range(cut, end + 1):
        fr = []
        for c in comps:
            fin, v = c[-1][1], _value_at(c, d)
            if fin - base > 0 and v is not None:
                fr.append(min(1.0, max(0.0, (v - base) / (fin - base))))
        p = 1.0 if d == end else (sorted(fr)[len(fr) // 2] if fr else 1 - math.exp(-(d - cut) / 8))
        prev = max(prev, p)
        proj.append((d, prev))
    line = lambda target: [(d, base + (target - base) * p) for d, p in proj]
    return line(last["pred"]), line(last["lo"]), line(last["hi"]), end


def _chart(payload, w, h):
    fcs = payload["forecasts"]
    last = fcs[-1]
    daily = payload["daily"]
    cut = payload["dn_now"]
    base = payload["film"]["cum_now"]
    after = (payload.get("actual_after") or {}).get("curve") or []
    mid, lo, hi, end = _projection(payload)
    x_max = max([end] + [p[0] for p in after])
    y_raw = max(last["hi"], (payload.get("actual_after") or {}).get("total", 0))
    step = next(s for s in [10000, 20000, 50000, 100000, 200000, 250000, 500000, 1000000, 2000000, 5000000, 10000000] if y_raw / s <= 6)
    y_max = -(-y_raw // step) * step
    ml, mr, mt, mb = 40, 70, 8, 22
    X = lambda d: ml + (d - 1) / (x_max - 1) * (w - ml - mr)
    Y = lambda v: mb + v / y_max * (h - mt - mb)
    flat = lambda pts: [q for a, b in pts for q in (X(a), Y(b))]
    D = Drawing(w, h)
    v = 0
    while v <= y_max:
        D.add(Line(ml, Y(v), w - mr, Y(v), strokeColor=GRIDC, strokeWidth=0.5))
        D.add(String(ml - 4, Y(v) - 3, (man(v) + "만") if v else "0", fontName=_FONT, fontSize=6.5, fillColor=MUTED, textAnchor="end"))
        v += step
    d = 1
    while d <= x_max:
        if d == 1 or X(d) < w - mr - 16:
            D.add(String(X(d), mb - 11, "개봉일" if d == 1 else f"{d}일", fontName=_FONT, fontSize=6.5, fillColor=MUTED, textAnchor="middle"))
        d += 6 if d == 1 else 7
    D.add(Line(X(cut), mb, X(cut), h - mt, strokeColor=MUTED, strokeWidth=0.5, strokeDashArray=[2, 3]))
    D.add(String(X(cut) + 3, h - mt - 7, f"기준일 (개봉 {cut}일차)", fontName=_FONT, fontSize=6.5, fillColor=MUTED))
    D.add(Polygon(flat(hi) + flat(list(reversed(lo))), fillColor=BAND, strokeColor=None))
    D.add(PolyLine(flat(mid), strokeColor=BLUE, strokeWidth=1.4, strokeDashArray=[4, 3]))
    if after:
        pts = [p for p in after if p[0] >= cut]
        if len(pts) > 1:
            D.add(PolyLine(flat(pts), strokeColor=ORANGE, strokeWidth=1.2, strokeDashArray=[1.5, 2]))
    pts = [(r[0], r[3]) for r in daily]
    if len(pts) > 1:
        D.add(PolyLine(flat(pts), strokeColor=INK, strokeWidth=1.6))
    D.add(Circle(X(cut), Y(base), 2.6, fillColor=INK, strokeColor=colors.white))
    D.add(String(X(cut) - 5, Y(base) + 6, f"현재 {man(base)}만", fontName=_FONT_B, fontSize=6.5, fillColor=INK, textAnchor="end"))
    xe = w - mr + 12
    D.add(Rect(xe - 4, Y(last["lo"]), 8, max(2, Y(last["hi"]) - Y(last["lo"])), rx=3, ry=3, fillColor=BAND, strokeColor=BLUE, strokeWidth=0.8))
    D.add(Line(xe - 7, Y(last["pred"]), xe + 7, Y(last["pred"]), strokeColor=BLUE, strokeWidth=1.8))
    D.add(String(xe + 10, Y(last["pred"]) - 3, man(last["pred"]) + "만", fontName=_FONT_B, fontSize=7, fillColor=INK))
    if Y(last["hi"]) - Y(last["pred"]) > 9:
        D.add(String(xe + 10, Y(last["hi"]) - 3, man(last["hi"]) + "만", fontName=_FONT, fontSize=6.5, fillColor=MUTED))
    if Y(last["pred"]) - Y(last["lo"]) > 9:
        D.add(String(xe + 10, Y(last["lo"]) - 3, man(last["lo"]) + "만", fontName=_FONT, fontSize=6.5, fillColor=MUTED))
    D.add(String(xe, mb - 11, "예상 최종", fontName=_FONT, fontSize=6.5, fillColor=MUTED, textAnchor="middle"))
    if after:
        tot = payload["actual_after"]["total"]
        D.add(Circle(xe, Y(tot), 2.6, fillColor=ORANGE, strokeColor=colors.white))
        D.add(String(xe - 7, Y(tot) + 4, f"실제 {man(tot)}만", fontName=_FONT_B, fontSize=6.5, fillColor=INK, textAnchor="end"))
    return D


def _legend(has_after):
    items = [("━", INK, "실제 누적 관객"), ("- -", BLUE, "앞으로 예상되는 누적 관객"), ("■", BAND_SOLID, "예상 범위")]
    if has_after:
        items.append(("···", ORANGE, "기준일 이후 실제 누적"))
    txt = "&nbsp;&nbsp;&nbsp;".join(f'<font color="{c.hexval().replace("0x", "#")}">{s}</font> {t}' for s, c, t in items)
    return _p(txt, size=7, align="LEFT", color=MUTED)


def _caption(payload):
    last = payload["forecasts"][-1]
    return _p(f"검은 선은 기준일까지 실제 누적 관객, 파란 점선은 비슷한 작품들이 같은 시점 이후 늘어난 모양을 따라 그린 예상 흐름입니다. "
              f"파란 영역은 실제 결과가 들어올 가능성이 높은 범위({man(last['lo'])}만~{man(last['hi'])}만 명)입니다.",
              size=6.8, align="LEFT", color=MUTED)


def forecast_page(payload, title="흥행 전망"):
    """한 장 분량 flowable 목록"""
    _ensure_fonts()
    S = _styles()
    f = payload["film"]
    fcs = payload["forecasts"]
    story = []
    _page_header(story, S, title,
                 f"작품명 {f['title']} | 개봉 {f['release']} | 기준일 {payload['as_of']} (개봉 {payload['dn_now']}일차) | 전국 관객")
    if not fcs:
        story.append(_p("개봉 7일이 지나야 예측할 수 있습니다.", size=10, align="LEFT"))
        return story
    if payload.get("score_note"):
        story += [_p(payload["score_note"], size=8, align="LEFT", color=colors.HexColor("#92400e")), Spacer(1, 6)]
    last = fcs[-1]
    w2 = next((w for w in payload["weekly"] if w["week"] == 2), None)
    kpi = Table([
        [_p("예상 최종 관객", size=8.5, bold=True), _p("예상 범위 (적중 가능성 약 80%)", size=8.5, bold=True),
         _p(f"누적 관객 (개봉 {payload['dn_now']}일차)", size=8.5, bold=True), _p("2주차 관객 변화", size=8.5, bold=True)],
        [_p(f"{man(last['pred'])}만 명", size=15, bold=True), _p(f"{man(last['lo'])}만 ~ {man(last['hi'])}만 명", size=11),
         _p(f"{man(f['cum_now'])}만 명", size=13, bold=True),
         _p(f"{round(w2['chg'] * 100)}%" if w2 and w2["chg"] is not None else "-", size=13, bold=True)],
    ], colWidths=[CONTENT_W / 4] * 4)
    kpi.setStyle(TableStyle(_base_table_style() + [("TOPPADDING", (0, 1), (-1, 1), 7), ("BOTTOMPADDING", (0, 1), (-1, 1), 7)]))
    story += [kpi, Spacer(1, 8)]

    left_w, right_w = CONTENT_W * 0.6, CONTENT_W * 0.4 - 10
    chart = _chart(payload, left_w, 205)
    # 시점별 전망
    rows = [_header_cells(["기준일", "당시 누적", "예상 최종", "예상 범위"])]
    for s in fcs:
        rows.append([_p(f"{s['h']}일차", size=8), _p(f"{man(s['base'])}만", size=8), _p(f"{man(s['pred'])}만", size=8, bold=True),
                     _p(f"{man(s['lo'])}만~{man(s['hi'])}만", size=8)])
    tl = Table(rows, colWidths=[right_w * x for x in (.18, .24, .24, .34)])
    tl.setStyle(TableStyle(_base_table_style()))
    rows = [_header_cells(["주차", "관객", "전주 대비", "최대 극장"])]
    for wk in payload["weekly"]:
        rows.append([_p(f"{wk['week']}주차", size=8), _p(f"{wk['v']:,}", size=8),
                     _p("-" if wk["chg"] is None else f"{round(wk['chg'] * 100)}%", size=8), _p(wk["th"], size=8)])
    wt = Table(rows, colWidths=[right_w * x for x in (.2, .3, .25, .25)])
    wt.setStyle(TableStyle(_base_table_style()))
    right = [Paragraph("기준일별 예측", S["section"]), Spacer(1, 3), tl, Spacer(1, 8),
             Paragraph("주차별 실적", S["section"]), Spacer(1, 3), wt]
    sig = next((s.get("signal") for s in fcs if s.get("signal")), None)
    if sig:
        diff = round(sig["late_vs_early"] * 100)
        if sig["on"]:
            txt = f"<b>입소문 확산 조짐이 보입니다.</b> 개봉 5~7일차 관객이 1~3일차보다 {diff}% 많습니다."
            if sig.get("rate_sig") is not None:
                txt += f" 과거 비슷한 흐름을 보인 {sig['n_sig']}편 중 {round(sig['rate_sig'] * 100)}%는 최종 관객이 예상의 2배를 넘었습니다."
        else:
            level = f"{diff}% 많은" if diff >= 0 else f"{-diff}% 적은"
            txt = (f"<b>입소문 확산 조짐은 아직 없습니다.</b> 개봉 5~7일차 관객이 1~3일차보다 {level} 수준입니다"
                   f"(18% 이상 많으면 확산 조짐으로 봅니다).")
        right += [Spacer(1, 6), _p(txt, size=7.2, align="LEFT", color=ORANGE if sig["on"] else MUTED)]
    body = Table([[[Paragraph("누적 관객 추이", S["section"]), Spacer(1, 2), _legend(bool(payload.get("actual_after"))), chart, _caption(payload)],
                   right]], colWidths=[left_w + 10, right_w])
    body.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                              ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [body, Spacer(1, 8)]

    comps = payload.get("comps") or []
    if comps:
        h = payload["comp_basis"]
        story += [Paragraph(f"유사 작품 (개봉 {h}일차까지 관객 규모와 감소 흐름이 비슷했던 작품, 2020~2021년 제외)", S["section"]), Spacer(1, 3)]
        rows = [_header_cells(["작품", "개봉연도", "국가·장르", f"{h}일차 누적", "최종 관객", "최종/누적"])]
        for c in comps:
            rows.append([_p(c["title"], size=8, align="LEFT"), _p(c["year"], size=8), _p(f"{c['nation']}·{c['genre']}", size=8),
                         _p(f"{man(c['cum' + str(h)])}만", size=8), _p(f"{man(c['total'])}만", size=8), _p(f"{c['mult']:.2f}배", size=8)])
        ct = Table(rows, colWidths=[CONTENT_W * x for x in (.34, .1, .16, .14, .14, .12)])
        ct.setStyle(TableStyle(_base_table_style()))
        story += [ct, Spacer(1, 6)]

    tk = (payload.get("track") or {}).get("horizons") or {}
    if tk:
        yrs = payload["track"]["years"]
        parts = [f"개봉 {k}일차 기준 {round(v['hit30'] * 100)}%" for k, v in tk.items() if k in ("7", "14")]
        n = next(iter(tk.values()))["n"]
        story.append(_p(f"※ 예측 정확도: {min(yrs)}~{max(yrs)}년 개봉작 {n}편을 당시 알 수 있던 데이터만으로 예측했을 때, "
                        f"최종 관객과의 차이가 30% 이내였던 비율은 " + ", ".join(parts) + "입니다. "
                        "예상 범위는 실제 결과가 들어올 가능성이 약 80%인 구간입니다. "
                        "자료: 캐스팅라인 전국 극장 스코어, KOBIS 일별 박스오피스·영화정보.", size=7, align="LEFT", color=MUTED))
    return story


def build_forecast_pdf(payload, out_path):
    _ensure_fonts()
    avail_h = PAGE_SIZE[1] - M_TOP - M_BOTTOM
    story = [KeepInFrame(CONTENT_W, avail_h, forecast_page(payload, "흥행 전망 리포트"), mode="shrink")]
    doc = BaseDocTemplate(out_path, pagesize=PAGE_SIZE, leftMargin=M_LEFT, rightMargin=M_RIGHT, topMargin=M_TOP, bottomMargin=M_BOTTOM)
    frame = Frame(M_LEFT, M_BOTTOM, CONTENT_W, avail_h, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame], onPage=_draw_logo)])
    doc.build(story)
