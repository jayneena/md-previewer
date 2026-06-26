# 📄 MD Live Viewer

**Markdown 桌面预览器** —— 基于 Tauri v2 + CodeMirror 6 的跨平台 Markdown 编辑与 DOCX 导出工具。

English version below. [English](#-english)

---

## 中文介绍

### 📖 简介

MD Live Viewer 是一款面向桌面端的 Markdown 文档工具，支持实时预览、代码编辑、图表渲染以及带自定义模版的 DOCX 导出。适用于技术文档编写、报告生成、笔记管理等场景。

### ✨ 功能特性

- **📂 文件管理** — 拖拽或点击打开 `.md` 文件，支持多文件侧边栏切换
- **✏️ 实时编辑** — 基于 CodeMirror 6 的 Markdown 编辑器，支持语法高亮、自动换行
- **👁️ 即时预览** — 基于 marked + highlight.js 的实时渲染，支持 GFM 扩展语法
- **📊 图表渲染** — 支持 Mermaid 流程图、时序图、甘特图等，以及 Cytoscape 网络图
- **🌓 主题切换** — 深色/浅色编辑主题一键切换
- **📄 DOCX 导出** — 支持选择 Word 模版（.docx）进行样式化导出
- **🔤 代码高亮** — 支持 JavaScript、Python、Java、CSS、HTML、JSON 等多语言代码块
- **📑 表格增强** — 表格自动合并、表头灰色背景

### 🚀 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建发布版
npm run tauri build
```

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

### ⚠️ 注意事项

- **Windows 中文输入法**：WebView2 Runtime 149 版本存在 IME 焦点 Bug，如遇到中文输入异常，按 `Ctrl+Shift+I` 打开 DevTools 后点击编辑器即可修复
- **macOS 构建**：需在 Mac 电脑上执行 `npm run tauri build`

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

---

## 🇬🇧 English

### 📖 Overview

MD Live Viewer is a cross-platform desktop Markdown tool built with **Tauri v2** and **CodeMirror 6**. It features live preview, code editing, diagram rendering, and template-based DOCX export — ideal for technical writing, report generation, and note-taking.

### ✨ Features

- **📂 File Management** — Drag-and-drop or dialog to open `.md` files; multi-file sidebar tabs
- **✏️ Live Editing** — CodeMirror 6 Markdown editor with syntax highlighting and line wrapping
- **👁️ Instant Preview** — Real-time Markdown rendering via marked + highlight.js, GFM support
- **📊 Diagrams** — Mermaid (flowcharts, sequence, Gantt) and Cytoscape network graphs
- **🌓 Theme Toggle** — Switch between dark and light editor themes
- **📄 DOCX Export** — Export with custom Word templates (.docx)
- **🔤 Code Blocks** — Highlighting for JS, Python, Java, CSS, HTML, JSON, and more
- **📑 Enhanced Tables** — Auto-merge rows, gray header background

### 🚀 Quick Start

```bash
npm install
npm run tauri dev    # Development
npm run tauri build  # Production build
```

### 🏗 Tech Stack

| Layer       | Technology                           |
|-------------|--------------------------------------|
| Framework   | Tauri v2 + Vite 6                    |
| Frontend    | Vanilla JS + CSS                     |
| Editor      | CodeMirror 6                         |
| Markdown    | marked + highlight.js + mermaid      |
| DOCX        | docx.js + JSZip                      |
| Backend     | Rust (file I/O, single-instance)     |
| Platform    | Windows (WebView2) / macOS (WKWebView) |

### 📂 Project Structure

```
md-previewer/
├── src/                  # Frontend source
│   ├── main.js           # App entry point
│   ├── editor.js         # CodeMirror editor
│   ├── preview.js        # Markdown preview
│   ├── export.js         # DOCX export
│   └── style.css         # Global styles
├── src-tauri/            # Rust backend
│   ├── src/
│   │   ├── lib.rs        # Tauri app setup + commands
│   │   └── main.rs       # Windows subsystem config
│   └── tauri.conf.json   # Tauri configuration
├── index.html            # Entry HTML
└── package.json          # Frontend deps
```

### ⚠️ Notes

- **Windows IME Issue**: WebView2 Runtime 149 has a known IME focus bug. Press `Ctrl+Shift+I` to open DevTools, then click the editor to fix Chinese input
- **macOS Build**: Run `npm run tauri build` on a Mac

### 📝 Dependencies

| Package | Purpose |
|---------|---------|
| codemirror | Code editor |
| marked | Markdown parser |
| highlight.js | Syntax highlighting |
| mermaid | Diagram rendering |
| docx / jszip | DOCX generation |
| dompurify | HTML sanitization |
| @tauri-apps/* | Tauri API bindings |
