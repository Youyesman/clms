import i18n from "i18next";

/**
 * 호출부(다른 파일)를 수정하지 않고
 * i18n 설정에 따라 날짜 포맷을 변경하는 함수
 */
export default function formatDateTime(isoDateTime: string | number | Date): string {
    if (!isoDateTime) {
        return "";
    }

    const date = new Date(isoDateTime);
    if (isNaN(date.getTime())) {
        return "";
    }

    // i18next에 현재 설정된 언어 코드를 가져옵니다. (ko, en, cn 등)
    const currentLang = i18n.language;

    // 언어 코드에 따른 locale 매핑
    const localeMap: Record<string, string> = {
        ko: "ko-KR",
        en: "en-US",
        cn: "zh-CN",
    };

    const locale = localeMap[currentLang] || navigator.language;

    return date.toLocaleString(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false, // 한국어는 '오전/오후', 중국어는 '上午/下午', 영어는 'AM/PM'
    });
}
