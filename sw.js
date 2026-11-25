/* Service worker de Ma stratégie : hors ligne, partage de captures, rappel du jour d'investir */
const VERSION = 'ms-v5';
const APP = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
const CDN = /(^|\.)cdn\.jsdelivr\.net$|^fonts\.googleapis\.com$|^fonts\.gstatic\.com$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('ms-v') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function shareTarget(req){
  try {
    const form = await req.formData();
    const file = form.get('image');
    if (file && typeof file !== 'string') {
      const c = await caches.open('ms-share');
      await c.put('./__share/image', new Response(file, { headers:{ 'content-type':file.type || 'image/png' } }));
    }
  } catch (e) { /* rien */ }
  return Response.redirect('./?share=1', 303);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share-target')) { e.respondWith(shareTarget(req)); return; }
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put('./index.html', copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html').then(r => r || caches.match('./'))));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    })));
    return;
  }
  if (CDN.test(url.hostname)) {
    e.respondWith(caches.open('ms-cdn').then(c => c.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') c.put(req, res.clone()).catch(() => {});
      return res;
    }))));
  }
  /* Google Sheets et le reste : réseau direct */
});

function parisISO(){
  const f = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit' });
  const o = {}; f.formatToParts(new Date()).forEach(p => { o[p.type] = p.value; });
  return `${o.year}-${o.month}-${o.day}`;
}
async function checkReminder(){
  const c = await caches.open('ms-meta');
  const r = await c.match('./__meta/reminder');
  if (!r) return;
  const meta = await r.json();
  const today = parisISO();
  if (!meta.enabled || !Array.isArray(meta.dates) || !meta.dates.includes(today) || meta.notified === today) return;
  await self.registration.showNotification('Ma stratégie', {
    body:"C'est le jour d'investir. Ouvre l'appli pour voir ton ordre du mois.",
    icon:'./icon-192.png', badge:'./icon-192.png', tag:'invest-day', lang:'fr'
  });
  meta.notified = today;
  await c.put('./__meta/reminder', new Response(JSON.stringify(meta), { headers:{ 'content-type':'application/json' } }));
}
self.addEventListener('periodicsync', e => { if (e.tag === 'ms-reminder') e.waitUntil(checkReminder()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
    for (const w of list) { if ('focus' in w) return w.focus(); }
    return self.clients.openWindow('./?tab=home');
  }));
});
