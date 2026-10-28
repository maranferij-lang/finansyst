// Аудит прототипу WaybillGuarantee: node tests/waybill.js http://localhost:8768
const { chromium } = require('playwright');
const BASE=process.argv[2]||'http://localhost:8768';
const R=[];const ok=(n,c,d='')=>{R.push([c?'PASS':'FAIL',n,d])};
const st=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('wg-state')).s);
const last=(p,sel)=>p.locator(sel).last().click();
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts|favicon|ServiceWorker|fetching the script/.test(m.text()))errs.push(m.text())});
// самоперевірка моделі
await p.goto(BASE+'/waybill/?selftest');await p.waitForTimeout(800);
const self=await p.evaluate(()=>window.WG_SELFTEST||[]);
ok('S1 самоперевірка: усе ok',self.length>10&&self.every(x=>x.startsWith('ok')),self.filter(x=>!x.startsWith('ok')).join('; '));
await p.evaluate(()=>localStorage.clear());await p.goto(BASE+'/waybill/');await p.waitForTimeout(800);
// 1. пропозиція
await p.click('#mk-link');await p.waitForTimeout(900);let s=await st(p);
ok('W1 посилання сформовано: 123 600 = 37 080 + 43 260 + 43 260',s.deal.total===123600&&s.deal.tr.map(t=>t.a).join()==='37080,43260,43260');
ok('W2 покупцю прийшов пуш',await p.locator('#bpush').count()===1);
// 2–3. підключення і перевірка
await p.click('#bpush');await p.click('#of-go');await p.click('#wz-next');
ok('W3 «Перевірити» неактивна без джерела даних',await p.isDisabled('#wz-check'));
await p.click('[data-src="keycrm"]');await p.click('#wz-check');await p.waitForTimeout(4400);
ok('W4 ліміт 86 800 ₴',/86\s800/.test(await p.textContent('#blayer h3')));
await p.click('#wz-send');await p.waitForTimeout(300);s=await st(p);
ok('W5 заявка в постачальника, зелена',s.b==='ok'&&s.deal.stage==='scored'&&await p.locator('[data-app="olena"] .dot.green').count()===1);
await p.click('[data-app="tkachuk"]');ok('W6 АСВП: погодити неможливо',await p.locator('.adet .btn').first().isDisabled());
await p.click('[data-app="bondar"]');ok('W7 жовта заявка: рекомендовано аванс 60%',/60%/.test(await p.textContent('.adet')));
// 4–5. погодження і підписи
await p.click('[data-app="olena"]');await p.click('#ap-ok');await p.waitForTimeout(300);
ok('W8 договір відкрито',await p.isVisible('#ovl')&&/РОЗСТРОЧЕННЯ ПЛАТЕЖУ/.test(await p.textContent('#ovl')));
await p.click('#sg-sup');await p.waitForTimeout(1200);await p.click('#bpush');await p.click('#sg-buy');await p.waitForTimeout(300);s=await st(p);
ok('W9 договір підписано обома',s.deal.stage==='signed'&&s.deal.sigS&&s.deal.sigB);
// 6. аванс
await p.click('[data-btab="inv"]');await p.click('[data-inv="T1"]');await p.waitForTimeout(500);
ok('W10 рахунок з QR',await p.locator('#qrbox canvas, #qrbox img').count()>0);
await p.click('#inv-pay');await p.waitForTimeout(300);s=await st(p);
ok('W11 аванс звірено автоматично, товар відвантажено',s.deal.tr[0].paid===0&&s.deal.shipped&&s.stmt.at(-1).m==='WG-8492-T1');
// 7. тиждень
await p.click('#day7');await p.waitForTimeout(400);s=await st(p);
ok('W12 день 7, бот написав про NovaPay і чернетку',s.day===7&&s.bot.some(m=>/NovaPay/.test(m.t))&&s.bot.some(m=>/Чернетку/.test(m.t)));
ok('W13 Бойко T3 закрито за кодом, Гнатюк не розпізнано',s.old[1].tr[2].paid===4&&s.stmt.find(e=>e.code==='3399887766').m===null);
// 8. другий транш
await p.click('[data-btab="bot"]');await last(p,'[data-bot-pay="T2"]');await p.waitForTimeout(300);await p.click('#inv-pay');await p.waitForTimeout(300);s=await st(p);
await p.click('[data-stab="ar"]');
ok('W14 T2 сплачено, прострочок нуль',s.deal.tr[1].paid===7&&await p.locator('.trow .chip.crit').count()===0);
ok('W15 усі 8 кроків сценарію позначено',['offer','connect','score','approve','sign','adv','day7','pay2'].every(k=>s.done[k]));
await p.click('#day7');await p.click('#day7');await p.waitForTimeout(300);await p.click('[data-stab="ar"]');
ok('W16 через 21 день T3 прострочено',/WG-8492-T3/.test(await p.locator('.trow:has(.chip.crit)').first().textContent()));
// ручний режим: крок 5 доганяє попередні
await p.click('#reset');await p.click('[data-j="4"]');await p.waitForTimeout(600);s=await st(p);
ok('W17 крок 5 вручну доганяє 1–4 і відкриває договір',s.deal.stage==='approved'&&await p.isVisible('#sg-sup'));
// телефон
await p.setViewportSize({width:390,height:844});await p.click('#doc-close');await p.waitForTimeout(200);
ok('M1 без горизонтальної прокрутки на 390px',await p.evaluate(()=>document.documentElement.scrollWidth<=390));
await p.click('[data-role="buy"]');ok('M2 перемикач ролей показує телефон покупця',await p.isVisible('#bscr')&&!(await p.isVisible('#sbody')));
ok('E1 без помилок у консолі',errs.length===0,errs.join(' | '));
await b.close();
R.forEach(r=>console.log(r[0],r[1],r[2]?'· '+r[2]:''));console.log(`\n${R.filter(r=>r[0]==='PASS').length}/${R.length}`);
process.exit(R.some(r=>r[0]==='FAIL')?1:0)})();
