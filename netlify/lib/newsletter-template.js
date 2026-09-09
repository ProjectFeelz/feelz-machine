/**
 * netlify/lib/newsletter-template.js
 *
 * The HTML for a newsletter email, and the plain-text alternative.
 *
 *
 * WHY IT LOOKS LIKE 2005 IN HERE
 *
 * Email clients are not browsers. Outlook renders with Word's engine, Gmail
 * strips <style> from forwarded mail, and no client can be relied on for flex,
 * grid, custom properties, or even a background colour on <body>. So this is
 * table-based, inline-styled, and 600px wide, which is what actually arrives
 * intact. None of the app's Tailwind can be reused here.
 *
 * It is also light-on-white rather than matching the app's black. Dark-themed
 * HTML mail is unreliable — several clients invert colours themselves and a
 * dark design comes out unreadable — and a newsletter that cannot be read is
 * worth less than one that does not match the brand.
 *
 *
 * THE BODY IS AUTHOR-SUPPLIED HTML
 *
 * NewsletterComposePage writes with a WYSIWYG editor, so `body` is already
 * HTML from a trusted author (a full admin, or someone in newsletter_editors).
 * It is passed through rather than escaped, which is the intent — but it is
 * also why the compose page's editor is the security boundary here, and why
 * newsletter_editors should stay a short list.
 *
 * Everything that is NOT author HTML — title, excerpt, recipient name — is
 * escaped, because those come from other places.
 */

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strip tags for the text/plain alternative. Crude, and sufficient. */
function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '  - ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * A YouTube URL cannot become a playing video in email — no client allows
 * script or iframe — so it becomes a thumbnail that links out. That is what
 * every newsletter platform does, for the same reason.
 */
function youtubeBlock(url) {
  if (!url) return '';
  const m = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (!m) return '';
  const id = m[1];
  const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const watch = `https://www.youtube.com/watch?v=${id}`;
  return `
    <tr><td style="padding:8px 32px 24px 32px;">
      <a href="${watch}" style="text-decoration:none;display:block;">
        <img src="${thumb}" width="536" alt="Watch on YouTube"
             style="display:block;width:100%;max-width:536px;height:auto;border-radius:8px;border:1px solid #e5e5e5;" />
        <span style="display:inline-block;margin-top:10px;font:600 14px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#7c3aed;">
          Watch on YouTube &rarr;
        </span>
      </a>
    </td></tr>`;
}

/**
 * @param post           { title, excerpt, body, youtube_url, slug? }
 * @param recipient      { email, name? }
 * @param unsubscribeUrl absolute URL
 * @param siteUrl        absolute site root
 */
function buildNewsletterEmail(post, recipient, unsubscribeUrl, siteUrl = 'https://www.feelzmachine.com') {
  const title   = escapeHtml(post.title);
  const excerpt = escapeHtml(post.excerpt || '');
  const name    = recipient && recipient.name ? escapeHtml(recipient.name) : '';
  const postUrl = post.slug ? `${siteUrl}/newsletter/${encodeURIComponent(post.slug)}` : siteUrl;

  const html = `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <!-- Preheader: the grey line the inbox shows next to the subject. Hidden in
       the body itself. Without it, clients pick the first words of the article,
       which is usually a heading repeat. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${excerpt || title}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:24px 12px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">

        <tr><td style="padding:28px 32px 8px 32px;">
          <span style="font:700 15px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;letter-spacing:-0.2px;color:#111111;">
            Feelz Machine
          </span>
        </td></tr>

        <tr><td style="padding:8px 32px 0 32px;">
          <h1 style="margin:0;font:700 26px/1.25 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;letter-spacing:-0.5px;color:#111111;">
            ${title}
          </h1>
        </td></tr>

        ${excerpt ? `<tr><td style="padding:10px 32px 0 32px;">
          <p style="margin:0;font:400 16px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#52525b;">
            ${excerpt}
          </p>
        </td></tr>` : ''}

        ${name ? `<tr><td style="padding:18px 32px 0 32px;">
          <p style="margin:0;font:400 16px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111111;">
            Hi ${name},
          </p>
        </td></tr>` : ''}

        <tr><td style="padding:14px 32px 8px 32px;font:400 16px/1.65 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#27272a;">
          ${post.body || ''}
        </td></tr>

        ${youtubeBlock(post.youtube_url)}

        <tr><td style="padding:8px 32px 30px 32px;">
          <a href="${postUrl}"
             style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;
                    font:600 15px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                    padding:12px 22px;border-radius:8px;">
            Open on Feelz Machine
          </a>
        </td></tr>

        <tr><td style="padding:0 32px;"><div style="height:1px;background:#e5e5e5;"></div></td></tr>

        <tr><td style="padding:18px 32px 26px 32px;">
          <p style="margin:0 0 8px 0;font:400 12px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#a1a1aa;">
            You are receiving this because you asked to hear from Feelz Machine.
          </p>
          <p style="margin:0;font:400 12px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#a1a1aa;">
            <a href="${unsubscribeUrl}" style="color:#71717a;text-decoration:underline;">Unsubscribe or change what you receive</a>
          </p>
        </td></tr>

      </table>

    </td></tr>
  </table>
</body></html>`;

  const text = [
    post.title,
    '',
    post.excerpt || '',
    '',
    htmlToText(post.body),
    '',
    post.youtube_url ? `Watch: ${post.youtube_url}` : '',
    '',
    `Read it on Feelz Machine: ${postUrl}`,
    '',
    `Unsubscribe or change what you receive: ${unsubscribeUrl}`,
  ].filter(Boolean).join('\n');

  return { subject: post.title, html, text };
}

module.exports = { buildNewsletterEmail, escapeHtml, htmlToText };