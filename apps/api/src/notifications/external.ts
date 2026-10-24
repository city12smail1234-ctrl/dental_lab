// Messages that leave the website: text rendering + the two senders (WhatsApp Cloud API, Telegram Bot API).
// No patient data is ever included: only the case/order reference, the doctor's name and clinic, and a link.
export type Lang = 'ar' | 'en';
type Params = Record<string, string | undefined>;

const T: Record<Lang, Record<string, string>> = {
  ar: {
    case_new: '🦷 حالة جديدة {ref}{by}', case_received: '✅ تم استلام حالتك {ref}', case_status: 'الحالة {ref}: {status}', case_message: '💬 رسالة جديدة على الحالة {ref}{by}',
    order_new: '🛒 طلب جديد {ref}{by}', order_received: '✅ تم استلام طلبك {ref}', order_status: 'الطلب {ref}: {status}', payment_proof: '🧾 إيصال دفع جديد للطلب {ref}{by}',
    payment_paid: '✅ تم تأكيد دفع الطلب {ref}', payment_rejected: '⚠️ تم رفض إيصال الطلب {ref}، أرسل إيصالًا صحيحًا', doctor_new: '👤 طبيب جديد بانتظار الموافقة: {ref}',
    doctor_status: '{status}', delivery_new: '🚚 طلب توصيل جديد {ref}{by}', delivery_status: 'التوصيل {ref}: {status}', delivery_failed: '⚠️ فشل توصيل {ref}{by}',
    delivery_assigned: '🚚 تم تعيين توصيل لك {ref}', test: '✅ رسالة تجريبية من City Smile Dental Lab. التنبيهات شغالة.', generic: 'إشعار جديد',
  },
  en: {
    case_new: '🦷 New case {ref}{by}', case_received: '✅ Your case {ref} was received', case_status: 'Case {ref}: {status}', case_message: '💬 New message on case {ref}{by}',
    order_new: '🛒 New order {ref}{by}', order_received: '✅ Your order {ref} was received', order_status: 'Order {ref}: {status}', payment_proof: '🧾 New payment receipt for order {ref}{by}',
    payment_paid: '✅ Payment confirmed for order {ref}', payment_rejected: '⚠️ The receipt for order {ref} was rejected, please send a valid one', doctor_new: '👤 New doctor awaiting approval: {ref}',
    doctor_status: '{status}', delivery_new: '🚚 New delivery request {ref}{by}', delivery_status: 'Delivery {ref}: {status}', delivery_failed: '⚠️ Delivery {ref} failed{by}',
    delivery_assigned: '🚚 A delivery was assigned to you {ref}', test: '✅ Test message from City Smile Dental Lab. Alerts are working.', generic: 'New notification',
  },
};
const S: Record<Lang, Record<string, string>> = {
  ar: {
    cs_submitted: 'تم الإرسال', cs_info_required: 'مطلوب معلومات', cs_approved: 'تمت الموافقة', cs_designing: 'التصميم', cs_milling: 'التصنيع', cs_finishing: 'التشطيب', cs_quality_control: 'مراجعة الجودة',
    cs_ready_for_delivery: 'جاهز للتسليم', cs_out_for_delivery: 'خرج للتوصيل', cs_delivered: 'تم التسليم', cs_on_hold: 'معلّق', cs_rejected: 'مرفوض', cs_cancelled: 'ملغي',
    os_pending: 'قيد المراجعة', os_confirmed: 'مؤكد', os_processing: 'قيد التجهيز', os_out_for_delivery: 'خرج للتوصيل', os_delivered: 'تم التسليم', os_cancelled: 'ملغي',
    dv_failed: 'فشل التوصيل', dv_rescheduled: 'أعيدت الجدولة',
    ds_pending: 'حسابك قيد المراجعة.', ds_approved: 'تمت الموافقة على حسابك ✅', ds_rejected: 'تم رفض الطلب، تواصل مع المعمل.', ds_suspended: 'حسابك موقوف مؤقتًا، تواصل مع المعمل.',
  },
  en: {
    cs_submitted: 'Submitted', cs_info_required: 'Information required', cs_approved: 'Approved', cs_designing: 'Designing', cs_milling: 'Milling', cs_finishing: 'Finishing', cs_quality_control: 'Quality control',
    cs_ready_for_delivery: 'Ready for delivery', cs_out_for_delivery: 'Out for delivery', cs_delivered: 'Delivered', cs_on_hold: 'On hold', cs_rejected: 'Rejected', cs_cancelled: 'Cancelled',
    os_pending: 'Under review', os_confirmed: 'Confirmed', os_processing: 'Processing', os_out_for_delivery: 'Out for delivery', os_delivered: 'Delivered', os_cancelled: 'Cancelled',
    dv_failed: 'Delivery failed', dv_rescheduled: 'Rescheduled',
    ds_pending: 'Your account is under review.', ds_approved: 'Your account was approved ✅', ds_rejected: 'Your request was rejected. Please contact the lab.', ds_suspended: 'Your account is suspended. Please contact the lab.',
  },
};

export function renderMessage(kind: string, params: Params | null, lang: Lang): string {
  const p = params ?? {};
  const by = p.doctor ? ` — ${p.doctor}${p.clinic ? ` (${p.clinic})` : ''}` : '';
  const text = (T[lang][kind] ?? T[lang].generic).replace('{ref}', p.ref ?? '').replace('{by}', by).replace('{status}', p.status_key ? S[lang][p.status_key] ?? '' : '');
  return text.trim();
}

/** WhatsApp template parameters cannot contain new lines or long runs of spaces. */
export const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' | ').replace(/ {2,}/g, ' ').trim();

export interface WaCfg { token: string; phoneNumberId: string; template: string; templateLang: string; apiBase: string }
export interface TgCfg { token: string; apiBase: string }

export function waConfig(env: NodeJS.ProcessEnv = process.env): WaCfg | null {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_TEMPLATE) return null;
  return { token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, template: env.WHATSAPP_TEMPLATE, templateLang: env.WHATSAPP_TEMPLATE_LANG || 'ar', apiBase: env.WHATSAPP_API_BASE || 'https://graph.facebook.com/v21.0' };
}
export function tgConfig(env: NodeJS.ProcessEnv = process.env): TgCfg | null {
  return env.TELEGRAM_BOT_TOKEN ? { token: env.TELEGRAM_BOT_TOKEN, apiBase: env.TELEGRAM_API_BASE || 'https://api.telegram.org' } : null;
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/** Business-initiated WhatsApp messages must use an approved template with ONE body variable ({{1}}). */
export async function sendWhatsApp(cfg: WaCfg, to: string, text: string) {
  await post(`${cfg.apiBase}/${cfg.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), type: 'template',
    template: { name: cfg.template, language: { code: cfg.templateLang }, components: [{ type: 'body', parameters: [{ type: 'text', text: oneLine(text).slice(0, 900) }] }] },
  }, { Authorization: `Bearer ${cfg.token}` });
}

export async function sendTelegram(cfg: TgCfg, chatId: string, text: string) {
  await post(`${cfg.apiBase}/bot${cfg.token}/sendMessage`, { chat_id: chatId, text, disable_web_page_preview: true });
}

export async function telegramUpdates(cfg: TgCfg, offset: number): Promise<{ update_id: number; message?: { text?: string; chat: { id: number } } }[]> {
  const r = await post(`${cfg.apiBase}/bot${cfg.token}/getUpdates`, { offset, timeout: 0, allowed_updates: ['message'] });
  return r.result ?? [];
}
