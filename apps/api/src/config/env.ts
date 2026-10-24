import { z } from 'zod';

// WEB_ORIGIN can hold several addresses separated by commas, e.g. the Vercel URL and the custom domain.
const origins = z.string().min(1).refine((v) => v.split(',').every((o) => { try { return new URL(o.trim()).protocol.startsWith('http'); } catch { return false; } }), 'WEB_ORIGIN must be one or more http(s) URLs separated by commas');

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  API_PORT: z.coerce.number().default(4000),
  PORT: z.coerce.number().optional(),            // set automatically by most hosts (Render, Railway...)
  WEB_ORIGIN: origins,
  ENABLE_DOCS: z.enum(['true', 'false']).optional(),
  // optional external alert channels (WhatsApp Cloud API / Telegram bot)
  WHATSAPP_TOKEN: z.string().optional(), WHATSAPP_PHONE_NUMBER_ID: z.string().optional(), WHATSAPP_TEMPLATE: z.string().optional(), WHATSAPP_TEMPLATE_LANG: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(), TELEGRAM_BOT_USERNAME: z.string().optional(), PUBLIC_WEB_URL: z.string().optional(),
});

export const validateEnv = (config: Record<string, unknown>) => {
  const r = schema.safeParse(config);
  if (!r.success) throw new Error('Invalid environment: ' + JSON.stringify(r.error.flatten().fieldErrors));
  return r.data;
};
