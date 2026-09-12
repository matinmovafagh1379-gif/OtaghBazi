// Vercel Edge Function — /api/booking
// نسخه‌ی Vercel از همون بک‌اند رزرو نوبت. اگه سایت روی Vercel بمونه، این فایل
// جایگزین worker.js (که مخصوص Cloudflare Workers بود) می‌شه.
// توکن‌ها از Environment Variables پروژه‌ی Vercel خونده می‌شن (Settings > Environment Variables)،
// نه از کد. هیچ‌وقت اینجا مستقیم ننویسشون.

export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const data = await request.json();

    // ---------- 1) هانی‌پات ----------
    if (data._gotcha) {
      return jsonResponse({ success: true }, 200);
    }

    // ---------- 2) اعتبارسنجی سمت سرور ----------
    const parentName = sanitize(data.parent_name);
    const phone = sanitize(data.phone);
    const childInfo = sanitize(data.child_info);
    const preferredDay = sanitize(data.preferred_day);
    const preferredTime = sanitize(data.preferred_time);
    const message = sanitize(data.message);

    if (!parentName || parentName.length > 100) {
      return jsonResponse({ success: false, error: 'نام والد نامعتبره.' }, 400);
    }
    if (!phone || !/^[\d+\-\s()]{6,20}$/.test(phone)) {
      return jsonResponse({ success: false, error: 'شماره تماس نامعتبره.' }, 400);
    }

    // ---------- 3) بررسی Cloudflare Turnstile (در صورت فعال بودن) ----------
    const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
    if (TURNSTILE_SECRET_KEY) {
      const turnstileToken = data['cf-turnstile-response'];
      if (!turnstileToken) {
        return jsonResponse({ success: false, error: 'لطفاً دوباره تلاش کن (کپچا).' }, 400);
      }
      const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: TURNSTILE_SECRET_KEY,
          response: turnstileToken,
          remoteip: request.headers.get('x-forwarded-for') || ''
        })
      });
      const verifyJson = await verify.json();
      if (!verifyJson.success) {
        return jsonResponse({ success: false, error: 'تایید کپچا رد شد.' }, 400);
      }
    }

    // ---------- 4) ارسال به تلگرام ----------
    const results = { telegram: false, email: false };
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const WEB3FORMS_KEY = process.env.WEB3FORMS_KEY;

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      const text =
        '📩 درخواست نوبت جدید از سایت\n\n' +
        '👤 والد: ' + parentName + '\n' +
        '📞 تماس: ' + phone + '\n' +
        '🧒 کودک: ' + (childInfo || '—') + '\n' +
        '📅 روز: ' + (preferredDay || '—') + '\n' +
        '🕐 زمان: ' + (preferredTime || '—') + '\n' +
        '📝 توضیح: ' + (message || '—');

      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
        });
        results.telegram = tgRes.ok;
      } catch (e) {
        results.telegram = false;
      }
    }

    // ---------- 5) ارسال ایمیل (Web3Forms) ----------
    if (WEB3FORMS_KEY) {
      try {
        const emailRes = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_key: WEB3FORMS_KEY,
            subject: 'درخواست نوبت جدید — اتاق بازی',
            'نام والد': parentName,
            'شماره تماس': phone,
            'کودک': childInfo || '—',
            'روز پیشنهادی': preferredDay || '—',
            'زمان پیشنهادی': preferredTime || '—',
            'توضیح': message || '—'
          })
        });
        const emailJson = await emailRes.json().catch(() => ({}));
        results.email = !!emailJson.success;
      } catch (e) {
        results.email = false;
      }
    }

    const anySuccess = results.telegram || results.email;
    return jsonResponse({ success: anySuccess, channels: results }, anySuccess ? 200 : 502);

  } catch (err) {
    return jsonResponse({ success: false, error: 'درخواست نامعتبر بود.' }, 400);
  }
}

function sanitize(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>]/g, '').trim().slice(0, 500);
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
