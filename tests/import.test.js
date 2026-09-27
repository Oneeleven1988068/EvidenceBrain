import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyFilename,
  guessBusinessDate,
  mergeImported,
  normalizeImport,
  normalizeResults,
  teamName,
  unwrapList,
} from "../src/data/jcImport.js";

function wrapCalculator(value) {
  return {
    fetched_at_local: "2026-09-27T09:05:02+08:00",
    endpoint: "calculator",
    data: JSON.stringify({ success: true, errorCode: "0", value }),
    source: "sporttery_official",
  };
}

function wrapResults(value) {
  return {
    fetched_at_local: "2026-09-27T09:05:02+08:00",
    endpoint: "results",
    data: JSON.stringify({ success: true, errorCode: "0", value }),
    source: "sporttery_official",
  };
}

const REAL_POOLS = "/home/ubuntu/.cursor/projects/workspace/uploads/sporttery_5pools_20260927_090502_8714.json";
const REAL_RESULTS = "/home/ubuntu/.cursor/projects/workspace/uploads/sporttery_results_20260927_090502_0455.json";

describe("体彩文件导入", () => {
  it("认 sporttery 文件名", () => {
    expect(classifyFilename("sporttery_5pools_20260927.json")).toBe("pools");
    expect(classifyFilename("sporttery_results_20260927.json")).toBe("results");
  });

  it("解开 value.matchInfoList，队名从对象取出", () => {
    const payload = {
      value: {
        matchInfoList: [
          {
            matchNumStr: "周日009",
            leagueNameAbbr: "美职",
            businessDate: "2026-09-27",
            matchDate: "2026-09-28",
            matchTime: "07:00",
            homeTeam: { teamName: "哥伦布" },
            awayTeam: { teamName: "迈阿密国际" },
            poolList: [
              { poolCode: "HAD", h: "1.88", d: "3.35", a: "3.55" },
              { poolCode: "HHAD", goalLine: "+1", h: "2.1", d: "3.4", a: "2.9" },
            ],
          },
        ],
      },
    };
    const n = normalizeImport(payload, new Date(), "sporttery_5pools_20260927.json");
    expect(n.ok).toBe(true);
    expect(n.matches[0].jcId).toBe("周日009");
    expect(n.matches[0].home).toBe("哥伦布");
    expect(n.matches[0].away).toBe("迈阿密国际");
    expect(n.matches[0].had.home).toBe(1.88);
    expect(n.matches[0].hhad_line).toBe("+1");
  });

  it("解开官方包 data 字符串 + subMatchList", () => {
    const payload = wrapCalculator({
      matchInfoList: [
        {
          businessDate: "2026-09-26",
          weekday: "周六",
          subMatchList: [
            {
              matchNumStr: "周六023",
              leagueAbbName: "美职",
              homeTeamAbbName: "盐湖城",
              awayTeamAbbName: "新英格兰",
              homeRank: "[美职13]",
              awayRank: "[美职2]",
              matchDate: "2026-09-27",
              matchTime: "09:30:00",
              businessDate: "2026-09-26",
              bettingSingle: 0,
              matchStatus: "Selling",
              had: { h: "2.20", d: "3.50", a: "2.57" },
              hhad: { h: "4.50", d: "4.15", a: "1.50", goalLine: "-1" },
            },
          ],
        },
      ],
    });
    const n = normalizeImport(payload, new Date("2026-09-27T01:05:02Z"), "sporttery_5pools_20260927_090502_8714.json");
    expect(n.ok).toBe(true);
    expect(n.count).toBe(1);
    expect(n.matches[0].home).toBe("盐湖城");
    expect(n.matches[0].away).toBe("新英格兰");
    expect(n.matches[0].standing.home.rank).toBe(13);
    expect(n.matches[0].standing.away.rank).toBe(2);
    expect(n.matches[0].had.home).toBe(2.2);
    expect(n.matches[0].had.singleHome).toBe("仅串关");
    expect(n.matches[0].hhad_line).toBe("-1");
    expect(n.matches[0].kickoffAt).toBe("2026-09-27T01:30:00.000Z");
  });

  it("赛果 matchResultList", () => {
    const n = normalizeResults({
      value: {
        matchResultList: [
          { matchNumStr: "周日001", homeTeam: "江原FC", awayTeam: "仁川联", homeScore: 0, awayScore: 0, matchDate: "2026-09-27" },
        ],
      },
    }, "sporttery_results_20260927.json");
    expect(n.ok).toBe(true);
    expect(n.results[0].jcId).toBe("周日001");
    expect(n.results[0].homeScore).toBe(0);
  });

  it("解开官方赛果 data 字符串 + matchResult", () => {
    const n = normalizeResults(wrapResults({
      matchResult: [
        {
          matchNumStr: "周六016",
          homeTeam: "英格兰",
          awayTeam: "西班牙",
          leagueNameAbbr: "欧国联",
          matchDate: "2026-09-27",
          sectionsNo999: "2:3",
          sectionsNo1: "2:1",
          winFlag: "",
          goalLine: "+1",
          h: "3.46",
          d: "3.40",
          a: "1.83",
        },
        {
          matchNumStr: "周六022",
          homeTeam: "纳什维尔",
          awayTeam: "多伦多",
          leagueNameAbbr: "美职",
          matchDate: "2026-09-27",
          sectionsNo999: "",
          sectionsNo1: "",
          winFlag: "",
          goalLine: "-1",
        },
      ],
    }), "sporttery_results_20260927_090502_0455.json");
    expect(n.ok).toBe(true);
    expect(n.count).toBe(2);
    expect(n.results[0].scoreText).toBe("2:3");
    expect(n.results[0].homeScore).toBe(2);
    expect(n.results[0].awayScore).toBe(3);
    expect(n.results[0].half).toBe("2:1");
    expect(n.results[0].had.home).toBe(3.46);
    expect(n.results[1].homeScore).toBe(null);
    expect(n.results[1].scoreText).toBe(null);
  });

  it("旧版 {businessDate,matches} 仍可用", () => {
    const n = normalizeImport({
      businessDate: "2026-09-26",
      matches: [{ jcId: "周六008", home: "斯洛文尼亚", away: "苏格兰", had: { home: 2.38, draw: 3.05, away: 2.95 } }],
    });
    expect(n.ok).toBe(true);
    expect(n.count).toBe(1);
  });

  it("队名和列表辅助函数", () => {
    expect(teamName({ teamName: "德国" })).toBe("德国");
    expect(unwrapList({ value: { matchInfoList: [1] } })).toEqual([1]);
    expect(guessBusinessDate({}, "sporttery_5pools_20260927.json")).toBe("2026-09-27");
  });

  it("导入覆盖演示场，保留同号已有情报", () => {
    const next = mergeImported(
      [
        { id: "seed", jcId: "周六008", home: "斯洛文尼亚" },
        { id: "keep", jcId: "周六023", home: "旧名", pinnacle: { ah: [1] }, jc: { imported: true } },
      ],
      {
        matches: [{
          jcId: "周六023",
          home: "盐湖城",
          away: "新英格兰",
          standing: { home: { rank: 13, played: 0 }, away: { rank: 2, played: 0 } },
          had: { home: 2.2, draw: 3.5, away: 2.57 },
          jc_points: 3,
          snapshot_at: "t",
        }],
      },
    );
    expect(next.map((m) => m.jcId)).toEqual(["周六023"]);
    expect(next[0].home).toBe("盐湖城");
    expect(next[0].pinnacle.ah).toEqual([1]);
    expect(next[0].standing.home.rank).toBe(13);
    expect(next[0].jc.imported).toBe(true);
  });
});

const hasReal = existsSync(REAL_POOLS) && existsSync(REAL_RESULTS);
(hasReal ? describe : describe.skip)("真实体彩上传文件", () => {
  it("赛程包 6 场，周日009 哥伦布 vs 迈国际", () => {
    const payload = JSON.parse(readFileSync(REAL_POOLS, "utf8"));
    const n = normalizeImport(payload, new Date("2026-09-27T01:05:02Z"), "sporttery_5pools_20260927_090502_8714.json");
    expect(n.ok).toBe(true);
    expect(n.count).toBe(6);
    expect(n.matches.map((m) => m.jcId)).toEqual(["周六023", "周六024", "周六025", "周日001", "周日003", "周日009"]);
    const col = n.matches.find((m) => m.jcId === "周日009");
    expect(col.home).toBe("哥伦布");
    expect(col.away).toBe("迈国际");
    expect(col.leagueAbbName).toBe("美职");
    expect(col.standing.home.rank).toBe(13);
    expect(col.standing.away.rank).toBe(3);
    expect(col.had.home).toBe(2.68);
    expect(col.hhad_line).toBe("+1");
    expect(col.had.singleHome).toBe("仅串关");
  });

  it("赛果包 43 场，空比分不误读，完场读 2:3", () => {
    const payload = JSON.parse(readFileSync(REAL_RESULTS, "utf8"));
    const n = normalizeResults(payload, "sporttery_results_20260927_090502_0455.json");
    expect(n.ok).toBe(true);
    expect(n.count).toBe(43);
    const open = n.results.find((r) => r.jcId === "周六022");
    expect(open.home).toBe("纳什维尔");
    expect(open.homeScore).toBe(null);
    const done = n.results.find((r) => r.jcId === "周六016");
    expect(done.home).toBe("英格兰");
    expect(done.away).toBe("西班牙");
    expect(done.scoreText).toBe("2:3");
    expect(done.homeScore).toBe(2);
    expect(done.awayScore).toBe(3);
    expect(done.half).toBe("2:1");
  });
});
