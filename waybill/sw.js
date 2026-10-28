// Кешує оболонку застосунку, щоб він відкривався як звичайна апка навіть зі слабким інтернетом.
const CACHE='waybill-v2';
const SHELL=['./','./index.html','./app.js','./app.css','./web/','./demo/','./manifest.webmanifest','../icons/icon-192.png','../icons/icon-512.png','../icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('waybill-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;          // шрифти й бібліотека QR ідуть напряму в мережу
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
