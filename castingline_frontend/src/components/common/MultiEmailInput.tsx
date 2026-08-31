/**
 * S001(0829): 메일 주소 다중 입력 (태그/칩 방식)
 *
 * - ',' 또는 ';' 또는 Enter 로 주소를 확정해 칩으로 만든다.
 * - 값은 부모에 항상 "주소1, 주소2" 형태의 한 문자열로 돌려준다 (DB 저장 형식과 동일).
 * - 형식이 맞지 않는 주소는 빨간 칩으로 표시해 저장 전에 바로 알 수 있게 한다.
 */
import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { X } from "@phosphor-icons/react";
import { ui } from "../../styles/uiTokens";

export const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** ',' / ';' 구분 문자열 → 주소 배열 (공백·빈 항목 제거) */
export const splitEmails = (raw: string | null | undefined): string[] =>
    (raw ?? "")
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);

type Props = {
    label?: string;
    value: string;
    setValue: (v: string) => void;
    /** 입력 가능한 최대 개수 (기본 3) */
    max?: number;
    disabled?: boolean;
    placeholder?: string;
};

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
`;

const LabelText = styled.label`
    color: ${ui.color.textMuted};
    font-size: ${ui.font.size.sm};
    font-family: ${ui.font.family};
    font-weight: ${ui.font.weight.semibold};
    line-height: 16px;
    white-space: nowrap;
`;

const Box = styled.div<{ $disabled?: boolean }>`
    min-height: ${ui.control.sm}px;
    padding: 3px 8px;
    background: ${({ $disabled }) => ($disabled ? ui.color.surfaceSunken : ui.color.surface)};
    border-radius: ${ui.radius.md};
    outline: 1px solid ${ui.color.borderStrong};
    outline-offset: -1px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    transition: all 0.15s ease;

    &:hover {
        outline-color: ${ui.color.textSubtle};
    }
    &:focus-within {
        outline: 1px solid ${ui.color.primary};
        box-shadow: 0 0 0 3px ${ui.color.primarySoft};
    }
`;

const Chip = styled.span<{ $invalid?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    padding: 1px 4px 1px 8px;
    border-radius: ${ui.radius.pill};
    font-family: ${ui.font.family};
    font-size: ${ui.font.size.xs};
    font-weight: ${ui.font.weight.semibold};
    border: 1px solid ${({ $invalid }) => ($invalid ? ui.color.danger : ui.color.primaryBorder)};
    background: ${({ $invalid }) => ($invalid ? ui.color.dangerSoft : ui.color.primarySoft)};
    color: ${({ $invalid }) => ($invalid ? ui.color.danger : ui.color.primaryHover)};

    button {
        display: inline-flex;
        align-items: center;
        border: none;
        background: none;
        cursor: pointer;
        color: inherit;
        padding: 2px;
        border-radius: ${ui.radius.pill};
        &:hover { background: rgba(15, 23, 42, 0.08); }
    }
`;

const Bare = styled.input`
    flex: 1;
    min-width: 120px;
    border: none;
    outline: none;
    background: transparent;
    font-family: ${ui.font.family};
    font-size: ${ui.font.size.sm};
    color: ${ui.color.text};
    height: 22px;
    &::placeholder { color: ${ui.color.textSubtle}; }
    &:disabled { background: transparent; }
`;

const Hint = styled.div<{ $error?: boolean }>`
    font-size: ${ui.font.size.xs};
    font-family: ${ui.font.family};
    color: ${({ $error }) => ($error ? ui.color.danger : ui.color.textSubtle)};
`;

export function MultiEmailInput({
    label,
    value,
    setValue,
    max = 3,
    disabled,
    placeholder = "메일 입력 후 Enter (쉼표·세미콜론으로도 구분)",
}: Props) {
    const [draft, setDraft] = useState("");

    const emails = useMemo(() => splitEmails(value), [value]);
    const invalidCount = emails.filter((e) => !EMAIL_RE.test(e)).length;

    const commit = (next: string[]) => setValue(next.join(", "));

    /** 입력 중인 문자열을 칩으로 확정 (구분자가 여러 개 들어와도 한 번에 처리) */
    const flush = (raw: string) => {
        const parts = splitEmails(raw);
        if (parts.length === 0) return;
        const next = [...emails];
        for (const p of parts) {
            if (next.length >= max) break;
            if (!next.includes(p)) next.push(p);
        }
        commit(next);
        setDraft("");
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        // 구분자를 입력하는 순간 칩으로 확정한다
        if (/[,;]/.test(v)) {
            flush(v);
            return;
        }
        setDraft(v);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === "Tab") {
            if (draft.trim()) {
                e.preventDefault();
                flush(draft);
            }
        } else if (e.key === "Backspace" && !draft && emails.length > 0) {
            commit(emails.slice(0, -1));
        }
    };

    const full = emails.length >= max;

    return (
        <Container>
            {label && <LabelText>{label}</LabelText>}
            <Box $disabled={disabled}>
                {emails.map((em, i) => (
                    <Chip key={`${em}-${i}`} $invalid={!EMAIL_RE.test(em)} title={em}>
                        {em}
                        {!disabled && (
                            <button
                                type="button"
                                onClick={() => commit(emails.filter((_, idx) => idx !== i))}
                                aria-label={`${em} 삭제`}
                            >
                                <X size={11} weight="bold" />
                            </button>
                        )}
                    </Chip>
                ))}
                <Bare
                    value={draft}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onBlur={() => flush(draft)}
                    disabled={disabled || full}
                    placeholder={full ? `최대 ${max}개까지 입력할 수 있습니다` : placeholder}
                />
            </Box>
            {invalidCount > 0 ? (
                <Hint $error>메일 형식이 올바르지 않은 주소가 {invalidCount}개 있습니다.</Hint>
            ) : (
                <Hint>
                    최대 {max}개 · {emails.length}개 입력됨
                </Hint>
            )}
        </Container>
    );
}
