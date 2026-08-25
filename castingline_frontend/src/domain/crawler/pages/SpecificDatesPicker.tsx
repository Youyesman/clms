import React, { useState } from "react";
import { CustomCheckbox } from "../../../components/common/CustomCheckbox";

/* C008: 특정 날짜(비연속 다중 선택) 선택기 — 엑셀 다운로드·보고서 생성 모달 공용.
   체크를 켜면 연속 기간 대신 추가한 날짜들만 대상으로 생성한다. */

interface SpecificDatesPickerProps {
    enabled: boolean;
    setEnabled: (v: boolean) => void;
    dates: string[];
    setDates: (updater: (prev: string[]) => string[]) => void;
    label?: string;
}

export const SpecificDatesPicker: React.FC<SpecificDatesPickerProps> = ({
    enabled,
    setEnabled,
    dates,
    setDates,
    label = "특정 날짜만 골라서 생성 (비연속 다중 선택)",
}) => {
    const [input, setInput] = useState("");

    return (
        <div style={{ marginTop: 8 }}>
            <CustomCheckbox label={label} checked={enabled} onChange={() => setEnabled(!enabled)} />
            {enabled && (
                <div style={{ marginTop: 6 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                        <input
                            type="date"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            style={{ flex: 1, height: 30, padding: "0 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, color: "#475569", outline: "none" }}
                        />
                        <button
                            type="button"
                            onClick={() => {
                                if (!input) return;
                                setDates((prev) => (prev.includes(input) ? prev : [...prev, input].sort()));
                                setInput("");
                            }}
                            style={{ height: 30, padding: "0 12px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            추가
                        </button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {dates.map((d) => (
                            <span key={d}
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                                {d}
                                <span
                                    onClick={() => setDates((prev) => prev.filter((x) => x !== d))}
                                    style={{ cursor: "pointer", fontWeight: 700 }}>×</span>
                            </span>
                        ))}
                        {dates.length === 0 && (
                            <span style={{ fontSize: 11, color: "#94a3b8" }}>날짜를 추가하세요 (예: 8/29, 8/30, 9/5, 9/6)</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
