export const ALLOWLIST_TEMPLATE =
  JSON.stringify(
    {
      _comment:
        'The configured account (credentials.json / GMAIL_USER) is always allowed to receive mail from itself. Add other permitted recipients here. This file is edited by hand.',
      recipients: [{ email: 'person@example.com', aliases: ['person'] }],
    },
    null,
    2,
  ) + '\n';

export const CONFIG_TEMPLATE =
  JSON.stringify(
    {
      _comment: 'All fields are optional. Remove or leave blank any you do not need.',
      fromName: 'Your Name',
      replyTo: 'you@example.com',
      signature: {
        text: '--\nYour Name',
        html: '<p>--<br>Your Name</p>',
      },
      sendLog: {
        enabled: true,
        logBody: false,
      },
    },
    null,
    2,
  ) + '\n';
