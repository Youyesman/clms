import styled from "styled-components";
import { useRef, useState, useEffect } from "react";
import { EmailChipsInput } from "./EmailChipsInput";

interface EmailRecipientsProps {
    emailData: {
        to: string[];
        cc: string[];
        bcc: string[];
    };
    setEmailData: (data: any) => void;
}

export function EmailRecipients({ emailData, setEmailData }: EmailRecipientsProps) {
    const [showCC, setShowCC] = useState(false);
    const [showBCC, setShowBCC] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const ccRef = useRef<HTMLDivElement>(null);
    const bccRef = useRef<HTMLDivElement>(null);
    const ccButtonRef = useRef<HTMLSpanElement>(null);
    const bccButtonRef = useRef<HTMLSpanElement>(null);

    /** 클릭 영역 밖 클릭 시 CC/BCC 닫기 */
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;

            const inCC = ccRef.current?.contains(t) || ccButtonRef.current?.contains(t);
            const inBCC = bccRef.current?.contains(t) || bccButtonRef.current?.contains(t);

            if (showCC && emailData.cc.length === 0 && !inCC) setShowCC(false);
            if (showBCC && emailData.bcc.length === 0 && !inBCC) setShowBCC(false);
        };

        containerRef.current?.addEventListener("mousedown", handler);
        return () => containerRef.current?.removeEventListener("mousedown", handler);
    }, [showCC, showBCC, emailData.cc, emailData.bcc]);

    return (
        <Wrapper ref={containerRef}>
            {/* TO */}
            <LabelRow>
                <Label>TO</Label>
                <EmailChipsInput
                    values={emailData.to}
                    setValues={(v) => setEmailData({ ...emailData, to: v })}
                    placeholder="Input e-mail address"
                    rightElement={
                        <>
                            {!showCC && !showBCC && (
                                <span
                                    ref={ccButtonRef}
                                    onClick={() => {
                                        setShowCC(true);
                                        setShowBCC(false);
                                    }}>
                                    CC
                                </span>
                            )}
                            {!showCC && !showBCC && (
                                <span
                                    ref={bccButtonRef}
                                    onClick={() => {
                                        setShowBCC(true);
                                        setShowCC(false);
                                    }}>
                                    BCC
                                </span>
                            )}
                        </>
                    }
                />
            </LabelRow>

            {/* CC */}
            {showCC && (
                <div ref={ccRef}>
                    <LabelRow>
                        <Label>CC</Label>
                        <EmailChipsInput
                            values={emailData.cc}
                            setValues={(v) => setEmailData({ ...emailData, cc: v })}
                            placeholder="Input e-mail address"
                            rightElement={
                                !showBCC && (
                                    <span ref={bccButtonRef} onClick={() => setShowBCC(true)}>
                                        BCC
                                    </span>
                                )
                            }
                        />
                    </LabelRow>
                </div>
            )}

            {/* BCC */}
            {showBCC && (
                <div ref={bccRef}>
                    <LabelRow>
                        <Label>BCC</Label>
                        <EmailChipsInput
                            values={emailData.bcc}
                            setValues={(v) => setEmailData({ ...emailData, bcc: v })}
                            placeholder="Input e-mail address"
                            rightElement={
                                !showCC && (
                                    <span ref={ccButtonRef} onClick={() => setShowCC(true)}>
                                        CC
                                    </span>
                                )
                            }
                        />
                    </LabelRow>
                </div>
            )}
        </Wrapper>
    );
}

const Wrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
`;

const LabelRow = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
`;

const Label = styled.div`
    min-width: 60px;
    padding-top: 12px;
    font-size: 15px;
    font-weight: 600;
    color: var(--Gray-700);
`;
