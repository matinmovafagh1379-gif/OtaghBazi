// mobile nav toggle
const menuToggle = document.getElementById('menuToggle');
const nav = document.getElementById('nav');
const navBackdrop = document.getElementById('navBackdrop');
const navClose = document.getElementById('navClose');
const siteHeader = document.querySelector('.modern-header') || document.querySelector('header');

// دقیقاً ارتفاع واقعی هدر رو اندازه می‌گیره تا منو همیشه درست زیر خودش بشینه،
// صرف‌نظر از سایز صفحه یا اینکه فونت/زوم کاربر چقدره
function syncHeaderHeight() {
  if (siteHeader) {
    document.documentElement.style.setProperty('--header-h', siteHeader.offsetHeight + 'px');
  }
}
syncHeaderHeight();
window.addEventListener('resize', syncHeaderHeight);

function openNav() {
  syncHeaderHeight();
  nav.classList.add('open');
  navBackdrop.classList.add('show');
  menuToggle.classList.add('is-active');
  menuToggle.setAttribute('aria-expanded', 'true');
}
function closeNav() {
  nav.classList.remove('open');
  navBackdrop.classList.remove('show');
  menuToggle.classList.remove('is-active');
  menuToggle.setAttribute('aria-expanded', 'false');
}
menuToggle.addEventListener('click', () => {
  nav.classList.contains('open') ? closeNav() : openNav();
});
if (navClose) navClose.addEventListener('click', closeNav);
navBackdrop.addEventListener('click', closeNav);
nav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeNav));

// media filter tabs
const filterBtns = document.querySelectorAll('.filter-btn');
const mediaCards = document.querySelectorAll('.media-card');
filterBtns.forEach(btn => btn.addEventListener('click', () => {
  filterBtns.forEach(b => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  const f = btn.dataset.filter;
  mediaCards.forEach(card => {
    card.style.display = (f === 'all' || card.dataset.type === f) ? '' : 'none';
  });
}));

// scroll reveal
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); } });
  }, { threshold: .15 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
} else {
  document.querySelectorAll('.reveal').forEach(el => el.classList.add('in-view'));
}

// highlight today's row in the working-hours table
// JS Date.getDay(): 0=Sunday...6=Saturday → map to our table's data-day (0=شنبه...6=جمعه)
const dayMap = [1, 2, 3, 4, 5, 6, 0];
const todayIndex = dayMap[new Date().getDay()];
const todayRow = document.querySelector('#hoursTable tr[data-day="' + todayIndex + '"]');
if (todayRow) todayRow.classList.add('is-today');

// ============ فرم رزرو: ارسال هم‌زمان به تلگرام و ایمیل ============
const TELEGRAM_BOT_TOKEN = '8529446234:AAHrwKorZPlr9QOqhusU-viUX1jwHixGpYY';
const TELEGRAM_CHAT_ID   = '75666671';
const WEB3FORMS_KEY      = '2de49184-ce2d-4d3c-aeba-e692a236ab51';

const bookingForm = document.getElementById('bookingForm');
const bookingSubmitBtn = bookingForm ? bookingForm.querySelector('button[type="submit"]') : null;
const bookingNoteEl = bookingForm ? bookingForm.querySelector('.form-note') : null;

function bookingShowStatus(message, isError) {
  if (!bookingNoteEl) return;
  bookingNoteEl.textContent = message;
  bookingNoteEl.style.color = isError ? '#E8543F' : 'var(--grass)';
}

async function sendToTelegram(data) {
  const text =
    '📩 درخواست نوبت جدید از سایت\n\n' +
    '👤 والد: ' + data.parent_name + '\n' +
    '📞 تماس: ' + data.phone + '\n' +
    '🧒 کودک: ' + (data.child_info || '—') + '\n' +
    '📅 روز: ' + data.preferred_day + '\n' +
    '🕐 زمان: ' + data.preferred_time + '\n' +
    '📝 توضیح: ' + (data.message || '—');

  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
  });
  const json = await res.json().catch(() => ({}));
  console.log('[booking] telegram response:', res.status, json);
  if (!res.ok) throw new Error('telegram failed: ' + res.status + ' ' + JSON.stringify(json));
}

async function sendToEmail(data) {
  const res = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_key: WEB3FORMS_KEY,
      subject: 'درخواست نوبت جدید — اتاق بازی',
      'نام والد': data.parent_name,
      'شماره تماس': data.phone,
      'کودک': data.child_info || '—',
      'روز پیشنهادی': data.preferred_day,
      'زمان پیشنهادی': data.preferred_time,
      'توضیح': data.message || '—'
    })
  });
  const json = await res.json().catch(() => ({}));
  console.log('[booking] web3forms response:', res.status, json);
  if (!json.success) throw new Error('email failed: ' + res.status + ' ' + JSON.stringify(json));
}

if (bookingForm) {
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fd = new FormData(bookingForm);
    const data = Object.fromEntries(fd.entries());

    if (bookingSubmitBtn) { bookingSubmitBtn.disabled = true; bookingSubmitBtn.style.opacity = '.7'; }
    bookingShowStatus('در حال ارسال...', false);

    const channels = ['تلگرام', 'ایمیل'];
    const results = await Promise.allSettled([sendToTelegram(data), sendToEmail(data)]);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error('[booking]', channels[i], 'خطا داد:', r.reason);
      }
    });
    const okCount = results.filter(r => r.status === 'fulfilled').length;

    if (okCount > 0) {
      bookingShowStatus('✅ درخواستت ثبت شد! به‌زودی باهات تماس می‌گیریم.', false);
      bookingForm.reset();
    } else {
      bookingShowStatus('مشکلی پیش اومد — لطفاً از طریق تلفن یا پذیرش۲۴ اقدام کن.', true);
    }

    if (bookingSubmitBtn) { bookingSubmitBtn.disabled = false; bookingSubmitBtn.style.opacity = '1'; }
  });
}
