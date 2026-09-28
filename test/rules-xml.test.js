import { describe, it, expect } from 'vitest';
import { rulesToFilterXml } from '../src/rules/xml.js';

describe('rulesToFilterXml', () => {
  it('emits a feed with one entry per rule (golden)', () => {
    const xml = rulesToFilterXml([
      { id: 'outreach-acme', match: 'from:acme.com', actions: ['label:Outreach/Acme', 'archive'], mailbox: 'INBOX' },
    ]);
    expect(xml).toBe(
`<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>
  <title>Mail Filters</title>
  <entry>
    <category term='filter'></category>
    <title>outreach-acme</title>
    <content></content>
    <apps:property name='hasTheWord' value='from:acme.com'/>
    <apps:property name='label' value='Outreach/Acme'/>
    <apps:property name='shouldArchive' value='true'/>
  </entry>
</feed>
`);
  });

  it('maps move → label + shouldArchive; trash → shouldTrash; mark/star/important', () => {
    const xml = rulesToFilterXml([
      { id: 'm', match: 'from:x', actions: ['move:Saved', 'mark:read', 'star', 'important', 'trash'] },
    ]);
    expect(xml).toContain("<apps:property name='label' value='Saved'/>");
    expect(xml).toContain("<apps:property name='shouldArchive' value='true'/>");
    expect(xml).toContain("<apps:property name='shouldMarkAsRead' value='true'/>");
    expect(xml).toContain("<apps:property name='shouldStar' value='true'/>");
    expect(xml).toContain("<apps:property name='shouldAlwaysMarkAsImportant' value='true'/>");
    expect(xml).toContain("<apps:property name='shouldTrash' value='true'/>");
  });

  it('escapes XML special characters in match + label values', () => {
    const xml = rulesToFilterXml([{ id: 'e', match: "subject:(a & b) 'x'", actions: ['label:A&B'] }]);
    expect(xml).toContain("value='subject:(a &amp; b) &#39;x&#39;'");
    expect(xml).toContain("value='A&amp;B'");
  });

  it('escapes < and > in match values', () => {
    const xml = rulesToFilterXml([{ id: 'lt-gt', match: 'subject:<foo>', actions: ['archive'] }]);
    expect(xml).toContain('&lt;foo&gt;');
  });

  it('omits unlabel (no server-side equivalent)', () => {
    const xml = rulesToFilterXml([{ id: 'u', match: 'from:x', actions: ['unlabel:Y'] }]);
    expect(xml).not.toContain('unlabel');
    expect(xml).not.toContain("name='label'");
  });

  it('empty rule set → feed with no entries', () => {
    const xml = rulesToFilterXml([]);
    expect(xml).toContain('<title>Mail Filters</title>');
    expect(xml).not.toContain('<entry>');
  });
});
