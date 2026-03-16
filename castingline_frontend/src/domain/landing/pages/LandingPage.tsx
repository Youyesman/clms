import React from "react";
import styled, { keyframes } from "styled-components";
import { useNavigate } from "react-router-dom";
import { useRecoilValue } from "recoil";
import { AccountState } from "../../../atom/AccountState";
import { FilmReel, ArrowRight, ChartLineUp, ShieldCheck, Database, Cloud, Desktop, FilmStrip, Calendar } from "@phosphor-icons/react";
import LogoVerticalImg from "../../../assets/img/logo/logo_vertical.png";

/* ── Refined Animations ── */
const slideUp = keyframes`
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
`;

const dataFlow = keyframes`
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
`;

/* ── Styled Components (Modern B2B SaaS Style) ── */
const PageWrapper = styled.div`
    min-height: 100vh;
    background: #fcfcfd;
    color: #111827;
    font-family: "Pretendard", "Apple SD Gothic Neo", sans-serif;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
`;

const Nav = styled.nav`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 48px;
    height: 72px;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    z-index: 50;
`;

const Logo = styled.div`
    cursor: pointer;
    display: flex;
    align-items: center;
    overflow: hidden;
    height: 52px;

    img {
        height: 180px;
        object-fit: contain;
        margin: -64px 0;
    }
`;

const NavActions = styled.div`
    display: flex;
    gap: 12px;
`;

const Button = styled.button<{ $primary?: boolean, $size?: "large" }>`
    padding: ${({ $size }) => $size === "large" ? "16px 32px" : "10px 20px"};
    font-size: ${({ $size }) => $size === "large" ? "16px" : "14px"};
    font-weight: 600;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    
    background: ${({ $primary }) => ($primary ? "#111827" : "#ffffff")};
    color: ${({ $primary }) => ($primary ? "#ffffff" : "#374151")};
    border: 1px solid ${({ $primary }) => ($primary ? "#111827" : "#d1d5db")};
    box-shadow: ${({ $primary }) => ($primary ? "0 4px 6px -1px rgba(0, 0, 0, 0.1)" : "0 1px 2px 0 rgba(0, 0, 0, 0.05)")};

    &:hover {
        background: ${({ $primary }) => ($primary ? "#1f2937" : "#f9fafb")};
        transform: translateY(-1px);
        box-shadow: ${({ $primary }) => ($primary ? "0 6px 8px -1px rgba(0, 0, 0, 0.15)" : "0 4px 6px -1px rgba(0, 0, 0, 0.05)")};
    }
`;

const HeroSection = styled.section`
    padding: 100px 48px 80px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 1000px;
    margin: 0 auto;
    width: 100%;
`;

const HeroBadge = styled.div`
    font-size: 13px;
    font-weight: 600;
    color: #2563eb;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    padding: 6px 16px;
    border-radius: 4px;
    margin-bottom: 24px;
    animation: ${slideUp} 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
    display: inline-flex;
    align-items: center;
    gap: 6px;
`;

const HeroTitle = styled.h1`
    font-size: clamp(36px, 5vw, 56px);
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: -1px;
    margin: 0 0 24px 0;
    color: #111827;
    animation: ${slideUp} 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
    word-break: keep-all;

    span {
        color: #2563eb;
    }
`;

const HeroSubtitle = styled.p`
    font-size: 18px;
    color: #4b5563;
    max-width: 680px;
    line-height: 1.7;
    margin: 0 0 40px 0;
    animation: ${slideUp} 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
    word-break: keep-all;

    strong {
        color: #111827;
        font-weight: 600;
    }
`;

const CTAGroup = styled.div`
    display: flex;
    gap: 16px;
    animation: ${slideUp} 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both;
`;

/* ── Sleek Data flow Animation ── */
const TechAnimationContainer = styled.div`
    width: 100%;
    max-width: 720px;
    height: 120px;
    margin: 60px auto 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 40px;
    animation: ${slideUp} 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
`;

const TechNode = styled.div`
    width: 64px;
    height: 64px;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #334155;
    position: relative;
    z-index: 2;
    
    &::after {
        content: '';
        position: absolute;
        top: -4px; right: -4px;
        width: 8px; height: 8px;
        background: #10b981;
        border-radius: 50%;
        border: 2px solid #ffffff;
    }
`;

const TechLine = styled.div`
    flex: 1;
    height: 2px;
    background: #e2e8f0;
    margin: 0 16px;
    position: relative;
    overflow: hidden;

    &::after {
        content: '';
        position: absolute;
        top: 0; left: 0; bottom: 0; width: 30%;
        background: linear-gradient(90deg, transparent, #3b82f6, transparent);
        animation: ${dataFlow} 2s ease-in-out infinite;
    }
`;

const FeaturesContainer = styled.div`
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
    width: 100%;
    max-width: 1000px;
    margin: 0 auto 80px;
    padding: 0 48px;

    @media (max-width: 800px) {
        grid-template-columns: 1fr;
    }
`;

const FeatureCard = styled.div<{ $delay: string }>`
    padding: 32px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    text-align: left;
    transition: all 0.3s ease;
    animation: ${slideUp} 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${({ $delay }) => $delay} both;

    &:hover {
        border-color: #cbd5e1;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);
        transform: translateY(-2px);
    }

    .icon-wrapper {
        width: 48px;
        height: 48px;
        border-radius: 6px;
        background: #f1f5f9;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #111827;
        margin-bottom: 20px;
    }

    h3 {
        font-size: 18px;
        font-weight: 700;
        margin: 0 0 12px 0;
        color: #111827;
        letter-spacing: -0.5px;
    }

    p {
        font-size: 14.5px;
        color: #4b5563;
        line-height: 1.6;
        margin: 0;
        word-break: keep-all;
    }
`;

const Footer = styled.footer`
    border-top: 1px solid #e5e7eb;
    padding: 48px;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
`;

const FooterBrand = styled.div`
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.5px;
    color: #111827;
    margin-bottom: 24px;
    overflow: hidden;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;

    img {
        height: 160px;
        object-fit: contain;
        margin: -56px 0;
    }
`;

const FooterInfo = styled.div`
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 16px 24px;
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 24px;
    line-height: 1.5;

    span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    b {
        color: #374151;
        font-weight: 600;
    }
`;

const Copyright = styled.div`
    font-size: 12px;
    color: #9ca3af;
`;

export default function LandingPage() {
    const navigate = useNavigate();
    const account = useRecoilValue(AccountState);
    const isLoggedIn = !!(account as any)?.is_superuser || !!localStorage.getItem("token");

    return (
        <PageWrapper>
            <Nav>
                <Logo onClick={() => navigate("/")}>
                    <img src={LogoVerticalImg} alt="Castingline" />
                </Logo>
                <NavActions>
                    {isLoggedIn ? (
                        <Button $primary onClick={() => navigate((account as any)?.is_superuser ? "/manage" : "/score")}>
                            시스템 접속
                        </Button>
                    ) : (
                        <Button $primary onClick={() => navigate("/login")}>
                            로그인
                        </Button>
                    )}
                </NavActions>
            </Nav>

            <HeroSection>
                <HeroBadge>
                    <ShieldCheck weight="bold" size={16} /> 대한민국 No.1 영화 입회사
                </HeroBadge>

                <HeroTitle>
                    투명한 데이터 스탠다드, <br /> <span>CASTINGLINE</span>
                </HeroTitle>

                <HeroSubtitle>
                    캐스팅라인은 <strong>20년 업력</strong>의 영화 입회 노하우와 방대한 축적 데이터를 갖춘 전문 기업입니다. <br />
                    매일 극장 데이터를 수집·가공하여 <strong>오차 없는 부금 정산</strong>을 수행하며, <br />
                    나아가 <strong>빅데이터 기반의 인사이트</strong>로 가장 성공적인 배급 전략을 지원합니다.
                </HeroSubtitle>

                <CTAGroup>
                    {isLoggedIn ? (
                        <Button $primary $size="large" onClick={() => navigate((account as any)?.is_superuser ? "/manage" : "/score")}>
                            <Desktop size={20} /> 대시보드 바로가기
                        </Button>
                    ) : (
                        <>
                            <Button $primary $size="large" onClick={() => navigate("/score")}>
                                <ChartLineUp size={20} /> 스코어 조회 (배급사용)
                            </Button>
                            <Button $size="large" onClick={() => navigate("/login")}>
                                관리자 로그인
                            </Button>
                        </>
                    )}
                </CTAGroup>

                <TechAnimationContainer>
                    <TechNode>
                        <Database size={28} weight="duotone" />
                    </TechNode>
                    <TechLine />
                    <TechNode>
                        <Cloud size={28} weight="duotone" />
                    </TechNode>
                    <TechLine />
                    <TechNode>
                        <Desktop size={28} weight="duotone" />
                    </TechNode>
                </TechAnimationContainer>
            </HeroSection>

            <FeaturesContainer>
                <FeatureCard $delay="0.4s">
                    <div className="icon-wrapper"><ChartLineUp size={24} weight="bold" /></div>
                    <h3>투명하고 검증된 스코어 데이터</h3>
                    <p>매일 오차 없는 현황판을 통해 복잡한 극장 관람객 수 및 티켓 단가를 교차 검증하여, 실시간 배급 척도를 제공합니다.</p>
                </FeatureCard>
                <FeatureCard $delay="0.5s">
                    <div className="icon-wrapper"><ShieldCheck size={24} weight="bold" /></div>
                    <h3>정확한 부금 정산 시스템</h3>
                    <p>시스템 내 자동화된 부율 계산 과정을 통해, 배급사 및 극장 간의 투명하고 빠르고 무결한 부금 정산 서류를 발행합니다.</p>
                </FeatureCard>

                <FeatureCard $delay="0.6s">
                    <div className="icon-wrapper"><Calendar size={24} weight="bold" /></div>
                    <h3>풍부한 지표 데이터</h3>
                    <p>매일 제공되는 좌석수 데이터를 이용한 그래프, 대시보드 등의 세세한 비교 데이터 제공</p>
                </FeatureCard>

                <FeatureCard $delay="0.7s">
                    <div className="icon-wrapper"><ArrowRight size={24} weight="bold" /></div>
                    <h3>배급사 전산망 다이렉트 API</h3>
                    <p>이중 입력의 번거로움 없이 입회 데이터 및 정산 완료 내역을 배급사 측 자체 ERP와 다이렉트로 안전하게 동기화합니다.</p>
                </FeatureCard>
            </FeaturesContainer>

            <Footer>
                <FooterBrand>
                    <img src={LogoVerticalImg} alt="Castingline" />
                </FooterBrand>
                <FooterInfo>
                    <span><b>회사명</b> (주) 캐스팅라인</span>
                    <span><b>대표이사</b> 박미선</span>
                    <span><b>전화</b> 02-2285-1790</span>
                    <span><b>사업자등록번호</b> 201-181-69426</span>
                    <span><b>주소</b> 경기도 고양시 덕양구 으뜸로 130</span>
                </FooterInfo>
                <Copyright>© 2026 CASTINGLINE. All rights reserved.</Copyright>
            </Footer>
        </PageWrapper>
    );
}
