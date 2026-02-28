import React, { useEffect, useState } from "react";
import styled from "styled-components";
import axios from "axios";
import { useToast } from "../../../components/common/CustomToast";

interface CrawlTarget {
  id: number;
  title: string;
  clean_title: string;
  is_active: boolean;
  created_at: string;
}

const API_BASE = "/Api/crawler/targets/";

export const CrawlTargetPage: React.FC = () => {
  const [targets, setTargets] = useState<CrawlTarget[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const fetchTargets = async () => {
    try {
      const res = await axios.get<CrawlTarget[]>(API_BASE);
      setTargets(res.data);
    } catch {
      toast.error("목록 불러오기 실패");
    }
  };

  useEffect(() => {
    fetchTargets();
  }, []);

  const handleAdd = async () => {
    const title = inputValue.trim();
    if (!title) return;
    setLoading(true);
    try {
      await axios.post(API_BASE, { title });
      setInputValue("");
      await fetchTargets();
      toast.success(`'${title}' 추가 완료`);
    } catch {
      toast.error("추가 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: number) => {
    try {
      await axios.patch(`${API_BASE}${id}/`);
      setTargets((prev) =>
        prev.map((t) => (t.id === id ? { ...t, is_active: !t.is_active } : t))
      );
    } catch {
      toast.error("상태 변경 실패");
    }
  };

  const handleDelete = async (id: number, title: string) => {
    if (!window.confirm(`'${title}' 을(를) 삭제하시겠습니까?`)) return;
    try {
      await axios.delete(`${API_BASE}${id}/`);
      setTargets((prev) => prev.filter((t) => t.id !== id));
      toast.success("삭제 완료");
    } catch {
      toast.error("삭제 실패");
    }
  };

  const activeCount = targets.filter((t) => t.is_active).length;

  return (
    <Container>
      <Header>
        <Title>크롤 대상 영화 관리</Title>
        <SubTitle>
          활성화된 영화만 시간표에 저장됩니다. 미지정 시 전체 저장.
        </SubTitle>
      </Header>

      <AddRow>
        <Input
          placeholder="영화 제목 입력 (예: 아바타: 불의 재)"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <AddButton onClick={handleAdd} disabled={loading || !inputValue.trim()}>
          + 추가
        </AddButton>
      </AddRow>

      <CountBar>
        전체 <strong>{targets.length}</strong>편 | 활성화{" "}
        <strong>{activeCount}</strong>편
      </CountBar>

      {targets.length === 0 ? (
        <EmptyMsg>
          등록된 대상 영화가 없습니다. 추가하면 해당 영화만 크롤링됩니다.
        </EmptyMsg>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th style={{ width: 60 }}>상태</Th>
              <Th>입력 제목</Th>
              <Th>정규화 제목</Th>
              <Th style={{ width: 140 }}>등록일</Th>
              <Th style={{ width: 80 }}></Th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.id}>
                <Td>
                  <Toggle
                    $active={t.is_active}
                    onClick={() => handleToggle(t.id)}
                    title={t.is_active ? "클릭하여 비활성화" : "클릭하여 활성화"}
                  >
                    {t.is_active ? "활성" : "중지"}
                  </Toggle>
                </Td>
                <Td>
                  <TitleText $active={t.is_active}>{t.title}</TitleText>
                </Td>
                <Td>
                  <CleanTitle>{t.clean_title}</CleanTitle>
                </Td>
                <Td style={{ color: "#888", fontSize: 12 }}>{t.created_at}</Td>
                <Td>
                  <DeleteBtn onClick={() => handleDelete(t.id, t.title)}>
                    삭제
                  </DeleteBtn>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <InfoBox>
        <InfoTitle>매칭 방식</InfoTitle>
        <InfoText>
          입력한 제목에서 특수문자·괄호·포맷 태그를 제거한 뒤 크롤된 제목과 비교합니다.
          <br />
          <code>아바타: 불의 재</code> 입력 시 → <code>아바타- 불의재(3D)</code>,{" "}
          <code>아바타: 불의 재 [IMAX]</code> 도 모두 매칭됩니다.
        </InfoText>
      </InfoBox>
    </Container>
  );
};

const Container = styled.div`
  padding: 28px;
  max-width: 900px;
`;
const Header = styled.div`margin-bottom: 24px;`;
const Title = styled.h2`font-size: 20px; font-weight: 700; margin: 0 0 4px;`;
const SubTitle = styled.p`font-size: 13px; color: #888; margin: 0;`;

const AddRow = styled.div`
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
`;
const Input = styled.input`
  flex: 1;
  padding: 9px 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  &:focus { border-color: #6366f1; }
`;
const AddButton = styled.button`
  padding: 9px 20px;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  &:disabled { background: #ccc; cursor: default; }
`;

const CountBar = styled.div`
  font-size: 13px;
  color: #555;
  margin-bottom: 12px;
  strong { color: #222; }
`;
const EmptyMsg = styled.div`
  padding: 32px;
  text-align: center;
  color: #aaa;
  font-size: 14px;
  border: 1px dashed #e0e0e0;
  border-radius: 8px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;
const Th = styled.th`
  padding: 10px 12px;
  text-align: left;
  background: #f7f8fa;
  border-bottom: 1px solid #e8e8e8;
  font-weight: 600;
  color: #555;
`;
const Td = styled.td`
  padding: 10px 12px;
  border-bottom: 1px solid #f0f0f0;
  vertical-align: middle;
`;
const Toggle = styled.button<{ $active: boolean }>`
  padding: 3px 10px;
  border-radius: 12px;
  border: none;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  background: ${(p) => (p.$active ? "#dcfce7" : "#f3f4f6")};
  color: ${(p) => (p.$active ? "#16a34a" : "#9ca3af")};
`;
const TitleText = styled.span<{ $active: boolean }>`
  font-weight: 500;
  color: ${(p) => (p.$active ? "#222" : "#aaa")};
`;
const CleanTitle = styled.span`
  color: #6366f1;
  font-size: 12px;
  font-family: monospace;
`;
const DeleteBtn = styled.button`
  padding: 3px 10px;
  border: 1px solid #fca5a5;
  background: #fff;
  color: #ef4444;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  &:hover { background: #fef2f2; }
`;
const InfoBox = styled.div`
  margin-top: 32px;
  padding: 16px;
  background: #f0f4ff;
  border-radius: 8px;
  border-left: 3px solid #6366f1;
`;
const InfoTitle = styled.div`font-weight: 600; font-size: 13px; margin-bottom: 6px;`;
const InfoText = styled.div`font-size: 13px; color: #555; line-height: 1.6;
  code { background: #e8e8ff; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
`;
