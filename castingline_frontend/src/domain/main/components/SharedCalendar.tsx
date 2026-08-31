import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import dayjs, { Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { CaretLeft, CaretRight, Trash } from "@phosphor-icons/react";
import { AxiosDelete, AxiosGet, AxiosPatch, AxiosPost } from "../../../axios/Axios";
import { CommonSectionCard } from "../../../components/common/CommonSectionCard";
import { CommonListHeader } from "../../../components/common/CommonListHeader";
import { useToast } from "../../../components/common/CustomToast";

dayjs.extend(isoWeek);

/**
 * SharedCalendar — 모든 관리자가 함께 보고 편집하는 공유 캘린더.
 *
 * 공유 메모장과 같은 방식으로 Api/dashboard/calendar/ 를 짧은 주기로 polling 해
 * 여러 명이 등록한 일정을 실시간처럼 동기화한다.
 * 날짜를 클릭하면 그 날짜의 메모/할 일을 추가·완료체크·삭제할 수 있고,
 * 완료된 항목은 취소선 + 흐리게 표시된다.
 */

const POLL_INTERVAL = 8000;

interface CalendarEvent {
    id: number;
    date: string;
    content: string;
    is_done: boolean;
    updated_by_name: string;
}

const Body = styled.div`
    flex: 1;
    display: flex;
    min-height: 0;
`;

const CalendarPane = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 10px 12px 12px;
    min-width: 0;
`;

const WeekdayRow = styled.div`
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    margin-bottom: 4px;
`;

const Weekday = styled.div<{ $sun?: boolean; $sat?: boolean }>`
    text-align: center;
    font-size: 11.5px;
    font-weight: 700;
    padding: 4px 0;
    color: ${({ $sun, $sat }) => ($sun ? "#dc2626" : $sat ? "#2563eb" : "#64748b")};
`;

const Grid = styled.div<{ $rows: number }>`
    flex: 1;
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    grid-template-rows: repeat(${({ $rows }) => $rows}, minmax(0, 1fr));
    gap: 3px;
    min-height: 0;
`;

const DayCell = styled.button<{ $muted: boolean; $today: boolean; $selected: boolean }>`
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    padding: 4px 5px;
    border-radius: 6px;
    border: 1px solid ${({ $selected }) => ($selected ? "#2563eb" : "#e2e8f0")};
    background: ${({ $selected, $today }) =>
        $selected ? "#eff6ff" : $today ? "#f8fafc" : "#ffffff"};
    cursor: pointer;
    overflow: hidden;
    text-align: left;
    opacity: ${({ $muted }) => ($muted ? 0.45 : 1)};
    transition: border-color 0.12s ease, background 0.12s ease;

    &:hover {
        border-color: #2563eb;
    }
`;

const DayNum = styled.span<{ $sun?: boolean; $sat?: boolean; $today: boolean }>`
    font-size: 12px;
    font-weight: ${({ $today }) => ($today ? 800 : 600)};
    color: ${({ $sun, $sat, $today }) =>
        $today ? "#2563eb" : $sun ? "#dc2626" : $sat ? "#2563eb" : "#334155"};
`;

const Chip = styled.span<{ $done: boolean }>`
    display: block;
    font-size: 10.5px;
    line-height: 1.35;
    padding: 1px 4px;
    border-radius: 3px;
    background: ${({ $done }) => ($done ? "#f1f5f9" : "#dbeafe")};
    color: ${({ $done }) => ($done ? "#94a3b8" : "#1e40af")};
    text-decoration: ${({ $done }) => ($done ? "line-through" : "none")};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const MoreChip = styled.span`
    font-size: 10px;
    color: #94a3b8;
    padding-left: 4px;
`;

const DetailPane = styled.div`
    width: 240px;
    flex-shrink: 0;
    border-left: 1px solid #f1f5f9;
    display: flex;
    flex-direction: column;
    background: #fcfcfd;
`;

const DetailHead = styled.div`
    padding: 10px 12px 6px;
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
`;

const DetailList = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 0 8px;
`;

const Item = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 5px 4px;
    border-bottom: 1px solid #f1f5f9;

    input[type="checkbox"] {
        margin-top: 2px;
        cursor: pointer;
        flex-shrink: 0;
    }
`;

const ItemText = styled.span<{ $done: boolean }>`
    flex: 1;
    font-size: 12.5px;
    line-height: 1.45;
    word-break: break-all;
    color: ${({ $done }) => ($done ? "#a1a9b8" : "#1e293b")};
    text-decoration: ${({ $done }) => ($done ? "line-through" : "none")};
`;

const DelButton = styled.button`
    border: none;
    background: none;
    color: #cbd5e1;
    cursor: pointer;
    padding: 0 2px;
    flex-shrink: 0;
    display: flex;
    align-items: center;

    &:hover { color: #dc2626; }
`;

const AddRow = styled.form`
    display: flex;
    gap: 5px;
    padding: 8px;
    border-top: 1px solid #f1f5f9;

    input {
        flex: 1;
        min-width: 0;
        height: 28px;
        padding: 0 8px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 12.5px;
        font-family: "SUIT", sans-serif;
        outline: none;

        &:focus { border-color: #2563eb; }
    }

    button {
        height: 28px;
        padding: 0 10px;
        border: none;
        border-radius: 6px;
        background: #2563eb;
        color: #fff;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;

        &:disabled { background: #cbd5e1; cursor: default; }
    }
`;

const Empty = styled.div`
    padding: 18px 8px;
    text-align: center;
    color: #94a3b8;
    font-size: 12.5px;
`;

const NavGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

const NavBtn = styled.button`
    width: 26px;
    height: 26px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #475569;

    &:hover { border-color: #2563eb; color: #2563eb; }
`;

const ModeToggle = styled.button<{ $active: boolean }>`
    height: 26px;
    padding: 0 10px;
    border: 1px solid ${({ $active }) => ($active ? "#2563eb" : "#e2e8f0")};
    border-radius: 6px;
    background: ${({ $active }) => ($active ? "#eff6ff" : "#fff")};
    color: ${({ $active }) => ($active ? "#2563eb" : "#64748b")};
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
`;

const Label = styled.span`
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
    min-width: 92px;
    text-align: center;
`;

type Mode = "month" | "week";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function SharedCalendar() {
    const toast = useToast();
    const [mode, setMode] = useState<Mode>("month");
    const [cursor, setCursor] = useState<Dayjs>(dayjs());
    const [selected, setSelected] = useState<string>(dayjs().format("YYYY-MM-DD"));
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [input, setInput] = useState("");

    // 화면에 그릴 날짜 범위 (월: 해당 월이 걸친 주 전체 / 주: 해당 주)
    const { days, rangeStart, rangeEnd, rows } = useMemo(() => {
        if (mode === "week") {
            const s = cursor.startOf("week");
            return {
                days: Array.from({ length: 7 }, (_, i) => s.add(i, "day")),
                rangeStart: s, rangeEnd: s.add(6, "day"), rows: 1,
            };
        }
        const s = cursor.startOf("month").startOf("week");
        const e = cursor.endOf("month").endOf("week");
        const n = e.diff(s, "day") + 1;
        return {
            days: Array.from({ length: n }, (_, i) => s.add(i, "day")),
            rangeStart: s, rangeEnd: e, rows: Math.ceil(n / 7),
        };
    }, [mode, cursor]);

    // 월↔주 전환·이동으로 선택 날짜가 화면 밖으로 나가면 범위 안으로 되돌린다.
    // (그대로 두면 보이지도 않는 날짜의 일정 패널이 떠서 혼란스럽다)
    useEffect(() => {
        const sel = dayjs(selected);
        if (sel.isBefore(rangeStart, "day") || sel.isAfter(rangeEnd, "day")) {
            const today = dayjs();
            const inRange = !today.isBefore(rangeStart, "day") && !today.isAfter(rangeEnd, "day");
            setSelected((inRange ? today : rangeStart).format("YYYY-MM-DD"));
        }
    }, [rangeStart, rangeEnd, selected]);

    const fetchEvents = useCallback(async () => {
        try {
            const res = await AxiosGet(
                `dashboard/calendar/?start=${rangeStart.format("YYYY-MM-DD")}&end=${rangeEnd.format("YYYY-MM-DD")}`,
                { skipLoading: true }
            );
            setEvents(res.data || []);
        } catch {
            /* 폴링 실패는 조용히 무시 — 다음 주기에 다시 시도 */
        }
    }, [rangeStart, rangeEnd]);

    useEffect(() => {
        fetchEvents();
        const t = setInterval(fetchEvents, POLL_INTERVAL);
        return () => clearInterval(t);
    }, [fetchEvents]);

    const byDate = useMemo(() => {
        const m: Record<string, CalendarEvent[]> = {};
        events.forEach((e) => {
            (m[e.date] = m[e.date] || []).push(e);
        });
        return m;
    }, [events]);

    const selectedEvents = byDate[selected] || [];

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        const content = input.trim();
        if (!content) return;
        try {
            await AxiosPost("dashboard/calendar", { date: selected, content });
            setInput("");
            fetchEvents();
        } catch {
            toast.error("일정 등록에 실패했습니다.");
        }
    };

    const handleToggle = async (ev: CalendarEvent) => {
        try {
            await AxiosPatch("dashboard/calendar", { is_done: !ev.is_done }, ev.id);
            setEvents((prev) => prev.map((x) => (x.id === ev.id ? { ...x, is_done: !x.is_done } : x)));
        } catch {
            toast.error("완료 처리에 실패했습니다.");
        }
    };

    const handleDelete = async (ev: CalendarEvent) => {
        try {
            await AxiosDelete("dashboard/calendar", ev.id);
            setEvents((prev) => prev.filter((x) => x.id !== ev.id));
        } catch {
            toast.error("일정 삭제에 실패했습니다.");
        }
    };

    const move = (dir: number) =>
        setCursor((c) => c.add(dir, mode === "week" ? "week" : "month"));

    const today = dayjs().format("YYYY-MM-DD");
    const headLabel =
        mode === "week"
            ? `${rangeStart.format("MM.DD")} ~ ${rangeEnd.format("MM.DD")}`
            : cursor.format("YYYY년 M월");

    return (
        <CommonSectionCard height="450px" padding="0">
            <CommonListHeader
                title="공유 캘린더"
                actions={
                    <NavGroup>
                        <ModeToggle $active={mode === "month"} onClick={() => setMode("month")}>월</ModeToggle>
                        <ModeToggle $active={mode === "week"} onClick={() => setMode("week")}>주</ModeToggle>
                        <NavBtn onClick={() => move(-1)} title="이전"><CaretLeft size={14} /></NavBtn>
                        <Label>{headLabel}</Label>
                        <NavBtn onClick={() => move(1)} title="다음"><CaretRight size={14} /></NavBtn>
                    </NavGroup>
                }
            />
            <Body>
                <CalendarPane>
                    <WeekdayRow>
                        {WEEKDAYS.map((d, i) => (
                            <Weekday key={d} $sun={i === 0} $sat={i === 6}>{d}</Weekday>
                        ))}
                    </WeekdayRow>
                    <Grid $rows={rows}>
                        {days.map((d) => {
                            const key = d.format("YYYY-MM-DD");
                            const list = byDate[key] || [];
                            const maxChips = mode === "week" ? 6 : 2;
                            return (
                                <DayCell
                                    key={key}
                                    type="button"
                                    $muted={mode === "month" && d.month() !== cursor.month()}
                                    $today={key === today}
                                    $selected={key === selected}
                                    onClick={() => setSelected(key)}
                                >
                                    <DayNum $sun={d.day() === 0} $sat={d.day() === 6} $today={key === today}>
                                        {d.date()}
                                    </DayNum>
                                    {list.slice(0, maxChips).map((ev) => (
                                        <Chip key={ev.id} $done={ev.is_done}>{ev.content}</Chip>
                                    ))}
                                    {list.length > maxChips && (
                                        <MoreChip>+{list.length - maxChips}</MoreChip>
                                    )}
                                </DayCell>
                            );
                        })}
                    </Grid>
                </CalendarPane>

                <DetailPane>
                    <DetailHead>
                        {dayjs(selected).format("M월 D일")} ({WEEKDAYS[dayjs(selected).day()]})
                    </DetailHead>
                    <DetailList>
                        {selectedEvents.length === 0 ? (
                            <Empty>등록된 일정이 없습니다.</Empty>
                        ) : (
                            selectedEvents.map((ev) => (
                                <Item key={ev.id}>
                                    <input
                                        type="checkbox"
                                        checked={ev.is_done}
                                        onChange={() => handleToggle(ev)}
                                    />
                                    <ItemText $done={ev.is_done} title={ev.updated_by_name}>
                                        {ev.content}
                                    </ItemText>
                                    <DelButton onClick={() => handleDelete(ev)} title="삭제">
                                        <Trash size={13} />
                                    </DelButton>
                                </Item>
                            ))
                        )}
                    </DetailList>
                    <AddRow onSubmit={handleAdd}>
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="메모 / 할 일 입력"
                            maxLength={500}
                        />
                        <button type="submit" disabled={!input.trim()}>추가</button>
                    </AddRow>
                </DetailPane>
            </Body>
        </CommonSectionCard>
    );
}
