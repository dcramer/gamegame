import { Resend } from 'resend';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface EmailProvider {
  send(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

/**
 * Resend email provider
 */
export class ResendEmailProvider implements EmailProvider {
  private resend: Resend;
  private fromEmail: string;

  constructor(apiKey: string, fromEmail: string = 'GameGame <noreply@gamegame.ai>') {
    this.resend = new Resend(apiKey);
    this.fromEmail = fromEmail;
  }

  async send(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { data, error } = await this.resend.emails.send({
        from: options.from || this.fromEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      if (error) {
        console.error('Resend email error:', error);
        return { success: false, error: error.message };
      }

      console.log('Email sent successfully via Resend', { messageId: data?.id, to: options.to });
      return { success: true, messageId: data?.id };
    } catch (error) {
      console.error('Failed to send email via Resend:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Development email provider (logs to console, no actual sending)
 */
export class DevEmailProvider implements EmailProvider {
  async send(options: EmailOptions): Promise<{ success: boolean; messageId?: string }> {
    console.log('📧 [DEV MODE] Email would be sent:', {
      to: options.to,
      subject: options.subject,
      from: options.from,
    });
    console.log('📧 [DEV MODE] Email HTML content:\n', options.html);
    console.log(
      '📧 [DEV MODE] In production, this would be sent via the configured email provider.'
    );

    return { success: true, messageId: `dev-${Date.now()}` };
  }
}

/**
 * Factory function to create the appropriate email provider
 */
export function createEmailProvider(
  resendApiKey?: string,
  environment: string = 'development'
): EmailProvider {
  // If we have a Resend API key, use Resend
  if (resendApiKey) {
    console.log('Using Resend email provider');
    return new ResendEmailProvider(resendApiKey);
  }

  // Development mode: log emails to console
  if (environment === 'development') {
    console.log('Using development email provider (emails logged to console)');
    return new DevEmailProvider();
  }

  // Production without email provider configured
  console.warn('No email provider configured in production! Emails will not be sent.');
  return new DevEmailProvider();
}

/**
 * Generate magic link email HTML
 */
export function generateMagicLinkEmail(loginUrl: string, expiryMinutes: number = 15): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login to GameGame</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    h1 {
      color: #1a1a1a;
      font-size: 24px;
      margin-bottom: 20px;
    }
    p {
      margin-bottom: 16px;
    }
    .button {
      display: inline-block;
      background-color: #0070f3;
      color: #ffffff;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
    }
    .button:hover {
      background-color: #0051cc;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #eaeaea;
      font-size: 12px;
      color: #666;
    }
    .warning {
      background-color: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      padding: 12px;
      margin-top: 20px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎲 Login to GameGame</h1>

    <p>Hello!</p>

    <p>You requested a magic link to log in to GameGame. Click the button below to access your account:</p>

    <a href="${loginUrl}" class="button">Log in to GameGame</a>

    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; font-size: 12px; background-color: #f5f5f5; padding: 10px; border-radius: 4px;">
      ${loginUrl}
    </p>

    <div class="warning">
      ⏱️ This link will expire in ${expiryMinutes} minutes for security.
    </div>

    <div class="footer">
      <p>If you didn't request this email, you can safely ignore it.</p>
      <p>This is an automated email from GameGame. Please do not reply to this message.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
