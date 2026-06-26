

# 📄 MD Live Viewer

**Markdown 桌面预览器** —— 基于 Tauri v2 + CodeMirror 6 的跨平台 Markdown 编辑与 DOCX 导出工具。

网址：https://jayneena.github.io/md-previewer/

### 📖 简介

MD Live Viewer 是一款面向桌面端的 Markdown 文档工具，支持实时预览、代码编辑、图表渲染以及带自定义模版的 DOCX 导出。专为重度阅读、轻量编辑及规范文档输出的用户设计。

### ✨ 功能特性

- **📂 文件管理** — 拖拽或点击打开 `.md` 文件，支持多文件侧边栏切换
- **✏️ 实时编辑** — 基于 CodeMirror 6 的 Markdown 编辑器，支持语法高亮、自动换行

<img width="2559" height="1527" alt="e88" src="https://github.com/user-attachments/assets/deceaf3e-c5ad-4343-8f8b-aff2dbd0bb04" />


- **👁️ 即时预览** — 基于 marked + highlight.js 的实时渲染，支持 GFM 扩展语法

<img width="2559" height="1527" alt="eg3" src="https://github.com/user-attachments/assets/66436c71-ccfe-4582-81dd-59ef13e67a05" />
<img width="2559" height="1527" alt="eg4" src="https://github.com/user-attachments/assets/ffd349fd-f796-4942-aaec-2bfb4bd04383" />


- **📊 图表渲染** — 支持 Mermaid 流程图、时序图、甘特图等，以及 Cytoscape 网络图

<img width="2559" height="1527" alt="eg5" src="https://github.com/user-attachments/assets/880eeb44-b95e-42ca-9c20-b6ce357db7b6" />


- **🌓 主题切换** — 深色/浅色编辑主题一键切换
- **📄 DOCX 导出** — 支持选择 Word 模版（.docx）进行样式化导出

<img width="2559" height="1527" alt="eg6" src="https://github.com/user-attachments/assets/0b8512a5-d4cf-4470-bdf4-fbff4451196b" />


- **🔤 代码高亮** — 支持 JavaScript、Python、Java、CSS、HTML、JSON 等多语言代码块
- **📑 表格增强** — 表格自动合并、表头灰色背景


### 🏗 技术栈

| 层     | 技术                                |
|--------|-------------------------------------|
| 框架   | Tauri v2 + Vite 6                   |
| 前端   | Vanilla JS + CSS                    |
| 编辑器 | CodeMirror 6                        |
| Markdown | marked + highlight.js + mermaid   |
| DOCX   | docx.js + JSZip                     |
| 后端   | Rust（文件读写 + 单实例管理）        |
| 系统   | Windows（WebView2）/ macOS（WKWebView） |

### 📂 项目结构

```
md-previewer/
├── src/                  # 前端源码
│   ├── main.js           # 应用主入口
│   ├── editor.js         # CodeMirror 编辑器模块
│   ├── preview.js        # Markdown 预览模块
│   ├── export.js         # DOCX 导出模块
│   └── style.css         # 全局样式
├── src-tauri/            # Rust 后端
│   ├── src/
│   │   ├── lib.rs        # Tauri 应用入口 + 命令
│   │   └── main.rs       # Windows 子系统配置
│   └── tauri.conf.json   # Tauri 配置
├── index.html            # 入口 HTML
└── package.json          # 前端依赖
```

### 📝 依赖

| 包名 | 用途 |
|------|------|
| codemirror | 代码编辑器 |
| marked | Markdown 解析 |
| highlight.js | 代码语法高亮 |
| mermaid | 图表渲染 |
| docx / jszip | DOCX 文档生成 |
| dompurify | HTML 安全过滤 |
| @tauri-apps/* | Tauri API 绑定 |

