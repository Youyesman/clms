import React from "react";
import styled from "styled-components";
import { ui } from "../../styles/uiTokens";

/**
 * EmptyState — 데이터가 없거나 아직 선택하지 않았을 때의 공통 안내.
 *
 * 이전에는 화면마다 각자 styled.div로 만들어 쓰는 바람에
 * 같은 성격의 문구인데 13px / 14px / 굵기 600 / 점선 테두리 등으로 제각각이었습니다.
 * 크기만 size로 고르고 나머지(색·굵기·줄간격·정렬)는 여기서 고정합니다.
 *
 *   sm — 표 안쪽, 작은 카드
 *   md — 카드 본문 (기본)
 *   lg — 상세 패널처럼 넓은 영역
 */

export type EmptyStateSize = "sm" | "md" | "lg";

const SIZE = {
    sm: { font: ui.font.size.md, padding: "28px 16px", gap: "6px", icon: 22 },
    md: { font: ui.font.size.base, padding: "44px 20px", gap: "8px", icon: 28 },
    lg: { font: ui.font.size.lg, padding: "72px 24px", gap: "10px", icon: 34 },
} as const;

const Container = styled.div<{ $size: EmptyStateSize; $fill?: boolean; $height?: string }>`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: ${({ $size }) => SIZE[$size].gap};
    padding: ${({ $size }) => SIZE[$size].padding};
    width: 100%;
    text-align: center;
    ${({ $fill }) => ($fill ? "flex: 1; height: 100%; min-height: 0;" : "")}
    ${({ $height }) => ($height ? `min-height: ${$height};` : "")}
`;

const IconBox = styled.div`
    display: flex;
    color: ${ui.color.borderStrong};
    margin-bottom: 2px;
`;

const Message = styled.div<{ $size: EmptyStateSize }>`
    font-family: ${ui.font.family};
    font-size: ${({ $size }) => SIZE[$size].font};
    font-weight: ${ui.font.weight.medium};
    color: ${ui.color.textSubtle};
    line-height: 1.6;
`;

const Description = styled.div`
    font-family: ${ui.font.family};
    font-size: ${ui.font.size.sm};
    font-weight: ${ui.font.weight.regular};
    color: ${ui.color.textSubtle};
    line-height: 1.6;
`;

const ActionBox = styled.div`
    margin-top: 6px;
`;

interface EmptyStateProps {
    /** 주 안내 문구 */
    children?: React.ReactNode;
    /** 보조 설명 (한 줄 더 필요할 때) */
    description?: React.ReactNode;
    /** 아이콘 (직접 전달, 크기는 size에 맞춰 조정) */
    icon?: React.ReactNode;
    size?: EmptyStateSize;
    /** 부모 높이를 채우고 세로 중앙 정렬 */
    fill?: boolean;
    /** 최소 높이 지정이 필요할 때 */
    height?: string;
    /** 버튼 등 후속 동작 */
    action?: React.ReactNode;
    className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    children,
    description,
    icon,
    size = "md",
    fill,
    height,
    action,
    className,
}) => {
    return (
        <Container $size={size} $fill={fill} $height={height} className={className}>
            {icon && <IconBox>{icon}</IconBox>}
            {children && <Message $size={size}>{children}</Message>}
            {description && <Description>{description}</Description>}
            {action && <ActionBox>{action}</ActionBox>}
        </Container>
    );
};

/** size별 아이콘 권장 크기 — 호출부에서 아이콘 크기를 맞출 때 사용 */
export const emptyStateIconSize = (size: EmptyStateSize = "md") => SIZE[size].icon;
