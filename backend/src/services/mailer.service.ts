import { env, isProd } from '../config/env';
import { logger } from '../utils/logger';

interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Mailer stub (approved for MVP). In dev the full message, including any
 * verification / reset link, is logged to the console. No SMTP transport is wired yet:
 * in production this logs only the recipient and subject and never the body (tokens).
 * TODO: swap in a real SMTP transport using SMTP_* env vars.
 */
export const sendMail = async (mail: Mail): Promise<void> => {
  if (isProd) {
    logger.warn('Mailer not configured: email not sent', { to: mail.to, subject: mail.subject });
    return;
  }
  logger.info('[mail stub]', mail);
};

export const appLink = (path: string, params: Record<string, string>) => {
  const url = new URL(path, env.APP_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
};
