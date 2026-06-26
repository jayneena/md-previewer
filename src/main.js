// 应用主入口模块
// 负责 UI 事件绑定、文件管理、拖拽、侧边栏、缩放、导出等核心交互

import "./style.css";
import { open, save } from "@tauri-apps/plugin-dialog";
import { initEditor, getEditorContent, destroyEditor, isEditorInitialized, setEditorContent, setCtrlClickCallback, scrollToText, toggleEditorTheme } from "./editor.js";
import { renderPreview, applyHighlight } from "./preview.js";
import { exportToDocxWithTemplate } from "./export.js";

// DOM 元素引用
const previewArea = document.getElementById("previewArea");
const fileInfoSpan = document.getElementById("fileInfoDisplay");
const openFileBtn = document.getElementById("openFileBtn");
const editToggleBtn = document.getElementById("editToggleBtn");
const saveBtn = document.getElementById("saveBtn");

const clearBtn = document.getElementById("clearViewBtn");
const exampleBtn = document.getElementById("exampleBtn");
const selectTemplateBtn = document.getElementById("selectTemplateBtn");

const themeToggleBtn = document.getElementById("themeToggleBtn");
const toastEl = document.getElementById("toastMsg");
const previewWrapper = document.getElementById("previewWrapper");
const editorWrapper = document.getElementById("editorWrapper");
const editorContainer = document.getElementById("editorContainer");

const exportModal = document.getElementById("exportModal");
const modalTemplateName = document.getElementById("modalTemplateName");
const modalExportPath = document.getElementById("modalExportPath");
const modalExportName = document.getElementById("modalExportName");
const modalBrowseBtn = document.getElementById("modalBrowseBtn");
const modalConfirmBtn = document.getElementById("modalConfirmBtn");
const modalCancelBtn = document.getElementById("modalCancelBtn");

// 应用状态
let currentMarkdownText = null;      // 当前显示的 Markdown 原文
let currentFileName = null;          // 当前文件名
let currentFilePath = null;          // 当前文件路径
let isEditMode = false;              // 是否处于编辑模式
let fileList = [];                   // 文件列表 [{path, fileName, content}]
let activeFileIndex = -1;            // 当前激活文件索引
let sidebarVisible = true;           // 侧边栏可见性
let sidebarAuto = true;              // 侧边栏自动折叠模式（单文件时自动隐藏）
let dragCounter = 0;                 // 拖拽进入/离开计数器
let debounceTimer = null;            // 防抖定时器
let cachedPreviewHtml = null;        // 缓存的预览 HTML（未使用）
let templateFilePath = null;         // DOCX 模版文件路径
let templateFileData = null;         // DOCX 模版二进制数据
let fontSizeEditor = 18;             // 编辑器字号（px）
let fontSizePreview = 18;            // 预览区字号（px）

// 显示 Toast 消息
function showToast(message, duration = 1800) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.style.opacity = "1";
  if (window.toastTimeout) clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => {
    if (toastEl) toastEl.style.opacity = "0";
  }, duration);
}

// HTML 转义（防止 XSS）
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 防抖渲染预览（400ms 延迟）
function debouncePreview(markdownText) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    cachedPreviewHtml = renderPreview(markdownText);
  }, 400);
}

// 渲染 Markdown 到预览区，支持空内容/错误状态
function renderPreviewView(markdownText, fileName = null) {
  currentMarkdownText = markdownText;

  if (!markdownText || markdownText.trim() === "") {
    previewArea.innerHTML = `<div class="empty-guide"><div class="big-icon">📭</div><h3>空文档内容</h3><p>文件没有任何内容，请检查源文件</p></div>`;
    if (fileName) fileInfoSpan.innerHTML = `📄 ${fileName} (空内容)`;
    else fileInfoSpan.innerHTML = "📭 未打开文件";
    return;
  }

  try {
    const html = renderPreview(markdownText);
    previewArea.innerHTML = html;
    if (fontSizePreview !== 18) previewArea.style.fontSize = fontSizePreview + "px";
    applyHighlight(previewArea);

    if (fileName) {
      currentFileName = fileName;
      let displayName = fileName.length > 48 ? fileName.slice(0, 44) + "…" : fileName;
      fileInfoSpan.innerHTML = `📄 ${displayName}`;
    } else if (currentFileName) {
      fileInfoSpan.innerHTML = `📄 ${currentFileName}`;
    } else {
      fileInfoSpan.innerHTML = "📭 未打开文件";
    }
  } catch (err) {
    console.error("preview render error:", err);
    previewArea.innerHTML =
      `<div class="empty-guide"><div class="big-icon">⚠️</div><h3>解析失败</h3><p>Markdown 语法解析出错</p><code style="background:#f0f0f0;padding:4px 8px;border-radius:8px;">${escapeHtml(err.message || "未知错误")}</code></div>`;
    showToast("❌ 解析失败: " + (err.message || "格式错误"), 2000);
    if (fileName) fileInfoSpan.innerHTML = `⚠️ ${fileName} (解析错误)`;
  }
}

// 将内容写入文件（通过 Tauri 后端 API）
async function saveFile(content) {
  const invoke = window.__TAURI_INTERNALS__?.invoke;
  if (!invoke) {
    showToast("无法保存: Tauri API 不可用", 2500);
    return false;
  }

  let path = currentFilePath;
  if (!path || path.startsWith("__drag__")) {  // 拖拽文件没有真实路径，需弹另存为对话框
    try {
      path = await save({
        filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] }],
        defaultPath: currentFileName || "untitled.md",
      });
      if (!path) return false;
    } catch (err) {
      showToast("保存对话框失败: " + (err?.message || String(err)), 2500);
      return false;
    }
  }

  try {
    await invoke("write_file_content", { path, content });
    currentFilePath = path;
    if (activeFileIndex >= 0) fileList[activeFileIndex].path = path;
    showToast("✅ 文件已保存", 1200);
    return true;
  } catch (err) {
    showToast("❌ 保存失败: " + (err?.message || String(err)), 2500);
    return false;
  }
}

// 切换到编辑模式（CodeMirror），保留预览滚动比例
function switchToEditMode(targetText) {
  if (isEditMode) return;

  if (!currentMarkdownText || currentMarkdownText.trim() === "") {
    showToast("请先打开一个 Markdown 文件", 2000);
    return;
  }

  const savedRatio = previewWrapper.scrollHeight > previewWrapper.clientHeight
    ? previewWrapper.scrollTop / (previewWrapper.scrollHeight - previewWrapper.clientHeight) : 0;

  previewWrapper.style.display = "none";
  editorWrapper.style.display = "flex";
  editorWrapper.classList.add("editor-wrapper");

  initEditor(editorContainer, currentMarkdownText);
  setCtrlClickCallback((text) => {
    switchToPreviewMode(text);
  });
  isEditMode = true;
  editToggleBtn.textContent = "👁️ 预览";
  editToggleBtn.classList.add("btn-active");
  saveBtn.style.display = "inline-block";
  themeToggleBtn.style.display = "inline-block";


  requestAnimationFrame(() => {
    if (targetText && scrollToText(targetText)) return;
    const ev = document.querySelector("#editorContainer .cm-scroller");
    if (ev) {
      if (fontSizeEditor !== 18) ev.style.fontSize = fontSizeEditor + "px";
      if (ev.scrollHeight > ev.clientHeight) {
        ev.scrollTop = Math.round(savedRatio * (ev.scrollHeight - ev.clientHeight));
      }
    }
  });

  showToast("✏️ 编辑模式", 800);
}

// 切换到预览模式，保存编辑器内容，恢复滚动位置
async function switchToPreviewMode(targetText) {
  let savedRatio = 0;
  if (isEditMode) {
    const dom = document.querySelector("#editorContainer .cm-scroller");
    if (dom && dom.scrollHeight > dom.clientHeight) {
      savedRatio = dom.scrollTop / (dom.scrollHeight - dom.clientHeight);
    }
  }

  if (!isEditMode && isEditorInitialized()) {
    destroyEditor();
  }

  if (isEditMode && isEditorInitialized()) {
    const content = getEditorContent();
    currentMarkdownText = content;
    if (activeFileIndex >= 0) fileList[activeFileIndex].content = content;

    if (currentFilePath) {
      await saveFile(content);
    }

    destroyEditor();
  }

  editorWrapper.style.display = "none";
  previewWrapper.style.display = "flex";
  isEditMode = false;
  editToggleBtn.textContent = "✏️ 编辑";
  editToggleBtn.classList.remove("btn-active");
  saveBtn.style.display = "none";
  themeToggleBtn.style.display = "none";


  if (currentMarkdownText) {
    try {
      const html = renderPreview(currentMarkdownText);
      previewArea.innerHTML = html;
      applyHighlight(previewArea);
      requestAnimationFrame(() => {
        if (fontSizePreview !== 18) previewArea.style.fontSize = fontSizePreview + "px";
        if (targetText) {
          const target = Array.from(previewArea.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, td, th, pre, blockquote")).find(
            el => el.textContent.trim().includes(targetText.slice(0, 30))
          );
          if (target) { previewWrapper.scrollTop = Math.max(0, target.offsetTop - 40); return; }
        }
        if (savedRatio > 0 && previewWrapper.scrollHeight > previewWrapper.clientHeight) {
          previewWrapper.scrollTop = Math.round(savedRatio * (previewWrapper.scrollHeight - previewWrapper.clientHeight));
        }
      });
    } catch (err) {
      console.error("preview error:", err);
    }
  }

  showToast("👁️ 预览模式", 800);
}

// 编辑/预览模式切换入口
function toggleEditPreview() {
  if (isEditMode) {
    switchToPreviewMode();
  } else {
    switchToEditMode();
  }
}

// 通过浏览器 File API 读取本地文件并预览（拖拽场景）
function readAndPreviewFile(file) {
  if (!file) return;
  const fileName = file.name;
  const ext = fileName.lastIndexOf(".") > -1 ? fileName.substring(fileName.lastIndexOf(".") + 1).toLowerCase() : "";
  if (!["md", "markdown", "mdown", "mkd"].includes(ext)) {
    showToast(`⚠️ 不支持的文件类型: .${ext || "无扩展名"}`, 2300);
    return;
  }

  if (isEditMode) {
    switchToPreviewMode();
  }

  previewArea.innerHTML = `<div class="empty-guide"><div class="big-icon">⏳</div><h3>加载中...</h3><p>正在读取 ${escapeHtml(fileName)}</p></div>`;
  fileInfoSpan.innerHTML = `📂 ${escapeHtml(fileName)} (读取中)`;

  const reader = new FileReader();
  reader.onload = function (evt) {
    const content = evt.target.result;
    if (content && content.length > 10 * 1024 * 1024) {
      showToast(`文件较大 (${(content.length / 1024 / 1024).toFixed(1)}MB)，渲染可能稍慢`, 2000);
    }
    if (isEditMode) switchToPreviewMode();
    addFileToList(null, fileName, content);
    showToast(`✅ 已加载: ${fileName}`, 1200);
  };
  reader.onerror = function () {
    previewArea.innerHTML = `<div class="empty-guide"><div class="big-icon">📛</div><h3>读取失败</h3><p>无法读取文件，可能是权限或编码问题</p></div>`;
    fileInfoSpan.innerHTML = `❌ 读取失败: ${escapeHtml(fileName)}`;
    showToast("读取文件失败，请重试", 1800);
  };
  reader.readAsText(file, "UTF-8");
}

// 打开系统文件选择对话框（支持多选）
async function openFileDialog() {
  if (isEditMode) {
    switchToPreviewMode();
  }
  try {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] }],
    });
    if (selected && selected.length > 0) {
      for (const filePath of selected) {
        await readAndPreviewFileByPath(filePath);
      }
    } else {
      showToast("未选择文件", 1000);
    }
  } catch (err) {
    showToast("打开对话框失败: " + (err?.message || String(err)), 2500);
  }
}

// 通过 Tauri 后端 API 读取文件内容并预览
async function readAndPreviewFileByPath(filePath) {
  const invoke = window.__TAURI_INTERNALS__?.invoke;
  if (!invoke) {
    showToast("Tauri API 不可用", 2500);
    return;
  }
  try {
    const content = await invoke("read_file_content", { path: filePath });
    const parts = filePath.replace(/\\/g, "/").split("/");
    const fileName = parts[parts.length - 1];
    if (isEditMode) switchToPreviewMode();
    addFileToList(filePath, fileName, content);
    showToast(`✅ 已加载: ${fileName}`, 1200);
  } catch (err) {
    showToast("❌ 读取失败: " + (err?.message || String(err)), 2500);
  }
}

// 保存按钮处理函数
async function handleSave() {
  if (!isEditMode) {
    showToast("当前不在编辑模式", 1000);
    return;
  }
  const content = getEditorContent();
  currentMarkdownText = content;
  if (activeFileIndex >= 0) fileList[activeFileIndex].content = content;
  await saveFile(content);
}

// 打开导出确认弹窗
function showExportModal(fileName) {
  modalTemplateName.textContent = fileName;
  // 默认路径：与 md 文件同目录
  let dir = "";
  if (currentFilePath) {
    dir = currentFilePath.replace(/[/\\][^/\\]+$/, "");
  }
  const baseName = (currentFileName || "untitled").replace(/\.(md|markdown|mdown|mkd)$/i, "");
  modalExportPath.value = dir;
  modalExportName.value = `${baseName}.docx`;
  exportModal.style.display = "flex";
}

function hideExportModal() {
  exportModal.style.display = "none";
}

// 浏览按钮：选择保存位置
modalBrowseBtn.addEventListener("click", async () => {
  const selected = await save({
    filters: [{ name: "Word 文档", extensions: ["docx"] }],
    defaultPath: modalExportPath.value ? `${modalExportPath.value}/${modalExportName.value}` : modalExportName.value,
  });
  if (selected) {
    const parts = selected.replace(/\\/g, "/").split("/");
    modalExportName.value = parts.pop();
    modalExportPath.value = parts.join("/");
  }
});

// 实际执行导出
async function doExport() {
  if (!templateFileData) return;

  let content = currentMarkdownText;
  if (!content) {
    showToast("没有内容可导出", 1500);
    return;
  }
  if (isEditMode && isEditorInitialized()) {
    content = getEditorContent();
    currentMarkdownText = content;
  }

  const invoke = window.__TAURI_INTERNALS__?.invoke;
  if (!invoke) {
    showToast("导出失败: Tauri API 不可用", 2500);
    return;
  }

  let docxPath = null;
  const dir = modalExportPath.value;
  const name = modalExportName.value;
  if (dir) {
    docxPath = `${dir}/${name}`;
  } else {
    // 无目录则弹出保存对话框
    try {
      docxPath = await save({
        filters: [{ name: "Word 文档", extensions: ["docx"] }],
        defaultPath: name,
      });
      if (!docxPath) return;
    } catch (err) {
      showToast("保存对话框失败: " + (err?.message || String(err)), 2500);
      return;
    }
  }

  showToast("📋 正在使用模版生成 DOCX...", 6000);
  try {
    const uint8arr = await exportToDocxWithTemplate(content, new Uint8Array(templateFileData));
    await invoke("write_binary_file", { path: docxPath, data: Array.from(uint8arr) });
    hideExportModal();
    showToast("✅ 模版导出成功: " + docxPath.split(/[/\\]/).pop(), 2000);
  } catch (err) {
    console.error("template export error:", err);
    showToast("❌ 模版导出失败: " + (err?.message || String(err)), 2500);
  }
}

// 选择 DOCX 模版文件
async function handleSelectTemplate() {
  if (templateFileData) {
    clearTemplate();
    showToast("已清除模版选择", 1000);
    return;
  }
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Word 模版", extensions: ["docx"] }],
    });
    if (!selected) return;

    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (!invoke) {
      showToast("Tauri API 不可用", 2500);
      return;
    }

    templateFileData = await invoke("read_binary_file", { path: selected });
    templateFilePath = selected;

    const parts = selected.replace(/\\/g, "/").split("/");
    const fileName = parts[parts.length - 1];
    showExportModal(fileName);
  } catch (err) {
    console.error("select template error:", err);
    showToast("❌ 选择模版失败: " + (err?.message || String(err)), 2500);
  }
}

// 清除已选择的模版
function clearTemplate() {
  templateFilePath = null;
  templateFileData = null;
  selectTemplateBtn.textContent = "📋 选择doc模版导出";
}

// 加载内置示例文档
function loadExample() {
  if (isEditMode) {
    switchToPreviewMode();
  }
  const exampleMD = `# ✨ Markdown 桌面预览器示例

## 强大的功能支持

### 1. 拖拽或选择文件
- 直接拖拽 **\`.md\`** 文件到窗口任意位置即可预览
- 支持快捷键 \`⌘/Ctrl + O\` 唤起选择器
- 适配高亮、表格、任务列表

### 2. 代码块高亮 (JavaScript / Python / Bash)

\`\`\`javascript
function greet(name) {
    return \`Hello, \${name}！欢迎使用 MD 桌面预览器\`;
}
console.log(greet("开发者"));
\`\`\`

\`\`\`python
def markdown_to_html(text):
    print("语法高亮真好看")
    return text.upper()
\`\`\`

### 3. 表格展示

| 功能项       | 支持状态 | 备注               |
|-------------|----------|--------------------|
| 拖拽打开     | ✅ 完美   | 全局任意区域        |
| 文件选择器   | ✅ 支持   | 按钮或快捷键 Ctrl+O |
| 清空预览     | ✅ 支持   | 一键清空恢复引导    |
| 实时高亮     | ✅ 同步   | 基于 highlight.js   |
| 大文件渲染   | ✅ 优化   | 核心体验流畅        |

### 4. GFM 扩展语法
- **加粗** 和 *斜体* 完美解析
- ~~删除线~~ 与 [超链接](https://github.com)
- 任务列表：
  - [x] 完成拖拽功能
  - [x] 完成代码高亮
  - [ ] 未来增加导出PDF (敬请期待)

> 引述效果： 本工具专为桌面端（Tauri）设计，纯前端无依赖后端。

---

**💡 提示**：点击「打开 .md 文件」选择你自己的文档，或继续拖拽文件体验即时预览。`;

  if (isEditMode) switchToPreviewMode();
  addFileToList("__example__", "✨ 演示文档.md", exampleMD);
  showToast("示例文档已加载，试试拖拽文件吧", 1500);
}

// 清空预览区，重置所有状态
function clearPreview() {
  if (isEditMode) {
    destroyEditor();
    editorWrapper.style.display = "none";
    previewWrapper.style.display = "flex";
    isEditMode = false;
    editToggleBtn.textContent = "✏️ 编辑";
    editToggleBtn.classList.remove("btn-active");
    saveBtn.style.display = "none";
  }

  previewArea.innerHTML = `<div class="empty-guide"><div class="big-icon">🧹</div><h3>预览已清空</h3><p>点击「打开 .md 文件」或拖拽 Markdown 文件开始体验</p><p style="margin-top: 12px;">💡 支持 .md / .markdown 文件</p></div>`;
  fileInfoSpan.innerHTML = "📭 未打开文件 — 拖拽或点击打开";
  fileList = [];
  activeFileIndex = -1;
  currentFileName = null;
  currentMarkdownText = null;
  currentFilePath = null;
  clearTemplate();
  updateSidebar();
  showToast("已清空预览区", 800);
}

// 拖拽经过：添加拖拽高亮样式
function onDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  if (!document.body.classList.contains("drag-over")) {
    document.body.classList.add("drag-over");
  }
}

// 拖拽离开：计数器归零后移除高亮
function onDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  dragCounter--;
  if (dragCounter === 0) {
    document.body.classList.remove("drag-over");
  }
}

// 拖拽进入：计数器递增并添加高亮
function onDragEnter(e) {
  e.preventDefault();
  e.stopPropagation();
  dragCounter++;
  document.body.classList.add("drag-over");
}

// 递归遍历文件夹，收集所有 Markdown 文件
async function traverseDir(entry, results) {
  if (entry.isFile) {
    if (/\.(md|markdown|mdown|mkd)$/i.test(entry.name)) {
      const file = await new Promise((r) => entry.file(r));
      results.push(file);
    }
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = await new Promise((r) => reader.readEntries(r));
    for (const sub of entries) {
      await traverseDir(sub, results);
    }
  }
}

// 全局拖拽放置处理（支持文件和文件夹递归）
function onDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  dragCounter = 0;
  document.body.classList.remove("drag-over");

  if (isEditMode) {
    switchToPreviewMode();
  }

  const items = e.dataTransfer.items;
  if (!items || items.length === 0) {
    showToast("未检测到有效文件", 1200);
    return;
  }

  let pending = 0;
  const allFiles = [];

  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
    if (entry) {
      pending++;
      traverseDir(entry, allFiles).then(() => {
        pending--;
        if (pending === 0) processFiles(allFiles);
      });
    } else {
      const file = items[i].getAsFile();
      if (file) allFiles.push(file);
    }
  }

  if (pending === 0) processFiles(allFiles);

  // 处理收集到的文件列表，过滤出 Markdown 文件
  function processFiles(files) {
    if (files.length === 0) {
      showToast("⛔ 未找到 Markdown 文件", 2000);
      return;
    }
    let loaded = 0;
    for (const file of files) {
      if (/\.(md|markdown|mdown|mkd)$/i.test(file.name)) {
        readAndPreviewFile(file);
        loaded++;
      }
    }
    if (loaded > 0) showToast(`✅ 已加载 ${loaded} 个 Markdown 文件`, 1500);
  }
}

// 启动时处理文件关联打开（双击 .md 文件打开本应用）
async function handleFileAssociation() {
  try {
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (!invoke) return;

    const filePath = await invoke("get_file_arg");
    if (!filePath || typeof filePath !== "string" || !/\.(md|markdown|mdown|mkd)$/i.test(filePath)) return;

    const content = await invoke("read_file_content", { path: filePath });
    const parts = filePath.replace(/\\/g, "/").split("/");
    const fileName = parts[parts.length - 1];
    addFileToList(filePath, fileName, content);
  } catch (err) {
    console.error("handleFileAssociation error:", err);
  }
}

// 全局拖拽事件绑定
document.body.addEventListener("dragover", onDragOver);
document.body.addEventListener("dragenter", onDragEnter);
document.body.addEventListener("dragleave", onDragLeave);
document.body.addEventListener("drop", onDrop);

// 键盘快捷键：Ctrl+O 打开文件，Ctrl+E 加载示例，Ctrl+S 保存
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "o") {
    e.preventDefault();
    openFileDialog();
    showToast("快捷键触发，选择 Markdown 文件", 1000);
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "e") {
    e.preventDefault();
    loadExample();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    if (isEditMode) handleSave();
    else showToast("当前不在编辑模式", 1000);
  }
});

// Ctrl+Wheel 缩放（10~36px 范围，2px 步进）
document.addEventListener("wheel", (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();

  const step = 2;
  const minPx = 10;
  const maxPx = 36;

  const el = isEditMode
    ? document.querySelector("#editorContainer .cm-scroller")
    : document.querySelector(".markdown-body");
  if (!el) return;

  const current = parseFloat(el.style.fontSize) || (isEditMode ? fontSizeEditor : fontSizePreview);
  const base = isEditMode ? fontSizeEditor : fontSizePreview;
  const delta = -Math.sign(e.deltaY) * step;
  const next = Math.round((Math.min(maxPx, Math.max(minPx, current + delta))) * 10) / 10;
  el.style.fontSize = next + "px";
  if (isEditMode) fontSizeEditor = next; else fontSizePreview = next;
  showToast(`缩放: ${Math.round(next / 14 * 100)}%`, 800);
}, { passive: false });

// 侧边栏 DOM 引用与切换按钮
const sidebar = document.getElementById("sidebar");
const sidebarList = document.getElementById("sidebarList");
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");

sidebarToggleBtn.addEventListener("click", () => {
  sidebarVisible = !sidebarVisible;
  sidebarAuto = false;
  sidebar.classList.toggle("collapsed", !sidebarVisible);
  sidebar.style.width = "";
  sidebar.style.minWidth = "";
});

// 侧边栏宽度拖拽调整（120~400px）
const resizeHandle = document.getElementById("resizeHandle");
let isResizing = false;
resizeHandle.addEventListener("mousedown", (e) => {
  isResizing = true;
  e.preventDefault();
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
});
document.addEventListener("mousemove", (e) => {
  if (!isResizing) return;
  const w = Math.max(120, Math.min(400, e.clientX - sidebar.getBoundingClientRect().left));
  sidebar.style.width = w + "px";
  sidebar.style.minWidth = w + "px";
});
document.addEventListener("mouseup", () => {
  if (!isResizing) return;
  isResizing = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
});

// 添加文件到列表（重复则更新，否则追加后切换到该文件）
function addFileToList(filePath, fileName, content) {
  const key = filePath || "__drag__" + fileName;
  const idx = fileList.findIndex((f) => f.path === key);
  if (idx >= 0) {
    fileList[idx].content = content;
    switchToFile(idx);
    return;
  }
  fileList.push({ path: key, fileName, content });
  switchToFile(fileList.length - 1);
}

// 切换到指定文件（编辑模式下先保存当前文件内容）
function switchToFile(index) {
  if (index < 0 || index >= fileList.length) return;
  // 编辑模式下切换文件时先保存当前内容
  if (index !== activeFileIndex && isEditMode && isEditorInitialized() && activeFileIndex >= 0) {
    const content = getEditorContent();
    fileList[activeFileIndex].content = content;
    currentMarkdownText = content;
    if (fileList[activeFileIndex].path && !fileList[activeFileIndex].path.startsWith("__drag__") && fileList[activeFileIndex].path !== "__example__") {
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (invoke) invoke("write_file_content", { path: fileList[activeFileIndex].path, content }).catch(() => {});
    }
  }
  activeFileIndex = index;
  const entry = fileList[index];
  currentFilePath = entry.path === "__example__" ? null : entry.path;
  currentFileName = entry.fileName;
  currentMarkdownText = entry.content;

  if (isEditMode) {
    if (isEditorInitialized()) {
      setEditorContent(entry.content);
    } else {
      switchToPreviewMode();
      renderPreviewView(entry.content, entry.fileName);
    }
  } else {
    renderPreviewView(entry.content, entry.fileName);
  }
  updateSidebar();
}

// 关闭指定文件，文件列表为空时显示引导页
function closeFile(index) {
  if (index < 0 || index >= fileList.length) return;
  fileList.splice(index, 1);
  if (fileList.length === 0) {
    activeFileIndex = -1;
    currentFilePath = null;
    currentFileName = null;
    currentMarkdownText = null;
    previewArea.innerHTML = `<div class="empty-guide"><div class="big-icon">📄✨</div><h3>MD 文件预览器</h3><p>拖拽 <strong>.md / .markdown</strong> 文件至此窗口<br>或点击上方「打开 .md 文件」选择文档</p><p style="font-size: 13px; margin-top: 16px;">💡 快捷键 <kbd>⌘/Ctrl + O</kbd> 唤起文件选择</p></div>`;
    fileInfoSpan.innerHTML = "📭 未打开文件 — 拖拽或点击打开";
    if (isEditMode) switchToPreviewMode();
    updateSidebar();
    return;
  }
  const nextIdx = Math.min(index, fileList.length - 1);
  switchToFile(nextIdx);
}

// 拖拽重排源文件索引
let dragSrcIndex = -1;

// 重新渲染侧边栏文件列表（支持拖拽排序、关闭、单文件自动隐藏）
function updateSidebar() {
  sidebarList.innerHTML = "";
  for (let i = 0; i < fileList.length; i++) {
    const item = document.createElement("div");
    item.className = "sidebar-item" + (i === activeFileIndex ? " active" : "");
    item.draggable = true;
    item.dataset.index = i;
    const nameSpan = document.createElement("span");
    nameSpan.className = "sidebar-filename";
    nameSpan.textContent = fileList[i].fileName;
    nameSpan.title = fileList[i].path && fileList[i].path !== "__example__" ? fileList[i].path : fileList[i].fileName;
    item.appendChild(nameSpan);

    const closeBtn = document.createElement("button");
    closeBtn.className = "sidebar-close";
    closeBtn.textContent = "✕";
    closeBtn.title = "关闭文件";
    closeBtn.addEventListener("click", (e) => { e.stopPropagation(); closeFile(i); });
    item.appendChild(closeBtn);

    // 拖拽重排事件
    item.addEventListener("dragstart", (e) => {
      dragSrcIndex = i;
      e.dataTransfer.effectAllowed = "move";
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    item.addEventListener("dragenter", () => {
      item.classList.add("drag-over");
    });
    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over");
    });
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      item.classList.remove("drag-over");
      const from = dragSrcIndex;
      const to = i;
      if (from === to || from < 0 || to < 0) return;
      const [moved] = fileList.splice(from, 1);
      fileList.splice(to, 0, moved);
      if (activeFileIndex === from) activeFileIndex = to;
      else if (activeFileIndex > from && activeFileIndex <= to) activeFileIndex--;
      else if (activeFileIndex < from && activeFileIndex >= to) activeFileIndex++;
      updateSidebar();
      dragSrcIndex = -1;
    });
    item.addEventListener("click", () => switchToFile(i));
    sidebarList.appendChild(item);
  }

  // 单文件自动隐藏侧边栏，多文件自动显示
  if (fileList.length <= 1 && sidebarVisible && sidebarAuto) {
    sidebarVisible = false;
    sidebar.classList.add("collapsed");
    sidebar.style.width = "";
    sidebar.style.minWidth = "";
  } else if (fileList.length > 1 && !sidebarVisible && sidebarAuto) {
    sidebarVisible = true;
    sidebar.classList.remove("collapsed");
    sidebar.style.width = "";
    sidebar.style.minWidth = "";
  }
}

// 预览区 Ctrl+Click：跳转到编辑器对应位置
previewArea.addEventListener("click", (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  if (isEditMode) return;
  const el = e.target.closest("h1, h2, h3, h4, h5, h6, p, li, td, th");
  if (!el) return;
  const text = el.textContent.trim().slice(0, 50);
  if (text) switchToEditMode(text);
});

// 按钮事件绑定
openFileBtn.addEventListener("click", openFileDialog);
editToggleBtn.addEventListener("click", toggleEditPreview);
saveBtn.addEventListener("click", handleSave);
exampleBtn.addEventListener("click", loadExample);
selectTemplateBtn.addEventListener("click", handleSelectTemplate);
modalConfirmBtn.addEventListener("click", doExport);
modalCancelBtn.addEventListener("click", hideExportModal);
themeToggleBtn.addEventListener("click", () => {
  const dark = toggleEditorTheme();
  themeToggleBtn.textContent = dark ? "🌓" : "☀️";
  themeToggleBtn.title = dark ? "切换浅色" : "切换深色";
  editorContainer.classList.toggle("cm-light", !dark);
});

// 应用启动：显示就绪提示、处理文件关联、监听单实例事件
window.addEventListener("load", async () => {
  showToast("👋 就绪 | 拖拽MD文件或点击打开", 2000);
  handleFileAssociation();

  // 监听单实例事件（用户双击关联文件时其他实例发送的文件路径）
  try {
    const { listen } = window.__TAURI__.event;
    await listen("single-instance", (event) => {
      const filePath = event.payload;
      if (!filePath || typeof filePath !== "string" || !/\.(md|markdown|mdown|mkd)$/i.test(filePath)) return;
      readAndPreviewFileByPath(filePath);
    });
  } catch (_) {}
});
