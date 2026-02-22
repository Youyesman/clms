import React from "react";
import styled, { keyframes } from "styled-components";
import { useNavigate } from "react-router-dom";
import { useRecoilValue } from "recoil";
import { AccountState } from "../../../atom/AccountState";
import { FilmReel, ArrowRight, ChartLineUp, ShieldCheck } from "@phosphor-icons/react";
import NewsSection from "../components/NewsSection";

/* ── Animations ── */
const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(30px); }
    to   { opacity: 1; transform: translateY(0); }
`;

const shimmer = keyframes`
    0%   { background-position: -200% center; }
    100% { background-position: 200% center; }
`;

const float = keyframes`
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-12px); }
`;

/* ── Styles ── */
const PageWrapper = styled.div`
    min-height: 100vh;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%);
    display: flex;
    flex-direction: column;
    font-family: "SUIT", "Pretendard", sans-serif;
    overflow-x: hidden;
`;

const Nav = styled.nav`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 48px;
    z-index: 10;
`;

const Logo = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 22px;
    font-weight: 900;
    letter-spacing: -0.5px;

    .icon {
        background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        color: #fff;
        font-size: 20px;
        box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);
    }
    .white { color: #f8fafc; }
    .blue  {
        background: linear-gradient(90deg, #3b82f6, #818cf8);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }
`;

const NavActions = styled.div`
    display: flex;
    gap: 12px;
`;

const NavButton = styled.button<{ $primary?: boolean }>`
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    border: ${({ $primary }) => ($primary ? "none" : "1px solid #334155")};
    background: ${({ $primary }) =>
        $primary
            ? "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)"
            : "transparent"};
    color: ${({ $primary }) => ($primary ? "#fff" : "#94a3b8")};

    &:hover {
        transform: translateY(-1px);
        box-shadow: ${({ $primary }) =>
            $primary
                ? "0 8px 24px rgba(59, 130, 246, 0.4)"
                : "0 4px 12px rgba(0,0,0,0.2)"};
        color: #fff;
    }
`;

const HeroSection = styled.section`
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 60px 24px 80px;
    gap: 32px;
    position: relative;
`;

const HeroBadge = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid rgba(59, 130, 246, 0.25);
    border-radius: 100px;
    font-size: 13px;
    font-weight: 600;
    color: #60a5fa;
    animation: ${fadeUp} 0.6s ease both;
`;

const HeroTitle = styled.h1`
    font-size: clamp(36px, 5vw, 60px);
    font-weight: 900;
    color: #f8fafc;
    line-height: 1.15;
    letter-spacing: -1px;
    margin: 0;
    animation: ${fadeUp} 0.6s ease 0.15s both;

    .gradient {
        background: linear-gradient(90deg, #3b82f6, #818cf8, #3b82f6);
        background-size: 200% auto;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: ${shimmer} 4s linear infinite;
    }
`;

const HeroDescription = styled.p`
    font-size: 18px;
    color: #94a3b8;
    max-width: 560px;
    line-height: 1.7;
    margin: 0;
    animation: ${fadeUp} 0.6s ease 0.3s both;
`;

const CTAGroup = styled.div`
    display: flex;
    gap: 16px;
    animation: ${fadeUp} 0.6s ease 0.45s both;
`;

const CTAButton = styled.button<{ $variant?: "primary" | "secondary" }>`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 32px;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    border: none;
    transition: all 0.25s ease;

    ${({ $variant }) =>
        $variant === "secondary"
            ? `
        background: rgba(255,255,255,0.06);
        color: #cbd5e1;
        border: 1px solid #334155;
        &:hover {
            background: rgba(255,255,255,0.1);
            border-color: #475569;
            color: #f8fafc;
        }
    `
            : `
        background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
        color: #fff;
        box-shadow: 0 4px 20px rgba(59, 130, 246, 0.35);
        &:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 30px rgba(59, 130, 246, 0.5);
        }
    `}
`;

const FeaturesGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    max-width: 900px;
    margin-top: 20px;
    animation: ${fadeUp} 0.6s ease 0.6s both;

    @media (max-width: 768px) {
        grid-template-columns: 1fr;
    }
`;

const FeatureCard = styled.div`
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    padding: 28px 24px;
    text-align: left;
    transition: all 0.3s ease;

    &:hover {
        background: rgba(255, 255, 255, 0.07);
        border-color: rgba(59, 130, 246, 0.3);
        transform: translateY(-4px);
    }

    .icon-box {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 16px;
        background: rgba(59, 130, 246, 0.12);
        color: #60a5fa;
    }

    h3 {
        font-size: 16px;
        font-weight: 800;
        color: #f1f5f9;
        margin: 0 0 8px;
    }

    p {
        font-size: 13.5px;
        color: #64748b;
        line-height: 1.6;
        margin: 0;
    }
`;

const GlowOrb = styled.div<{ $top: string; $left: string; $color: string; $delay: string }>`
    position: absolute;
    width: 300px;
    height: 300px;
    border-radius: 50%;
    background: ${({ $color }) => $color};
    filter: blur(120px);
    opacity: 0.15;
    pointer-events: none;
    top: ${({ $top }) => $top};
    left: ${({ $left }) => $left};
    animation: ${float} 6s ease-in-out ${({ $delay }) => $delay} infinite;
`;

const Footer = styled.footer`
    padding: 24px 48px;
    text-align: center;
    font-size: 12px;
    color: #475569;
    border-top: 1px solid #1e293b;
`;

/* ── Component ── */
export default function LandingPage() {
    const navigate = useNavigate();
    const account = useRecoilValue(AccountState);
    const isLoggedIn = !!(account as any)?.is_superuser || !!localStorage.getItem("token");

    return (
        <PageWrapper>
            <Nav>
                <Logo>
                    <div className="icon">C</div>
                    <span className="white">CASTING</span>
                    <span className="blue">LINE</span>
                </Logo>
                <NavActions>
                    {isLoggedIn ? (
                        <NavButton $primary onClick={() => navigate("/manage")}>
                            대시보드로 이동
                        </NavButton>
                    ) : (
                        <>
                            <NavButton onClick={() => navigate("/score")}>스코어 조회</NavButton>
                            <NavButton $primary onClick={() => navigate("/login")}>
                                로그인
                            </NavButton>
                        </>
                    )}
                </NavActions>
            </Nav>

            <NewsSection />

            <Footer>
                © 2026 Casting Line. All rights reserved.
            </Footer>
        </PageWrapper>
    );
}
