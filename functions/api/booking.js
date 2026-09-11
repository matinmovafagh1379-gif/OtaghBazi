// Cloudflare Pages Function — /api/booking
// این فایل بک‌اند رزرو نوبته. با استقرار روی Cloudflare Pages، خودکار روی
// مسیر /api/booking در دسترسه. هیچ کلید یا توکنی اینجا نوشته نشده؛
// همه از Environment Variables (تنظیمات پروژه در داشبورد Cloudflare) خونده می‌شن.

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    // ---------- 1) هانی‌پات: فیلد مخفی که فقط ربات‌ها پر می‌کنن ----------
    if (data._gotcha) {
      return jsonResponse({ success: true }, 200); // به ربات بگو موفق بود، ولی چیزی نفرست
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

    // ---------- 3) ارسال به تلگرام (توکن فقط سمت سرور، هیچ‌وقت به کاربر نمیره) ----------
    const results = { telegram: false, email: false };

    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      const text =
        '📩 درخواست نوبت جدید از سایت\n\n' +
        '👤 والد: ' + parentName + '\n' +
        '📞 تماس: ' + phone + '\n' +
        '🧒 کودک: ' + (childInfo || '—') + '\n' +
        '📅 روز: ' + (preferredDay || '—') + '\n' +
        '🕐 زمان: ' + (preferredTime || '—') + '\n' +
        '📝 توضیح: ' + (message || '—');

      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text })
        });
        results.telegram = tgRes.ok;
      } catch (e) {
        results.telegram = false;
      }
    }

    // ---------- 4) ارسال ایمیل (Web3Forms) ----------
    if (env.WEB3FORMS_KEY) {
      try {
        const emailRes = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_key: env.WEB3FORMS_KEY,
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

// درخواست‌های غیر از POST رو رد کن
export async function onRequestGet() {
  return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
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
