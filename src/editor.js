// CodeMirror 6 markdown 编辑器模块
// 负责编辑器的创建、内容读写、主题切换、代码块标记等功能

import { EditorView, basicSetup } from "codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { java } from "@codemirror/lang-java";
import { oneDark } from "@codemirror/theme-one-dark";
import { githubLight } from "@uiw/codemirror-theme-github";
import { StateField, RangeSetBuilder, Compartment, Prec } from "@codemirror/state";
import { Decoration, keymap } from "@codemirror/view";
import { syntaxTree, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { indentWithTab } from "@codemirror/commands";

// 浅色模式语法高亮配色方案
const lightMarkdownHighlight = Prec.highest(syntaxHighlighting(HighlightStyle.define([
  // 默认正文
  { tag: tags.content, color: "#1E1F22" },
  { tag: tags.comment, color: "#8F9AA5", fontStyle: "italic" },

  // 标题
  { tag: tags.heading, color: "#1A1B1E", fontWeight: "bold" },
  { tag: tags.heading1, color: "#1A1B1E", fontWeight: "bold" },
  { tag: tags.heading2, color: "#2C2E35", fontWeight: "bold" },
  { tag: tags.heading3, color: "#3A3C42", fontWeight: "bold" },

  // 行内样式
  { tag: tags.strong, color: "#1A1E24", fontWeight: "bold" },
  { tag: tags.emphasis, color: "#4B6A5C", fontStyle: "italic" },
  { tag: tags.link, color: "#2C6D9E" },
  { tag: tags.url, color: "#2C6D9E" },
  { tag: tags.monospace, color: "#D14C3A", fontFamily: "Consolas, 'Courier New', monospace" },
  { tag: tags.strikethrough, color: "#9CA3AF", textDecoration: "line-through" },
  { tag: tags.quote, color: "#4B5563", fontStyle: "italic" },

  // 代码语法高亮
  { tag: tags.keyword, color: "#C25A3B" },
  { tag: tags.string, color: "#3A7D6B" },
  { tag: tags.number, color: "#B85C1A" },
  { tag: tags.function, color: "#4F6F8F" },
  { tag: tags.operator, color: "#6C7A89" },
  { tag: tags.typeName, color: "#4F6F8F" },

  // 次要文字
  { tag: tags.bracket, color: "#6B6F76" },
  { tag: tags.punctuation, color: "#6B6F76" },
])));


// 表格分隔符 Decoration
const tableDelimiterDeco = Decoration.mark({ class: "cm-table-delimiter" });
// 表头单元格 Decoration
const tableHeaderCellDeco = Decoration.mark({ class: "cm-table-header-cell" });
// 加粗标记 ** 的 Decoration
const boldMarkerDeco = Decoration.mark({ class: "cm-bold-marker" });
// 加粗文字的 Decoration
const boldTextDeco = Decoration.mark({ class: "cm-bold-text" });

// 代码块行的 Decoration
const codeBlockLineDeco = Decoration.line({ class: "cm-codeblock-line" });

// StateField：标记表格分隔符（| 和 |---|）
const tableDelimiterHighlight = StateField.define({
  create(state) {
    return buildTableDelimiterDeco(state);
  },
  update(deco, tr) {
    if (tr.docChanged) return buildTableDelimiterDeco(tr.state);
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// StateField：根据语法树动态标记代码块行
const codeBlockBackground = StateField.define({
  create(state) {
    return buildCodeBlockDeco(state);
  },
  update(deco, tr) {
    if (tr.docChanged) return buildCodeBlockDeco(tr.state);
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// 遍历语法树，找到 FencedCode / CodeBlock 节点，为这些行添加背景标记
function buildCodeBlockDeco(state) {
  const builder = new RangeSetBuilder();
  const tree = syntaxTree(state);
  tree.iterate({
    enter(node) {
      if (node.name === "FencedCode" || node.name === "CodeBlock") {
        const fromLine = state.doc.lineAt(node.from).number;
        const toLine = state.doc.lineAt(Math.min(node.to, state.doc.length)).number;
        for (let i = fromLine; i <= toLine; i++) {
          const line = state.doc.line(i);
          builder.add(line.from, line.from, codeBlockLineDeco);
        }
      }
    },
  });
  return builder.finish();
}

// 遍历语法树，找到 TableDelimiter 节点，为这些字符添加样式
function buildTableDelimiterDeco(state) {
  const builder = new RangeSetBuilder();
  const tree = syntaxTree(state);
  tree.iterate({
    enter(node) {
      if (node.name === "TableDelimiter") {
        for (let pos = node.from; pos < node.to; pos++) {
          builder.add(pos, pos + 1, tableDelimiterDeco);
        }
      }
    },
  });
  return builder.finish();
}

// 遍历语法树，找到 TableHeader 下的 TableCell，为表头文字添加样式
function buildTableHeaderDeco(state) {
  const builder = new RangeSetBuilder();
  const tree = syntaxTree(state);
  let inHeader = false;
  tree.iterate({
    enter(node) {
      if (node.name === "TableHeader") inHeader = true;
      if (inHeader && node.name === "TableCell") {
        builder.add(node.from, node.to, tableHeaderCellDeco);
      }
    },
    leave(node) {
      if (node.name === "TableHeader") inHeader = false;
    },
  });
  return builder.finish();
}

// StateField：标记表头单元格
const tableHeaderHighlight = StateField.define({
  create(state) { return buildTableHeaderDeco(state); },
  update(deco, tr) {
    if (tr.docChanged) return buildTableHeaderDeco(tr.state);
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// 遍历语法树，找到 StrongEmphasis 下的 EmphasisMark（**），为标记和中间文字添加样式
function buildBoldDeco(state) {
  if (isDarkMode) return new RangeSetBuilder().finish();  // 仅在浅色模式下应用
  const builder = new RangeSetBuilder();
  const tree = syntaxTree(state);
  let insideStrong = false;
  let markers = [];
  tree.iterate({
    enter(node) {
      if (node.name === "StrongEmphasis") {
        insideStrong = true;
        markers = [];
      }
      if (insideStrong && node.name === "EmphasisMark") {
        markers.push({ from: node.from, to: node.to });
      }
    },
    leave(node) {
      if (node.name === "StrongEmphasis") {
        if (markers.length >= 2) {
          for (let p = markers[0].from; p < markers[0].to; p++) builder.add(p, p + 1, boldMarkerDeco);
          if (markers[0].to < markers[1].from) builder.add(markers[0].to, markers[1].from, boldTextDeco);
          for (let p = markers[1].from; p < markers[1].to; p++) builder.add(p, p + 1, boldMarkerDeco);
        }
        insideStrong = false;
      }
    },
  });
  return builder.finish();
}

// StateField：标记加粗语法（始终重新计算，因依赖 isDarkMode）
const boldHighlight = StateField.define({
  create(state) { return buildBoldDeco(state); },
  update(deco, tr) { return buildBoldDeco(tr.state); },
  provide: (f) => EditorView.decorations.from(f),
});

let editorView = null;
let ctrlClickCallback = null;
let isDarkMode = true;
const themeComp = new Compartment(); // 用于动态切换主题

export function setCtrlClickCallback(fn) {
  ctrlClickCallback = fn;
}

// Ctrl+Click 插件：编辑器内按住 Ctrl 点击某行，触发跳转到预览对应位置
const ctrlClickPlugin = EditorView.domEventHandlers({
  click(event, view) {
    if (!event.ctrlKey && !event.metaKey) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos !== null && ctrlClickCallback) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text.trim();
      if (text) ctrlClickCallback(text);
    }
    return true;
  },
});

// 初始化编辑器，挂载到指定容器
export function initEditor(container, content) {
  if (editorView) {
    editorView.destroy();
    editorView = null;
  }

  editorView = new EditorView({
    doc: content || "",
    extensions: [
      basicSetup,
      markdown({
        base: markdownLanguage,
        codeLanguages(info) {
          switch (info) {
            case "html": case "htm": return html().language;
            case "javascript": case "js": return javascript().language;
            case "css": return css().language;
            case "python": return python().language;
            case "json": return json().language;
            case "java": return java().language;
          }
        },
      }),
      themeComp.of(oneDark),                    // 默认深色主题，通过 Compartment 可动态切换
      EditorView.lineWrapping,                   // 自动换行
      keymap.of([indentWithTab]),                // Tab 缩进 / Shift+Tab 取消缩进
      ctrlClickPlugin,                           // Ctrl+Click 跳转
      codeBlockBackground,                       // 代码块背景标记
      tableDelimiterHighlight,                   // 表格分隔符标记
      tableHeaderHighlight,                      // 表头单元格标记
      boldHighlight,                             // 加粗语法标记
      EditorView.contentAttributes.of({
        spellcheck: "false",
        lang: "zh-CN",
      }),
      EditorView.domEventHandlers({
        compositionend(e, view) {
          try { view.observer.forceFlush(); } catch (_) {}
        },
      }),
    ],
    parent: container,
  });

  return editorView;
}

// 获取编辑器全部文本内容
export function getEditorContent() {
  if (!editorView) return "";
  return editorView.state.doc.toString();
}

// 替换编辑器全部内容（切换文件时使用）
export function setEditorContent(content) {
  if (!editorView) return;
  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: content || "",
    },
  });
}

// 销毁编辑器实例
export function destroyEditor() {
  if (editorView) {
    editorView.destroy();
    editorView = null;
  }
}

export function isEditorInitialized() {
  return editorView !== null;
}

// 预留接口；编辑器内容变化回调（当前未使用）
export function onEditorChange(callback) {
  if (!editorView) return;
}


// 切换深色/浅色主题
export function toggleEditorTheme() {
  if (!editorView) return;
  isDarkMode = !isDarkMode;
  editorView.dispatch({
    effects: themeComp.reconfigure(isDarkMode ? oneDark : [githubLight, lightMarkdownHighlight]),
  });
  return isDarkMode;
}

// 在编辑器文档中搜索指定文本，滚动到对应行
export function scrollToText(text) {
  if (!editorView || !text) return false;
  const doc = editorView.state.doc;
  const full = doc.toString();
  const pos = full.indexOf(text);
  if (pos < 0) return false;
  const line = doc.lineAt(pos);
  const lineInfo = editorView.lineBlockAt(line.from);
  if (lineInfo) {
    editorView.scrollDOM.scrollTop = Math.max(0, lineInfo.top - 40);
  }
  return true;
}
