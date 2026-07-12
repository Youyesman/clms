"""위탁/기타(일반극장 포함) 부금정산서 PDF 파서 — AI(OpenAI) 기반 정산 대사용.

직영 체인 엑셀(compare.py)과 달리 위탁/일반극장 정산서는 극장마다 양식이
제각각(체인 위탁관 양식, 극장 자체 양식, 팩스 스캔본 등)이라 규칙 파싱이
불가능하다. OpenAI 비전 모델에 PDF를 통째로 넘겨 (극장, 영화) 단위의
영화사(배급사) 몫 인원/공급가액/부가세/지급금을 구조화 추출한다.

- 추출 결과는 파일 sha256 기준으로 DB 캐시(AiParseCache) — 재업로드 시 무과금.
- 극장명/영화명이 시스템과 정확히 일치하지 않는 건(스캔 오독, 법인명 표기 등)은
  ai_match_names()로 시스템 후보 목록에서 한 번에 매칭한다.

샘플 검증(2026-06 위탁&기타 13종, gpt-5.4): 금액 13/13 정확.
gpt-5.4-mini는 다페이지 합계 중복·영화사/총매출 혼동이 있어 사용 금지.
"""

import base64
import concurrent.futures
import hashlib
import json

from django.conf import settings


def _model():
    return getattr(settings, "OPENAI_SETTLEMENT_MODEL", "gpt-5.4")


def _client():
    from openai import OpenAI
    return OpenAI(api_key=settings.OPENAI_API_KEY, timeout=300.0, max_retries=2)


# ── 추출 ──────────────────────────────────────────────────────────────

_ROW_PROPS = {
    "theater": {"type": "string", "description": "극장 상호/지점명 (법인표기·배급사명 아님)"},
    "movie": {"type": "string", "description": "영화 제목"},
    "date": {"type": "string", "description": "상영/공급기간 시작일 YYYY-MM-DD, 없으면 빈 문자열"},
    "date_end": {"type": "string", "description": "상영/공급기간 종료일 YYYY-MM-DD, 없으면 빈 문자열"},
    "visitors": {"type": "integer", "description": "총 관람인원(문서의 합계 인원)"},
    "supply": {"type": "integer", "description": "영화사(배급사) 몫 공급가액 (부가세 제외)"},
    "vat": {"type": "integer", "description": "영화사(배급사) 몫 부가세(VAT)"},
    "payout": {"type": "integer", "description": "영화사 지급 총액 (공급가액+부가세)"},
}

_EXTRACT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "chain": {
            "type": "string",
            "description": "정산서 발행 극장의 소속 체인. 문서 양식/로고/사업자명 기준, 불명확하면 '불명'",
            "enum": ["CGV", "롯데", "메가박스", "씨네큐", "일반극장", "불명"],
        },
        "theater_hint": {
            "type": "string",
            "description": "극장 식별에 도움되는 문서 내 정보(사업자명/주소/연락처/직인 등) 요약. 없으면 빈 문자열",
        },
        "rows": {
            "type": "array",
            "description": "(극장, 영화, 공급기간) 단위 합산 행",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": _ROW_PROPS,
                "required": list(_ROW_PROPS),
            },
        },
        "confidence": {"type": "string", "enum": ["high", "low"],
                       "description": "숫자/이름 판독이 불확실하면 low"},
        "notes": {"type": "string", "description": "특이사항·판독 불확실 부분 (없으면 빈 문자열)"},
    },
    "required": ["chain", "theater_hint", "rows", "confidence", "notes"],
}

EXTRACT_PROMPT = """이 PDF는 극장이 영화 배급사에게 보내는 '부금(정산)계산서'입니다. 배급사 입장에서 받을 돈을 대사(검증)하기 위해 데이터를 추출합니다.
양식은 극장마다 제각각입니다(체인 위탁관 정산서, 개별 극장 자체 양식, 팩스 스캔본 등).

■ 역할 구분 (매우 중요 — 세 가지를 절대 혼동하지 말 것)
- 배급사(영화사): 돈을 받는 쪽. 문서에 '주식회사 ○○', '(주)○○', '귀하', '배급사' 등으로 표기. → theater/movie 필드에 넣지 말 것.
- theater: 정산서를 발행한 극장의 상호/지점명 (예: 'CGV 범계', '가양', '예산시네마', '마산버스터미널 시네마'). 문서 제목, 극장명/지점명/대표영화관 칸, 하단 사업자 정보(상호/직인)에서 찾을 것.
- movie: 영화 제목 (제명/영화명 칸).

■ 금액: 반드시 '영화사(배급사) 몫'만 추출 (매우 중요)
- 대부분 총매출을 부율(예: 50%)로 나눠 '영화사'와 '극장' 몫을 나란히 표기함. 반드시 '영화사' 쪽 행/열의 값을 사용.
- supply: 영화사 몫 공급가액(부가세 제외), vat: 영화사 몫 부가세, payout: 영화사 지급 총액(=supply+vat, 문서의 '영화사수령액/실지급액/부금실지급액/청구액' 등).
- 총수입금액/총매출/발권금액/입장액 합계는 절대 supply가 아님.
- 검산: supply + vat = payout 이어야 함. 안 맞으면 notes에 기록하고 confidence low.

■ 행 단위
- (극장, 영화) 단위로 합산해 rows에 1행씩. 요금대별/일자별/포맷별 상세 행은 출력하지 않음.
- 한 문서에 극장·영화·정산건이 여러 개면 각각 별도 행. 단, 같은 (극장, 영화, 공급기간)의 정산 합계가 동일하게 여러 페이지에 반복 인쇄된 경우(가격대 목록이 길어 페이지가 나뉜 것)는 **하나의 정산건**임: 금액 합계는 한 번만 세고, 인원은 각 페이지 인원 합계의 합.
- 공급기간이 다른 페이지는 별도 정산건 → 별도 행. (한 행으로 합치지 말 것)

■ 기타
- visitors: 해당 정산건의 총 관람인원(문서의 합계 인원).
- 문서에 표기된 숫자를 그대로 옮길 것. 임의 계산 금지. 문서 합계와 상세 합이 다르면 notes 기록 + confidence low.
- 팩스/스캔으로 글자·숫자 판독이 불확실하면 confidence low + notes에 어떤 값이 불확실한지 기록.
- 금액은 원 단위 정수(콤마 제거). 날짜는 YYYY-MM-DD.
"""


def parse_settlement_pdf(filename, data):
    """PDF 1개 → {"chain","theater_hint","rows","confidence","notes"} (해시 캐시)."""
    from settlement.models import AiParseCache

    model = _model()
    file_hash = hashlib.sha256(data).hexdigest()
    cached = AiParseCache.objects.filter(file_hash=file_hash, model=model).first()
    if cached:
        return cached.result

    resp = _client().responses.create(
        model=model,
        input=[{
            "role": "user",
            "content": [
                {"type": "input_file", "filename": filename,
                 "file_data": "data:application/pdf;base64," + base64.b64encode(data).decode()},
                {"type": "input_text", "text": EXTRACT_PROMPT},
            ],
        }],
        text={"format": {"type": "json_schema", "name": "settlement",
                         "schema": _EXTRACT_SCHEMA, "strict": True}},
    )
    result = json.loads(resp.output_text)
    AiParseCache.objects.update_or_create(
        file_hash=file_hash, model=model,
        defaults={"filename": filename[:255], "result": result})
    return result


def parse_settlement_pdfs(files):
    """(filename, bytes) 목록 병렬 AI 추출 → [{filename, result}] (입력 순서 유지).

    한 파일이라도 실패하면 ValueError(파일명 포함) — 부분 결과로 대사하면
    누락을 일치로 오인할 수 있어 전체 실패 처리한다.
    """
    def run(item):
        name, data = item
        return parse_settlement_pdf(name, data)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        futures = [ex.submit(run, item) for item in files]
        results = []
        for (name, _), fut in zip(files, futures):
            try:
                results.append({"filename": name, "result": fut.result()})
            except Exception as e:
                raise ValueError(f"'{name}' AI 분석 실패: {e}") from e
    return results


# ── 이름 매칭 (극장/영화) ─────────────────────────────────────────────

_MATCH_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "theaters": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "file_name": {"type": "string", "description": "정산서의 극장명 (입력 그대로)"},
                    "client_name": {"type": "string",
                                    "description": "후보 목록에서 고른 시스템 거래처명 (목록의 표기 그대로). 확신할 수 없으면 빈 문자열"},
                },
                "required": ["file_name", "client_name"],
            },
        },
        "movies": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "file_name": {"type": "string", "description": "정산서의 영화명 (입력 그대로)"},
                    "title": {"type": "string",
                              "description": "후보 목록에서 고른 영화 제목 (목록의 표기 그대로). 확신할 수 없으면 빈 문자열"},
                },
                "required": ["file_name", "title"],
            },
        },
    },
    "required": ["theaters", "movies"],
}

MATCH_PROMPT = """영화 부금정산서(극장→배급사)에서 추출한 극장명/영화명을 시스템(정산 시스템)의 거래처/영화 후보 목록과 매칭하세요.

극장명 매칭:
- 극장은 법인명/운영사명으로 표기되기도 함. hint(사업자명·주소·연락처)와 파일명, 체인 정보를 적극 활용할 것 (예: '마산버스터미널 시네마' + 주소 '합성동' → '롯데마산(합성동)').
- 체인 지점은 시스템에 '롯데가양', 'CGV 범계', '메가박스김천'처럼 브랜드+지점명으로 등록돼 있음.
- 합리적으로 확신할 수 있는 경우에만 매칭하고, 애매하면 빈 문자열. (엉뚱한 극장에 매칭되면 정산 대사가 틀어짐)

영화명 매칭:
- 여기 온 영화명은 이미 정확 일치에 실패한 것들 = 대부분 팩스/스캔 오독임 (예: '논둑자'/'뉴투자' → 실제 '눈동자').
- 글자 수가 같거나 비슷하고 자형이 유사한 후보가 있으면 **적극적으로** 그 후보로 매칭할 것. 후보 목록은 해당 월에 실제 상영된 영화 전체이므로, 비슷한 제목이 하나뿐이면 그것이 정답일 가능성이 매우 높음.
- 어떤 후보와도 유사하지 않은 제목(전혀 다른 영화)만 빈 문자열.

반드시 후보 목록에 있는 표기 그대로 답할 것.
"""


def ai_match_names(theaters, client_candidates, movies, movie_candidates):
    """미매칭 극장/영화명 → 시스템 이름 매핑 (한 번의 호출).

    theaters: [{"name", "hint", "chain", "filename"}]
    client_candidates: ["롯데가양 [롯데/위탁]", ...] 표기용 문자열 목록
    movies: ["논둑자", ...] / movie_candidates: ["눈동자", ...]
    반환: {"theaters": {file_name: client_name}, "movies": {file_name: title}}
    (반환 이름의 후보 목록 포함 여부 검증은 호출측에서 수행)
    """
    if not theaters and not movies:
        return {"theaters": {}, "movies": {}}

    parts = [MATCH_PROMPT]
    if theaters:
        lines = [f"- 극장명: {t['name']} | 체인추정: {t.get('chain') or '불명'} | "
                 f"파일명: {t.get('filename') or '-'} | hint: {t.get('hint') or '-'}"
                 for t in theaters]
        parts.append("■ 매칭할 극장명:\n" + "\n".join(lines))
        parts.append("■ 시스템 거래처 후보 (이름 [체인/구분]):\n" + "\n".join(client_candidates))
    if movies:
        parts.append("■ 매칭할 영화명:\n" + "\n".join(f"- {m}" for m in movies))
        parts.append("■ 시스템 영화 후보:\n" + "\n".join(movie_candidates))

    resp = _client().responses.create(
        model=_model(),
        input=[{"role": "user", "content": [{"type": "input_text", "text": "\n\n".join(parts)}]}],
        text={"format": {"type": "json_schema", "name": "matching",
                         "schema": _MATCH_SCHEMA, "strict": True}},
    )
    out = json.loads(resp.output_text)
    return {
        "theaters": {t["file_name"]: t["client_name"] for t in out.get("theaters", []) if t["client_name"]},
        "movies": {m["file_name"]: m["title"] for m in out.get("movies", []) if m["title"]},
    }
