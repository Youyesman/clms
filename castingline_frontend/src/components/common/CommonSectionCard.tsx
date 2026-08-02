import React from "react";
import styled from "styled-components";
import { ui } from "../../styles/uiTokens";

/**
 * CommonSectionCard
 * 
 * 모든 리스트 및 상세 정보 컨테이너의 공통 디자인을 제공합니다.
 * FilterBar와 조화를 이루는 연한 보더와 그림자 효과가 적용되어 있습니다.
 */

const CardContainer = styled.div<{ $flex?: string | number; $height?: string; $padding?: string }>`
    display: flex;
    flex-direction: column;
    background-color: ${ui.color.surface};
    border: 1px solid ${ui.color.border};
    border-radius: ${ui.radius.md};
    box-shadow: ${ui.shadow.xs};
    overflow: hidden;
    
    flex: ${({ $flex }) => $flex || "none"};
    height: ${({ $height }) => $height || "100%"};
    padding: ${({ $padding }) => $padding || "0"};
`;

interface CommonSectionCardProps {
    children: React.ReactNode;
    flex?: string | number;
    height?: string;
    padding?: string;
    className?: string;
    style?: React.CSSProperties;
}

export const CommonSectionCard: React.FC<CommonSectionCardProps> = ({ 
    children, 
    flex, 
    height, 
    padding,
    className,
    style
}) => {
    return (
        <CardContainer 
            $flex={flex} 
            $height={height} 
            $padding={padding} 
            className={className}
            style={style}
        >
            {children}
        </CardContainer>
    );
};
