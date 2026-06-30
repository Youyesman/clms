import React, { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import dayjs from "dayjs";
import { NotePencil } from "@phosphor-icons/react";
import { AxiosGet, AxiosPut } from "../../../axios/Axios";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";
import { CommonListHeader } from "../../../components/common/CommonListHeader";

/**
 * SharedMemo - 모든 관리자가 함께 보고 편집하는 공유 메모장.
 *
 * 백엔드(Api/dashboard/memo/)를 짧은 주기(4초)로 polling 하여 실시간처럼 동기화하고,
 * 입력이 멈추면(800ms) 자동 저장한다. 동시 편집 시 마지막 저장이 우선(last-write-wins).
 */

const POLL_INTERVAL = 4000;
const SAVE_DEBOUNCE = 800;

const MemoTextArea = styled.textarea`
    flex: 1;
    width: 100%;
    border: none;
    outline: none;
    resize: none;
    padding: 16px;
    font-family: "SUIT", sans-serif;
    font-size: 14px;
    line-height: 1.7;
    color: #1e293b;
    background: #fffef7;

    &::placeholder {
        color: #94a3b8;
    }
`;

const MemoFooter = styled.div`
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    border-top: 1px solid #f1f5f9;
    font-size: 11.5px;
    color: #94a3b8;
    background: #fff;
    min-height: 28px;
`;

const SaveStatus = styled.span<{ $saving: boolean }>`
    color: ${({ $saving }) => ($saving ? "#2563eb" : "#10b981")};
    font-weight: 600;
`;

export default function SharedMemo() {
    const [content, setContent] = useState("");
    const [updatedBy, setUpdatedBy] = useState("");
    const [updatedAt, setUpdatedAt] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // 서버 기준 최신 시각 / 마지막으로 저장(동기화)된 내용. 충돌 회피용.
    const lastServerAtRef = useRef<string | null>(null);
    const lastSyncedContentRef = useRef("");
    const focusedRef = useRef(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 폴링 콜백에서 항상 최신 content 를 참조하기 위한 ref
    const contentRef = useRef("");
    useEffect(() => {
        contentRef.current = content;
    }, [content]);

    const applyServer = useCallback((data: { content: string; updated_at: string; updated_by_name: string }) => {
        setContent(data.content || "");
        contentRef.current = data.content || "";
        lastSyncedContentRef.current = data.content || "";
        lastServerAtRef.current = data.updated_at;
        setUpdatedAt(data.updated_at);
        setUpdatedBy(data.updated_by_name || "");
    }, []);

    // 폴링: 다른 사용자의 변경을 가져온다(로컬 미저장 편집 중이면 덮어쓰지 않음).
    const poll = useCallback(async () => {
        try {
            const res = await AxiosGet("dashboard/memo/");
            const data = res.data;
            const dirty = contentRef.current !== lastSyncedContentRef.current;
            if (data.updated_at !== lastServerAtRef.current && !dirty) {
                applyServer(data);
            } else if (!lastServerAtRef.current) {
                applyServer(data);
            }
        } catch (e) {
            // 폴링 실패는 조용히 무시(다음 주기에 재시도)
        }
    }, [applyServer]);

    const save = useCallback(async () => {
        const toSave = contentRef.current;
        setSaving(true);
        try {
            const res = await AxiosPut("dashboard/memo", { content: toSave });
            const data = res.data;
            lastSyncedContentRef.current = toSave;
            lastServerAtRef.current = data.updated_at;
            setUpdatedAt(data.updated_at);
            setUpdatedBy(data.updated_by_name || "");
        } catch (e) {
            // 저장 실패 시 다음 입력 때 재시도됨
        } finally {
            setSaving(false);
        }
    }, []);

    // 최초 로드 + 폴링 시작
    useEffect(() => {
        (async () => {
            await poll();
            setLoaded(true);
        })();
        const timer = setInterval(poll, POLL_INTERVAL);
        return () => clearInterval(timer);
    }, [poll]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setContent(e.target.value);
        contentRef.current = e.target.value;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(save, SAVE_DEBOUNCE);
    };

    const handleBlur = () => {
        focusedRef.current = false;
        // 포커스 아웃 시 미저장 내용이 있으면 즉시 저장
        if (contentRef.current !== lastSyncedContentRef.current) {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            save();
        }
    };

    return (
        <CommonSectionCard height="450px" padding="0">
            <CommonListHeader
                title="📝 공유 메모장"
                subtitle="모두가 함께 편집"
                actions={<NotePencil size={18} color="#64748b" />}
            />
            <MemoTextArea
                value={content}
                onChange={handleChange}
                onFocus={() => (focusedRef.current = true)}
                onBlur={handleBlur}
                placeholder={loaded ? "여기에 공지/메모를 남겨보세요. 모든 관리자가 실시간으로 함께 봅니다." : "불러오는 중..."}
                spellCheck={false}
            />
            <MemoFooter>
                <span>
                    {updatedAt
                        ? `마지막 수정: ${updatedBy || "-"} · ${dayjs(updatedAt).format("MM-DD HH:mm")}`
                        : "아직 수정 내역이 없습니다."}
                </span>
                <SaveStatus $saving={saving}>{saving ? "저장 중…" : "자동 저장됨"}</SaveStatus>
            </MemoFooter>
        </CommonSectionCard>
    );
}
