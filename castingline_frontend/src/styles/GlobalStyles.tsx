import styled, { createGlobalStyle } from "styled-components";
import { colorTokens, shadowTokens, sizeTokens, zIndexTokens } from "./designTokens";
import { resetStyles } from "./resetStyles";
import { commonStyles } from "./commonStyles";
import { textStyles } from "./textStyles";

const fonts = {
    SUIT: "SUIT",
};

const CustomerGlobalStyles = createGlobalStyle`

    ${resetStyles}
    :root {
        ${shadowTokens}
        ${colorTokens}
        ${sizeTokens}
        ${zIndexTokens}
        --input-border: var(--Gray-300);
        --sidenav-width: 60px;
        --primary-font-stack: 'SUIT'}
    ${commonStyles}
    ${textStyles}
    
    font-family: ${fonts.SUIT};
    input,span,td,th,select,div,button{
        font-family:  ${fonts.SUIT};
    }
    input::placeholder{
            font-family:  ${fonts.SUIT};
            font-size: 14px; 
            color: #999;
            font-style: italic; 
    }

    html, body, #root {
        font-family: var(--primary-font-stack);
        font-size: 16px;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }
    @media print {
        main {
            padding-left: 0px !important;   /* 또는 0 !important; 네 인쇄 기준에 맞게 */
        }
        .GnbBar{
            height : 0px !important;
        }
    }
    *{
        box-sizing: border-box;
        button{
            cursor: pointer;
            font-family: var(--primary-font-stack);
        }
        a{  
            text-decoration: none;
            color: black;
            &:active{
                color: black;
                text-indent: 6px;
            }
        }
        input,select{
            outline: none;
            border : 1px solid var(--gray);
            border-radius: var(--radius-small);
            font-family: var(--primary-font-stack);
        }
        @media print {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-synthesis: none; 

            html, body {
                background-color: #ffffff !important;
            }
        }
    }

    //TuiGrid Cell에 Tooltip적용
    .tui-tooltip-content {
    padding: 6px;
    border-radius: 2px;
    text-align: left;
    display: none;
    position: absolute;
    background-color: #f9f9f9;
    border: 1px solid #ccc;
    overflow: visible;
    /* z-index: 999000999; */
    }
    .tui-tooltip-wrap:hover .tui-tooltip-content {
        display: block;
    }

    //SweetAlert Style
    .swal2-container {
    z-index: 10000000000000 !important;
    }
    .swal2-icon {
    margin: 40px auto !important;  /* 원래의 마진 값으로 변경 */
    border: solid;
}
    .swal2-confirm{
        background-color: var(--main-color);
    }

    //스크롤바스타일
    ::-webkit-scrollbar {
    width: 10px; /* 수직 스크롤바 두께 조절 */
    height: 8px; /* 수평 스크롤바 두께 조절 */

    }
    ::-webkit-scrollbar-thumb {
    background: rgba(0,0,0,0.1);/* 스크롤바 역동 부분의 색상을 설정 */
    border-radius: 6px; 
    }
    /* 수평 스크롤바 */
    ::-webkit-scrollbar-track {
    background: rgba(0,0,0,0.01); /* 스크롤바 배경 색상을 설정 */
    border-radius: 6px; 
    }

    //기본 Table Style
    table.table-style{
        table-layout: auto;
        width: 100%;
        overflow: auto;
        background-color: white;
        border-radius: var(--radius-base);
        margin: 8px 0;
        box-shadow: var(--box-shadow1);
        text-align: center;
        tr.even-row{
        background-color: #FAFBFE;
        }
        tr.hover-row{
            background-color: var(--hover-color);
        }

        input,select{
            width: 100%;
            text-align: center;
            height: 30px;
        }
        input[disabled],select[disabled]{
            background-color: transparent;
            outline: none;
            border: none;
        }
        select[disabled]{
            appearance: none;
        }
        thead{
            tr{
                border-bottom:.2px solid var(--gray);
                th{
                    vertical-align: middle;
                    height: 40px;
        
                }
            }
        }
        tbody{
            tr{
                td{
                    border-top: none; 
                    border-bottom: none;
                    border-left: .2px solid var(--gray); /* 왼쪽 테두리 설정 */
                    border-right: .2px solid var(--gray); /* 오른쪽 테두리 설정 */
                    padding: 4px 2px; 
                    vertical-align: middle;
                    &.btn-wrap{
                        width: 100%;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }
                }
            }
        }
    }

    //Text Style
    .top-title-font{
        color: var(--black);
        font-family: var(--primary-font-stack);
        font-size: var(--font-2xlarge);
        font-style: normal;
        font-weight: 700;
        line-height: normal;
        letter-spacing: -0.28px;
        padding: 6px 0;
    }
    .sub-title-font{
        color: var(--black);
        font-family: var(--primary-font-stack);
        font-size: var(--font-middle);
        font-style: normal;
        font-weight: 600;
        line-height: normal;
        letter-spacing: -0.2px;
    }
    .table-header-font{
        color: var(--font-gray);
        font-family: var(--primary-font-stack);
        font-size: var(--font-small);
        line-height: var(--font-middle);
        font-style: normal;
        font-weight: 600;
    }
    .table-content-font{
        font-family: var(--primary-font-stack);
        color: var(--font-black);
        font-size: var(--font-small);
        line-height: var(--font-middle);
        font-style: normal;
        font-weight: 600;
    }
    .table-tag{
        color: var(--tag-fontcolor);
        background: var(--tag-bg);
        text-align: center;
        font-family: var(--primary-font-stack);
        font-size: var(--font-xsmall);
        line-height: var(--font-middle); 
        font-style: normal;
        font-weight: 500;
        padding: 2px 4px;
        margin: 2px;
        border-radius: var(--radius-small);
        vertical-align: middle;
        width: 20px;
        height : 20px;
    }
    .trucking-state{
        text-align: center;
        font-family: var(--primary-font-stack);
        font-size: var(--font-xsmall);
        line-height: var(--font-middle); 
        padding: 2px 4px;
        border-radius: var(--radius-small);
        vertical-align: middle;
    }
    .from-to-tag-font{
        font-family: var(--primary-font-stack);
        color: var(--font-blue);
        background: var(--tag-bg);
        font-size: var(--font-xsmall);
        padding: 1.4px 4px;
        font-style: normal;
        font-weight: 600;
        letter-spacing: -0.2px;
    }
    .type-tag-font{
        color: var(--main-color );
        font-family: var(--primary-font-stack);
        font-size: var(--font-xsmall);
        padding: 1.4px 4px;
        font-style: normal;
        font-weight: 700;
        background-color: white;
        border-radius: 4px;
        border: 1px solid var(--main-color-opacity)
    }


    //title
    .title-exlg{
        color: var(--text-text-title, #2A2A2A);
        font-family: var(--primary-font-stack);
        font-size: 1.75rem;
        font-style: normal;
        font-weight: 700;
        line-height: normal;
        letter-spacing: -0.0175rem;
    }
    .title-lg{
        color: var(--text-text-title, #2A2A2A);
        font-family: var(--primary-font-stack);
        font-size: 1.25rem;
        font-style: normal;
        font-weight: 600;
        line-height: normal;
        letter-spacing: -0.0125rem;
    }
    .title-md{
        color: var(--text-text-primary, #4E4E4E);
        font-family: var(--primary-font-stack);
        font-size: 1.0625rem;
        font-style: normal;
        font-weight: 700;
        line-height: 150%; /* 1.59375rem */
        letter-spacing: -0.03188rem;
    }
    .title-sm{
        color: var(--text-text-title, #2A2A2A);
        font-family: var(--primary-font-stack);
        font-size: 0.9rem;
        font-style: normal;
        font-weight: 600;
        line-height: normal;
    }
    //body
    .bd-lg{
        color: var(--text-text-title, #2A2A2A);
        font-family: var(--primary-font-stack);
        font-size: 0.9375rem;
        font-style: normal;
        font-weight: 700;
        line-height: normal;
        letter-spacing: -0.01875rem;
    }
    //normal-caption
    .cp-exlg{
        color: var(--text-text-primary, #4E4E4E);
        font-family: var(--primary-font-stack);
        font-size: 1rem;
        font-style: normal;
        font-weight: 700;
        line-height: normal;
        letter-spacing: -0.0175rem;
    }
    .cp-lg{
        color: var(--text-text-primary, #4E4E4E);
        font-family: var(--primary-font-stack);
        font-size: 0.875rem;
        font-style: normal;
        font-weight: 600;
        line-height: normal;
        letter-spacing: -0.00875rem;
    }
    .cp-md{
        color: var(--text-text-title, #2A2A2A);
        font-family: var(--primary-font-stack);
        font-size: 0.75rem;
        font-style: normal;
        font-weight: 500;
        line-height: 130%;
    }
    .cp-sm{
        color: var(--color-grey-4E, #4E4E4E);
        font-family: var(--primary-font-stack);
        font-size: 0.6875rem;
        font-style: normal;
        font-weight: 400;
        line-height: normal;
        letter-spacing: -0.00875rem;
    }
    .cp-xsm{
        color: var(--color-grey-4E, #4E4E4E);
        font-family: var(--primary-font-stack);
        font-size: 0.62rem;
        font-style: normal;
        font-weight: 400;
        line-height: normal;
        letter-spacing: -0.00875rem;
    }
    .label-sm{
        font-family: var(--primary-font-stack);
        font-weight: 500;
        font-size: 0.6875rem;
        line-height: 18px;
        letter-spacing: 0px;
    }
    /* etc */
    //line
    .horizontal-line {
    width: 100%;
    height: 0.0625rem;
    background: var(--stroke-stroke-primary, rgba(0, 0, 0, 0.10));
    }
    //클릭하면 선택된객체 어떻게 나타낼건지
    .selected{
        border-radius: 0.75rem;
        border: 2px solid var(--main-color-opacity);
        background: var(--main-color-opacity);
    }

    .pagination-wrap{
        button {
                    font-family: SUIT;
                    font-weight: 600;
                    font-size: 13px;
                    line-height: 150%;
                    letter-spacing: 0%;
                    text-align: center;
                    color: var(--text-text-secondary, rgba(110, 110, 110, 1));
                }
    }
`;

export default CustomerGlobalStyles;

type ButtonSize = "sm" | "md" | "lg";

const sizeMap = {
    sm: "28px",
    md: "40px",
    lg: "52px",
};

export const StyledButton = styled.button<{ size?: ButtonSize }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: ${({ size = "md" }) => sizeMap[size]};
    height: ${({ size = "md" }) => sizeMap[size]};
    border-radius: 50%;
    border: none;
    background-color: #f5f5f5;
    cursor: pointer;
    transition: background-color 0.3s ease;

    &:hover {
        background-color: #d0e7f4;
    }

    img {
        width: 24px;
        height: 24px;
        object-fit: contain;
    }
`;
