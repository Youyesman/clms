// A001: [배급사뷰] 시간표 조회 전 탭 엑셀 다운로드 공용 헬퍼
// 백엔드 score/timetable-excel/ 이 화면과 같은 조회 로직으로 엑셀을 생성한다 (그래프 제외)
import { AxiosGet } from "../../../axios/Axios";

export async function downloadTimetableExcel(
    tab: "timetable" | "seats" | "theaters" | "screens" | "shows",
    params: Record<string, string>,
    fallbackName: string
) {
    const response: any = await AxiosGet("score/timetable-excel/", {
        params: { tab, ...params },
        responseType: "blob",
    });
    const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    let filename = `${fallbackName}.xlsx`;
    const cd = response.headers?.["content-disposition"];
    if (cd) {
        // 한글 파일명은 filename*=utf-8'' 형식으로 오므로 우선 처리
        const star = cd.match(/filename\*=(?:utf-8'')?([^;]+)/i);
        const plain = cd.match(/filename="?([^";]+)"?/);
        if (star?.[1]) filename = decodeURIComponent(star[1]);
        else if (plain?.[1]) filename = decodeURIComponent(plain[1]);
    }
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}
