import { useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { MagnifyingGlass, FilePdf } from "@phosphor-icons/react";
import { AxiosGet } from "../../../axios/Axios";
import { AccountState } from "../../../atom/AccountState";
import { useToast } from "../../../components/common/CustomToast";
import { ForecastChart } from "../components/ForecastChart";
import { ForecastMovie, ForecastPayload, man, pct } from "../types";

/**
 * 흥행 전망 — 개봉 후 관객 추이로 최종 관객 수를 예측한다 (개봉 7일 이후).
 * 7·14·21일차 기준을 골라 볼 수 있고, 상영이 끝난 작품은 그 시점 예측과 실제 결과를 함께 보여준다.
 * 관리자(superuser) 전용 — 이전에 열어 둔 탭이 남아 있어도 안내만 보인다.
 */
export const ForecastPage = () => {
    const account = useRecoilValue(AccountState);
    if (!account?.is_superuser) {
        return (
            <Wrapper>
                <Header>
                    <div>
                        <h2>흥행 전망</h2>
                        <p>관리자만 볼 수 있는 화면입니다.</p>
                    </div>
                </Header>
            </Wrapper>
        );
    }
    return <ForecastPageBody />;
};

const ForecastPageBody = () => {
    const toast = useToast();
    const [movies, setMovies] = useState<ForecastMovie[]>([]);
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState<number | null>(null);
    const [dn, setDn] = useState<number | null>(null);
    const [data, setData] = useState<ForecastPayload | null>(null);
    const [loading, setLoading] = useState(false);
    const [showAfter, setShowAfter] = useState(true);

    useEffect(() => {
        AxiosGet("forecast/movies/")
            .then((res) => {
                const list: ForecastMovie[] = res.data.movies ?? [];
                setMovies(list);
                if (list.length) setSelected(list[0].movie_id);
            })
            .catch(() => toast.error("작품 목록을 불러오지 못했습니다."));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selected == null) return;
        setLoading(true);
        AxiosGet(`forecast/report/?movie_id=${selected}${dn ? `&dn=${dn}` : ""}`)
            .then((res) => setData(res.data))
            .catch((err) => {
                setData(null);
                toast.error(err?.response?.data?.error ?? "예측 결과를 불러오지 못했습니다.");
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected, dn]);

    const filtered = useMemo(() => {
        const q = query.replace(/\s/g, "");
        return q ? movies.filter((m) => m.title.replace(/\s/g, "").includes(q)) : movies;
    }, [movies, query]);

    const pick = (id: number) => {
        setSelected(id);
        setDn(null);
    };

    const downloadPdf = async () => {
        if (!data) return;
        try {
            const res: any = await AxiosGet(`forecast/report/pdf/?movie_id=${data.film.movie_id}&dn=${data.dn_now}`, { responseType: "blob" });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = `흥행전망_${data.film.title}_${data.as_of}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            toast.error("PDF를 만들지 못했습니다.");
        }
    };

    return (
        <Wrapper>
            <Header>
                <div>
                    <h2>흥행 전망</h2>
                    <p>개봉 후 관객 추이를 바탕으로 최종 관객 수를 예측합니다. 개봉 7일이 지난 작품부터 볼 수 있습니다.</p>
                </div>
            </Header>

            <Layout>
                <MovieList>
                    <SearchBox>
                        <MagnifyingGlass size={14} />
                        <input id="forecast-search" placeholder="작품 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
                    </SearchBox>
                    <ul>
                        {filtered.map((m) => (
                            <li key={m.movie_id}>
                                <button type="button" className={m.movie_id === selected ? "on" : ""} onClick={() => pick(m.movie_id)}>
                                    <span className="t">{m.title}</span>
                                    <span className="s">
                                        {m.release} · {man(m.total)}만
                                        {!m.completed && <i>상영 중</i>}
                                    </span>
                                </button>
                            </li>
                        ))}
                        {!filtered.length && <li className="empty">검색 결과가 없습니다.</li>}
                    </ul>
                </MovieList>

                <Report $loading={loading}>
                    {!data ? (
                        <Empty>{loading ? "예측하는 중입니다…" : "왼쪽 목록에서 작품을 선택하세요."}</Empty>
                    ) : (
                        <ReportBody data={data} dn={data.dn_now} setDn={setDn} showAfter={showAfter} setShowAfter={setShowAfter} onPdf={downloadPdf} />
                    )}
                </Report>
            </Layout>
        </Wrapper>
    );
};

interface BodyProps {
    data: ForecastPayload;
    dn: number;
    setDn: (d: number) => void;
    showAfter: boolean;
    setShowAfter: (v: boolean) => void;
    onPdf: () => void;
}

const ReportBody = ({ data, dn, setDn, showAfter, setShowAfter, onPdf }: BodyProps) => {
    const [showComps, setShowComps] = useState(false);
    const f = data.film;
    const fcs = data.forecasts;
    if (!fcs.length) {
        return <Empty>개봉 7일이 지나야 예측할 수 있습니다.</Empty>;
    }
    const last = fcs[fcs.length - 1];
    const w2 = data.weekly.find((w) => w.week === 2);
    const tMax = Math.max(...fcs.map((s) => s.hi), data.actual_after?.total ?? 0) * 1.05;
    const pos = (v: number) => `${((v / tMax) * 100).toFixed(2)}%`;
    const tk = data.track?.horizons ?? {};
    const actual = data.actual_after?.total;
    const comps = data.comps ?? [];
    const basis = data.comp_basis ?? dn;

    return (
        <>
            <TitleRow>
                <div>
                    <h3>{f.title}{f.rerelease && <Chip>재개봉</Chip>}</h3>
                    <Meta>
                        <span><b>개봉</b>{f.release}</span>
                        {f.distributor && <span><b>배급</b>{f.distributor.replace(/^주식회사\s*|\(주\)\s*|㈜/g, "")}</span>}
                        <span><b>장르</b>{f.nation}{f.genre ? ` · ${f.genre}` : ""}</span>
                        {f.director && <span><b>감독</b>{f.director}</span>}
                        {f.actors.length > 0 && <span><b>출연</b>{f.actors.join(", ")}</span>}
                    </Meta>
                </div>
                <Actions>
                    <DaySeg role="group" aria-label="예측 기준일">
                        {data.available_days.map((d) => (
                            <button key={d} type="button" className={d === dn ? "on" : ""} onClick={() => setDn(d)}>
                                {[7, 14, 21].includes(d) ? `${d}일차` : `${d}일차(최신)`}
                            </button>
                        ))}
                    </DaySeg>
                    <PdfBtn type="button" onClick={onPdf}><FilePdf size={15} />PDF</PdfBtn>
                </Actions>
            </TitleRow>
            {data.score_note && <Notice role="status">{data.score_note}</Notice>}

            <Kpis>
                <div>
                    <label>예상 최종 관객</label>
                    <strong className="big">{man(last.pred)}<small>만 명</small></strong>
                    <span className="range">{man(last.lo)}만 ~ {man(last.hi)}만 명</span>
                    <span className="sub">예상 범위 · 실제 결과가 이 안에 들 가능성 약 80%</span>
                </div>
                <div>
                    <label>누적 관객</label>
                    <strong>{man(f.cum_now)}<small>만 명</small></strong>
                    <span className="sub">{data.as_of} 기준 (개봉 {data.dn_now}일차) · 시사회 {f.pre.toLocaleString()}명 포함</span>
                </div>
                <div>
                    <label>2주차 관객 변화</label>
                    <strong>{w2 && w2.chg != null ? pct(w2.chg) : "-"}</strong>
                    <span className="sub">{w2 ? `1주차 대비 하루 평균 · 상영 극장 ${data.weekly[0].th}곳 → ${w2.th}곳` : "2주차 집계 전"}</span>
                </div>
            </Kpis>

            <Section>
                <SecHead>
                    <h4>누적 관객 추이</h4>
                    <Toggles>
                        <label className="toggle" htmlFor="forecast-show-comps">
                            <input id="forecast-show-comps" type="checkbox" checked={showComps} onChange={(e) => setShowComps(e.target.checked)} />
                            유사 작품 흐름 보기
                        </label>
                        {data.actual_after && (
                            <label className="toggle" htmlFor="forecast-show-after">
                                <input id="forecast-show-after" type="checkbox" checked={showAfter} onChange={(e) => setShowAfter(e.target.checked)} />
                                기준일 이후 실제 관객 함께 보기
                            </label>
                        )}
                    </Toggles>
                </SecHead>
                <ForecastChart data={data} showAfter={showAfter} showComps={showComps} />
            </Section>

            <Section>
                <h4>기준일별 예측</h4>
                <Timeline>
                    {fcs.map((s) => (
                        <div className="step" key={s.h}>
                            <span className="when">개봉 {s.h}일차</span>
                            <div>
                                누적 {man(s.base)}만 명일 때 최종 <b>{man(s.pred)}만 명</b> 예상
                                <span className="sub"> (범위 {man(s.lo)}만~{man(s.hi)}만)</span>
                                <div className="bar" aria-hidden="true">
                                    <i style={{ left: pos(s.lo), width: `calc(${pos(s.hi)} - ${pos(s.lo)})` }} />
                                    <em style={{ left: pos(s.pred) }} />
                                    {actual != null && showAfter && <u style={{ left: pos(actual) }} />}
                                </div>
                                {s.signal && (
                                    <Signal className={s.signal.on ? "on" : ""}>
                                        <span className="dot" />
                                        <span>{signalText(s.signal)}</span>
                                    </Signal>
                                )}
                            </div>
                        </div>
                    ))}
                    {actual != null && showAfter && (
                        <div className="step">
                            <span className="when">실제 결과</span>
                            <div>
                                최종 <b>{man(actual)}만 명</b>
                                <span className="sub"> (주황 표시) · {fcs.every((s) => actual >= s.lo && actual <= s.hi) ? "모든 기준일의 예상 범위 안에 들었습니다." : "일부 기준일의 예상 범위를 벗어났습니다."}</span>
                            </div>
                        </div>
                    )}
                </Timeline>
            </Section>

            <Two>
                <Section>
                    <h4>주차별 실적</h4>
                    <Tbl>
                        <thead><tr><th>주차</th><th>관객</th><th>전주 대비</th><th>최대 극장</th></tr></thead>
                        <tbody>
                            {data.weekly.map((w) => (
                                <tr key={w.week}>
                                    <td>{w.week}주차{w.days < 7 ? ` (${w.days}일)` : ""}</td>
                                    <td>{w.v.toLocaleString()}</td>
                                    <td>{w.chg == null ? "-" : pct(w.chg)}</td>
                                    <td>{w.th}</td>
                                </tr>
                            ))}
                        </tbody>
                    </Tbl>
                </Section>
                <Section>
                    <h4>유사 작품</h4>
                    {comps.length ? (
                        <>
                            <Tbl>
                                <thead><tr><th>작품</th><th>{basis}일차 누적</th><th>최종</th><th>배수</th></tr></thead>
                                <tbody>
                                    {comps.map((c) => (
                                        <tr key={c.title}>
                                            <td>{c.title} <span className="sub">{c.year}</span></td>
                                            <td>{man(Number(c[`cum${basis}`]))}만</td>
                                            <td>{man(c.total)}만</td>
                                            <td>{c.mult.toFixed(2)}배</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Tbl>
                            <Note>개봉 {basis}일차까지의 관객 규모와 감소 흐름이 비슷했던 작품입니다. 2020~2021년 개봉작은 제외했습니다.</Note>
                        </>
                    ) : <Note>비슷한 흐름의 과거 작품이 없습니다.</Note>}
                </Section>
            </Two>

            {Object.keys(tk).length > 0 && (
                <Section>
                    <h4>예측 정확도</h4>
                    <Note>
                        {data.track?.years?.length ? `${Math.min(...data.track.years)}~${Math.max(...data.track.years)}년` : "최근"} 개봉작을 당시 알 수 있던 데이터만으로 예측하고 실제 최종 관객과 비교했습니다.
                    </Note>
                    <Track>
                        {["7", "14", "21"].filter((k) => tk[k]).map((k) => (
                            <div key={k}>
                                <label>개봉 {k}일차 기준 ({tk[k].n}편)</label>
                                <strong>{pct(tk[k].hit30)}</strong>
                                <span className="sub">실제와 차이 30% 이내 · 예상 범위 적중 {pct(tk[k].cover80)}</span>
                            </div>
                        ))}
                    </Track>
                </Section>
            )}
            <Note>자료: 캐스팅라인 전국 극장 스코어, KOBIS 일별 박스오피스·영화정보</Note>
        </>
    );
};

/** 입소문 확산 조짐 안내 문구 */
const signalText = (g: NonNullable<ForecastPayload["forecasts"][number]["signal"]>) => {
    const diff = Math.round(g.late_vs_early * 100);
    if (!g.on) {
        const level = diff >= 0 ? `${diff}% 많은` : `${-diff}% 적은`;
        return `입소문 확산 조짐은 아직 없습니다. 개봉 5~7일차 관객이 1~3일차보다 ${level} 수준입니다(18% 이상 많으면 확산 조짐으로 봅니다).`;
    }
    const tail = g.rate_sig != null ? ` 과거 비슷한 흐름을 보인 ${g.n_sig}편 중 ${pct(g.rate_sig)}는 최종 관객이 예상의 2배를 넘었습니다.` : "";
    return `입소문 확산 조짐이 보입니다. 개봉 5~7일차 관객이 1~3일차보다 ${diff}% 많습니다.${tail}`;
};

/* ───── styles ───── */
const Wrapper = styled.div`
    padding: 20px;
    background: #f8fafc;
    min-height: 100%;
    font-family: "SUIT", sans-serif;
    color: #1e293b;
`;
const Header = styled.div`
    margin-bottom: 16px;
    h2 { font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
    p { font-size: 13px; color: #64748b; margin: 0; }
`;
const Layout = styled.div`
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
    @media (max-width: 900px) { grid-template-columns: 1fr; }
`;
const MovieList = styled.div`
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    position: sticky;
    top: 12px;
    ul { list-style: none; margin: 0; padding: 4px; max-height: calc(100vh - 230px); overflow-y: auto; }
    li.empty { padding: 16px; font-size: 12.5px; color: #94a3b8; }
    button {
        width: 100%; text-align: left; background: none; border: 0; border-radius: 6px;
        padding: 8px 10px; cursor: pointer; display: grid; gap: 2px; font-family: inherit;
        &:hover { background: #f1f5f9; }
        &.on { background: #eff6ff; }
        &.on .t { color: #1d4ed8; }
        &:focus-visible { outline: 2px solid #2563eb; outline-offset: -2px; }
    }
    .t { font-size: 13px; font-weight: 600; color: #0f172a; }
    .s { font-size: 11.5px; color: #64748b; display: flex; gap: 6px; align-items: center; font-variant-numeric: tabular-nums; }
    i { font-style: normal; font-size: 10.5px; color: #16a34a; background: #f0fdf4; border-radius: 999px; padding: 0 6px; }
`;
const SearchBox = styled.label`
    display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #94a3b8;
    input { border: 0; outline: 0; flex: 1; font-size: 13px; font-family: inherit; color: #0f172a; background: transparent; }
`;
const Report = styled.div<{ $loading: boolean }>`
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 24px 28px;
    display: grid;
    gap: 28px;
    opacity: ${({ $loading }) => ($loading ? 0.55 : 1)};
    transition: opacity 0.15s;
`;
const Empty = styled.div`
    padding: 60px 0; text-align: center; color: #94a3b8; font-size: 13px;
`;
const TitleRow = styled.div`
    display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;
    border-bottom: 2px solid #0f172a; padding-bottom: 16px;
    h3 { margin: 0 0 8px; font-size: 26px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px; }
`;
const Chip = styled.span`
    font-size: 11px; font-weight: 600; color: #1d4ed8; background: #eff6ff; border-radius: 999px; padding: 2px 8px;
`;
const Meta = styled.div`
    display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 13px; color: #475569;
    b { color: #0f172a; font-weight: 600; margin-right: 6px; }
`;
const Actions = styled.div`
    display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap;
`;
const DaySeg = styled.div`
    display: inline-flex; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;
    button {
        border: 0; background: #fff; font-family: inherit; font-size: 12.5px; padding: 0 12px; height: 32px;
        cursor: pointer; color: #475569; border-right: 1px solid #e2e8f0;
        &:last-child { border-right: 0; }
        &.on { background: #2563eb; color: #fff; font-weight: 600; }
        &:focus-visible { outline: 2px solid #2563eb; outline-offset: -2px; }
    }
`;
const PdfBtn = styled.button`
    display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 12px; font-size: 12.5px;
    font-family: inherit; font-weight: 600; color: #0f172a; background: #fff; border: 1px solid #cbd5e1;
    border-radius: 6px; cursor: pointer;
    &:hover { background: #f1f5f9; }
`;
const Notice = styled.p`
    margin: -12px 0 0; font-size: 12.5px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a;
    border-radius: 6px; padding: 8px 12px;
`;
const Kpis = styled.div`
    display: grid; grid-template-columns: 1.3fr 1fr 1fr; border: 1px solid #e2e8f0; border-radius: 8px;
    > div { padding: 16px 20px; display: grid; gap: 3px; align-content: start; }
    > div + div { border-left: 1px solid #e2e8f0; }
    label { font-size: 12.5px; color: #64748b; font-weight: 500; }
    strong { font-size: 26px; font-weight: 700; color: #0f172a; line-height: 1.2; }
    strong.big { font-size: 36px; }
    small { font-size: 0.5em; font-weight: 500; color: #475569; margin-left: 3px; }
    .range { font-size: 14px; font-weight: 600; color: #1e293b; }
    .sub { font-size: 12px; color: #94a3b8; }
    @media (max-width: 1100px) { grid-template-columns: 1fr; > div + div { border-left: 0; border-top: 1px solid #e2e8f0; } }
`;
const Section = styled.section`
    display: grid; gap: 12px; align-content: start;
    h4 { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; }
`;
const SecHead = styled.div`
    display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
    .toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: #475569; cursor: pointer; }
    input { accent-color: #2563eb; }
`;
const Toggles = styled.div`
    display: flex; gap: 16px; flex-wrap: wrap;
`;
const Timeline = styled.div`
    display: grid;
    .step { display: grid; grid-template-columns: 96px 1fr; gap: 14px; padding: 12px 0; border-top: 1px solid #f1f5f9; font-size: 13.5px; }
    .step:first-child { border-top: 0; }
    .when { font-size: 12.5px; color: #64748b; font-weight: 500; }
    b { font-weight: 700; color: #0f172a; }
    .sub { color: #94a3b8; font-size: 12.5px; }
    .bar { position: relative; height: 10px; margin-top: 8px; background: #f1f5f9; border-radius: 5px; }
    .bar i { position: absolute; top: 0; bottom: 0; background: rgba(37, 99, 235, 0.14); border: 1px solid #2563eb; border-radius: 5px; }
    .bar em { position: absolute; top: -4px; width: 2px; height: 18px; background: #2563eb; }
    .bar u { position: absolute; top: -5px; width: 2px; height: 20px; background: #ea580c; }
`;
const Signal = styled.div`
    display: flex; gap: 8px; align-items: flex-start; margin-top: 10px; font-size: 12.5px; color: #475569;
    background: #f8fafc; border-radius: 6px; padding: 8px 12px;
    .dot { flex: none; width: 9px; height: 9px; border-radius: 50%; margin-top: 5px; border: 2px solid #94a3b8; }
    &.on .dot { background: #ea580c; border-color: #ea580c; }
    &.on b { color: #c2410c; }
`;
const Two = styled.div`
    display: grid; grid-template-columns: 1fr 1fr; gap: 28px;
    @media (max-width: 1100px) { grid-template-columns: 1fr; }
`;
const Tbl = styled.table`
    width: 100%; border-collapse: collapse; font-size: 12.5px;
    th, td { padding: 8px 10px; text-align: right; border-bottom: 1px solid #f1f5f9; font-variant-numeric: tabular-nums; }
    th { font-weight: 500; color: #64748b; background: #f8fafc; }
    th:first-child, td:first-child { text-align: left; }
    .sub { color: #94a3b8; }
`;
const Note = styled.p`
    margin: 0; font-size: 12px; color: #94a3b8;
`;
const Track = styled.div`
    display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #e2e8f0; border-radius: 8px;
    > div { padding: 14px 18px; display: grid; gap: 2px; }
    > div + div { border-left: 1px solid #e2e8f0; }
    label { font-size: 12.5px; color: #64748b; }
    strong { font-size: 24px; font-weight: 700; color: #0f172a; }
    .sub { font-size: 12px; color: #94a3b8; }
`;
