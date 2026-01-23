import styled from "styled-components";
import { useNavigate, useLocation } from "react-router-dom";

const SidebarContainer = styled.aside`
    width: 240px;
    background-color: #1e293b; /* 다크 네이비 */
    color: #f8fafc;
    display: flex;
    flex-direction: column;
    height: calc(100vh - 50px); /* Topbar 높이를 제외한 나머지 */
    flex-shrink: 0;
`;

const MenuSection = styled.div`
    padding: 24px 0;
`;

const MenuTitle = styled.div`
    padding: 0 24px 12px;
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
`;

const MenuItem = styled.button<{ active: boolean }>`
    width: 100%;
    display: flex;
    align-items: center;
    padding: 12px 24px;
    background: ${(props) => (props.active ? "#334155" : "transparent")};
    color: ${(props) => (props.active ? "#38bdf8" : "#cbd5e1")};
    border: none;
    border-left: 4px solid ${(props) => (props.active ? "#38bdf8" : "transparent")};
    cursor: pointer;
    font-size: 14px;
    font-weight: ${(props) => (props.active ? "700" : "500")};
    text-align: left;
    transition: all 0.2s;

    &:hover {
        background-color: #334155;
        color: #f8fafc;
    }
`;

export function ScoreSideBar() {
    const navigate = useNavigate();
    const location = useLocation();

    // 현재 경로 또는 Query 등을 확인하여 활성화 상태 표시
    const currentPath = location.pathname;

    const menus = [
        { name: "지역별총괄", path: "/manage/score/region" },
        { name: "멀티별총괄", path: "/manage/score/multi" },
        { name: "버전별총괄", path: "/manage/score/version" },
        { name: "기간별총괄", path: "/manage/score/period" },
    ];

    return (
        <SidebarContainer>
            <MenuSection>
                <MenuTitle>스코어 통계</MenuTitle>
                {menus.map((menu) => (
                    <MenuItem
                        key={menu.path}
                        active={currentPath.includes(menu.path)}
                        onClick={() => navigate(menu.path)}>
                        {menu.name}
                    </MenuItem>
                ))}
            </MenuSection>
        </SidebarContainer>
    );
}
