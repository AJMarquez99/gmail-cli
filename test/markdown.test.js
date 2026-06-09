import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown.js';

describe('renderMarkdown', () => {
  it('renders headings and links to HTML and keeps raw markdown as text', () => {
    const { html, text } = renderMarkdown('# Title\n\n[link](https://x.com)');
    expect(html).toContain('<h1');
    expect(html).toContain('href="https://x.com"');
    expect(text).toBe('# Title\n\n[link](https://x.com)');
  });

  it('injects inline styles onto table cells (email-safe)', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const { html } = renderMarkdown(md, { style: true });
    expect(html).toMatch(/<table[^>]*style="/);
    expect(html).toMatch(/<td[^>]*style="/);
  });

  it('skips the styler when style:false', () => {
    const { html } = renderMarkdown('# Hi', { style: false });
    expect(html).toContain('<h1');
    expect(html).not.toMatch(/<h1[^>]*style="/);
  });
});
