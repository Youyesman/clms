import { useEffect, useState } from "react";
import styled, { keyframes } from "styled-components";
import React from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import { useRecoilValue, useResetRecoilState } from "recoil";
import ErrorImg from "../../assets/img/alert/error_alert_img.png";
import SuccessImg from "../../assets/img/alert/success_signup.png";
import CheckingImg from "../../assets/img/alert/checking_img.png";
import DoneImg from "../../assets/img/alert/checking_done_img.png";
import { CustomButton } from "./CustomButton";
import { CustomFilledButton } from "./CustomFilledButton";
import { GlobalAlertState } from "../../atom/GlobalAlertState";

/* ---------------- Animations ---------------- */

const overlayFadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;
const overlayFadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

const modalFadeInScale = keyframes`
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
`;

const modalFadeOutScale = keyframes`
  from {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  to {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.95);
  }
`;

/* ---------------- Styled ---------------- */

const Overlay = styled.div<{ closing?: boolean }>`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(2px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;

    animation: ${({ closing }) => (closing ? overlayFadeOut : overlayFadeIn)} 0.25s ease forwards;
`;

const AlertContainer = styled.div<{ closing?: boolean }>`
    width: 400px;
    padding: 24px;
    background: white;
    box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    align-items: center;

    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    animation: ${({ closing }) => (closing ? modalFadeOutScale : modalFadeInScale)} 0.25s ease forwards;
`;

const MessageGroup = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
`;

const Title = styled.div`
    text-align: center;
    color: var(--FEG-Dark-900, #03080b);
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.36px;
    margin-bottom: 24px;
`;

const Subtitle = styled.div`
    text-align: center;
    color: var(--FEG-Dark-900, #03080b);
    font-size: 14px;
    font-weight: 300;
    letter-spacing: 0.2px;
`;

const IllustBox = styled.div`
    width: 140px;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 24px;

    img {
        max-width: 100%;
        height: auto;
    }
`;

const AlertButtonWrapper = styled.div<{
    dual?: boolean;
}>`
    width: 100%;
    display: flex;
    gap: 12px;

    & > button {
        ${({ dual }) =>
        dual
            ? `
            flex: 1;
            width: auto !important;
            max-width: none !important;
        `
            : `
            width: 100% !important;
            max-width: none !important;
        `}
    }
`;

/* ---------------- Hook ---------------- */

function useCloseOnEsc(onClose: () => void) {
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [onClose]);
}

/* ---------------- Component ---------------- */

type AlertType = "error" | "success" | "checking" | "done" | "none";

type Props = {
    open: boolean;
    onConfirm?: () => void;
    onClose: () => void;
    title: string;
    subTitle?: string;
    highlight?: string;
    highlightColor?: string;
    img?: string;
    type?: AlertType; // ⭐ 추가됨
    showBtn?: boolean;
    btnName?: string;
    showCancelBtn?: boolean;
};

export function AlertConfirm({
    open,
    onClose,
    onConfirm = () => { },
    title,
    subTitle,
    highlight,
    highlightColor = "var(--FEG-Dark-50)",
    img,
    type = "error",
    showBtn = true,
    btnName = "",
    showCancelBtn = false,
}: Props) {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(open);
    const [closing, setClosing] = useState(false);
    const resetGlobalAlertState = useResetRecoilState(GlobalAlertState);

    useCloseOnEsc(() => startClose());

    useEffect(() => {
        if (open) {
            setVisible(true);
            setClosing(false);
        } else {
            startClose();
        }
    }, [open]);

    const startClose = () => {
        setClosing(true);

        setTimeout(() => {
            setClosing(false);
            setVisible(false);
            resetGlobalAlertState(); // ⭐ 여기 딱 1번만!
        }, 250);
    };

    const handleConfirmBtn = () => {
        startClose(); // ← 추가
        onConfirm();
    };

    if (!visible) return null;

    // ⭐ 기본 이미지 매핑
    const defaultImages: Record<Exclude<AlertType, "none">, string> = {
        error: ErrorImg,
        checking: CheckingImg,
        done: DoneImg,
        success: SuccessImg,
    };

    // ⭐ img 없으면 type에 따라 기본 이미지 자동 사용
    const finalImg = type === "none" ? null : img || defaultImages[type];

    const subTitleRenderNewLine = (text: any) => {
        if (!text || typeof text !== "string") return "";
        return text.split("\n").map((line, index) => (
            <React.Fragment key={index}>
                {line}
                {index < text.split("\n").length - 1 && <br />}
            </React.Fragment>
        ));
    };

    return ReactDOM.createPortal(
        <Overlay closing={closing} onClick={startClose}>
            <AlertContainer closing={closing} onClick={(e) => e.stopPropagation()}>
                <MessageGroup>
                    <Title>{title}</Title>
                    <Subtitle>
                        {subTitleRenderNewLine(subTitle)}
                        <br />
                        <br />
                        {highlight && <span style={{ color: highlightColor, fontWeight: 500 }}>{highlight}</span>}
                    </Subtitle>
                </MessageGroup>

                {finalImg && (
                    <IllustBox>
                        <img src={finalImg} alt="alert_illust" />
                    </IllustBox>
                )}

                {(showBtn || showCancelBtn) && (
                    <AlertButtonWrapper
                        dual={showCancelBtn && showBtn}
                        style={{
                            flexDirection: showCancelBtn && showBtn ? "row" : "column",
                        }}>
                        {showCancelBtn && (
                            <CustomFilledButton color="gray" onClick={startClose}>
                                취소
                            </CustomFilledButton>
                        )}

                        {showBtn && (
                            <CustomFilledButton
                                onClick={handleConfirmBtn}
                                style={{
                                    backgroundColor: highlightColor,
                                }}>
                                {btnName ? btnName : '확인'}
                            </CustomFilledButton>
                        )}
                    </AlertButtonWrapper>
                )}
            </AlertContainer>
        </Overlay>,
        document.body
    );
}

/* ---------------- Global Wrapper ---------------- */

export function GlobalAlert() {
    const globalAlertState = useRecoilValue(GlobalAlertState);

    return (
        <AlertConfirm
            open={globalAlertState.isOpen}
            onClose={globalAlertState.onClose}
            onConfirm={globalAlertState.onConfirm}
            title={globalAlertState.title}
            subTitle={globalAlertState.subTitle}
            highlight={globalAlertState.highlight || ""}
            highlightColor={globalAlertState.highlightColor || ""}
            img={globalAlertState.img}
            type={globalAlertState.type}
            showBtn={globalAlertState.showConfirmBtn}
            showCancelBtn={globalAlertState.showCancelBtn}
        />
    );
}
