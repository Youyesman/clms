// CustomAccordion.tsx
import { CaretUp } from "@phosphor-icons/react";
import { useState } from "react";
import styled from "styled-components";

export function CustomAccordion({ title, children }) {
    const [open, setOpen] = useState(true);

    return (
        <Wrapper>
            <Header onClick={() => setOpen(!open)}>
                <RotateIcon $open={open}>
                    <CaretUp size={20} weight="fill" />
                </RotateIcon>

                <HeaderText>{title}</HeaderText>
            </Header>

            {open && <Content>{children}</Content>}
        </Wrapper>
    );
}

const Wrapper = styled.div`
    width: 100%;
`;

const Header = styled.div`
    width: 100%;
    padding: 12px 20px;

    background: #f1f5f9;
    border-left: 1px solid #cbd5e1;
    border-top: 1px solid #cbd5e1;
    border-right: 1px solid #cbd5e1;

    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
`;

/* CaretUpIcon 회전 */
const RotateIcon = styled.div<{ $open: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;

    transform: rotate(${(p) => (p.$open ? "0deg" : "180deg")});
    transition: 0.2s ease;
`;

const HeaderText = styled.div`
    font-size: 16px;
    font-family: SUIT;
    font-weight: 700;
    color: #1e293b;
`;

const Content = styled.div`
    width: 100%;
    border: 1px solid #cbd5e1;
    border-top: none;
    padding: 16px 20px;
    background: white;
`;
