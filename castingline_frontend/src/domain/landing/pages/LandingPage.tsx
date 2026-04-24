import React, { useEffect, useRef, useState, useCallback } from "react";
import styled, { keyframes, css } from "styled-components";
import { useNavigate } from "react-router-dom";
import { useRecoilValue } from "recoil";
import { AccountState } from "../../../atom/AccountState";
import {
    ArrowRight, ChartLineUp, ShieldCheck, Database,
    Desktop, Calendar, FilmSlate, CurrencyKrw, Buildings, FilmReel,
    ArrowDown,
} from "@phosphor-icons/react";
import LogoWhiteImg from "../../../assets/img/logo/logo-horizontal-white@2x.png";
import HeroImg from "../../../assets/img/landing/Gemini_Generated_Image_jjem9jjem9jjem9j.png";
import AudienceImg from "../../../assets/img/landing/Gemini_Generated_Image_f0kkycf0kkycf0kk.png";
import CinemaSignImg from "../../../assets/img/landing/Gemini_Generated_Image_uln0pquln0pquln0.png";

/* ═══════════ Hooks ═══════════ */

function useInView(threshold = 0.18) {
    const ref = useRef<HTMLDivElement>(null);
    const [inView, setInView] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([e]) => { if (e.isIntersecting) { setInView(true); obs.unobserve(el); } },
            { threshold },
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [threshold]);
    return { ref, inView };
}

function useCountUp(target: number, duration: number, start: boolean) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!start) return;
        let t0: number;
        const step = (ts: number) => {
            if (!t0) t0 = ts;
            const p = Math.min((ts - t0) / duration, 1);
            setVal(Math.round((1 - Math.pow(1 - p, 3)) * target));
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }, [target, duration, start]);
    return val;
}

function useScrollProgress() {
    const [progress, setProgress] = useState(0);
    useEffect(() => {
        const handler = () => {
            const h = document.documentElement.scrollHeight - window.innerHeight;
            setProgress(h > 0 ? window.scrollY / h : 0);
        };
        window.addEventListener("scroll", handler, { passive: true });
        return () => window.removeEventListener("scroll", handler);
    }, []);
    return progress;
}

function useTypingText(texts: string[], speed = 80, pause = 2500) {
    const [display, setDisplay] = useState("");
    const [idx, setIdx] = useState(0);
    const [charIdx, setCharIdx] = useState(0);
    const [deleting, setDeleting] = useState(false);
    useEffect(() => {
        const current = texts[idx];
        let timer: ReturnType<typeof setTimeout>;
        if (!deleting && charIdx <= current.length) {
            timer = setTimeout(() => { setDisplay(current.slice(0, charIdx)); setCharIdx(c => c + 1); }, speed);
        } else if (!deleting && charIdx > current.length) {
            timer = setTimeout(() => setDeleting(true), pause);
        } else if (deleting && charIdx > 0) {
            timer = setTimeout(() => { setCharIdx(c => c - 1); setDisplay(current.slice(0, charIdx - 1)); }, speed / 2);
        } else { setDeleting(false); setIdx(i => (i + 1) % texts.length); }
        return () => clearTimeout(timer);
    }, [charIdx, deleting, idx, texts, speed, pause]);
    return display;
}

/* ═══════════ Particle Canvas ═══════════ */

function ParticleBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mouseRef = useRef({ x: -9999, y: -9999 });
    const rafRef = useRef(0);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const resize = () => { canvas.width = window.innerWidth; canvas.height = document.documentElement.scrollHeight; };
        resize();
        window.addEventListener("resize", resize);
        const colors = ["228,179,90", "148,163,184", "96,165,250", "167,139,250"];
        const count = Math.min(Math.floor(window.innerWidth / 22), 60);
        interface P { x: number; y: number; vx: number; vy: number; r: number; a: number; c: string }
        const ps: P[] = [];
        for (let i = 0; i < count; i++) {
            ps.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
                r: Math.random() * 1.8 + 0.5, a: Math.random() * 0.18 + 0.04,
                c: colors[Math.floor(Math.random() * colors.length)] });
        }
        const onMouse = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY + window.scrollY }; };
        window.addEventListener("mousemove", onMouse);
        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const mx = mouseRef.current.x, my = mouseRef.current.y;
            for (const p of ps) {
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
                if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
                const dx = p.x - mx, dy = p.y - my, dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 140 && dist > 0) { const f = (140 - dist) / 140 * 1.2; p.x += (dx / dist) * f; p.y += (dy / dist) * f; }
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${p.c},${p.a})`; ctx.fill();
            }
            for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
                const dx = ps[i].x - ps[j].x, dy = ps[i].y - ps[j].y, d = Math.sqrt(dx * dx + dy * dy);
                if (d < 100) { ctx.beginPath(); ctx.moveTo(ps[i].x, ps[i].y); ctx.lineTo(ps[j].x, ps[j].y);
                    ctx.strokeStyle = `rgba(228,179,90,${(1 - d / 100) * 0.06})`; ctx.lineWidth = 0.5; ctx.stroke(); }
            }
            if (mx > 0 && my > 0) {
                const g = ctx.createRadialGradient(mx, my, 0, mx, my, 180);
                g.addColorStop(0, "rgba(228,179,90,0.04)"); g.addColorStop(1, "rgba(228,179,90,0)");
                ctx.beginPath(); ctx.arc(mx, my, 180, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
            }
            rafRef.current = requestAnimationFrame(draw);
        };
        rafRef.current = requestAnimationFrame(draw);
        return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); window.removeEventListener("mousemove", onMouse); };
    }, []);
    return <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }} />;
}

/* ═══════════ Stars Canvas ═══════════ */

function StarsCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef(0);
    useEffect(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        const parent = canvas.parentElement; if (!parent) return;
        const resize = () => { canvas.width = parent.offsetWidth; canvas.height = parent.offsetHeight; };
        resize(); const ro = new ResizeObserver(resize); ro.observe(parent);
        interface S { x: number; y: number; r: number; ph: number; sp: number }
        const stars: S[] = [];
        for (let i = 0; i < 50; i++) stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height,
            r: Math.random() * 1.5 + 0.3, ph: Math.random() * Math.PI * 2, sp: Math.random() * 0.02 + 0.005 });
        let t = 0;
        const draw = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); t++;
            for (const s of stars) { const a = 0.3 + 0.7 * Math.abs(Math.sin(s.ph + t * s.sp));
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fillStyle = `rgba(228,199,140,${a})`; ctx.fill(); }
            rafRef.current = requestAnimationFrame(draw); };
        rafRef.current = requestAnimationFrame(draw);
        return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
    }, []);
    return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}

/* ═══════════ GlowCard ═══════════ */

function GlowCard({ children, visible, delay }: { children: React.ReactNode; visible: boolean; delay: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [hover, setHover] = useState(false);
    const onMove = useCallback((e: React.MouseEvent) => {
        const r = ref.current?.getBoundingClientRect(); if (!r) return;
        setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
    }, []);
    return (
        <FeatCard ref={ref} $visible={visible} $delay={delay} onMouseMove={onMove} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            {hover && <CardGlow style={{ left: pos.x, top: pos.y }} />}
            {children}
        </FeatCard>
    );
}

/* ═══════════ MagneticButton ═══════════ */

function MagneticButton({ children, primary, onClick }: { children: React.ReactNode; primary?: boolean; onClick?: () => void }) {
    const ref = useRef<HTMLButtonElement>(null);
    const [off, setOff] = useState({ x: 0, y: 0 });
    const onMove = useCallback((e: React.MouseEvent) => {
        const r = ref.current?.getBoundingClientRect(); if (!r) return;
        setOff({ x: (e.clientX - r.left - r.width / 2) * 0.15, y: (e.clientY - r.top - r.height / 2) * 0.15 });
    }, []);
    return (
        <CTAButton ref={ref} $primary={primary} onClick={onClick} onMouseMove={onMove} onMouseLeave={() => setOff({ x: 0, y: 0 })}
            style={{ transform: `translate3d(${off.x}px, ${off.y}px, 0)` }}>{children}</CTAButton>
    );
}

/* ═══════════ Tilt Image Card ═══════════ */

function TiltImageCard({ src, visible }: { src: string; visible: boolean }) {
    const cardRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const glowRef = useRef<HTMLDivElement>(null);

    const onMove = useCallback((e: React.MouseEvent) => {
        const r = cardRef.current?.getBoundingClientRect();
        if (!r || !cardRef.current || !imgRef.current || !glowRef.current) return;
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        const rotY = (x - 0.5) * 12;
        const rotX = (0.5 - y) * 12;
        cardRef.current.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.02)`;
        imgRef.current.style.transform = `translate3d(${(0.5 - x) * 15}px, ${(0.5 - y) * 15}px, 0) scale(1.08)`;
        glowRef.current.style.background = `radial-gradient(400px circle at ${x * 100}% ${y * 100}%, rgba(228,179,90,0.2), transparent 70%)`;
    }, []);

    const onLeave = useCallback(() => {
        if (cardRef.current) cardRef.current.style.transform = "perspective(800px) rotateX(0) rotateY(0) scale(1)";
        if (imgRef.current) imgRef.current.style.transform = "translate3d(0,0,0) scale(1.02)";
        if (glowRef.current) glowRef.current.style.background = "transparent";
    }, []);

    return (
        <ImageCardWrap
            ref={cardRef}
            $visible={visible}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
        >
            <ImageCardInner>
                <ImageCardImg ref={imgRef} src={src} alt="" />
            </ImageCardInner>
            <ImageCardGlow ref={glowRef} />
            <ImageCardShine />
        </ImageCardWrap>
    );
}

/* ═══════════ Animations ═══════════ */

const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(40px); }
    to   { opacity: 1; transform: translateY(0); }
`;

const shimmer = keyframes`
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
`;

const scrollHint = keyframes`
    0%, 100% { opacity: 0.4; transform: translateY(0); }
    50%      { opacity: 1; transform: translateY(8px); }
`;

const blinkAnim = keyframes`
    0%, 100% { opacity: 1; }
    50%      { opacity: 0; }
`;

const processNodePulse = keyframes`
    0%   { box-shadow: 0 0 0 0 rgba(228,179,90,0.4); }
    70%  { box-shadow: 0 0 0 14px rgba(228,179,90,0); }
    100% { box-shadow: 0 0 0 0 rgba(228,179,90,0); }
`;

const zoomReveal = keyframes`
    from { transform: scale(1.15); opacity: 0; }
    to   { transform: scale(1.08); opacity: 1; }
`;

/* ═══════════ Styled Components ═══════════ */

const Page = styled.div`
    background: #0a0a0f;
    color: #f1f1f1;
    font-family: "Pretendard", "Apple SD Gothic Neo", sans-serif;
    overflow-x: hidden;
    position: relative;
`;

const ScrollProgress = styled.div<{ $p: number }>`
    position: fixed; top: 0; left: 0; height: 3px;
    width: ${({ $p }) => $p * 100}%;
    background: linear-gradient(90deg, #e4b35a, #f7d98b);
    z-index: 200;
    box-shadow: 0 0 12px rgba(228,179,90,0.5);
`;

const Grain = styled.div`
    position: fixed; inset: 0; opacity: 0.035; pointer-events: none; z-index: 50;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 128px;
`;

/* ── Nav ── */
const Nav = styled.nav`
    position: fixed; top: 3px; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 48px; height: 72px;
    background: rgba(10,10,15,0.6); backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(255,255,255,0.06);
`;
const NavLogo = styled.div`cursor: pointer; height: 32px; img { height: 100%; object-fit: contain; }`;
const NavBtn = styled.button`
    padding: 10px 24px; font-size: 14px; font-weight: 600; border-radius: 6px;
    cursor: pointer; transition: all 0.25s; border: none; background: #e4b35a; color: #0a0a0f;
    &:hover { transform: translateY(-1px); background: #f0c36d; box-shadow: 0 4px 20px rgba(228,179,90,0.3); }
`;

/* ── Hero ── */
const HeroSection = styled.section`
    position: relative; height: 100vh; min-height: 700px;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
`;

/* CSS-only parallax: fixed attachment for smooth scrolling */
const HeroBg = styled.div`
    position: absolute; inset: 0;
    background: url(${HeroImg}) center/cover no-repeat;
    background-attachment: fixed;
    filter: brightness(0.3) saturate(0.8);
    will-change: transform;
`;

const HeroOverlay = styled.div`
    position: absolute; inset: 0;
    background: linear-gradient(180deg,
        rgba(10,10,15,0.5) 0%, rgba(10,10,15,0.15) 40%,
        rgba(10,10,15,0.6) 80%, rgba(10,10,15,1) 100%);
`;

/* Hero mouse spotlight */
const HeroMouseLight = styled.div`
    position: absolute; inset: 0; pointer-events: none; z-index: 1;
    transition: background 0.15s ease-out;
`;

const HeroContent = styled.div`
    position: relative; z-index: 4; text-align: center; max-width: 800px; padding: 0 32px;
`;

const HeroTag = styled.div`
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 13px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase;
    color: #e4b35a; margin-bottom: 28px;
    animation: ${fadeUp} 1s cubic-bezier(0.16,1,0.3,1) 0.2s both;
`;
const HeroTagLine = styled.span`display: inline-block; width: 32px; height: 1px; background: #e4b35a;`;

const HeroTitle = styled.h1`
    font-size: clamp(40px, 6vw, 72px); font-weight: 800; line-height: 1.15;
    letter-spacing: -2px; margin: 0 0 28px; color: #ffffff;
    animation: ${fadeUp} 1s cubic-bezier(0.16,1,0.3,1) 0.4s both; word-break: keep-all;
`;

const GoldText = styled.span`
    background: linear-gradient(135deg, #e4b35a 0%, #f7d98b 50%, #e4b35a 100%);
    background-size: 200% auto; animation: ${shimmer} 4s linear infinite;
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
`;

const HeroSub = styled.p`
    font-size: 18px; color: rgba(255,255,255,0.7); line-height: 1.8;
    margin: 0 0 16px; animation: ${fadeUp} 1s cubic-bezier(0.16,1,0.3,1) 0.6s both;
    word-break: keep-all; strong { color: #ffffff; font-weight: 600; }
`;

const TypingWrap = styled.div`
    font-size: 15px; color: #e4b35a; margin-bottom: 40px; height: 24px;
    animation: ${fadeUp} 1s cubic-bezier(0.16,1,0.3,1) 0.7s both; font-weight: 500;
`;
const BlinkCursor = styled.span`
    display: inline-block; width: 2px; height: 18px; background: #e4b35a;
    margin-left: 2px; vertical-align: text-bottom; animation: ${blinkAnim} 1s step-end infinite;
`;

const HeroCTA = styled.div`
    display: flex; gap: 16px; justify-content: center;
    animation: ${fadeUp} 1s cubic-bezier(0.16,1,0.3,1) 0.8s both;
`;

const CTAButton = styled.button<{ $primary?: boolean }>`
    padding: 16px 36px; font-size: 16px; font-weight: 700; border-radius: 8px;
    cursor: pointer; display: flex; align-items: center; gap: 10px;
    transition: box-shadow 0.3s, background 0.3s;
    border: 1px solid ${({ $primary }) => ($primary ? "transparent" : "rgba(255,255,255,0.2)")};
    background: ${({ $primary }) => ($primary ? "linear-gradient(135deg, #e4b35a, #d4a04a)" : "rgba(255,255,255,0.05)")};
    color: ${({ $primary }) => ($primary ? "#0a0a0f" : "#ffffff")};
    backdrop-filter: ${({ $primary }) => ($primary ? "none" : "blur(8px)")};
    &:hover { box-shadow: ${({ $primary }) => $primary ? "0 8px 32px rgba(228,179,90,0.4)" : "0 8px 32px rgba(255,255,255,0.06)"}; }
`;

const ScrollDown = styled.div`
    position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%); z-index: 4;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    color: rgba(255,255,255,0.4); font-size: 11px; letter-spacing: 2px;
    text-transform: uppercase; animation: ${scrollHint} 2.5s ease-in-out infinite; cursor: pointer;
`;

/* ── Image Card Section (2-col: text + tilt card) ── */
const ImageSectionRow = styled.section<{ $visible: boolean }>`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 64px;
    align-items: center;
    max-width: 1200px;
    margin: 0 auto;
    padding: 120px 48px;
    position: relative;
    z-index: 2;
    opacity: ${({ $visible }) => ($visible ? 1 : 0)};
    transform: translateY(${({ $visible }) => ($visible ? 0 : 50)}px);
    transition: all 1s cubic-bezier(0.16,1,0.3,1);
    @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

const ImageTextBlock = styled.div<{ $order?: number }>`
    order: ${({ $order }) => $order ?? 0};
    @media (max-width: 900px) { order: 1; }
`;

const ImageCardWrap = styled.div<{ $visible: boolean }>`
    position: relative;
    border-radius: 20px;
    overflow: hidden;
    cursor: default;
    will-change: transform;
    transition: transform 0.25s ease-out;
    box-shadow: 0 24px 60px rgba(0,0,0,0.5);
    opacity: ${({ $visible }) => ($visible ? 1 : 0)};
    animation: ${({ $visible }) => ($visible ? css`${zoomReveal} 1.2s cubic-bezier(0.16,1,0.3,1) both` : "none")};
    @media (max-width: 900px) { order: 0; }
`;

const ImageCardInner = styled.div`
    overflow: hidden;
    border-radius: 20px;
    aspect-ratio: 4 / 3;
`;

const ImageCardImg = styled.img`
    width: 100%; height: 100%;
    object-fit: cover;
    will-change: transform;
    transition: transform 0.25s ease-out;
    transform: scale(1.02);
`;

const ImageCardGlow = styled.div`
    position: absolute; inset: 0; border-radius: 20px;
    pointer-events: none; z-index: 1;
    transition: background 0.25s ease-out;
`;

const ImageCardShine = styled.div`
    position: absolute; inset: 0; border-radius: 20px;
    pointer-events: none; z-index: 2;
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.1);
`;

const ImgSectionTag = styled.div`font-size: 12px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #e4b35a; margin-bottom: 16px;`;
const ImgSectionH2 = styled.h2`font-size: clamp(28px, 4vw, 40px); font-weight: 800; letter-spacing: -1px; color: #ffffff; margin: 0 0 20px; word-break: keep-all; line-height: 1.3;`;
const ImgSectionP = styled.p`font-size: 16px; color: rgba(255,255,255,0.55); line-height: 1.75; margin: 0; word-break: keep-all; strong { color: rgba(255,255,255,0.85); font-weight: 600; }`;
const ImgSectionCaption = styled.div`margin-top: 20px; font-size: 13px; color: rgba(255,255,255,0.35); letter-spacing: 2px; text-transform: uppercase; font-weight: 600;`;

/* ── Stats ── */
const StatsSectionWrap = styled.section`
    position: relative; overflow: hidden; z-index: 2;
    background: linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.95));
`;

const StatsGrid = styled.div<{ $visible: boolean }>`
    display: grid; grid-template-columns: repeat(4, 1fr);
    max-width: 1000px; margin: 0 auto; padding: 80px 48px;
    position: relative; z-index: 1;
    opacity: ${({ $visible }) => ($visible ? 1 : 0)};
    transform: translateY(${({ $visible }) => ($visible ? 0 : 40)}px);
    transition: all 0.8s cubic-bezier(0.16,1,0.3,1);
    @media (max-width: 700px) { grid-template-columns: repeat(2, 1fr); gap: 40px; }
`;

const StatCard = styled.div`
    text-align: center; position: relative;
    &:not(:last-child)::after {
        content: ""; position: absolute; right: 0; top: 50%;
        transform: translateY(-50%); width: 1px; height: 48px;
        background: rgba(255,255,255,0.08);
    }
    @media (max-width: 700px) { &:nth-child(2)::after { display: none; } }
`;
const StatIcon2 = styled.div`color: #e4b35a; margin-bottom: 14px;`;
const StatNum = styled.div`font-size: 48px; font-weight: 800; color: #ffffff; letter-spacing: -2px; font-variant-numeric: tabular-nums;`;
const StatLbl = styled.div`font-size: 14px; color: rgba(255,255,255,0.45); margin-top: 6px; font-weight: 500;`;

/* ── Features ── */
const FeatSection = styled.section`padding: 120px 48px; max-width: 1100px; margin: 0 auto; position: relative; z-index: 2;`;

const SectionHeader = styled.div<{ $visible: boolean }>`
    text-align: center; margin-bottom: 64px;
    opacity: ${({ $visible }) => ($visible ? 1 : 0)};
    transform: translateY(${({ $visible }) => ($visible ? 0 : 30)}px);
    transition: all 0.8s cubic-bezier(0.16,1,0.3,1);
`;

const SectionTag = styled.div`font-size: 12px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #e4b35a; margin-bottom: 16px;`;
const SectionH2 = styled.h2`font-size: clamp(28px, 4vw, 40px); font-weight: 800; letter-spacing: -1px; color: #ffffff; margin: 0 0 16px; word-break: keep-all;`;
const SectionDesc = styled.p`font-size: 16px; color: rgba(255,255,255,0.5); max-width: 500px; margin: 0 auto; line-height: 1.6;`;

const FeatGrid = styled.div`
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px;
    @media (max-width: 700px) { grid-template-columns: 1fr; }
`;

const FeatCard = styled.div<{ $visible: boolean; $delay: number }>`
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px; padding: 36px; position: relative; overflow: hidden; cursor: default;
    opacity: ${({ $visible }) => ($visible ? 1 : 0)};
    transform: translateY(${({ $visible }) => ($visible ? 0 : 40)}px);
    transition: all 0.7s cubic-bezier(0.16,1,0.3,1);
    transition-delay: ${({ $delay }) => $delay * 0.12}s;
    &::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 1px;
        background: linear-gradient(90deg, transparent, #e4b35a, transparent);
        transform: scaleX(0); transition: transform 0.5s; }
    &:hover { background: rgba(255,255,255,0.05); border-color: rgba(228,179,90,0.2);
        transform: translateY(-4px); &::before { transform: scaleX(1); } }
`;

const CardGlow = styled.div`
    position: absolute; width: 250px; height: 250px; border-radius: 50%;
    background: radial-gradient(circle, rgba(228,179,90,0.1) 0%, transparent 70%);
    pointer-events: none; transform: translate(-50%, -50%); z-index: 0;
`;

const FeatIconWrap = styled.div`
    width: 52px; height: 52px; border-radius: 12px;
    background: rgba(228,179,90,0.1); border: 1px solid rgba(228,179,90,0.15);
    display: flex; align-items: center; justify-content: center;
    color: #e4b35a; margin-bottom: 24px; transition: transform 0.3s;
    position: relative; z-index: 1;
    ${FeatCard}:hover & { transform: scale(1.1) rotate(-5deg); }
`;
const FeatTitle = styled.h3`font-size: 18px; font-weight: 700; color: #ffffff; margin: 0 0 12px; position: relative; z-index: 1;`;
const FeatDesc = styled.p`font-size: 14.5px; color: rgba(255,255,255,0.5); line-height: 1.65; margin: 0; word-break: keep-all; position: relative; z-index: 1;`;

/* ── Process ── */
const ProcessSection = styled.section`padding: 120px 48px; max-width: 900px; margin: 0 auto; position: relative; z-index: 2;`;
const ProcessTimeline = styled.div<{ $visible: boolean }>`
    display: flex; align-items: flex-start; justify-content: space-between; position: relative;
    opacity: ${({ $visible }) => ($visible ? 1 : 0)};
    transform: translateY(${({ $visible }) => ($visible ? 0 : 40)}px);
    transition: all 0.8s cubic-bezier(0.16,1,0.3,1);
    &::before { content: ""; position: absolute; top: 32px; left: 64px; right: 64px; height: 1px; background: rgba(255,255,255,0.08); }
    @media (max-width: 700px) { flex-direction: column; gap: 40px; align-items: center; &::before { display: none; } }
`;
const PStep = styled.div`display: flex; flex-direction: column; align-items: center; text-align: center; flex: 1; cursor: pointer; transition: transform 0.3s; &:hover { transform: translateY(-6px); }`;
const PCircle = styled.div<{ $active: boolean }>`
    width: 64px; height: 64px; border-radius: 50%;
    background: ${({ $active }) => ($active ? "linear-gradient(135deg, #e4b35a, #d4a04a)" : "rgba(255,255,255,0.04)")};
    border: 1px solid ${({ $active }) => ($active ? "#e4b35a" : "rgba(255,255,255,0.1)")};
    display: flex; align-items: center; justify-content: center;
    color: ${({ $active }) => ($active ? "#0a0a0f" : "rgba(255,255,255,0.4)")};
    margin-bottom: 16px; transition: all 0.4s;
    animation: ${({ $active }) => ($active ? css`${processNodePulse} 2s ease-out infinite` : "none")}; z-index: 2;
`;
const PLabel = styled.div<{ $active: boolean }>`
    font-size: 14px; font-weight: ${({ $active }) => ($active ? 700 : 500)};
    color: ${({ $active }) => ($active ? "#e4b35a" : "rgba(255,255,255,0.35)")}; transition: all 0.3s; max-width: 110px;
`;

/* ── CTA Banner ── */
const CTABanner = styled.section<{ $visible: boolean }>`
    margin: 0 auto 120px; max-width: 1000px; padding: 64px; border-radius: 20px;
    background: linear-gradient(135deg, rgba(228,179,90,0.12), rgba(228,179,90,0.04));
    border: 1px solid rgba(228,179,90,0.15); text-align: center; position: relative; overflow: hidden; z-index: 2;
    opacity: ${({ $visible }) => ($visible ? 1 : 0)};
    transform: translateY(${({ $visible }) => ($visible ? 0 : 40)}px);
    transition: all 0.8s cubic-bezier(0.16,1,0.3,1);
`;
const CTABannerH = styled.h2`font-size: 32px; font-weight: 800; color: #ffffff; margin: 0 0 16px; letter-spacing: -1px;`;
const CTABannerP = styled.p`font-size: 16px; color: rgba(255,255,255,0.5); margin: 0 0 36px; line-height: 1.6;`;

/* ── Footer ── */
const Footer = styled.footer`border-top: 1px solid rgba(255,255,255,0.06); padding: 56px 48px; text-align: center; position: relative; z-index: 2;`;
const FooterLogo = styled.div`height: 28px; margin-bottom: 28px; img { height: 100%; object-fit: contain; opacity: 0.5; }`;
const FooterInfo = styled.div`display: flex; flex-wrap: wrap; justify-content: center; gap: 16px 28px; font-size: 13px; color: rgba(255,255,255,0.3); margin-bottom: 24px; b { color: rgba(255,255,255,0.5); font-weight: 600; }`;
const FooterCopy = styled.div`font-size: 12px; color: rgba(255,255,255,0.2);`;

/* ═══════════ Component ═══════════ */

export default function LandingPage() {
    const navigate = useNavigate();
    const account = useRecoilValue(AccountState);
    const isLoggedIn = !!(account as any)?.is_superuser || !!localStorage.getItem("token");
    const scrollProgress = useScrollProgress();

    // Hero mouse spotlight
    const heroRef = useRef<HTMLDivElement>(null);
    const heroLightRef = useRef<HTMLDivElement>(null);
    const onHeroMouse = useCallback((e: React.MouseEvent) => {
        if (!heroLightRef.current) return;
        const r = heroRef.current?.getBoundingClientRect();
        if (!r) return;
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        heroLightRef.current.style.background =
            `radial-gradient(600px circle at ${x}px ${y}px, rgba(228,179,90,0.08), transparent 70%)`;
    }, []);

    const showcaseView1 = useInView(0.15);
    const statsView = useInView(0.2);
    const featView = useInView(0.1);
    const showcaseView2 = useInView(0.15);
    const processView = useInView(0.15);
    const ctaView = useInView(0.2);

    const years = useCountUp(20, 1800, statsView.inView);
    const movies = useCountUp(1500, 2000, statsView.inView);
    const clients = useCountUp(50, 1600, statsView.inView);
    const dataPoints = useCountUp(365, 1800, statsView.inView);

    const [activeStep, setActiveStep] = useState(0);
    useEffect(() => { const t = setInterval(() => setActiveStep(p => (p + 1) % 4), 3000); return () => clearInterval(t); }, []);

    const typingText = useTypingText([
        "오차 없는 부금 정산을 수행합니다",
        "빅데이터 기반의 배급 전략을 지원합니다",
        "매일 극장 데이터를 수집·가공합니다",
        "20년의 업력으로 신뢰를 쌓아왔습니다",
    ], 60, 2000);

    const goSystem = () => navigate((account as any)?.is_superuser ? "/manage" : "/score");

    const steps = [
        { icon: <Database size={26} weight="bold" />, label: "극장 데이터 수집" },
        { icon: <ChartLineUp size={26} weight="bold" />, label: "교차 검증 분석" },
        { icon: <CurrencyKrw size={26} weight="bold" />, label: "부금 정산 처리" },
        { icon: <ArrowRight size={26} weight="bold" />, label: "배급사 동기화" },
    ];

    return (
        <Page>
            <ScrollProgress $p={scrollProgress} />
            <ParticleBackground />
            <Grain />

            <Nav>
                <NavLogo onClick={() => navigate("/")}><img src={LogoWhiteImg} alt="Castingline" /></NavLogo>
                {isLoggedIn
                    ? <NavBtn onClick={goSystem}>시스템 접속</NavBtn>
                    : <NavBtn onClick={() => navigate("/login")}>로그인</NavBtn>}
            </Nav>

            {/* ── Hero ── */}
            <HeroSection ref={heroRef} onMouseMove={onHeroMouse}>
                <HeroBg />
                <HeroOverlay />
                <HeroMouseLight ref={heroLightRef} />
                <HeroContent>
                    <HeroTag><HeroTagLine /> 대한민국 No.1 영화 입회사 <HeroTagLine /></HeroTag>
                    <HeroTitle>투명한 데이터 스탠다드,<br /><GoldText>CASTINGLINE</GoldText></HeroTitle>
                    <HeroSub>
                        <strong>20년 업력</strong>의 영화 입회 노하우와 방대한 축적 데이터를 갖춘 전문 기업.
                        <br />매일 극장 데이터를 수집·가공하여 <strong>오차 없는 부금 정산</strong>을 수행하며,
                        <br /><strong>빅데이터 기반 인사이트</strong>로 가장 성공적인 배급 전략을 지원합니다.
                    </HeroSub>
                    <TypingWrap>{typingText}<BlinkCursor /></TypingWrap>
                    <HeroCTA>
                        {isLoggedIn ? (
                            <MagneticButton primary onClick={goSystem}><Desktop size={20} /> 대시보드 바로가기</MagneticButton>
                        ) : (<>
                            <MagneticButton primary onClick={() => navigate("/score")}><ChartLineUp size={20} /> 스코어 조회</MagneticButton>
                            <MagneticButton onClick={() => navigate("/login")}>관리자 로그인 <ArrowRight size={18} /></MagneticButton>
                        </>)}
                    </HeroCTA>
                </HeroContent>
                <ScrollDown onClick={() => window.scrollTo({ top: window.innerHeight, behavior: "smooth" })}>
                    SCROLL<ArrowDown size={16} />
                </ScrollDown>
            </HeroSection>

            {/* ── Audience: Text left + Image Card right ── */}
            <div ref={showcaseView1.ref}>
                <ImageSectionRow $visible={showcaseView1.inView}>
                    <ImageTextBlock>
                        <ImgSectionTag>About</ImgSectionTag>
                        <ImgSectionH2>모든 관객의 발걸음을,<br />데이터로 기록합니다</ImgSectionH2>
                        <ImgSectionP>
                            캐스팅라인은 <strong>20년 업력</strong>의 영화 입회 노하우와 방대한 축적 데이터를 갖춘 전문 기업입니다.
                            매일 극장 데이터를 수집·가공하여 오차 없는 부금 정산을 수행하며,
                            <strong>빅데이터 기반의 인사이트</strong>로 가장 성공적인 배급 전략을 지원합니다.
                        </ImgSectionP>
                        <ImgSectionCaption>Since 2006 &middot; 20 Years of Data</ImgSectionCaption>
                    </ImageTextBlock>
                    <TiltImageCard src={AudienceImg} visible={showcaseView1.inView} />
                </ImageSectionRow>
            </div>

            {/* ── Stats ── */}
            <StatsSectionWrap ref={statsView.ref}>
                <StarsCanvas />
                <StatsGrid $visible={statsView.inView}>
                    <StatCard><StatIcon2><FilmSlate size={28} weight="duotone" /></StatIcon2><StatNum>{years}+</StatNum><StatLbl>년 업력</StatLbl></StatCard>
                    <StatCard><StatIcon2><FilmReel size={28} weight="duotone" /></StatIcon2><StatNum>{movies.toLocaleString()}+</StatNum><StatLbl>작품 관리</StatLbl></StatCard>
                    <StatCard><StatIcon2><Buildings size={28} weight="duotone" /></StatIcon2><StatNum>{clients}+</StatNum><StatLbl>파트너 배급사</StatLbl></StatCard>
                    <StatCard><StatIcon2><Calendar size={28} weight="duotone" /></StatIcon2><StatNum>{dataPoints}</StatNum><StatLbl>일/년 데이터 수집</StatLbl></StatCard>
                </StatsGrid>
            </StatsSectionWrap>

            {/* ── Features ── */}
            <FeatSection ref={featView.ref}>
                <SectionHeader $visible={featView.inView}>
                    <SectionTag>Services</SectionTag>
                    <SectionH2>핵심 서비스</SectionH2>
                    <SectionDesc>캐스팅라인이 제공하는 데이터 기반 영화 입회 솔루션</SectionDesc>
                </SectionHeader>
                <FeatGrid>
                    <GlowCard visible={featView.inView} delay={0}>
                        <FeatIconWrap><ChartLineUp size={24} weight="bold" /></FeatIconWrap>
                        <FeatTitle>투명하고 검증된 스코어 데이터</FeatTitle>
                        <FeatDesc>매일 오차 없는 현황판을 통해 복잡한 극장 관람객 수 및 티켓 단가를 교차 검증하여, 실시간 배급 척도를 제공합니다.</FeatDesc>
                    </GlowCard>
                    <GlowCard visible={featView.inView} delay={1}>
                        <FeatIconWrap><ShieldCheck size={24} weight="bold" /></FeatIconWrap>
                        <FeatTitle>정확한 부금 정산 시스템</FeatTitle>
                        <FeatDesc>시스템 내 자동화된 부율 계산 과정을 통해, 배급사 및 극장 간의 투명하고 빠르고 무결한 부금 정산 서류를 발행합니다.</FeatDesc>
                    </GlowCard>
                    <GlowCard visible={featView.inView} delay={2}>
                        <FeatIconWrap><Calendar size={24} weight="bold" /></FeatIconWrap>
                        <FeatTitle>풍부한 지표 데이터</FeatTitle>
                        <FeatDesc>매일 제공되는 좌석수 데이터를 이용한 그래프, 대시보드 등의 세세한 비교 데이터 제공</FeatDesc>
                    </GlowCard>
                    <GlowCard visible={featView.inView} delay={3}>
                        <FeatIconWrap><ArrowRight size={24} weight="bold" /></FeatIconWrap>
                        <FeatTitle>배급사 전산망 다이렉트 API</FeatTitle>
                        <FeatDesc>이중 입력의 번거로움 없이 입회 데이터 및 정산 완료 내역을 배급사 측 자체 ERP와 다이렉트로 안전하게 동기화합니다.</FeatDesc>
                    </GlowCard>
                </FeatGrid>
            </FeatSection>

            {/* ── Cinema Sign: Image Card left + Text right ── */}
            <div ref={showcaseView2.ref}>
                <ImageSectionRow $visible={showcaseView2.inView}>
                    <TiltImageCard src={CinemaSignImg} visible={showcaseView2.inView} />
                    <ImageTextBlock $order={1}>
                        <ImgSectionTag>Process</ImgSectionTag>
                        <ImgSectionH2>데이터 수집부터 정산까지,<br />원스톱 처리</ImgSectionH2>
                        <ImgSectionP>
                            매일 전국 극장의 상영 데이터를 <strong>자동 수집</strong>하고,
                            검증된 알고리즘으로 <strong>정산까지 한 번에</strong> 완료합니다.
                            이중 입력 없이 배급사 ERP와 다이렉트로 동기화됩니다.
                        </ImgSectionP>
                        <ImgSectionCaption>Automated &middot; Transparent &middot; Accurate</ImgSectionCaption>
                    </ImageTextBlock>
                </ImageSectionRow>
            </div>

            {/* ── Process ── */}
            <ProcessSection ref={processView.ref}>
                <SectionHeader $visible={processView.inView}>
                    <SectionTag>Workflow</SectionTag>
                    <SectionH2>업무 프로세스</SectionH2>
                </SectionHeader>
                <ProcessTimeline $visible={processView.inView}>
                    {steps.map((s, i) => (
                        <PStep key={i} onMouseEnter={() => setActiveStep(i)}>
                            <PCircle $active={activeStep === i}>{s.icon}</PCircle>
                            <PLabel $active={activeStep === i}>{s.label}</PLabel>
                        </PStep>
                    ))}
                </ProcessTimeline>
            </ProcessSection>

            {/* ── CTA ── */}
            <div ref={ctaView.ref} style={{ padding: "0 48px" }}>
                <CTABanner $visible={ctaView.inView}>
                    <CTABannerH>지금 바로 시작하세요</CTABannerH>
                    <CTABannerP>캐스팅라인의 데이터 기반 영화 입회 솔루션을 경험해보세요.</CTABannerP>
                    {isLoggedIn ? (
                        <MagneticButton primary onClick={goSystem}><Desktop size={20} /> 대시보드 바로가기</MagneticButton>
                    ) : (
                        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
                            <MagneticButton primary onClick={() => navigate("/score")}><ChartLineUp size={20} /> 스코어 조회</MagneticButton>
                            <MagneticButton onClick={() => navigate("/login")}>관리자 로그인 <ArrowRight size={18} /></MagneticButton>
                        </div>
                    )}
                </CTABanner>
            </div>

            <Footer>
                <FooterLogo><img src={LogoWhiteImg} alt="Castingline" /></FooterLogo>
                <FooterInfo>
                    <span><b>회사명</b> (주) 캐스팅라인</span>
                    <span><b>대표이사</b> 박미선</span>
                    <span><b>전화</b> 02-2285-1790</span>
                    <span><b>사업자등록번호</b> 201-181-69426</span>
                    <span><b>주소</b> 경기도 고양시 덕양구 으뜸로 130</span>
                </FooterInfo>
                <FooterCopy>&copy; 2026 CASTINGLINE. All rights reserved.</FooterCopy>
            </Footer>
        </Page>
    );
}
