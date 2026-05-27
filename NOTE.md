# AskTree — 树状学习工具

> 项目名: **AskTree**（Ask + Tree，在树上提问）
> 开源项目，英语命名，目标是直观、好记、可发现。

## 背景

用户在学习群论时，用 LLM（Gemini）阅读教程，遇到不懂的概念不断追问，导致：
- 问答混在一起，翻找困难
- 每个回答引出新问题，层层嵌套
- 本质上是**树状结构**的学习方式，但没有合适的工具支撑

## 核心理念（树状学习）

1. **根节点**：用户最初学习的文章（粘贴或读取 .md 文件）
2. **边（Edge）**：用户在父节点文章中选中文字（或留空）+ 提问，构成指向子节点的边
3. **子节点**：LLM 对问题的回答，本身也是一篇 Markdown 文章
4. **递归**：子节点文章中也可继续选中文字提问，产生孙节点，形成树的不断扩展
5. **终止**：用户完全读懂某个回答时，该节点不再有子节点

---

## 发布路线图

- **Phase 1: Web** — GitHub Pages 静态部署，零门槛
- **Phase 2: VS Code 插件** — 复用 core，上架 Marketplace
- **Phase 3: Chrome 扩展** — 需 $5 注册费 + 审核，最后做

## 架构决策

- **纯前端**：无需后端/服务器，用户填自己的 API key/Ollama 地址
- **数据走用户的 LLM endpoint**：不经过任何第三方
- **三层架构**：`@asktree/core`（TypeScript 纯逻辑）+ 三平台各自 React UI + 各自 StorageAdapter 实现

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| Core | TypeScript (单 npm 包) | 零 UI 依赖，树管理、LLM 通信、存储接口 |
| UI | React 18 | 三平台共用组件库 |
| Markdown | markdown-it + KaTeX | 渲染 Markdown + LaTeX 数学公式 |
| Sanitize | DOMPurify | XSS 防护，支持 MathML |
| Storage (Web) | IndexedDB | key-value 存 tree meta + 各 node content |
| Storage (VS Code) | 工作区文件系统 | `.asktree/` 目录读写（规划中） |
| Storage (Chrome) | IndexedDB | 同 Web（规划中） |
| LLM | OpenAI 兼容 + Ollama 原生 + Custom Gateway | 接口抽象，支持 DeepSeek / 自定义 endpoint |
| Build | pnpm monorepo, tsup, Vite | workspace 管理，Core 双格式输出 |
| Test | Vitest + Testing Library | 32+ 单测 |

---

## 数据模型

```
Node {
  id: string (UUID)
  title: string             // 节点标题
  type: "article" | "answer"
  status: "resolved" | "question"
  parentId: string | null
  children: Edge[]
  createdAt: timestamp
  // 不存 content — 分离到 .md 文件
}

Edge {
  id: string (UUID)
  sourceNodeId: string
  targetNodeId: string
  selectedText: string      // 选中原文（空字符串 = 自由提问）
  startPos: number
  endPos: number
  question: string
}
```

**存储方式（已实现）**：
- 元数据：`tree_meta` → IndexedDB object store
- 节点内容：`node_contents` → IndexedDB object store（nodeId → markdown string）
- 导出/导入：JSON bundle（tree.json + 所有 node content）

---

## Core API 设计

```
TreeStore
  createTree(rootContent, title)
  addChild(parentId, edge, content)
  getNode(id): Node
  getContent(id): string       // 从 StorageAdapter 读
  getPath(id): Node[]          // 根 → 该节点的路径
  removeNode(id)                // 级联删除子树
  updateStatus(id, status)
  serialize(): TreeJSON
  deserialize(json): TreeStore
  export(): Promise<Blob>      // .zip
  import(blob): Promise<TreeStore>

StorageAdapter (接口)
  readNodeContent(id): Promise<string>
  writeNodeContent(id, md): Promise<void>
  readTreeMeta(): Promise<TreeJSON>
  writeTreeMeta(json): Promise<void>

LLMService
  ask(question, context): Promise<string>
  configure(endpoint, apiKey, model)
  ── 实现: ollama.ts / openai-compat.ts
```

---

## UI 设计

### 布局
- **双向面板模式**：始终显示左右两栏（父-子关系），深入提问时面板整体左移
- **顶部路径条**：`📄 群论简介 → ❓ 代数结构？ → ❓ "环" 是什么？`，点击任意节点直接跳转
- **左侧树形导航（可折叠）**：展示完整树结构，当前节点高亮，点击跳转

### 交互流程（已实现）

1. 用户在任意面板中选中文字 → 下方出现浮动按钮 `🔍 Ask about "xxx"`
2. 点击浮动按钮（onMouseDown）→ 选中文字自动填入右侧底部，badge 显示引用
3. 无选中时也可在右侧输入框自由提问（Free ask）
4. **提问左面文章** → 答案出现在右面，左面保持不变
5. **提问右面答案** → 右面内容搬至左面，新答案显示在右面（面板左移）
6. 点击顶部路径条（BreadcrumbBar）→ 跳转至任意祖先节点，面板同步更新
7. 点击左侧树形导航 → 跳转至任意节点
8. Enter 发送提问，Shift+Enter 换行
9. 输入框自动增高（2 行起步，最高 10 行）

### 待实现

- [ ] 右侧面板关闭 → 链路右移，恢复父级视图（navigateUp 已有，缺少 UI 入口）
- [ ] 点击之前高亮过的文字 → 右侧立即显示对应回答
- [ ] 删除节点（级联删除子树）
- [ ] 节点间连线可视化
- [ ] 快捷键 Ctrl+Q 触发 Ask

### 提问触发
- **选中 + 浮动按钮**：快捷方式，自动填入上下文
- **右侧常驻输入框**：统一提问入口，有选中文字时带上下文，无选中时自由提问
- 左侧和右侧面板行为一致

### 节点管理
- 每个窗口标记 status: `resolved`（已理解）/ `question`（待解决）
- 支持删除节点（级联删除子树）
- 节点间连线：选中文字位置 → 右侧问题标题

---

## 标注汇总

- [x] 水平平铺 vs 双向面板 → **双向面板（方案 B）**
- [x] 提问输入位置 → **右侧栏底部输入常驻**
- [x] 选中触发方式 → **浮动按钮 + 右侧常驻输入框结合**
- [x] 导航方式 → **顶部路径条 + 左侧可折叠树形导航（方案 B）**
- [x] 数据存储 → **IndexedDB key-value**
- [x] 后端 → **纯前端，不需要**
- [x] Core 实现 → **TypeScript 单包**
- [x] UI 框架 → **React 18**
- [x] 项目名 → **AskTree**
- [x] 发布路线 → **Web (GitHub Pages) 已上线**
- [ ] VS Code 插件 — 规划中
- [ ] Chrome 扩展 — 规划中

---

## Prompt 配置设计

### 上下文收集策略

提问时沿祖先链向上收集上下文切片：

```
ContextSlice {
  nodeTitle: string
  selectedText: string      // 该层用户选中过的文字
  surrounding: string       // 选中文字前后各 N 字符的段落切片
  depth: number             // 距离当前问题的深度 (0 = 当前节点)
}
```

**默认配置**：
- `maxDepth: 3` — 向上最多爬 3 层祖先
- `contextRadius: [200, 100, 50]` — 第 0/1/2 层各取选中文字前后多少字符
  - 直接上下文(depth=0)：前 200 字 + 选中文字 + 后 200 字
  - 父节点(depth=1)：前 100 字 + 选中文字 + 后 100 字
  - 祖父节点(depth=2)：前 50 字 + 选中文字 + 后 50 字
  - 逐层递减，保证不溢出且相关

### 默认 Prompt 模板

```markdown
System: 你是一个帮助用户理解文章内容的学习助手。请基于提供的文章上下文，针对用户的问题给出清晰、结构化的解释。使用通俗易懂的语言，逐步深入。

User:
我正在学习以下文章，请基于上下文回答我的问题：

{ancestors}

---
{surrounding_text}
---

我对文中「{selected_text}」有疑问：

{user_question}
```

**占位符说明**：
- `{selected_text}` — 当前选中的文字
- `{surrounding_text}` — depth=0 的上下文切片（前后各 200 字）
- `{ancestors}` — depth=1..n 的上下文切片，从远到近排列
- `{full_article}` — 当前节点的完整文章（可选，由 `includeFullArticle` 开关控制）
- `{root_title}` — 根节点标题
- `{path_summary}` — 从此节点到根的路径摘要

用户可在 Settings 中完全自定义 template 和 context 参数。

---

## React 组件树

```
<ErrorBoundary>                  — Crash 保护，显示错误信息
└── <App>                        — TreeStore context + LLM config
    ├── <AppHeader>              — Import/Export/Settings buttons
    ├── <AppBody>                — 三栏布局
    │   ├── <TreeSidebar>        — 左侧可折叠树形导航
    │   └── <MainArea>
    │       ├── <BreadcrumbBar>  — 顶部路径条
    │       └── <DualPanel>      — 左右分屏核心交互
    │           ├── <MarkdownPane> (左) — 父节点文章，支持选中+浮动按钮
    │           ├── <MarkdownPane> (右) — 子节点答案，支持选中+浮动按钮
    │           └── <QuestionInputBar> — 右栏底部多行输入（Enter 发送）
    └── <SettingsModal>          — LLM 配置 (Ollama/DeepSeek/Gateway) + Prompt 模板
```

### 数据流向

```
User Action         →  React State          →  TreeStore / LLM
选中文字             →  setSelectedText()     →  (保留在 context state)
点击浮动按钮          →  selectedText context  →  右侧 badge 显示 + placeholder 更新
发送提问             →  setIsAsking(true)     →  LLMService.ask() → addChildNode(questionedNodeId, …)
收到回答             →  activePath 新增子节点  →  右侧面板显示答案
点击路径条/侧栏       →  navigateTo(nodeId)    →  setActivePath() ← store.getPath()
加载新文件            →  resetTree() + createRootTree() → IndexedDB 清空 + 写入
```

## 组件状态（TreeContext）

| State | Type | 说明 |
|-------|------|------|
| `activePath` | Node[] | 当前路径节点链（根→当前） |
| `selectedText` | {text, start, end, nodeId} \| null | 当前选中的文字及所属节点 |
| `promptConfig` | PromptConfig | Prompt 模板 + context 参数 |
| `isLoading` | boolean | 初始加载状态 |

### 本地 State（DualPanel）
| State | Type | 说明 |
|-------|------|------|
| `parentContent` | string \| null | 左侧父节点 Markdown 内容 |
| `childContent` | string \| null | 右侧子节点 Markdown 内容（无子节点时为 null） |
| `isAsking` | boolean | 正在等待 LLM 回答 |
| `error` | string \| null | 错误消息 |

## 文档索引

- [英文 README](./README.md)
- [实现计划](./docs/superpowers/plans/2026-05-26-asktree-plan.md)
