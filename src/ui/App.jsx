import React, { useEffect, useMemo, useState } from "react";

const TIER_LABEL = {
  dev: "有偏离",
  weak: "弱倾向",
  flat: "无偏离",
  no_ext: "未接入",
  blocked: "不出结论",
};

function pillTone(kind) {
  if (kind === "time") return "gray";
  if (kind === "skip") return "yellow";
  if (kind === "empty") return "red";
  return "gray";
}

function toneForStatus(s) {
  if (!s) return "yellow";
  if (/未到|临盘/.test(s)) return "gray";
  if (/未抓取|未接入|销售日/.test(s)) return "yellow";
  if (/缺失|扒不到|不足|不一致|异常/.test(s)) return "red";
  return "gray";
}

function pct(x) {
  if (x == null || Number.isNaN(x)) return "—";
  return `${(x * 100).toFixed(1)}`;
}

function pts(x) {
  if (x == null || Number.isNaN(x)) return "—";
  const n = Number(x);
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
}

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

export default function App() {
  const [tab, setTab] = useState("list");
  const [slate, setSlate] = useState(null);
  const [board, setBoard] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);
  const [tierFilter, setTierFilter] = useState("all");
  const [batch, setBatch] = useState("all");
  const [importText, setImportText] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [parlay, setParlay] = useState([]);

  async function reload() {
    try {
      const s = await jget("/api/slate");
      setSlate(s);
      setErr("");
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const matches = slate?.matches || [];
  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (tierFilter !== "all" && m.verdict.tier !== tierFilter) return false;
      if (batch !== "all" && m.close.close_at !== batch) return false;
      return true;
    });
  }, [matches, tierFilter, batch]);

  return (
    <>
      <header className="top">
        <div className="brand">
          证据脑
          <small>方向跟证据，盘口只对照</small>
        </div>
        <div className="import-next">
          下一个体彩导入时段：
          {slate?.nextImport
            ? `${new Date(slate.nextImport.importFrom).toLocaleString("zh-CN", { hour12: false })} – ${new Date(slate.nextImport.importTo).toLocaleTimeString("zh-CN", { hour12: false })}`
            : "本日已无"}
        </div>
        <div className="tabs">
          {[
            ["list", "赛程"],
            ["import", "导入"],
            ["parlay", "串关"],
            ["board", "看板"],
          ].map(([id, label]) => (
            <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
          <button onClick={reload}>刷新</button>
          <a href="/api/export"><button>导出 JSON</button></a>
        </div>
      </header>

      {err && <div className="warn">{err}（仓库还没有比赛时先导入体彩 JSON）</div>}

      {tab === "list" && (
        <>
          <div className="filters">
            {["all", "dev", "weak", "flat", "no_ext", "blocked"].map((t) => (
              <button key={t} className={`chip ${tierFilter === t ? "on" : ""}`} onClick={() => setTierFilter(t)}>
                {t === "all" ? "全部档位" : TIER_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="filters">
            <button className={`chip ${batch === "all" ? "on" : ""}`} onClick={() => setBatch("all")}>
              全部批次
            </button>
            {(slate?.groups || []).map((g) => (
              <button
                key={g.close_at}
                className={`chip ${batch === g.close_at ? "on" : ""}`}
                onClick={() => setBatch(g.close_at)}
              >
                {g.closeHkt}
              </button>
            ))}
          </div>
          <div className="list">
            {filtered.length === 0 && <div className="card muted">没有场次。导入体彩或等待服务器抓取。</div>}
            {filtered.map((m) => (
              <article key={m.id || m.jcId} className="card" onClick={() => setOpen(m)}>
                <div className="card-head">
                  <div>
                    <div className="teams">{m.jcId || m.id} · {labelTeams(m)}</div>
                    <div className="meta">{m.league.name} · 封盘 {m.close.close_at ? new Date(m.close.close_at).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Hong_Kong" }) : "未知"}</div>
                  </div>
                  <span className={`tier ${m.verdict.tier}`}>{TIER_LABEL[m.verdict.tier]} {pts(m.verdict.peak?.diffPts)}</span>
                </div>
                <div className="meta">缺项：{m.verdict.missing.length ? m.verdict.missing.join("、") : "无"}</div>
                <GuangshiLine g={m.guangshi} />
                <StatusBar m={m} />
              </article>
            ))}
          </div>
        </>
      )}

      {tab === "import" && (
        <section className="panel">
          <p className="muted">体彩只收本地导入。必须带 businessDate。服务器不代理、不借号。</p>
          <textarea
            placeholder='{"businessDate":"2026-09-26","matches":[...]}'
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="row">
            <button
              className="primary"
              onClick={async () => {
                try {
                  const body = JSON.parse(importText);
                  const r = await fetch("/api/import", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  });
                  const j = await r.json();
                  setReceipt(j);
                  await reload();
                } catch (e) {
                  setReceipt({ ok: false, error: String(e.message || e), red: true });
                }
              }}
            >
              导入
            </button>
          </div>
          {receipt && (
            <div className={`card ${receipt.red ? "warn" : ""}`}>
              {receipt.ok ? (
                <>
                  <div>销售日 {receipt.businessDate} · {receipt.count} 场</div>
                  <div>变盘 {receipt.oddsChanged?.length || 0} · 销售状态变了 {receipt.saleChanged?.length || 0}</div>
                </>
              ) : (
                <div>导入失败：{receipt.error}</div>
              )}
            </div>
          )}
        </section>
      )}

      {tab === "parlay" && (
        <Parlay matches={matches} parlay={parlay} setParlay={setParlay} />
      )}

      {tab === "board" && (
        <Board board={board} load={async () => setBoard(await jget("/api/board"))} />
      )}

      {open && <Detail m={open} onClose={() => setOpen(null)} onPick={(m) => setParlay((p) => [...p, m])} />}
      <p className="footer-note">封盘结论周一至周五 21:45，周六日 22:45，或开球前 30 分钟，取较早者。时间一律 HKT。</p>
    </>
  );
}

function fmtHkt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Hong_Kong",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) + " HKT";
}

function labelTeams(m) {
  const h = m.home || m.nameMap?.jcHome || "?";
  const a = m.away || m.nameMap?.jcAway || "?";
  return `${h} vs ${a}`;
}

function StatusBar({ m }) {
  const items = [
    { k: "封盘", v: m.close.close_at ? "已计算" : "未到/不能算", t: m.close.close_at ? "time" : "skip" },
    { k: "体彩", v: m.jc.status, t: toneForStatus(m.jc.status) },
    { k: "平博", v: m.pinChangedAt ? "有变化时间" : "未抓取", t: m.pinChangedAt ? "time" : "skip" },
    { k: "伤停", v: m.injState.status, t: toneForStatus(m.injState.status) },
    { k: "首发", v: m.lineup.home.kind, t: m.lineup.residualOk ? "time" : "empty" },
  ];
  return (
    <div className="status-bar">
      {items.map((it) => (
        <span key={it.k} className={`pill ${pillTone(it.t)}`}>
          {it.k} {it.v}
        </span>
      ))}
    </div>
  );
}

function Detail({ m, onClose, onPick }) {
  const warnings = m.verdict.flags || [];
  const had = ["home", "draw", "away"];
  const names = { home: "胜", draw: "平", away: "负" };
  return (
    <div className="sheet">
      <button className="back" onClick={onClose}>返回</button>
      <div className="card-head">
        <div>
          <div className="teams">{m.jcId} {m.league.name}</div>
          <div className="clock">计算于 {fmtHkt(m.computedAt)}</div>
        </div>
        <span className={`tier ${m.verdict.tier}`}>{TIER_LABEL[m.verdict.tier]}</span>
      </div>
      <div className="meta">队名对照：体彩 / 来源 / FotMob。{m.nameMap?.ok === false ? "队名未对上" : "已对照"}</div>
      <StatusBar m={m} />
      <GuangshiLine g={m.guangshi} />
      {warnings.length > 0 && <div className="warn">{warnings.join(" · ")}（警告压住结论）</div>}

      <div className="card">
        <strong>结论</strong>
        <div>{m.verdict.title}</div>
        <div>偏离格 {m.verdict.peak?.key} {pts(m.verdict.peak?.diffPts)}</div>
        <div>{m.verdict.canBet ? "可下" : "不可下"} · {m.verdict.canBetNote}</div>
        <div>缺项：{m.verdict.missing.length ? m.verdict.missing.join("、") : "无"}</div>
      </div>

      <div className="grid4">
        <div></div>
        <div>盘口</div>
        <div>模型</div>
        <div>体彩</div>
        {had.map((k) => (
          <React.Fragment key={k}>
            <div>{names[k]}</div>
            <div className={m.verdict.peak?.key === k ? "devcell" : ""}>{pct(m.market1x2?.[k])}</div>
            <div>{pct(m.modelAdj?.[k])}</div>
            <div>{m.valueCells.find((c) => c.key === k)?.dec ?? "—"}</div>
          </React.Fragment>
        ))}
      </div>
      <div className="meta">
        期望值{" "}
        {m.valueCells.map((c) => `${c.key} ${c.ev == null ? "—" : c.ev.toFixed(3)}`).join(" · ") || "体彩价未抓取，可下格不判"}
      </div>
      <div className="meta">
        ρ {m.rhoInfo.rho} {m.rhoInfo.label}
        {m.rhoSense.map((r) => (
          <div key={r.key}>{r.key} {r.text}{r.sensitive ? " · 对 ρ 敏感" : ""}</div>
        ))}
      </div>

      <details>
        <summary>反推明细（独立公式代回）</summary>
        {(m.fitCheck.independentBack || []).map((r, i) => (
          <div key={i} className={Math.abs(r.errorPts) > 0.5 ? "warn" : "meta"}>
            {r.kind} {r.line} 盘口 {(r.market * 100).toFixed(1)} 代回 {(r.model * 100).toFixed(1)} 误差 {r.errorPts.toFixed(2)}
          </div>
        ))}
        {m.fitCheck.euroDiffs && (
          <div>
            欧赔差 胜 {m.fitCheck.euroDiffs.home?.toFixed(2)} 平 {m.fitCheck.euroDiffs.draw?.toFixed(2)} 负 {m.fitCheck.euroDiffs.away?.toFixed(2)}
          </div>
        )}
      </details>

      <details>
        <summary>点开看来源</summary>
        {(m.books.ah || []).map((b, i) => (
          <div key={`a${i}`} className="kv">
            <span>亚盘 {b.line}</span>
            <span>香港盘 {b.home}/{b.away} · 公司 {b.book_id} · 变 {fmtHkt(b.changed_at)} · 抓 {fmtHkt(b.fetched_at)}</span>
          </div>
        ))}
        {(m.books.ou || []).map((b, i) => (
          <div key={`o${i}`} className="kv">
            <span>大小 {b.line}</span>
            <span>香港盘 {b.over}/{b.under} · 公司 {b.book_id} · 变 {fmtHkt(b.changed_at)} · 抓 {fmtHkt(b.fetched_at)}</span>
          </div>
        ))}
        {m.books.euro && (
          <div className="kv">
            <span>欧赔 177</span>
            <span>
              {m.books.euro.raw?.home}/{m.books.euro.raw?.draw}/{m.books.euro.raw?.away} 小数盘 · 变 {fmtHkt(m.books.euro.changed_at)} · 抓 {fmtHkt(m.books.euro.fetched_at)}
            </span>
          </div>
        )}
      </details>

      <GuangshiBox g={m.guangshi} />

      <details>
        <summary>六行调整</summary>
        <Adj label="伤停" item={m.injState} extra={m.injHome} />
        <Adj label="首发" item={m.lineup.home} extra={m.lineup} />
        <Adj label="战意" item={m.motiveHome} extra={m.motiveAway} />
        <Adj label="轮换" item={m.rotation} />
        <Adj label="近况" item={{ status: "不适用" }} />
        <Adj label="零封" item={{ status: "不适用" }} />
      </details>

      {m.injState.players && (
        <details>
          <summary>伤停逐人</summary>
          {m.injHome.booked.concat(m.injAway.booked).map((p, i) => (
            <div key={i} className="meta">
              {p.side} {p.name} {p.absence_type} 占比 {p.startShare ?? "权重缺失"} 扣 {p.deduct?.toFixed(3) ?? "—"}
            </div>
          ))}
        </details>
      )}

      <MarginBars m={m} />

      <div className="row">
        <button onClick={() => onPick(m)}>加入串关</button>
      </div>
    </div>
  );
}

function GuangshiLine({ g }) {
  if (!g) return <div className="meta">广实 未接入</div>;
  if (g.status === "未接入") return <div className="meta">广实 未接入（缺进失球和排名，不打分）</div>;
  const vs = g.vs?.kind || "—";
  const open = g.openRead?.kind || "—";
  return (
    <div className="gs-line">
      广实 {g.home?.name || "?"} / {g.away?.name || "?"} · {g.diffText || "差未定"} · {open} · {vs}
    </div>
  );
}

function GuangshiBox({ g }) {
  if (!g) return null;
  const inv = g.inventory || {};
  const got = Object.entries(inv).filter(([, v]) => v).map(([k]) => k);
  const miss = Object.entries(inv).filter(([, v]) => !v).map(([k]) => k);
  return (
    <details open>
      <summary>广实推论（不改盘口 μ）</summary>
      <div className="kv"><span>主队档</span><span>{g.home?.name || "未定"} {g.home?.num != null ? `(${g.home.num})` : ""}</span></div>
      <div className="kv"><span>客队档</span><span>{g.away?.name || "未定"} {g.away?.num != null ? `(${g.away.num})` : ""}</span></div>
      <div className="kv"><span>广实差</span><span>{g.diff ?? "—"} · {g.diffText}（主减客，负=主高）</span></div>
      <div className="kv"><span>应开</span><span>{g.expected?.label || "未定"}</span></div>
      <div className="kv"><span>开盘</span><span>{g.openRead?.kind || "未对照"} {g.openRead?.note || ""}</span></div>
      <div className="kv"><span>判定</span><span>{g.vs?.kind} · {g.vs?.note}</span></div>
      <div className="kv"><span>广实偏向</span><span>胜平负 {g.vs?.gsLean || "—"} · 热门 {g.hot || "—"}</span></div>
      <div className="kv"><span>盘口偏向</span><span>{g.vs?.priceLean || "—"} · 用的是 {g.vs?.priceSource}</span></div>
      <div className="kv"><span>深浅</span><span>{g.vs?.depth?.kind || "—"} 应开 {g.vs?.depth?.expectedAh ?? "—"} 平博五五开 {g.vs?.depth?.actualAh ?? "—"}</span></div>
      <div className="meta">{g.vs?.jcHhadNote}</div>
      {g.home?.score && (
        <div className="meta">
          主队打分 {g.home.score.status === "已接入" ? g.home.score.score.toFixed(3) : g.home.score.reason}
          {g.home.score.weights ? ` · 净胜${g.home.score.weights.gd} 排名${g.home.score.weights.rank} 近况${g.home.score.weights.form}` : ""}
        </div>
      )}
      {g.away?.score && (
        <div className="meta">
          客队打分 {g.away.score.status === "已接入" ? g.away.score.score.toFixed(3) : g.away.score.reason}
        </div>
      )}
      {g.gs1x2 && (
        <div className="meta">
          广实胜平负 {(g.gs1x2.home * 100).toFixed(1)} / {(g.gs1x2.draw * 100).toFixed(1)} / {(g.gs1x2.away * 100).toFixed(1)}
          {g.gsAh ? ` · 预期让球 ${g.gsAh.line}` : ""}
        </div>
      )}
      <div className="meta">现在拿到：{got.length ? got.join("、") : "无"}</div>
      <div className="meta">还缺：{miss.length ? miss.join("、") : "无"}</div>
      <div className="meta">{g.note}</div>
    </details>
  );
}

function Adj({ label, item, extra }) {
  const status = item?.status || item?.kind || item?.text || "缺失";
  const unused = /不适用/.test(status);
  const missing = /缺失|未抓|扒不到|未接入/.test(status);
  return (
    <div className="kv">
      <span>{label}</span>
      <span>
        {unused ? "不适用" : missing ? status : status}
        {extra?.label ? ` · ${extra.label}` : ""}
        {!unused && !missing && extra?.deduct != null ? ` · 扣 ${extra.deduct.toFixed(3)}` : ""}
      </span>
    </div>
  );
}

function MarginBars({ m }) {
  const keys = [-3, -2, -1, 0, 1, 2, 3, 4, 5];
  return (
    <details>
      <summary>净胜球分布（盘口/模型叠画）</summary>
      {keys.map((k) => (
        <div key={k} className={`barwrap ${m.hhadName?.includes(String(Math.abs(k))) ? "hl" : ""}`}>
          <span style={{ width: 28 }}>{k > 0 ? `+${k}` : k}</span>
          <div className="bar">
            <i style={{ width: `${Math.max(2, (m.market1x2?.home || 0) * 40)}%` }} />
            <em style={{ width: `${Math.max(2, (m.modelAdj?.home || 0) * 40)}%` }} />
          </div>
        </div>
      ))}
    </details>
  );
}

function Parlay({ matches, parlay, setParlay }) {
  const indep = parlay.reduce((p, m) => p * (m.verdict.peak ? Math.abs(m.modelAdj?.[m.verdict.peak.key] || 0.3) : 0.3), 1);
  const shared = indep * 0.92;
  const sameDir = parlay.filter((m) => m.verdict.peak?.key === parlay[0]?.verdict.peak?.key).length;
  const injSrc = parlay.filter((m) => m.injState.status === "有名单").length;
  return (
    <section className="panel">
      <p>独立连乘 {(indep * 100).toFixed(2)}% · 扣共因后 {(shared * 100).toFixed(2)}%</p>
      {sameDir > 1 && <div className="warn">同向短热超过 1 腿</div>}
      {injSrc > 2 && <div className="warn">同一伤停来源超过 2 腿</div>}
      {parlay.map((m, i) => (
        <div key={i} className="card">
          {m.jcId} {TIER_LABEL[m.verdict.tier]}
          {m.valueCells?.some((c) => c.pool === "仅串关") ? " · 含仅串关" : ""}
          {m.valueCells?.some((c) => c.pool === "停售") ? " · 含停售，报红" : ""}
        </div>
      ))}
      <button onClick={() => setParlay([])}>清空</button>
      <p className="muted">从赛程卡点进详情再加入。报警按扣共因后的数。</p>
      {matches.length === 0 && <p className="muted">暂无场次</p>}
    </section>
  );
}

function Board({ board, load }) {
  useEffect(() => {
    load();
  }, []);
  const s = board?.stats || {};
  return (
    <section className="panel">
      <button onClick={load}>刷新看板</button>
      <div className="card">
        <div>单场倾向命中 {fmtStat(s.trendHit)}</div>
        <div>票面命中 {fmtStat(s.ticketHit)}</div>
        <div>弱倾向命中 {fmtStat(s.weakHit)}</div>
      </div>
    </section>
  );
}

function fmtStat(x) {
  if (!x) return "—";
  if (x.note) return `${x.note}（n=${x.n}）`;
  return `${(x.rate * 100).toFixed(1)}% n=${x.n}`;
}
