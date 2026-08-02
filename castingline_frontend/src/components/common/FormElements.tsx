import styled from "styled-components";

export const Label = styled.label`
    font-size: 13px;
    font-weight: 600;
    color: #1e293b;
    white-space: nowrap;
`;

export const BaseInput = styled.input`
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 14px;
    &:focus {
        border-color: #000080;
        outline: none;
    }
`;

export const BaseSelect = styled.select`
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    background: white;
`;
