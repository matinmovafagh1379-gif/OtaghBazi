// Vercel Serverless Function — جایگزین worker.js برای هاست روی Vercel
// هیچ کلید یا توکنی اینجا نوشته نشده؛ همه از Environment Variables
// (تنظیمات پروژه در داشبورد Vercel، بخش Settings > Environment Variables) خونده می‌شن.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // ---------- 1) هانی‌پات: فیلد مخفی که فقط ربات‌ها پر می‌کنن ----------
    if (data._gotcha) {
      res.status(200).json({ success: true });
      return;
    }

    // ---------- 2) اعتبارسنجی سمت سرور ----------
    const parentName = sanitize(data.parent_name);
    const phone = sanitize(data.phone);
    const childInfo = sanitize(data.child_info);
    const preferredDay = sanitize(data.preferred_day);
    const preferredTime = sanitize(data.preferred_time);
    const message = sanitize(data.message);

    if (!parentName || parentName.length > 100) {
      res.status(400).json({ success: false, error: 'نام والد نامعتبره.' });
      return;
    }
    if (!phone || !/^[\d+\-\s()]{6,20}$/.test(phone)) {
      res.status(400).json({ success: false, error: 'شماره تماس نامعتبره.' });
      return;
    }

    // ---------- 3) ارسال به تلگرام ----------
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

    // ---------- 4) ارسال ایمیل (Web3Forms) ----------
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
    res.status(anySuccess ? 200 : 502).json({ success: anySuccess, channels: results });

  } catch (err) {
    res.status(400).json({ success: false, error: 'درخواست نامعتبر بود.' });
  }
}

function sanitize(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>]/g, '').trim().slice(0, 500);
}
