import { describe, expect, it } from "vitest";
import {
  applyPedigree,
  buildLadder,
  classifyVsPrice,
  formPoints,
  inferFromOpening,
  intervalFromDiff,
  lockMidtable,
  nearestFiftyAh,
  openVsInterval,
  panNeng,
  scoreSide,
  williamInterval,
} from "../src/model/guangshi.js";
import { analyzeMatch } from "../src/model/pipeline.js";
import { mergeImported } from "../src/ui/localApi.js";
import { describeDiff, guangshiDiff, nameOf, parseTierName } from "../src/league/tiers.js";

describe("档本身", () => {
  it("九档数字越小越强，相邻可半档", () => {
    expect(parseTierName("超强")).toBe(1);
    expect(parseTierName("中游")).toBe(7);
    expect(parseTierName("下游")).toBe(9);
    expect(nameOf(3)).toBe("普强");
    expect(nameOf(3.5)).toBe("普强/准强");
  });
  it("广实差=主减客，负一档=主高一档", () => {
    expect(guangshiDiff(3, 4)).toBe(-1);
    expect(describeDiff(-1).text).toBe("主高1档");
    expect(describeDiff(-0.5).text).toBe("主高0.5档");
    expect(describeDiff(0).text).toBe("同档");
  });
});

describe("差对开盘区间", () => {
  it("同档平半、主高半档半球、主高一档半一、主高1.5一球", () => {
    expect(intervalFromDiff(0)).toMatchObject({ n: 2, expectedAh: -0.25 });
    expect(intervalFromDiff(-0.5)).toMatchObject({ n: 3, expectedAh: -0.5 });
    expect(intervalFromDiff(-1)).toMatchObject({ n: 4, expectedAh: -0.75 });
    expect(intervalFromDiff(-1.5)).toMatchObject({ n: 5, expectedAh: -1 });
  });
  it("客队更强整表下移", () => {
    expect(intervalFromDiff(0.5)).toMatchObject({ n: 1, expectedAh: 0 });
    expect(intervalFromDiff(1)).toMatchObject({ n: 2, expectedAh: 0.25 });
  });
  it("威廉 94 锚点", () => {
    expect(williamInterval(2.2).name).toBe("二区间");
    expect(williamInterval(1.95).name).toBe("三区间");
    expect(williamInterval(1.62).name).toBe("五区间");
  });
  it("切尔西对曼城 1.95：同档读成三区间=低开", () => {
    const expected = intervalFromDiff(0);
    const read = openVsInterval(expected, 1.95, 0.25);
    expect(read.kind).toBe("低开");
    expect(read.william.name).toBe("三区间");
  });
  it("塞维利亚主场 1.62 对主高1.5=五区间，开在档上", () => {
    const expected = intervalFromDiff(-1.5);
    expect(openVsInterval(expected, 1.62).kind).toBe("开在档上");
  });
});

describe("档怎么做出来", () => {
  it("夺冠 501 先锁中游", () => {
    const mid = lockMidtable({
      titleOdds: [
        { team: "伯恩茅斯", odds: 501 },
        { team: "埃弗顿", odds: 501 },
        { team: "水晶宫", odds: 501 },
        { team: "利物浦", odds: 5 },
      ],
    });
    expect(mid.map((x) => x.team).sort()).toEqual(["伯恩茅斯", "埃弗顿", "水晶宫"].sort());
    expect(mid.every((x) => x.num === 7)).toBe(true);
  });
  it("对中游开半球 → 主高半档 → 中上", () => {
    const inf = inferFromOpening({ selfIsHome: true, openingAh: -0.5, knownOppNum: 7 });
    expect(inf.num).toBe(6.5);
    expect(inf.name).toMatch(/中上/);
  });
  it("第一轮对中游：让一球半附近推出普强一侧", () => {
    const liv = inferFromOpening({ selfIsHome: true, openingAh: -1, knownOppNum: 7 });
    expect(liv.homeStrongerBy).toBe(1.5);
    expect(liv.num).toBe(5.5);
  });
  it("两轮开盘反推：先钉中游，再推普强/准强/中下，再推中上", () => {
    const lad = buildLadder({
      titleOdds: [
        { team: "伯恩茅斯", odds: 501 },
        { team: "埃弗顿", odds: 501 },
        { team: "水晶宫", odds: 501 },
      ],
      openings: [
        { home: "利物浦", away: "伯恩茅斯", openingAh: -2.25 },
        { home: "切尔西", away: "埃弗顿", openingAh: -1.75 },
        { home: "利兹联", away: "水晶宫", openingAh: 0.25 },
        { home: "布莱顿", away: "水晶宫", openingAh: -0.75 },
        { home: "森林", away: "伯恩茅斯", openingAh: -0.25 },
        { home: "切尔西", away: "狼队", openingAh: -2.25 },
      ],
    });
    expect(lad.tiers["利物浦"].name).toMatch(/普强/);
    expect(lad.tiers["切尔西"].name).toMatch(/准强/);
    expect(lad.tiers["利兹联"].name).toMatch(/中下/);
    expect(lad.tiers["布莱顿"].name).toMatch(/中上/);
    expect(lad.tiers["森林"].name).toBe("中游");
    expect(lad.tiers["狼队"].name).toMatch(/中下/);
    expect(lad.inferred.find((x) => x.team === "利物浦").round).toBe(1);
    expect(lad.inferred.find((x) => x.team === "狼队").round).toBeGreaterThanOrEqual(2);
  });
  it("盘能：同一第三者主胜更低高半档", () => {
    const pn = panNeng(
      {
        results: [
          { opp: "富勒姆", homeWinOdds: 1.7, gf: 2, ga: 0, oppNum: 7 },
          { opp: "伯恩茅斯", homeWinOdds: 1.65, gf: 1, ga: 1, oppNum: 7 },
        ],
      },
      {
        results: [
          { opp: "富勒姆", homeWinOdds: 2.1, gf: 1, ga: 1, oppNum: 7 },
          { opp: "伯恩茅斯", homeWinOdds: 2.05, gf: 0, ga: 1, oppNum: 7 },
        ],
      },
    );
    expect(pn.ok).toBe(true);
    expect(pn.delta).toBe(-0.5);
  });
  it("大田市民：无底蕴，联赛第二也只从中下到中游", () => {
    expect(applyPedigree(5, 8, 0.1)).toBe(7);
  });
});

describe("打分不看赔率", () => {
  it("净胜55 排名25 近况20；缺进失和排名不打分", () => {
    const s = scoreSide({
      gf: 18,
      ga: 10,
      played: 10,
      rank: 5,
      teams: 20,
      recent: [
        { gf: 2, ga: 1, oppNum: 7 },
        { gf: 1, ga: 1, oppNum: 6 },
        { gf: 0, ga: 2, oppNum: 3 },
        { gf: 3, ga: 0, oppNum: 9 },
        { gf: 1, ga: 0, oppNum: 7 },
      ],
      tierNum: 6,
    });
    expect(s.status).toBe("已接入");
    expect(s.weights.gd).toBeCloseTo(0.55);
    expect(s.weights.rank).toBeCloseTo(0.25);
    expect(s.weights.form).toBeCloseTo(0.2);
    const bare = scoreSide({ recent: [{ gf: 1, ga: 0 }] });
    expect(bare.status).toBe("未接入");
  });
  it("强队赢弱队的近况分被抠掉", () => {
    const f = formPoints(
      [
        { gf: 3, ga: 0, oppNum: 9 },
        { gf: 1, ga: 1, oppNum: 6 },
      ],
      3,
      { lastN: 6, strip: true },
    );
    expect(f.stripped).toBe(3);
    expect(f.pts).toBe(1);
  });
});

describe("对照价格不改 μ", () => {
  it("平博五五开亚盘判深浅，体彩让球不参与", () => {
    const fifty = nearestFiftyAh([
      { line: -0.25, home: 0.9, away: 0.95, format: "hk" },
      { line: -0.75, home: 1.4, away: 0.55, format: "hk" },
    ]);
    expect(fifty.line).toBe(-0.25);
    const vs = classifyVsPrice({
      gs1x2: { home: 0.4, draw: 0.28, away: 0.32 },
      expectedAh: -0.75,
      jcEuro: { home: 0.42, draw: 0.28, away: 0.3 },
      pinAhFifty: { line: -0.5 },
      jcHhad: { home: 3.2, draw: 3.3, away: 1.9 },
      hot: "away",
      openRead: { kind: "让浅" },
    });
    expect(vs.kind).toMatch(/诱盘|利分布/);
    expect(vs.jcHhadNote).toMatch(/不拿来判深浅|只写/);
    expect(vs.depth.kind).toBe("让浅");
  });
});

describe("接入每场且不改盘口 μ", () => {
  it("切尔西对曼城 1.95：同档读成三区间=低开，不改 μ", () => {
    const m = {
      id: "che-mci",
      jcId: "演示切城",
      leagueAbbName: "英超",
      businessDate: "2026-09-28",
      kickoffAt: "2026-09-28T19:30:00.000Z",
      home: "切尔西",
      away: "曼城",
      guangshiPreset: {
        home: { name: "准强", prestige: "准强", pedigree: 0.6 },
        away: { name: "准强", prestige: "准强", pedigree: 0.8 },
      },
      opening: { william: 1.95, imageBoost: 0.25 },
      pinnacle: {
        ah: [
          { book_id: 47, line: -0.25, home: 0.95, away: 0.9, odds_format: "hk" },
          { book_id: 47, line: 0, home: 0.72, away: 1.15, odds_format: "hk" },
        ],
        ou: [{ book_id: 47, line: 2.5, over: 0.92, under: 0.92, odds_format: "hk" }],
        euro: { book_id: 177, home: 2.7, draw: 3.4, away: 2.55, odds_format: "decimal", ownClock: true },
      },
      jc: { imported: true, jc_points: 3, snapshot_at: "2026-09-28T10:00:00.000Z", had: { home: 2.65, draw: 3.3, away: 2.5 } },
      injuries: { injury_tried: true, name_map_ok: true, emptyOfficial: true, injury_source_url: "https://x", fetched_at: "2026-09-28T10:00:00.000Z" },
      lineup: { home: { lineupType: "predicted", source: "enetpulse" }, away: { lineupType: "predicted", source: "enetpulse" } },
      standing: { home: { played: 8, rank: 4 }, away: { played: 8, rank: 3 } },
      schedule: { home: { prevDays: 7, nextDays: 8, nextMoreImportant: false } },
      fundamentals: {
        home: { gf: 12, ga: 9, played: 8, rank: 4, teams: 20, recent: [{ gf: 2, ga: 1, oppNum: 6 }] },
        away: { gf: 11, ga: 8, played: 8, rank: 3, teams: 20, recent: [{ gf: 2, ga: 0, oppNum: 8 }] },
      },
    };
    const a = analyzeMatch(m, new Date("2026-09-28T11:00:00.000Z"));
    expect(a.guangshi.diff).toBe(0);
    expect(a.guangshi.diffText).toBe("同档");
    expect(a.guangshi.expected.n).toBe(2);
    expect(a.guangshi.openRead.kind).toBe("低开");
    expect(a.guangshi.openRead.note).toMatch(/形象加/);
    expect(a.bookMuUnchanged).toBe(true);
    expect(a.fit.lambdaHome).toBeTruthy();
    const mu = a.fit.lambdaHome;
    expect(a.guangshi.gsMu.lambdaHome).not.toBe(mu);
  });
  it("水晶宫主场对利物浦：客场至少该让 0.75，实际 0.5=让浅", () => {
    const m = {
      id: "pal-liv",
      jcId: "演示宫利",
      leagueAbbName: "英超",
      businessDate: "2026-09-28",
      kickoffAt: "2026-09-28T19:00:00.000Z",
      home: "水晶宫",
      away: "利物浦",
      guangshiPreset: { home: { name: "中游" }, away: { name: "普强" } },
      pinnacle: {
        ah: [{ book_id: 47, line: 0.5, home: 0.9, away: 0.95, odds_format: "hk" }],
        ou: [{ book_id: 47, line: 2.5, over: 0.95, under: 0.9, odds_format: "hk" }],
        euro: { book_id: 177, home: 5.5, draw: 4.2, away: 1.55, odds_format: "decimal", ownClock: true },
      },
      jc: { imported: true, jc_points: 3, snapshot_at: "2026-09-28T10:00:00.000Z", had: { home: 5.2, draw: 4.0, away: 1.58 } },
      injuries: { injury_tried: true, name_map_ok: true, emptyOfficial: true, injury_source_url: "https://x", fetched_at: "2026-09-28T10:00:00.000Z" },
      lineup: { home: { lineupType: "predicted", source: "enetpulse" }, away: { lineupType: "predicted", source: "enetpulse" } },
      fundamentals: {
        home: { gf: 8, ga: 10, played: 7, rank: 12, teams: 20, recent: [{ gf: 1, ga: 0, oppNum: 7 }] },
        away: { gf: 14, ga: 6, played: 7, rank: 2, teams: 20, recent: [{ gf: 2, ga: 1, oppNum: 5 }] },
      },
    };
    const a = analyzeMatch(m, new Date("2026-09-28T11:00:00.000Z"));
    expect(a.guangshi.diff).toBe(4);
    expect(a.guangshi.expected.expectedAh).toBe(0.75);
    expect(a.guangshi.vs.depth.kind).toBe("让浅");
    expect(a.bookMuUnchanged).toBe(true);
    expect(a.guangshi.note).toMatch(/不改盘口/);
    expect(a.fit.lambdaHome).toBeTruthy();
  });
});

describe("手机静态页导入", () => {
  it("合并导入不丢已有广实预设", () => {
    const next = mergeImported(
      [{ id: "che-mci", jcId: "演示切城", guangshiPreset: { home: { name: "准强" } }, home: "切尔西" }],
      { matches: [{ jcId: "演示切城", businessDate: "2026-09-28", had: { home: 2.6, draw: 3.3, away: 2.5 }, jc_points: 3, snapshot_at: "t" }] },
    );
    expect(next[0].guangshiPreset.home.name).toBe("准强");
    expect(next[0].jc.had.home).toBe(2.6);
    expect(next[0].home).toBe("切尔西");
  });
});
