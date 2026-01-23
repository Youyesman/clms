// src/components/common/Spinner.tsx
import styled, { keyframes } from "styled-components";
import SpinnerIcon from "../../assets/img/common/Spinner.svg";

// 회전 애니메이션
const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

// ✅ 전체 너비 중앙 정렬용 Wrapper
const SpinnerWrapper = styled.div`
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
`;

// 스피너 이미지
const SpinnerImg = styled.img<{ size?: number }>`
    width: ${(p) => p.size || 20}px;
    height: ${(p) => p.size || 20}px;
    animation: ${spin} 0.9s linear infinite;
    opacity: 0.8;
`;

// 재사용 컴포넌트
export default function CustomSpinner({ size = 20 }: { size?: number }) {
    return (
        <SpinnerWrapper>
            <SpinnerImg src={SpinnerIcon} size={size} />
        </SpinnerWrapper>
    );
}
