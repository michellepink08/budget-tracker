// Inline styles only — no external images or webfonts, matching the app's
// cream background / deep muted-green accent. Keeps the email lightweight
// and avoids deliverability issues tied to loading external assets.
export function passwordResetEmailHtml(resetUrl: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px;background-color:#faf6ef;font-family:system-ui,-apple-system,sans-serif;color:#1f2a24;">
    <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:8px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#1f2a24;">Reset your password</h1>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#4b5a52;">
        We received a request to reset the password on your Budget Tracker account.
        This link expires in 1 hour and can only be used once.
      </p>
      <a
        href="${resetUrl}"
        style="display:inline-block;padding:12px 24px;background-color:#2f4a3c;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;"
      >
        Reset password
      </a>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#8a978f;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  </body>
</html>`;
}

export function passwordResetEmailText(resetUrl: string): string {
  return `Reset your password

We received a request to reset the password on your Budget Tracker account.
This link expires in 1 hour and can only be used once.

${resetUrl}

If you didn't request this, you can safely ignore this email.`;
}
