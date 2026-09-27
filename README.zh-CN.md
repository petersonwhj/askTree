[English](README.md) | **简体中文**

# AskTree

**把任何一篇文章,变成一棵可以不断追问的问题树。**

AskTree 是一个本地优先的学习工具。载入一篇 Markdown、Word 或 PDF 文档:划出看不懂的那句话、在 PDF 上框出一块、或贴一张图片 —— 然后提问。答案会变成一页新的内容 —— 你可以在它里面继续划词、继续追问。每一条分支都是一条追问的线索,这棵树能长多深,取决于你的好奇心。

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

**同时管理多篇文档**
- 侧边栏是一整片森林:每篇文档一行,可展开/收缩。可切换、重命名、导出或删除文档;每个回答与阅读位置都跟随各自的文档。

**支持 Markdown、Word 与 PDF**
- 可打开 `.md`、`.markdown`、`.txt`、`.docx` 或 `.pdf`。Word 文档在导入时转成 Markdown(标题、列表、表格、内嵌图片),之后就和普通文档一样。

**对着图片提问**
- 在提问栏粘贴图片(Ctrl+V)或选择文件,然后提问。图片会发给支持视觉的模型,并随回答一起保存 —— 下次打开还在。
- 点击任意缩略图(提问栏里的、或回答页上的)可查看大图。

**阅读 PDF,对局部提问**
- 可翻页、按页码跳转、缩放、以及「适合宽度」。
- 在页面上拖一个框,点 **Ask about this**:这张截图会连同**当前页与前后页**一起发给支持视觉的模型,让它看到周围上下文。
- 截图随回答保存;PDF 存在你的浏览器里,导出时一并带走:小文件导出 JSON,超过 10MB 打包为 `.zip`。扫描版(含 JBIG2)可正常渲染;无法解码的页会给出提示,而不是显示成白页。

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
| `pnpm test:e2e` | 运行浏览器端到端测试(Playwright) |
| `pnpm lint` | 类型检查 core、web 和扩展 |
| `pnpm build` | 构建 `@asktree/core` 和 web 应用 |
| `pnpm plugin` | 构建 Chrome 扩展,产物在 `apps/extension/dist` |
| `pnpm deploy` | 构建并发布到 GitHub Pages |

端到端测试会驱动真实浏览器:先执行一次 `pnpm exec playwright install chromium` 安装。PDF 支持依赖 pdf.js 的 WASM 解码器、CMap 与 worker;`pnpm dev` 与 `pnpm build` 会把它们自动复制到 `public/pdfjs/`(由固定版本的 `pdfjs-dist` 重新生成,不提交进仓库)。

---

## Chrome 扩展

AskTree 也提供了 Chrome 扩展(Manifest V3):点击工具栏图标,当前页面就会被剪藏到一个**新的 AskTree 标签页**。

- **网页文章**:提取为 Markdown(Defuddle + Turndown),作为新文档打开。
- **直接打开的 PDF**(`https://…/paper.pdf`):抓取后作为 PDF 文档打开,可阅读、可框选提问。
- 每次点击都会新开一个标签页,因此可以连续剪藏多个页面而不丢当前进度。

### 安装(从 Release 下载)

1. 到 [Releases](https://github.com/petersonwhj/askTree/releases) 下载 **`askTree-extension-v0.5.0.zip`**。
2. 解压到一个固定目录。
3. 打开 `chrome://extensions`,开启 **开发者模式**,点 **加载已解压的扩展程序**,选择解压后的文件夹。

### 从源码构建

```bash
pnpm install
pnpm plugin        # → apps/extension/dist
```

然后同样以"加载已解压的扩展程序"选择 `apps/extension/dist`。(Windows + WSL 环境下,`pnpm plugin:win` 还会把产物复制到 Chrome 能访问的目录。)

### 说明

- 扩展是同一个应用、运行在它自己的源(origin)下,因此拥有**独立的森林**,与网页版互不相通。用 **Export Tree / Import Tree** 在两者之间搬运文档。
- 大模型需要在扩展自己的标签页里配置(Settings),和网页版一样。
- 扩展只能读取 `http(s)` 地址。**本地文件**(`file://…`)任何扩展都读不了 —— 请改用 AskTree 里的 **📂** 按钮打开。

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

1. **开始一棵树** —— 粘贴 Markdown 后点 *Start Learning*,点 📂 打开 `.md`、`.docx` 或 `.pdf` 文件,或者直接拖进来。仓库自带一篇文章示例:`apps/web/public/samples/gemini-sample.md`。
2. **提问** —— 选中文本,点浮窗 **Ask about "…"**,输入问题,按 **Send**(Enter 发送,Shift+Enter 换行)。想对图片提问,先粘贴图片(Ctrl+V)或点提问栏里的 **附件**。
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
├── apps/extension/  # @asktree/extension —— Chrome(MV3)剪藏扩展
│   └── src/         #   service worker、content script、PDF 抓取、剪藏交接
└── tests/           # Vitest 测试(core + web + 扩展)
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
- [x] **导入** —— Word(.docx)转 Markdown;PDF 直接阅读 + 框选提问;无法解码的页会提示
- [x] **Chrome** —— 网页剪藏(页面经 Defuddle/Turndown 转 Markdown)+ 直链 PDF 导入;以「解压加载」的扩展形式发布
- [ ] **VS Code** —— 复用 `@asktree/core` 的插件

---

## License

MIT
