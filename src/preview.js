// Markdown 预览渲染模块
// 将 markdown 文本解析为安全 HTML，支持 Mermaid 图形渲染和代码高亮

import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
});

// DOMPurify 白名单配置：仅允许已知安全的 HTML 标签和属性
const purifyConfig = {
  ALLOWED_TAGS: [
    "h1","h2","h3","h4","h5","h6","p","br","hr",
    "ul","ol","li","dl","dt","dd",
    "table","thead","tbody","tfoot","tr","th","td",
    "blockquote","pre","code",
    "a","strong","em","del","b","i","u","span","mark","font",
    "div","input",
    "details","summary",
  ],
  ALLOWED_ATTR: [
    "class","id","href","target","rel","title","alt",
    "checked","type","start","reversed","name","value",
    "colspan","rowspan","align","style","color","face","size",
  ],
};

marked.setOptions({
  gfm: true,
  breaks: true,
  pedantic: false,
  smartLists: true,
  smartypants: false,
});

marked.use({
  renderer: {
    // 行内代码：解码 HTML 实体中的 | 管道符（表格中转义用）
    codespan(text) {
      return `<code>${text.replace(/&amp;#124;/g, '&#124;')}</code>`;
    },
  },
});

// 预处理：修正 markdown 中冒号位于 ** 前面导致的解析失败
// CommonMark 规范要求 **bold：**text 这种写法中冒号导致 ** 不被识别为结束符
// 修正为 **bold**：text
function fixMarkdown(text) {
  text = text.replace(/(\*\*)([^*\n：:]+?)([：:])(\*\*)/g, "$1$2$4$3");
  text = text.replace(/(\*)([^*\n：:]+?)([：:])(\*)/g, "$1$2$4$3");
  return text;
}

// 预处理：在表格行中，将代码块内的 | 转义为 \|，防止被误识别为列分隔符
function escapePipeInCodeSpans(text) {
  return text.split('\n').map(line => {
    if (/^\s*\|/.test(line)) {
      return line.replace(/(`+)(.+?)\1(?!`)/g, (match, bt, content) => {
        return bt + content.replace(/(?<!\\)\|/g, '\\|') + bt;
      });
    }
    return line;
  }).join('\n');
}

// 渲染预览 HTML
// 流程：fixMarkdown → escapePipe → marked.parse → DOMPurify.sanitize
export function renderPreview(markdownText) {
  if (!markdownText || markdownText.trim() === "") {
    return "";
  }
  const rawHtml = marked.parse(escapePipeInCodeSpans(fixMarkdown(markdownText)));
  const cleanHtml = DOMPurify.sanitize(rawHtml, purifyConfig);
  return cleanHtml;
}

// 对渲染后的容器应用高亮 & Mermaid 图形处理
export function applyHighlight(container) {
  if (!container) return;

  // 1) 渲染 Mermaid 图形：找到 language-mermaid 的代码块，替换为 SVG 图表
  const mermaidBlocks = container.querySelectorAll("pre code.language-mermaid");
  mermaidBlocks.forEach((block) => {
    const pre = block.parentElement;
    if (!pre || pre.classList.contains("mermaid-processed")) return;
    pre.classList.add("mermaid", "mermaid-processed");
    pre.textContent = block.textContent;
  });
  if (mermaidBlocks.length > 0) {
    try {
      mermaid.run({ nodes: container.querySelectorAll(".mermaid") });
    } catch (e) {
      console.warn("mermaid error:", e);
    }
  }

  // 2) highlight.js 高亮其余代码块
  const codeBlocks = container.querySelectorAll("pre code:not(.language-mermaid)");
  codeBlocks.forEach((block) => {
    try {
      hljs.highlightElement(block);
    } catch (e) {
      console.warn("highlight error", e);
    }
  });
}
