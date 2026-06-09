import { marked } from 'marked';

// Email-safe inline styles per tag (clients strip <style>/<head>, so styles must be inline).
const STYLES = {
  h1: 'font-size:24px;font-weight:700;margin:0 0 12px;line-height:1.25',
  h2: 'font-size:20px;font-weight:700;margin:20px 0 8px;border-bottom:2px solid #2c7;padding-bottom:4px',
  h3: 'font-size:16px;font-weight:700;margin:16px 0 6px',
  p: 'margin:0 0 12px',
  ul: 'margin:0 0 12px;padding-left:22px',
  ol: 'margin:0 0 12px;padding-left:22px',
  li: 'margin:0 0 4px',
  blockquote: 'margin:0 0 12px;padding:8px 12px;border-left:4px solid #ddd;color:#555',
  pre: 'margin:0 0 12px;padding:10px;background:#f6f8fa;border-radius:6px;overflow:auto;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px',
  code: 'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px',
  table: 'border-collapse:collapse;width:100%;font-size:14px;margin:0 0 16px',
  th: 'border:1px solid #ddd;padding:6px;text-align:left;background:#f0f7f0',
  td: 'border:1px solid #ddd;padding:6px',
  a: 'color:#1a7f5a',
};

const TAG_RE = /<(h1|h2|h3|p|ul|ol|li|blockquote|pre|code|table|th|td|a)(\s[^>]*)?>/g;

function inlineStyles(html) {
  const inner = html.replace(TAG_RE, (m, tag, attrs = '') => {
    if (/\bstyle=/.test(attrs)) return m; // respect any pre-existing style
    return `<${tag}${attrs} style="${STYLES[tag]}">`;
  });
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:840px;line-height:1.5">${inner}</div>`;
}

/** Markdown → { html, text }. html is styled-inline unless style:false; text is the raw markdown. */
export function renderMarkdown(md, { style = true } = {}) {
  const rawHtml = marked.parse(md, { async: false });
  return { html: style ? inlineStyles(rawHtml) : rawHtml, text: md };
}
