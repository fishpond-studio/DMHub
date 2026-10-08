# AGENTS.md

> Fishpond Studio 团队仓库的 AI Agent 工作规范
> 依据《Fishpond Studio 团队规范》v1.1（2026-10-07，维护者：北尘、advan10）
> 适用于所有读取 AGENTS.md 的工具：Claude Code、Codex、Cursor、Copilot、Gemini CLI 等

---

## 0. 适用范围

本文件是 DMHub 仓库的 Agent 工作规范。§1 的红线和 §2 的组织约定与 Fishpond Studio 团队规范一致；§6 的命令只适用于本仓库，其他仓库须各自维护命令表。若子目录中存在更近的 `AGENTS.md`，以更近的为准（closest-file-wins）；子目录规则不得与本文件的红线冲突。

本文件只保留**需要 Agent 执行或遵守**的内容。OOPz 频道准入、合作伙伴管理、娱乐联机等属于人类成员的管理规范，Agent 不参与、不执行、不得代替人类邀请或授权任何人。

---

## 1. 红线（Never）

以下行为在任何情况下都不得执行。团队最忌讳「图方便」「省事」「懒」，不得以任何理由绕过流程或降低标准——**没有例外**。

1. **禁止向 `main` 直接推送。** 包括 `git push origin main`、`git push --force`/`--force-with-lease`，以及 PR 未合并前的任何直推。所有改动必须走 Pull Request。
2. **禁止提交任何密钥。** API Key、Token、密码、`.env`、私有配置一律不入库；通过环境变量或密钥管理工具读取，并确认已被 `.gitignore` 覆盖。
3. **禁止分享或外传团队 API 额度。** FurAPI 的 Key 仅限申请人本人使用，不得转让、分发、聚合，也不得将 Key、接口或团队私有代码交给团队以外的人员、项目或第三方服务（包括外部检索、代码托管、在线调试平台）。**也不得将 Agent 的 API 端点指向未经批准的第三方中转 / 代理渠道**——改写 base URL 本身（接入 FurAPI、厂商官方端点或团队自建网关）是允许的，受限制的是端点指向哪里。
4. **禁止绕过流程。** 不得使用 `--no-verify` 跳过 Git hooks，不得伪造 Review 通过，不得伪造测试、构建或运行的输出。拿不到结果就如实说明"未验证"。
5. **禁止硬编码敏感信息**；也禁止把用户输入未经校验、转义就拼进 SQL、Shell、模板或 HTML。
6. **禁止擅自开源。** 仓库默认 Private，变更可见性必须经核心成员讨论通过。
7. **禁止擅自引入新的第三方依赖或大体积二进制文件。** 模型权重、安装包等应走 Git LFS 或外部存储，不入普通 Git 历史。
8. **禁止夹带与任务无关的改动。** 不顺手重构、不整文件格式化、不删除看似"无用"的代码。
9. **禁止虚构产出或署名。** `Co-authored-by` 只写真实参与者，测试结论只写真实结果。
10. **禁止在未获明确授权时执行破坏性操作**：`rm -rf`、`git reset --hard`、`git clean -fdx`、改写历史、删除分支或标签。

---

## 2. 仓库基本信息

| 项 | 约定 |
| :-- | :-- |
| 组织 | Fishpond Studio 组织账号（个人实验性项目可放个人账号） |
| 仓库命名 | kebab-case，全小写 + 短横线，如 `fishpond-website` |
| 默认可见性 | Private |
| 主分支 | `main`，始终保持可发布状态 |
| 版本标签 | 语义化版本 `vX.Y.Z` |
| 大文件 | Git LFS 或外部存储 |

**核心成员（Reviewer 人选）**：[@advan10](https://github.com/advan10)、[@Re-BeiChen](https://github.com/Re-BeiChen)、[@RegadPoleCN](https://github.com/RegadPoleCN)、[@BB0813](https://github.com/BB0813)

---

## 3. 提交规范

遵循[约定式提交规范 Conventional Commits v1.0.0](https://www.conventionalcommits.org/zh-hans/v1.0.0/)。

```
<type>(<scope>): <subject>

<body>

<footer>
```

- **type 必须用英文**（见下表）；subject 用英文祈使句，建议不超过 72 字符，结尾不加句号。
- **body 中英文均可，推荐英文**；解释"为什么"而非"做了什么"。
- **推荐（不强制）声明 AI 参与**：如认为合适，可在 footer 加一行 `Co-authored-by: AI Agent <ai-agent@users.noreply.github.com>`。GitHub 只认带邮箱的形式。
- 关联 issue 使用 `Closes #12` 或 `Refs #12`。

| type | 用途 |
| :-- | :-- |
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档变更 |
| `style` | 格式调整（不影响功能） |
| `refactor` | 重构（不加功能、不修 Bug） |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建 / 工具 / 依赖等辅助变更 |

示例：

```
feat: add user authentication module

Implement JWT-based login and registration flow.

Closes #12
Co-authored-by: AI Agent <ai-agent@users.noreply.github.com>
```

---

## 4. 分支与 PR

- 功能分支从最新的 `main` 切出，命名 `feat/<english-kebab-case>` 或 `fix/<english-kebab-case>`，例如 `feat/user-auth`、`fix/login-timeout`。分支名用**英文**。
- 一个分支只做一件事；PR 标题与分支首个 Commit 保持一致。
- **PR 必须经 Review 通过后才可合并**。核心成员可以亲自审查，也可以明确安排 Agent 审查。团队规范 6.4 列出的敏感改动——安全敏感改动（认证、授权、加密、密钥）、数据库 schema 与迁移、CI/CD 与 `.github/` 配置、依赖增删与锁文件、对外发布、大范围结构调整——须经核心成员审查，或由核心成员安排 Agent 代为审查。**审查不转移责任——PR 内容的责任始终由提交者承担。**
- **Agent 不得自行合并自己发起的 PR**，不得在审查要求未满足时合并，也不得未经授权关闭他人的 PR。Agent 留下的 Review 必须标明是 Agent 审查，不能冒充人类成员。另见 §7。
- 合并后及时删除已合并的功能分支。
- PR 描述写清四件事：改了什么、为什么改、如何验证、有何风险。

---

## 5. 代码规范

**通用原则**

1. 可读性优先——代码首先是写给人看的，其次才是机器执行的。
2. **修改现有代码时，风格向周围代码看齐**，不夹带风格迁移。
3. 注释解释"为什么"，不解释"做了什么"；避免无意义注释。

**命名**

| 类型 | 规范 | 示例 |
| :-- | :-- | :-- |
| 变量 / 函数 | camelCase | `userName`、`getUserInfo()` |
| 类 / 构造函数 | PascalCase | `UserService`、`ApiClient` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`、`API_BASE_URL` |
| 文件 / 文件夹 | kebab-case | `user-service.ts`、`components/` |
| 数据库表 / 字段 | snake_case | `user_profiles`、`created_at` |

**安全**

- 密钥走环境变量或密钥管理工具；发现泄露立即报告并轮换密钥。
- 用户输入必须校验与转义，防止注入攻击。
- 涉及用户数据的操作遵循最小权限原则；第三方依赖定期更新并关注安全公告。

---

## 6. 常用命令

> 下表为 DMHub 仓库（pnpm workspace）的真实命令，均可在仓库根目录执行。新增命令前请先确认其存在，不要凭空猜测。

| 用途 | 命令 |
| :-- | :-- |
| 安装依赖 | `pnpm install` |
| 本地启动 | `pnpm dev:server`（后端）/ `pnpm dev:web`（前端） |
| 构建 | `pnpm build`（`shared` → `dns-providers` → `web` → `server`） |
| 运行测试 | 仓库当前未配置测试脚本（各 package.json 均无 `test`），需要时先与人类成员确认方案 |
| Lint / 格式化 | `pnpm lint` / `pnpm format` |
| 类型检查 | `pnpm --filter @dmhub/shared build && pnpm --filter @dmhub/dns-providers build && pnpm --filter @dmhub/server build`（`tsc`）/ `pnpm --filter @dmhub/web exec vue-tsc --noEmit` |

Agent 在宣布任务完成前，**应实际运行与改动相关的测试和 lint**，并在汇报中给出真实输出；无法运行时明确说明原因与未覆盖范围，不得跳过或含糊带过。

---

## 7. 先问再做（Ask first）

以下操作须先向人类成员确认并得到明确答复后再执行：

- 新增、升级或移除依赖，改动锁文件
- 改动 CI/CD、发布流程、`.github/` 下的配置
- 引入 Git LFS，或修改 `.gitignore` 中与密钥相关的条目
- 改动数据库 schema 或执行数据迁移
- 大范围重命名、目录结构调整、批量删除文件
- 变更仓库可见性、创建新仓库、打版本标签
- 任何对外发布（npm / Docker / 应用商店 / 官网 / 生产环境）

---

## 8. 与团队规范的对应关系

| 团队规范条目 | 本文件落点 |
| :-- | :-- |
| 团队忌讳：图方便 / 省事 / 懒 | §1 红线 4、8；§7 |
| GitHub 仓库规范 | §1、§2、§3、§4 |
| 代码规范 | §1、§5 |
| 模型 API 使用规范 | §1 红线 2、3 |
| AI Agent 使用规范（第 6 章） | §1 红线 2、3；§7。工具清单与选用属人类决策，Agent 不自行选择或更换工具 |
| OOPz 使用规范 | 不适用 Agent（人类成员规范） |

---

## 9. 维护

- 依据《Fishpond Studio 团队规范》v1.1（2026-10-07）。
- 团队规范更新后同步更新本文件；**内容冲突时以团队规范原文为准**，并提 PR 修正本文件。
- 红线 1、4、8、9、10 的部分表述（破坏性操作、禁止伪造结果、禁止夹带改动、禁止署名不实）由团队精神推导而来，供维护者复核。

---

*最后更新：2026-10-07*
