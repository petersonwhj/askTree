[English](README.md) | **简体中文**

# AskTree

**把任何一篇文章,变成一棵可以不断追问的问题树。**

AskTree 是一个本地优先的学习工具。载入一篇 Markdown 文章,划出你看不懂的那句话,直接提问。答案会变成一页新的内容 —— 你可以在它里面继续划词、继续追问。每一条分支都是一条追问的线索,这棵树能长多深,取决于你的好奇心。

没有服务器、没有账号、没有埋点。文章、回答和整棵树都存在你的浏览器里(IndexedDB),用哪个大模型也由你决定。

---

## 为什么做这个

**只读是被动的,会问才是主动的。**
大多数人刷完一篇文章,遇到一句看不懂的话,就滑过去了。AskTree 让这个瞬间变得有产出:选中那句话,问一句「为什么」,得到一段紧贴你正在读的文本的解释。

**每个答案都是新的起点。**
不像聊天窗口里每个问题彼此孤立,AskTree 把整条学习路径保留成一棵树 —— 你随时能看到自己从哪来、还有什么没弄明白。

**结构本身就是理解的痕迹。**
当你真的想通了,把这一页标成 `resolved`。侧边栏就成了你思考过程的map。

---

## 功能

**对着原文提问**
- 选中任意一段 → 点击浮窗按钮 → 大模型以新子页的形式回答。
- 回答本身就是完整的 Markdown 页面 —— 在回答里继续划词、继续往下追。
- **自由提问**(未选中文本):用 **◀ 左 / 右 ▶** 选择这个问题是针对哪一页的。

**不知道该问什么的时候**
- 点击 **💡**,针对当前这段内容给出三个建议问题。
- **↻** 换一批,**✕** 关掉,**?** 查看实际用到的 prompt。

**看清到底发了什么**
- 标题旁的 **?** 会展开 **Prompt Debug**:生成这一页时用的完整 SYSTEM/USER 文本。
- Prompt 模板可以在设置里编辑,包括建议问题的模板。

**阅读连续性**
- 每一页的阅读位置会被记住,回来时自动恢复。
- 已经问过的段落会有一道淡下划线;当前的选区高亮优先。
- 如果这一页来自某段被引用的选区,左栏会自动滚动到那段引用。

**一切都可带走**
- 任意页面 **复制 Markdown** / **下载 .md**。
- **Export Tree / Import Tree** 把整棵树导出或导入为 JSON。

**自带模型**
- **Ollama**(本地,免 Key)、**OpenAI 兼容**(默认 DeepSeek,自动开启思考模式)、**Anthropic 兼容**。
- 错误信息可读(鉴权、限流、网络、返回格式异常),并对安全请求做重试。

**认识数学公式**
- 通过 KaTeX 支持行内与独立公式。
- 公式可以像普通文本一样被选中、提问。

---

## 快速开始(本地)

环境要求:**Node 18+** 和 **pnpm**。

```bash
git clone git@github.com:petersonwhj/askTree.git
cd askTree
pnpm install
pnpm dev
```

打开 **http://localhost:5173/askTree/** —— 注意有 `/askTree/` 这个 base 路径。

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动开发服务器(Vite) |
| `pnpm test` | 运行单元测试(Vitest) |
| `pnpm test:watch` | 改动时自动重跑测试 |
| `pnpm lint` | 类型检查 core + web |
| `pnpm build` | 构建 `@asktree/core` 和 web 应用 |
| `pnpm deploy` | 构建并发布到 GitHub Pages |

---

## 配置大模型

打开头部的 **Settings(设置)**:

| Provider | 默认 Endpoint | 默认模型 | 是否需要 Key |
| --- | --- | --- | --- |
| 🖥️ Ollama | `http://localhost:11434` | `llama3` | 不需要 |
| ☁️ OpenAI Compatible API | `https://api.deepseek.com` | `deepseek-flash` | 需要 |
| 🧠 Anthropic Compatible API | `https://api.anthropic.com` | `claude-sonnet-4-6` | 需要 |

切换 provider 只是一个草稿 —— 按下 **Save** 才会真正保存,**Cancel** 会丢弃修改。

**CORS / 网关(开发环境):** 如果你的 endpoint 拒绝浏览器的跨域请求,在 `.env.local` 里设置 `LLM_PROXY_TARGET`(参考 `.env.local.example`)。以 `/llm-` 开头的请求会被代理转发,并去掉浏览器带来的 `Origin`/`Referer` 头。

---

## 怎么用

1. **开始一棵树** —— 粘贴 Markdown 后点 *Start Learning*,点 📂 选择文件,或者直接把 `.md` 拖进来。仓库自带一篇文章示例:`apps/web/public/samples/gemini-sample.md`。
2. **提问** —— 选中文本,点浮窗 **Ask about "…"**,输入问题,按 **Send**(Enter 发送,Shift+Enter 换行)。
3. **往下钻** —— 回答会在右侧作为新节点打开;在回答里继续划词就能追问。
4. **善用辅助** —— 💡 获取建议问题,标题旁的 **?** 查看实际 prompt。
5. **保持方向感** —— 侧边栏是整棵树,面包屑是当前路径,`→` 可以把节点平移,方便和父页面对照阅读。
6. **记录理解进度** —— 弄懂一页后,把它标成 `resolved`。

---

## 隐私

AskTree 是纯前端应用。你的文章、问题、回答和整棵树都留在浏览器的 IndexedDB 里。唯一的外发请求就是你配置的那个大模型接口。没有服务器、没有账号、没有埋点。

---

## 架构

```
askTree/
├── packages/core/   # @asktree/core —— 零依赖 TypeScript 逻辑
│   └── src/         #   TreeStore、LLMService、prompt 构建、存储适配器
├── apps/web/        # @asktree/web —— Vite + React 应用
│   └── src/         #   UI 组件、IndexedDB 适配器、Markdown 渲染
└── tests/           # Vitest 测试(core + web)
```

| 层 | 技术 |
| --- | --- |
| 语言 | TypeScript(strict) |
| 构建 | tsup(core)· Vite(web) |
| UI | React 18 |
| Markdown / 数学 | markdown-it + KaTeX(DOMPurify 消毒) |
| 存储 | IndexedDB |
| 大模型 | Ollama · OpenAI 兼容 · Anthropic 兼容 |
| 测试 | Vitest + Testing Library |

---

## 部署

```bash
pnpm deploy
```

会构建应用并把 `apps/web/dist` 发布到 `gh-pages` 分支。构建时 base 为 `/askTree/`,因此线上地址是 `https://<user>.github.io/askTree/`。

---

## Roadmap

- [x] **Web** —— 纯前端应用,GitHub Pages 部署
- [ ] **VS Code** —— 复用 `@asktree/core` 的插件
- [ ] **Chrome** —— 浏览器剪藏插件
- [ ] **导入** —— DOCX / PDF,并给出明确提示

---

## License

MIT
