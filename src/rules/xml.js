import { parseActions } from './actions.js';

/** Escape a value for use inside a single-quoted XML attribute. */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;');
}

/** Map one parsed action descriptor to zero or more Gmail filter properties. */
function actionToProps(action) {
  switch (action.type) {
    case 'label': return [{ name: 'label', value: action.arg }];
    case 'archive': return [{ name: 'shouldArchive', value: 'true' }];
    case 'mark-read': return [{ name: 'shouldMarkAsRead', value: 'true' }];
    case 'star': return [{ name: 'shouldStar', value: 'true' }];
    case 'important': return [{ name: 'shouldAlwaysMarkAsImportant', value: 'true' }];
    case 'move': return [{ name: 'label', value: action.arg }, { name: 'shouldArchive', value: 'true' }];
    case 'trash': return [{ name: 'shouldTrash', value: 'true' }];
    case 'unlabel': return []; // no server-side filter equivalent
    default: return [];
  }
}

const prop = (name, value) => `    <apps:property name='${esc(name)}' value='${esc(value)}'/>`;

/**
 * Build Gmail "Filters → Import" XML for the given rules. Pure.
 * Each rule → one <entry>: match → hasTheWord, actions → apps:property pairs.
 */
export function rulesToFilterXml(rules) {
  const entries = (rules || []).map((rule) => {
    const props = [prop('hasTheWord', rule.match)];
    for (const action of parseActions(rule.actions)) {
      for (const p of actionToProps(action)) props.push(prop(p.name, p.value));
    }
    return [
      '  <entry>',
      "    <category term='filter'></category>",
      `    <title>${esc(rule.id)}</title>`,
      '    <content></content>',
      ...props,
      '  </entry>',
    ].join('\n');
  });

  return [
    "<?xml version='1.0' encoding='UTF-8'?>",
    "<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>",
    '  <title>Mail Filters</title>',
    ...entries,
    '</feed>',
    '',
  ].join('\n');
}
