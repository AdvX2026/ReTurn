# Sampler Git 当日提交采集 — 实施 PRD

> 版本：v1.0 · 2026-07-24 · 状态：待实现
> 上游依据：`docs/PRD.md` v0.5 —— §3.1 T1 档（Git：本地仓库当日提交 message + 改动文件数，用户配置代码目录，扫描 `git log --since`）、§3.1 节点 kind 清单（已预留 `git_commit`）、§4.1 产出（"P1 接入 Git 后再叠加提交数"）。
> 本文档是自包含实施规格：实现者按本文执行即可，无需再向产品侧提问。本文未授权的事项一律不做。

## 1. 目标

macOS 常驻 sampler 进程每 5 分钟扫描用户配置的代码目录，把**当日本地 git 提交**落为 `git_commit` 节点，经既有 outbox → Pi 管线入库；server 侧产出属性叠加当日提交数。全程只读用户磁盘，不注入 hook、不写仓库。

## 2. 范围

**本期做：**

1. `shared`：`NodeKind` 枚举增加 `"git_commit"`。
2. `sampler`：git 采集器（发现仓库 → `git log` 扫描 → 节点映射 → 进程内去重），接入现有 snapshot 管线。
3. `server`：`scoreOutput` 公式叠加当日提交数；同步更新受影响测试。

**本期明确不做（不要顺手实现）：**

- 发酵 prompt 加 git 上下文（隐私边界待产品侧拍板，commit subject 是否送云端 LLM 未定）。
- 时间轴（timeline）git 打点。
- checkpoint 状态文件、commit amend/rebase 的节点回删、hook 注入、fsnotify 监听。
- Swift `Models.swift` 镜像（`apps/ReturnApp` 尚未落地，合同同步记为 app 开工待办）。
- 不修改 `docs/PRD.md`，不动当时仍存在的旧 Tauri probe shell（该目录已在 v0.7 客户端重构中删除）。

## 3. 总体数据流（与现有管线同构，server 入库路径零改动）

```
git log --fixed-strings --author=<local user.email>（配置目录下各仓库，每 tick）
  → sources/git.ts SampleSource            collect → map → SHA dedupe → NodeInput[]
  → collect.ts SOURCES 注册表 fan-out       纯编排，无 feature 逻辑
  → Outbox SQLite（不变）→ FIFO flush → POST /api/nodes（不变）
  → server insertNode 按 client_uuid 去重（不变）
  → scoreOutput 叠加当日提交数（compute.ts 小改）
```

核心幂等设计：**commit SHA 即幂等键**。采集器无状态——每 tick 扫「今天全天」，重启、补传、多分支重叠全部由确定性 `client_uuid` + server 端 `UNIQUE(client_uuid)` 去重兜底。

## 4. 实现前必读（先读这些文件再动手）

| 文件 | 读什么 |
|---|---|
| `packages/sampler/src/source.ts` | `SampleSource` 契约、`uuidFromSeed` / `todayLocal` / `createKeyDedupe` |
| `packages/sampler/src/collect.ts` | SOURCES 注册表；加 source 只 append 一行 |
| `packages/sampler/src/sources/agents.ts` | 既有 source 范本（collect → map → dedupe） |
| `packages/sampler/src/config.ts` | env 配置风格（`str`/`num` helper） |
| `packages/sampler/src/index.ts` | tick 循环如何调用 `collectSample` |
| `packages/shared/src/domain.ts` | `NodeKind` 枚举 |
| `packages/server/src/stats/compute.ts` | `scoreOutput` 现状（todo 70 + agent 30，合入后重分配） |
| `packages/server/src/stats/live.ts` / `packages/server/src/services/save.ts` | `computeStats` 仅有的两个调用点，`nodes` 均已在场 |
| `packages/sampler/src/collect.test.ts` | sampler 测试风格（`node:test`） |

环境：Node ≥ 22.13、pnpm workspace、TS strict、Biome（`pnpm lint`）。代码/注释/commit message 一律英文。

## 5. shared 契约变更

`packages/shared/src/domain.ts` 的 `NodeKind` 枚举追加 `"git_commit"`（位置建议紧随 `"agent_session"`）。无其他契约改动——`NodeInput` 现有字段（`source_meta` 自由 record、`client_created_at`、`date`）已够用。

注意：`nodes.kind` 在 DB 层是自由 TEXT，但 `POST /api/nodes` 经 Zod 校验，**旧 server 会 400 拒绝新 kind**——部署顺序须 server 先于 sampler（monorepo 同 commit 发布即可）。

## 6. Sampler 实现规格

### 6.1 配置（`config.ts` 追加 + `.env.example` 同步）

- `GIT_SCAN_DIRS`：逗号分隔的代码根目录，支持 `~` 展开。**默认空 = 功能关闭**（不 spawn 任何 git 进程，行为与现状完全一致）。
- 解析为 `gitScanDirs: string[]`（trim、去空、展开 `~`、**一律 `path.resolve` 成绝对路径**——`client_uuid` 种子含 `repoPath`，相对路径与绝对路径混用会双记同一 commit）。

### 6.2 新文件 `packages/sampler/src/collect-git.ts`

导出两个函数；解析部分做成**纯函数**便于单测：

```ts
export interface GitCommit {
  repo: string;        // basename(repoPath)
  repoPath: string;    // absolute, only for uuid seed
  sha: string;
  committedAt: string; // UTC ISO (converted, see pitfall below)
  subject: string;
  filesChanged: number | null;
  insertions: number | null;
  deletions: number | null;
}

export async function discoverRepos(roots: string[]): Promise<string[]>
export async function scanTodayCommits(roots: string[]): Promise<GitCommit[]>
export function parseGitLog(stdout: string, repo: string, repoPath: string): GitCommit[]
```

**仓库发现 `discoverRepos`**：每个 root 下，候选 = root 自身 + root 的直接子目录（跳过隐藏目录与 `node_modules`）；候选路径下存在 `.git`（文件或目录均可，兼容 worktree）即视为仓库。结果进程内缓存（`Map` + 时间戳，TTL 1 小时），不每 tick 走目录树。单目录读取失败静默跳过。

**扫描 `scanTodayCommits`**：对每个仓库先读 `git config --get user.email`（无 email → 跳过该仓，避免无 author 过滤）；再执行（`execFile`，timeout 10s，maxBuffer 1MB）：

```
git -C <repoPath> log --all --fixed-strings --author=<user.email> --since="<todayLocal()>T00:00:00" --max-count=100 --pretty=format:%x1e%H%x1f%aI%x1f%s --shortstat
```

- `--fixed-strings --author` 按字面邮箱过滤（`--author` 默认是正则，`john.doe@x` 会误匹配 `johnXdoe@x`）。
- `--all` 覆盖所有本地分支；git 自身按 SHA 去重。
- `--since` 用本地零点（`todayLocal()` 拼 `T00:00:00`，git 按本地时区解释）。
- `--max-count=100` 在 git 侧封顶，避免超大 shortstat 输出撑爆 `maxBuffer` 后整仓变空。
- 任何非零退出 / 超时 / 解析异常 → 该仓库返回 `[]`（空仓库、无提交均属正常）。
- 解析后不再二次 `slice`（cap 已在 argv）。

**解析 `parseGitLog`**（纯函数）：

- 按 `\x1e` 切记录；记录首行按 `\x1f` 切出 `sha`、`%aI` author 时间、subject。
- 记录剩余行匹配 shortstat：`/^\s*(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/`，缺项为 `null`。
- **关键坑**：`%aI` 输出带时区偏移（`+08:00`），而 `NodeInput.client_created_at` 的 `z.string().datetime()` 只接受 `Z` 结尾——先 `Date.parse`，NaN 则 `continue` 跳过该条（**禁止**对 Invalid Date 直接 `toISOString()`，会抛 RangeError 拖垮整仓），再 `new Date(ms).toISOString()` 转 UTC。

### 6.3 接入 pluggable source

1. 新文件 `packages/sampler/src/sources/git.ts` 实现 `SampleSource`（id=`git`）：`scanTodayCommits` → `commitsToNodes`（进程内 SHA dedupe via `createKeyDedupe`）。
2. `collect.ts` 的 `SOURCES` 数组 append `gitSource`（约 +2 行 import + 1 行注册）。**禁止**再往 `SampleSnapshot` 塞 `commits` 字段或在 orchestrator 里写映射。
3. `config.gitScanDirs` 为空时 `scanTodayCommits` 直接 `[]`，不 spawn。

**节点字段映射：**

| NodeInput 字段 | 取值 |
|---|---|
| `client_uuid` | `uuidFromSeed(`git:${repoPath}:${sha}`)` |
| `kind` | `"git_commit"` |
| `title` | `subject`（截断至 500 字符） |
| `content` | `null` |
| `source_meta` | `{ repo, sha, committed_at, files_changed, insertions, deletions }`（`committed_at` 为 UTC ISO） |
| `client_created_at` | `committedAt`（UTC ISO） |
| `date` | `todayLocal(new Date(committedAt))`——按提交 author 时间归日，跨零点提交归正确那天 |

Save Today 无需特殊处理 git——source 在每次 tick 都发 closed commits（commit 无 open 语义）。

### 6.4 失败哲学

git 不存在、目录未配置、单仓库报错 → 一律静默返回空，绝不影响采样主流程与 outbox flush（对齐 PRD §9.12）。

## 7. Server 实现规格

入库路径（`routes.ts` / `repo.ts`）**零改动**——`insertNode` kind 无关、`client_uuid` 去重现成。

唯一改动在 `packages/server/src/stats/compute.ts` 的产出公式：

- `scoreOutput(todoRate, sessions)` 改为 `scoreOutput(todoRate, sessions, commitCount)`。
- `computeStats` 内部：`commitCount = input.nodes.filter(n => n.kind === "git_commit").length`，传入。
- 新公式（系数为初值，标注可调，对齐现有注释风格）：
  - todo 完成率：`clamp(todoRate * 60, 0, 60)`
  - agent 时长加成：`clamp((agentMin / 120) * 20, 0, 20)`
  - 提交数加成：`clamp((commitCount / 5) * 20, 0, 20)`（5 个提交拿满）
- `live.ts` / `save.ts` 的 `computeStats` 调用点**无需改**（commitCount 在 `computeStats` 内部从 `nodes` 派生）。

## 8. 测试规格（backend profile：新行为必须有测试）

**sampler（`packages/sampler/src/collect-git.test.ts` 新建）：**

1. `parseGitLog` 纯函数：多提交 + shortstat 完整 / 缺 insertions / 单文件（`1 file changed`）/ 空输出 / 垃圾输入 / **坏 author 时间跳过且不拖垮后续记录**。
2. 时区转换：`+08:00` author 时间 → UTC ISO（Z 结尾）。
3. 节点映射确定性：同一 `(repoPath, sha)` 两次映射 `client_uuid` 相同；不同 sha 不同。
4. 归日：23:59 与 00:01（本地）的提交 `date` 字段各归其日。
5. 集成（tmp 目录建真 git 仓库，CI 是 ubuntu-latest、git 预装）：配置 root → 扫出当日提交；`GIT_SCAN_DIRS` 为空 → 不 spawn、返回空。
6. `commitsToNodes` 进程内去重：同一批 commit 映射两遍，第二遍为空；reset helper 后重新出现。

**server（`packages/server/src/stats/compute.test.ts` 更新）：**

- 第 84 行起 `scoreOutput` describe 的旧断言（`scoreOutput(1, []) >= 70`）随新公式改为 60，同步更新；新增用例：0 / 5 / 10 个提交 → 提交加成分档正确；`computeStats` 传入含 `git_commit` 节点时 output 上升。

## 9. 验证与交付

1. `pnpm check`（typecheck + test + build）与 `pnpm lint` 全绿。
2. 手动冒烟（macOS）：配 `GIT_SCAN_DIRS=~/Coding` 起 `pnpm dev:sampler` + `pnpm dev:server`，当日造一个提交 → `GET /api/nodes?date=<today>` 出现 `git_commit` 节点；重启 sampler → 不重复（响应 `duplicates` 非空）；`GET /api/stats/today` 的 `output` 上升。
3. 分支 `feat/sampler-git`，Conventional Commits 按包拆分：
   - `feat(shared): add git_commit node kind`
   - `feat(sampler): collect today's git commits into git_commit nodes`
   - `feat(server): count git commits in output stat`

## 10. 验收清单

- [ ] `GIT_SCAN_DIRS` 未配置时行为与现状零差异（进程列表无 git）。
- [ ] 配置后当日提交在 5 分钟内出现在 `GET /api/nodes?date=`，kind/title/source_meta 字段正确。
- [ ] sampler 重启、重复扫描、多分支同 SHA 均不产生重复节点。
- [ ] 跨零点提交按 author 时间归日。
- [ ] 产出属性随提交数上升，5 个提交拿满 20 分加成。
- [ ] `pnpm check`、`pnpm lint` 全绿；无新第三方依赖。

## 11. 后续待办（不在本期）

- 发酵 prompt 增加「今日 git 提交」上下文（待产品侧确认 commit subject 可送云端 LLM，届时只给 subject 不给 diff）。
- 时间轴 feed 打点纳入 `git_commit`（`TimelineSegment.kind` 沿用 `"feed"`、category 写 `"git_commit"`，无契约变更）。
- `apps/ReturnApp` 落地时同步 `Models.swift` 的 kind 枚举（AGENTS.md 合同镜像要求）。
