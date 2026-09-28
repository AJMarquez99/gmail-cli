import { InvalidInputError } from '../lib/errors.js';
import {
  addLabel, removeLabel, archiveMessage, markMessage,
  starMessage, importantMessage, moveMessage, trashMessage,
} from '../writer.js';

export const ACTION_TYPES = ['label', 'unlabel', 'archive', 'mark-read', 'star', 'important', 'move', 'trash'];

/**
 * Parse a single rule action string into a descriptor { raw, type, arg?, bucket }.
 * @throws {InvalidInputError} on an unknown action or unsupported mark state.
 */
export function parseAction(raw) {
  const s = String(raw).trim();
  const idx = s.indexOf(':');
  const head = idx === -1 ? s : s.slice(0, idx);
  const arg = idx === -1 ? undefined : s.slice(idx + 1);
  switch (head) {
    case 'label': return { raw: s, type: 'label', arg, bucket: 'organize' };
    case 'unlabel': return { raw: s, type: 'unlabel', arg, bucket: 'organize' };
    case 'move': return { raw: s, type: 'move', arg, bucket: 'organize' };
    case 'archive': return { raw: s, type: 'archive', bucket: 'organize' };
    case 'star': return { raw: s, type: 'star', bucket: 'organize' };
    case 'important': return { raw: s, type: 'important', bucket: 'organize' };
    case 'trash': return { raw: s, type: 'trash', bucket: 'delete' };
    case 'mark':
      if (arg === 'read') return { raw: s, type: 'mark-read', bucket: 'organize' };
      throw new InvalidInputError(`Unsupported mark action: "${s}" (only "mark:read" is supported).`);
    default:
      throw new InvalidInputError(`Unknown rule action: "${s}".`);
  }
}

/** Parse a list of action strings. Empty/absent → []. */
export function parseActions(list) {
  return (list || []).map(parseAction);
}

const EXECUTORS = {
  label: (client, { uid, mailbox }, a) => addLabel(client, { uid, label: a.arg, mailbox }),
  unlabel: (client, { uid, mailbox }, a) => removeLabel(client, { uid, label: a.arg, mailbox }),
  archive: (client, { uid, mailbox }) => archiveMessage(client, { uid, mailbox }),
  'mark-read': (client, { uid, mailbox }) => markMessage(client, { uid, seen: true, mailbox }),
  star: (client, { uid, mailbox }) => starMessage(client, { uid, on: true, mailbox }),
  important: (client, { uid, mailbox }) => importantMessage(client, { uid, on: true, mailbox }),
  move: (client, { uid, mailbox }, a) => moveMessage(client, { uid, mailbox, destination: a.arg }),
  trash: (client, { uid, mailbox }) => trashMessage(client, { uid, mailbox }),
};

/** Execute a parsed action against a connected client for one message. */
export function runAction(client, action, { uid, mailbox }, _deps = {}) {
  return EXECUTORS[action.type](client, { uid, mailbox }, action);
}
