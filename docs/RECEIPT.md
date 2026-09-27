# 第 1–62 条回执

基线 `utils-1Bq3g8Uo-p1612.js` / `3173b231…` 已整包作废。本仓库是源码重建，`npm run hash` 对 `src/calc/*` 取哈希。

| 条 | 文件 | 函数 | 说明 |
|---|---|---|---|
| 1 | `src/calc/dixonColes.js` | `tau` | 1:0 用客 μ，0:1 用主 μ |
| 2 | `src/calc/dixonColes.js` | `gridOf` | 至少算到 10 球 |
| 3 | `src/model/pipeline.js` | `analyzeMatch` | 负概率写入 adj_log；不静默抬平冒充无偏离 |
| 4 | `src/calc/bookMu.js` `src/league/catalog.js` | `rhoPrior` `classify` | ρ 标「临时先验」，夹在 −0.18…−0.03 |
| 5 | `src/calc/closeAt.js` `src/model/pipeline.js` | `jcSnap` `analyzeMatch` | 体彩取 close_at 前最近快照 |
| 6 | `src/model/pipeline.js` | `analyzeMatch` | 缺一口不合成盘口 |
| 7 | `src/calc/bookMu.js` | `bookMu` | 只用平博 OU，否则缺大小球 |
| 8 | `src/data/titan.js` `src/model/pipeline.js` | `fetchPinnacle` `pinnacleLinesFromBooks` | 只要 book_id 47，含备选线 |
| 9 | `src/data/titan.js` | `parseAsianTable` | 来源按编号，不写死 pinnacle 字符串 |
| 10 | `src/model/injury.js` | `injuryStatus` | 公示无伤必须队名对上+有来源 |
| 11 | `src/model/injury.js` | `publishedOrOld` | 无 published_at 残差 0 |
| 12 | `src/league/catalog.js` | `leagueMotive` | 按分差/分区，不看裸名次 |
| 13 | `src/data/fotmob.js` `src/server/index.js` | `unavailableFromDetails` | 存 URL、哈希、时间、试过的源 |
| 14 | `src/model/injury.js` | `grossOf` | 主客分开，国家队征召按缺阵 |
| 15 | `src/model/lineup.js` | `rotationRisk` | 轮换标哪一队，默认未进 μ |
| 16 | `src/model/lineup.js` | `lineupAtBet` | 可写 predicted；lastStarting11=缺失 |
| 17 | `src/model/lineup.js` | `isLineupNews` | 删掉「首发消息一律缺阵」 |
| 18 | 全仓库 | — | 只改源码，正常 `vite build` |
| 19 | `src/model/pipeline.js` | `analyzeMatch` | 无 OU 标总进球为假设值 |
| 20 | `src/model/verdict.js` | `verdictOf` | 攻防/零封默认不适用，不进 μ |
| 21 | `src/model/verdict.js` | `verdictOf` | week1 可下只记账 |
| 22 | `src/server/index.js` | `/api/weights` | 权重复服务器，带哈希 |
| 23 | `src/league/catalog.js` | `applyMotivePair` | 默认只调一边 |
| 24 | `src/league/catalog.js` | `LEAGUE_CATALOG` | 日乙等简称入表 |
| 25 | `src/server/slate.js` | `exportDay` | 导出 close_at / snapshot_at |
| 26 | — | — | 未纳入旧 `ir()` / 旧 `tau`/`M` |
| 27 | `src/calc/ttest.js` | `devHit` | 主检验对象与文案分离，预留 p_close |
| 28 | `src/model/verdict.js` | `settleHhadResult` | 缺让球数不结算 |
| 29 | `src/calc/ttest.js` | `devHit` `weakHit` | 弱倾向不双计，先过 rowOk |
| 30 | `src/calc/ttest.js` | `tPValue` | 一律 t 分布 |
| 31 | `src/calc/ttest.js` | `rowOk` | 与主检验同一套样本过滤 |
| 32 | `src/calc/bookMu.js` `src/calc/settle.js` | `bookMu` `ahFair` | 线和水一起拟合 |
| 33 | `src/calc/settle.js` `src/model/pipeline.js` | `ouFair` `ouQuote` | 有线没水=缺大小球 |
| 34 | `src/calc/bookMu.js` | `bookMu` | 盘口 μ 不乘联赛系数 |
| 35 | `src/league/catalog.js` | `classify` | 体彩简称对照表 |
| 36 | `src/league/catalog.js` | `leagueOk` | 检验白名单 |
| 37 | `src/league/catalog.js` | `leagueMotive` | 美职按分区和第 9 名 |
| 38 | `src/league/catalog.js` | `LEAGUE_CATALOG` | 韩职/荷乙自带队数和线 |
| 39 | `src/league/catalog.js` | `leagueMotive` | 杯赛不套战意 |
| 40 | `src/model/verdict.js` | `verdictOf` | 缺数据不许写无偏离 |
| 41 | `src/calc/closeAt.js` | `closeAt` `jcSnap` | 销售日 + 六种体彩状态 |
| 42 | `src/model/verdict.js` | `verdictOf` | 四档 + 可下分开 |
| 43 | `src/model/verdict.js` | `handicapIdentity` `zName` | 让两球以上用净胜 1..N-1 |
| 44 | `src/model/injury.js` | `injuryStatus` | 先状态后数字 |
| 45 | `src/server/slate.js` | `exportDay` | close_at ≠ p_close_at |
| 46 | `src/data/jcImport.js` `src/ui/App.jsx` | `normalizeImport` | 只收本地导入，排出导入窗 |
| 47 | `src/data/titan.js` | `shouldFetchNow` | 封盘前 5 小时起按节奏抓 |
| 48 | `src/data/titan.js` | `fetchPinnacle` | 球探公开页，存格式/时间/哈希 |
| 49 | `src/model/pipeline.js` | `pinnacleLinesFromBooks` | 按公司+数值线，不按槽位 |
| 50 | `src/calc/odds.js` | `toDecimal` | 无格式报错 |
| 51 | `src/calc/bookMu.js` | `bookMu` | 保留全部线，不滤 0.6–1.45 |
| 52 | `src/data/titan.js` | `PIN_AH` `PIN_EURO` | 亚盘 47，欧赔 177 |
| 53 | `src/data/fotmob.js` | `matchDetails` `lineupFromDetails` | FotMob + FPL；TM 403 只记账 |
| 54 | `src/data/fotmob.js` | `teamPage` `fixturesAround` `startShareForTeam` | 赛程按本场时间找上下场 |
| 55 | `src/data/jcImport.js` | `normalizeImport` | 导入保留 businessDate |
| 56 | `src/calc/settle.js` | `winRateFromBuckets` | 通用四分之一球公式 |
| 57 | `src/calc/settle.js` | `winRateFromBuckets` | 代回用独立公式 |
| 58 | `src/calc/bookMu.js` | `bookMu` `residualCheck` | 全线拟合 + 欧赔校验；闸 0.7/1.1 |
| 59 | `src/calc/closeAt.js` `src/ui/App.jsx` | `jcSnap` | 删星期几写死；页面 HKT |
| 60 | `src/model/injury.js` | `playerMul` `grossOf` | 首发占比加权，无 0.72 下限 |
| 61 | `src/model/injury.js` | `isOut` `mapAbsenceType` | 国家队征召=缺阵 |
| 62 | `src/ui/App.jsx` `src/ui/styles.css` | UI | 27 项手机优先 |

盘口补丁：欧赔独立存 177 + decimal + 自己的变化时间；去水保持比例法；亚盘+大小球少于 5 条最多弱倾向。
