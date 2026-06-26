// DOCX 导出模块
// 将 markdown 转换为 Word .docx 文件，支持 mermaid 图形导出和模版样式注入

import { marked } from "marked";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, convertInchesToTwip,
  WidthType, ShadingType, BorderStyle, ImageRun,
  TableOfContents, Header, Footer, PageNumber,
} from "docx";
import JSZip from "jszip";
import mermaid from "mermaid";
import { toPng } from "html-to-image";

mermaid.initialize({ startOnLoad: false });

// 离屏容器：用于临时挂载 SVG 元素进行截图，避免闪烁
const offscreenContainer = document.createElement("div");
offscreenContainer.style.position = "absolute";
offscreenContainer.style.left = "-9999px";
offscreenContainer.style.top = "-9999px";
offscreenContainer.style.width = "1px";
offscreenContainer.style.height = "1px";
offscreenContainer.style.overflow = "hidden";
document.body.appendChild(offscreenContainer);

const monospaceFont = "Consolas";
const codeBgColor = "EDEDED";
const tableBorder = { style: BorderStyle.SINGLE, size: 1, color: "999999" };

// 预处理：修正冒号在 ** 前导致 marked 无法识别粗体的问题
function fixMarkdown(text) {
  text = text.replace(/(\*\*)([^*\n：:]+?)([：:])(\*\*)/g, "$1$2$4$3");
  text = text.replace(/(\*)([^*\n：:]+?)([：:])(\*)/g, "$1$2$4$3");
  return text;
}

// 将 Mermaid 定义渲染为 PNG 图片（截图方式）
async function renderMermaidImage(definition) {
  const id = "mm-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const { svg } = await mermaid.render(id, definition);
  const vbox = svg.match(/viewBox="([^"]+)"/);
  let origW = 400, origH = 300;
  if (vbox) {
    const p = vbox[1].split(/\s+/);
    origW = parseFloat(p[2]);
    origH = parseFloat(p[3]);
  }
  // 横向图宽 500px，纵向图宽 400px，最大高度 500px
  const isLandscape = origW > origH;
  const maxW = isLandscape ? 500 : 400;
  const maxH = 500;
  let w = maxW, h = Math.round(maxW * (origH / origW));
  if (h > maxH) { h = maxH; w = Math.round(maxH * (origW / origH)); }

  const div = document.createElement("div");
  div.innerHTML = svg;
  const svgEl = div.firstElementChild;
  svgEl.setAttribute("width", String(w));
  svgEl.setAttribute("height", String(h));
  svgEl.style.width = w + "px";
  svgEl.style.height = h + "px";
  offscreenContainer.appendChild(svgEl);

  try {
    const dataUrl = await toPng(svgEl, { quality: 1, pixelRatio: 3, cacheBust: true });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    const binary = atob(base64);
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
    return { data, width: w, height: h };
  } finally {
    svgEl.remove();
  }
}

// 构建完整的 docx Document 对象（共用主体）
function mdToDocx(markdown, mermaidImages = null) {
  const tokens = marked.lexer(fixMarkdown(markdown));
  const children = [];
  let imgIdx = 0;

  for (const token of tokens) {
    switch (token.type) {
      case "heading":
        children.push(headingToParagraph(token));
        break;
      case "paragraph":
        children.push(paragraphToParagraph(token));
        break;
      case "code":
        if (mermaidImages && token.lang === "mermaid") {
          const { data, width, height } = mermaidImages[imgIdx++];
          children.push(new Paragraph({
            spacing: { before: 120, after: 120 },
            children: [new ImageRun({ data, type: "png", transformation: { width, height } })],
          }));
        } else {
          children.push(codeBlockToParagraph(token));
        }
        break;
      case "list":
        children.push(...listToParagraphs(token));
        break;
      case "table":
        children.push(tableToTable(token));
        break;
      case "blockquote":
        children.push(...blockquoteToParagraph(token));
        break;
      case "hr":
        children.push(hrToParagraph());
        break;
      case "space":
        break;
      default:
        break;
    }
  }

  const toc = new TableOfContents("目录", { hyperlink: true, headingStyleRange: "1-6" });
  return new Document({
    styles: {
      default: {
        document: {
          run: { size: 22, font: { name: "等线" } },
          paragraph: { spacing: { after: 120 } },
        },
      },
    },
    sections: [{
      properties: {},
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "MD Live Viewer", size: 18, color: "999999" })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: ["第 ", PageNumber.CURRENT, " 页"], size: 18 })],
          })],
        }),
      },
      children: [toc, ...children],
    }],
  });
}

// 并行收集所有 mermaid 代码块的渲染结果
async function collectMermaidImages(tokens) {
  const results = [];
  for (const token of tokens) {
    if (token.type === "code" && token.lang === "mermaid") {
      results.push(await renderMermaidImage(token.text));
    }
  }
  return results;
}

// 主导出函数（无模版）
export async function exportToDocx(markdownText) {
  const tokens = marked.lexer(fixMarkdown(markdownText));
  const mermaidImages = await collectMermaidImages(tokens);
  const doc = mdToDocx(markdownText, mermaidImages);
  const arrayBuffer = await Packer.toArrayBuffer(doc);
  return new Uint8Array(arrayBuffer);
}

// ----- 以下为各类型 token → docx Paragraph/Table 的转换函数 -----

// 标题 → HeadingLevel 段落（不设字号，由样式控制）
function headingToParagraph(token) {
  const levelMap = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
  };
  return new Paragraph({
    heading: levelMap[token.depth] || HeadingLevel.HEADING_1,
    children: inlineToRuns(token.tokens || []),
  });
}

// 正文段落
function paragraphToParagraph(token) {
  return new Paragraph({
    spacing: { after: 120 },
    children: inlineToRuns(token.tokens || [], { size: 22 }),
  });
}

// 代码块 → 等宽字体 + 灰色背景
function codeBlockToParagraph(token) {
  const lines = decodeEntities(token.text).split("\n");
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    indent: { left: convertInchesToTwip(0.3) },
    shading: { type: ShadingType.CLEAR, fill: codeBgColor, color: "auto" },
    children: lines.map((line, i) => {
      const runs = [];
      if (i > 0) runs.push(new TextRun({ break: 1 }));
      runs.push(new TextRun({
        text: line,
        font: { name: monospaceFont, ascii: monospaceFont, eastAsia: monospaceFont },
        size: 20,
      }));
      return runs;
    }).flat(),
  });
}

// 列表 → 按序/无序缩进，支持嵌套列表和 blockquote
function listToParagraphs(token, depth = 0) {
  const result = [];
  const isOrdered = token.ordered;
  const indent = convertInchesToTwip(0.5 + depth * 0.3);

  for (let i = 0; i < token.items.length; i++) {
    const item = token.items[i];
    const prefix = isOrdered ? `${i + 1}. ` : "• ";
    const inlineTokens = [];
    const nestedBlocks = [];
    for (const t of item.tokens || []) {
      if (t.type === "list") nestedBlocks.push(t);
      else if (t.type === "blockquote") nestedBlocks.push(t);
      else inlineTokens.push(t);
    }
    result.push(new Paragraph({
      spacing: { after: 60 },
      indent: { left: indent, hanging: convertInchesToTwip(0.25) },
      children: [
        new TextRun({ text: prefix, size: 22 }),
        ...inlineToRuns(inlineTokens, { size: 22 }),
      ],
    }));
    for (const nested of nestedBlocks) {
      if (nested.type === "list") {
        result.push(...listToParagraphs(nested, depth + 1));
      } else if (nested.type === "blockquote") {
        result.push(...blockquoteToParagraph(nested));
      }
    }
  }
  return result;
}

// 判断表格单元格是否为空（无可见文本）
function isCellEmpty(cell) {
  if (!cell) return true;
  if (cell.text && cell.text.trim()) return false;
  if (cell.tokens) {
    for (const t of cell.tokens) {
      if (t.type === "text" && t.text && t.text.trim()) return false;
    }
  }
  return true;
}

// 表格 → docx Table，支持合并只有首列有数据的行
function tableToTable(token) {
  const rows = token.rows || [];
  const headerRows = token.header || [];
  const colCount = headerRows.length > 0 ? headerRows.length : (rows[0] ? rows[0].length : 1);

  const tableRows = [];

  // 表头行（浅灰背景）
  if (headerRows.length > 0) {
    tableRows.push(new TableRow({
      children: headerRows.map((cell) => cellToTableCell(cell, true, "F2F2F2")),
    }));
  }

  // 数据行：若某行只有首格有内容，自动合并整行为一个单元格
  for (const row of rows) {
    const cells = row || [];
    const firstCell = cells[0];
    const restEmpty = cells.length > 1 && cells.slice(1).every((c) => isCellEmpty(c));
    const firstHasData = firstCell && !isCellEmpty(firstCell);

    if (restEmpty && firstHasData && colCount > 1) {
      const tokens = firstCell.tokens || [];
      const paragraphs = [];
      if (tokens.length > 0) {
        paragraphs.push(new Paragraph({
          spacing: { before: 40, after: 40 },
          children: inlineToRuns(tokens, { size: 20 }),
        }));
      } else {
        paragraphs.push(new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [new TextRun({ text: decodeEntities(firstCell.text || ""), size: 20 })],
        }));
      }
      tableRows.push(new TableRow({
        children: [new TableCell({
          children: paragraphs, columnSpan: colCount,
          width: { size: 100, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: "F2F2F2", color: "auto" },
        })],
      }));
    } else {
      tableRows.push(new TableRow({
        children: cells.map((cell) => cellToTableCell(cell, false)),
      }));
    }
  }

  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder,
      insideHorizontal: tableBorder, insideVertical: tableBorder,
    },
  });
}

// 单个表格单元格 → docx TableCell
function cellToTableCell(cell, isHeader, fillColor) {
  const cellTokens = cell.tokens || [];
  const paragraphs = [];

  if (cellTokens.length > 0) {
    paragraphs.push(new Paragraph({
      spacing: { before: 40, after: 40 },
      children: inlineToRuns(cellTokens, { size: 20 }),
    }));
  } else {
    paragraphs.push(new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text: decodeEntities(cell.text || ""), size: 20 })],
    }));
  }
  const opts = {
    children: paragraphs,
    width: { size: 0, type: WidthType.AUTO },
  };
  if (fillColor) {
    opts.shading = { type: ShadingType.CLEAR, fill: fillColor, color: "auto" };
  }
  return new TableCell(opts);
}

// 引用块 → 带左边框的段落，支持内部列表嵌套
function blockquoteToParagraph(token, bqDepth = 0) {
  const result = [];
  const border = { left: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 8 } };
  const baseIndent = convertInchesToTwip(0.5 + bqDepth * 0.3);
  for (const child of token.tokens || []) {
    if (child.type === "paragraph") {
      result.push(new Paragraph({
        spacing: { before: child === token.tokens[0] ? 120 : 0, after: 120 },
        indent: { left: baseIndent },
        border,
        children: inlineToRuns(child.tokens || [], { size: 22 }),
      }));
    } else if (child.type === "list") {
      const isOrdered = child.ordered;
      for (let i = 0; i < child.items.length; i++) {
        const item = child.items[i];
        const prefix = isOrdered ? `${i + 1}. ` : "• ";
        const inlineTokens = [];
        const nestedLists = [];
        for (const t of item.tokens || []) {
          if (t.type === "list") nestedLists.push(t);
          else inlineTokens.push(t);
        }
        result.push(new Paragraph({
          spacing: { after: 60 },
          indent: { left: baseIndent + convertInchesToTwip(0.3), hanging: convertInchesToTwip(0.25) },
          border,
          children: [
            new TextRun({ text: prefix, size: 22 }),
            ...inlineToRuns(inlineTokens, { size: 22 }),
          ],
        }));
        for (const nested of nestedLists) {
          result.push(...blockquoteToParagraph({ tokens: [nested] }, bqDepth + 1));
        }
      }
    }
  }
  if (result.length === 0) {
    result.push(new Paragraph({
      spacing: { before: 120, after: 120 },
      indent: { left: baseIndent },
      border,
      children: [new TextRun({ text: token.text || "", size: 22 })],
    }));
  }
  return result;
}

// 水平分割线 → 底部边框段落
function hrToParagraph() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 },
    },
    children: [],
  });
}

// 解码 HTML 实体 + 替换不兼容字符（如 🗹 → ☑）
function decodeEntities(text) {
  if (!text) return text;
  let result = text;
  if (result.indexOf("&") >= 0) {
    const el = document.createElement("textarea");
    el.innerHTML = result;
    result = el.value;
  }
  return result
    .replace(/\u{1F5F9}/gu, "☑")
    .replace(/\u{2611}/gu, "☑");
}

// 内联 tokens → docx TextRun 数组
// 处理 strong/em/del/codespan/link/html(支持mark)等内联标记
function inlineToRuns(tokens, extra = {}) {
  if (!tokens || tokens.length === 0) return [new TextRun({ text: "", ...extra })];
  const runs = [];
  let markOpen = false;

  for (const tok of tokens) {
    if (tok.type === "html") {
      const t = tok.text.trim();
      if (/^<mark\s*\/?>/i.test(t)) markOpen = true;
      else if (/^<\/mark>/i.test(t)) markOpen = false;
      continue;
    }
    if (tok.type === "text" || tok.type === "plain") {
      const markExtra = markOpen ? { ...extra, shading: { ...extra?.shading, type: ShadingType.CLEAR, fill: "FFFF00", color: "auto" } } : extra;
      if (tok.tokens && tok.tokens.length > 0) {
        runs.push(...inlineToRuns(tok.tokens, markExtra));
      } else {
        runs.push(new TextRun({ text: decodeEntities(tok.text), ...markExtra }));
      }
    } else if (tok.type === "strong") {
      const markExtra = markOpen ? { ...extra, shading: { type: ShadingType.CLEAR, fill: "FFFF00", color: "auto" }, bold: true } : { ...extra, bold: true };
      runs.push(...inlineToRuns(tok.tokens, markExtra));
    } else if (tok.type === "em") {
      const markExtra = markOpen ? { ...extra, shading: { type: ShadingType.CLEAR, fill: "FFFF00", color: "auto" }, italics: true } : { ...extra, italics: true };
      runs.push(...inlineToRuns(tok.tokens, markExtra));
    } else if (tok.type === "del") {
      const markExtra = markOpen ? { ...extra, shading: { type: ShadingType.CLEAR, fill: "FFFF00", color: "auto" }, strike: true } : { ...extra, strike: true };
    } else if (tok.type === "codespan") {
      runs.push(new TextRun({
        text: decodeEntities(tok.text),
        font: { ascii: monospaceFont, hAnsi: monospaceFont },
        size: 20,
        ...extra,
        shading: { ...extra?.shading, type: ShadingType.CLEAR, fill: codeBgColor, color: "auto" },
      }));
    } else if (tok.type === "link") {
      runs.push(new TextRun({
        text: decodeEntities(tok.text || tok.href),
        style: "Hyperlink",
        size: 22,
        ...extra,
      }));
    } else if (tok.type === "br") {
      runs.push(new TextRun({ break: 1 }));
    } else if (tok.type === "image") {
      const alt = decodeEntities(tok.text || "image");
      runs.push(new TextRun({ text: `[${alt}]`, size: 22, italics: true, color: "888888", ...extra }));
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text: "", ...extra })];
}

// 模版导出：提取模版的 styles.xml，将生成的 styleId 映射到模版样式
export async function exportToDocxWithTemplate(markdownText, templateData) {
  const tokens = marked.lexer(fixMarkdown(markdownText));
  const mermaidImages = await collectMermaidImages(tokens);
  const doc = mdToDocx(markdownText, mermaidImages);
  const baseArrayBuf = await Packer.toArrayBuffer(doc);

  const baseZip = await JSZip.loadAsync(baseArrayBuf);
  const tmplZip = await JSZip.loadAsync(templateData);

  // 读取两者的 styles.xml
  const tmplStylesFile = tmplZip.file("word/styles.xml");
  if (!tmplStylesFile) throw new Error("模版文件无效：缺少 word/styles.xml");
  const tmplStylesXml = await tmplStylesFile.async("string");
  const genStylesXml = await baseZip.file("word/styles.xml").async("string");
  const genDocXml = await baseZip.file("word/document.xml").async("string");

  // 建立模版样式 名称→styleId 映射
  const tmplNameToId = {};
  const styleRegex = /<w:style[^>]*>[\s\S]*?<\/w:style>/g;
  let m;
  while ((m = styleRegex.exec(tmplStylesXml)) !== null) {
    const styleEl = m[0];
    const nameMatch = styleEl.match(/<w:name w:val="([^"]+)"/);
    const idMatch = styleEl.match(/w:styleId="([^"]+)"/);
    if (nameMatch && idMatch) {
      tmplNameToId[nameMatch[1].toLowerCase()] = idMatch[1];
    }
  }

  // 建立生成文档的 styleId→名称 映射
  const genIdToName = {};
  styleRegex.lastIndex = 0;
  while ((m = styleRegex.exec(genStylesXml)) !== null) {
    const styleEl = m[0];
    const nameMatch = styleEl.match(/<w:name w:val="([^"]+)"/);
    const idMatch = styleEl.match(/w:styleId="([^"]+)"/);
    if (nameMatch && idMatch) {
      genIdToName[idMatch[1]] = nameMatch[1].toLowerCase();
    }
  }

  // 将 document.xml 中的 w:pStyle 引用替换为模版的 styleId
  const fixedDocXml = genDocXml.replace(/<w:pStyle w:val="([^"]+)"/g, (match, styleId) => {
    const name = genIdToName[styleId];
    if (name && tmplNameToId[name]) {
      return `<w:pStyle w:val="${tmplNameToId[name]}"`;
    }
    return match;
  });

  // 模版 Normal 样式若为两端对齐，强制改为左对齐
  const fixedStylesXml = tmplStylesXml.replace(
    /(<w:style[^>]*w:type="paragraph" w:default="1"[^>]*>[\s\S]*?<w:pPr[\s\S]*?)<w:jc w:val="both"\/>/,
    '$1<w:jc w:val="left"/>'
  );

  // 替换生成文档的 styles.xml 为模版样式（保留所有模版格式定义）
  baseZip.file("word/styles.xml", fixedStylesXml);
  baseZip.file("word/document.xml", fixedDocXml);

  // 复制模版的 numbering.xml（列表编号格式）
  const numFile = tmplZip.file("word/numbering.xml");
  if (numFile) {
    baseZip.file("word/numbering.xml", await numFile.async("uint8array"));
  }

  const result = await baseZip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return new Uint8Array(result);
}
