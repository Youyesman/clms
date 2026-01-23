import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { CustomSelect } from "./CustomSelect";
import { Pagination } from "./Pagination";

type BottomBarProps = {
    pageSize: number;
    onPageSizeChange: (size: number) => void;
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
};

export function BottomBar({ pageSize, onPageSizeChange, currentPage, totalPages, onPageChange }: BottomBarProps) {
    const { t } = useTranslation();

    return (
        <Wrapper>
            {/* ⬅️ 좌측: Page Size */}
            <Left>
                <CustomSelect
                    style={{ width: 50 }}
                    options={[
                        { label: "10", value: "10" },
                        { label: "20", value: "20" },
                        { label: "50", value: "50" },
                        { label: "100", value: "100" },
                    ]}
                    value={String(pageSize)}
                    onChange={(v) => onPageSizeChange(Number(v))}
                />
                <Text>{t("Shipmentpage.PerPage")}</Text>
            </Left>

            {/* 🎯 가운데: Pagination */}
            <Center>
                <Pagination
                    color="gray"
                    totalPages={totalPages}
                    currentPage={currentPage}
                    onPageChange={onPageChange}
                />
            </Center>
        </Wrapper>
    );
}

/* ---------------- styles ---------------- */

const Wrapper = styled.div`
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
`;

const Left = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const Center = styled.div`
    flex: 1;
    display: flex;
    justify-content: center;
`;

const Text = styled.span`
    font-size: 14px;
    color: var(--Gray-700);
`;
