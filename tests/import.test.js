import { describe, expect, it } from "vitest";
import { classifyFilename, guessBusinessDate, normalizeImport, normalizeResults, teamName, unwrapList } from "../src/data/jcImport.js";

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
});
