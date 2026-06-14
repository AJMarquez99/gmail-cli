import { describe, it, expect } from 'vitest';
import { TOOLS } from '../src/mcp/tools.js';
import { runSend } from '../src/commands/send.js';
import { runReadList, runReadSearch, runReadShow, runReadThread } from '../src/commands/read.js';
import { runLabelList, runLabelAdd, runLabelRemove } from '../src/commands/label.js';
import { runMark } from '../src/commands/mark.js';
import { runAllowList } from '../src/commands/allow.js';
import { runLog } from '../src/commands/log.js';
import { runDoctor } from '../src/commands/doctor.js';

const EXPECTED_NAMES = [
  'gmail_send',
  'gmail_read_list',
  'gmail_read_search',
  'gmail_read_show',
  'gmail_read_thread',
  'gmail_label_list',
  'gmail_label_add',
  'gmail_label_remove',
  'gmail_mark',
  'gmail_allow_list',
  'gmail_log',
  'gmail_doctor',
];

const byName = (n) => TOOLS.find((t) => t.name === n);

describe('TOOLS table', () => {
  it('has the 12 expected tool names in order', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(EXPECTED_NAMES);
  });

  it('wires each tool to the right command function', () => {
    expect(byName('gmail_send').command).toBe(runSend);
    expect(byName('gmail_read_list').command).toBe(runReadList);
    expect(byName('gmail_read_search').command).toBe(runReadSearch);
    expect(byName('gmail_read_show').command).toBe(runReadShow);
    expect(byName('gmail_read_thread').command).toBe(runReadThread);
    expect(byName('gmail_label_list').command).toBe(runLabelList);
    expect(byName('gmail_label_add').command).toBe(runLabelAdd);
    expect(byName('gmail_label_remove').command).toBe(runLabelRemove);
    expect(byName('gmail_mark').command).toBe(runMark);
    expect(byName('gmail_allow_list').command).toBe(runAllowList);
    expect(byName('gmail_log').command).toBe(runLog);
    expect(byName('gmail_doctor').command).toBe(runDoctor);
  });
});

describe('safety — boundary & accountability surface (safety-spec MCP-2/MCP-3)', () => {
  it('exposes NO boundary-mutating or secret-writing tools', () => {
    const names = TOOLS.map((t) => t.name);
    for (const forbidden of [
      'gmail_login', 'gmail_init',
      'gmail_allow_add', 'gmail_allow_remove',
      'gmail_config_set', 'gmail_config_get', 'gmail_config_unset',
      'gmail_profile_add', 'gmail_profile_use', 'gmail_profile_remove',
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it('gmail_send does not expose the allowlist bypass or log-suppression args', () => {
    const send = byName('gmail_send');
    expect(Object.keys(send.inputSchema)).not.toContain('no_allowlist');
    expect(Object.keys(send.inputSchema)).not.toContain('no_log');
  });

  it('gmail_send.mapArgs never produces noAllowlist/noLog even if the args are injected', () => {
    const send = byName('gmail_send');
    const mapped = send.mapArgs({ to: 'a@b.com', no_allowlist: true, no_log: true, allowlist: false, log: false });
    expect(mapped).not.toHaveProperty('noAllowlist');
    expect(mapped).not.toHaveProperty('noLog');
    expect(mapped).not.toHaveProperty('allowlist');
    expect(mapped).not.toHaveProperty('log');
  });
});

describe('mapArgs — snake_case → camelCase', () => {
  it('gmail_send maps all renamed fields', () => {
    const mapped = byName('gmail_send').mapArgs({
      to: ['a@b.com'], cc: 'c@d.com', bcc: 'e@f.com', subject: 's', body: 'b', html: '<p>h</p>',
      markdown: true, no_style: true, no_signature: true, attach: ['/f.pdf'],
      from_name: 'Me', reply_to: 'r@x.com', in_reply_to: '<m1>', references: ['<m0>'],
      dry_run: true, profile: 'work',
    });
    expect(mapped).toEqual({
      to: ['a@b.com'], cc: 'c@d.com', bcc: 'e@f.com', subject: 's', body: 'b', html: '<p>h</p>',
      markdown: true, noStyle: true, noSignature: true, attach: ['/f.pdf'],
      fromName: 'Me', replyTo: 'r@x.com', inReplyTo: '<m1>', references: ['<m0>'],
      dryRun: true, profile: 'work',
    });
  });

  it('gmail_read_thread maps thread_id → threadId', () => {
    expect(byName('gmail_read_thread').mapArgs({ thread_id: 't1', mailbox: 'INBOX' }))
      .toEqual({ threadId: 't1', mailbox: 'INBOX', profile: undefined });
  });

  it('gmail_mark passes read/unread/uid through', () => {
    expect(byName('gmail_mark').mapArgs({ uid: '5', read: true }))
      .toEqual({ uid: '5', read: true, unread: undefined, mailbox: undefined, profile: undefined });
  });

  it('gmail_label_add maps uid/name/mailbox', () => {
    expect(byName('gmail_label_add').mapArgs({ uid: '7', name: 'Work', mailbox: 'INBOX', profile: 'p' }))
      .toEqual({ uid: '7', name: 'Work', mailbox: 'INBOX', profile: 'p' });
  });

  it('profile-only tools thread the profile arg', () => {
    expect(byName('gmail_doctor').mapArgs({ profile: 'work' })).toEqual({ profile: 'work' });
    expect(byName('gmail_allow_list').mapArgs({})).toEqual({ profile: undefined });
  });
});
