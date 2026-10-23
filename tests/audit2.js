const { chromium } = require('playwright');
const BASE=process.argv[2]||'http://localhost:8768';
const R=[];const ok=(n,c,d='')=>{R.push([c?'PASS':'FAIL',n,d])};
const st=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('fk-state')).s);
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts|favicon/.test(m.text()))errs.push(m.text())});
// ---------- MOBILE ----------
await p.goto(BASE+'/');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1200);
let s=await st(p);const tot0=Object.values(s.bal).reduce((a,b)=>a+b,0);
ok('M1 дашборд заповнений (6 конвертів, чеки, посилки)',await p.locator('.envpill').count()===6&&await p.locator('#c-np').count()===1&&await p.locator('#c-cb').count()===1);
ok('M2 крок «Відкриваємо дашборд» позначений',s.done.dash===true);
// відсотки >100% блокують збереження
await p.click('[data-tab=env]');await p.waitForTimeout(500);await p.click('#edit-pct');await p.waitForTimeout(500);
await p.fill('#p-buy','80');await p.dispatchEvent('#p-buy','input');
ok('M3 сума часток >100% блокує «Зберегти»',await p.isDisabled('#pct-save'),await p.textContent('#selfline'));
await p.fill('#p-buy','50');await p.dispatchEvent('#p-buy','input');
await p.click('.gchip[data-g="12"]');ok('M4 1–2 група: податок 0% і пояснення',/фіксований/.test(await p.textContent('#taxline')));
await p.click('.gchip[data-g="3"]');ok('M5 3 група: 5% + 1%',/6%/.test(await p.textContent('#taxline')));
await p.click('#pct-save');await p.waitForTimeout(600);s=await st(p);ok('M6 відсотки збережено',s.done.pct&&s.pct.buy===50);
// платіж 2400 за дефолтних часток
await p.click('#pay-env');await p.waitForTimeout(500);await p.fill('#pay-amt','2400');await p.click('#pay-sim');await p.waitForTimeout(900);
let su=await st(p);ok('N1 платіж спершу лягає на рахунок як нерозподілений',su.unalloc===2400&&su.bal.ops===18880,`unalloc=${su.unalloc}`);
ok('N2 на «Собі» попередження про розрив',/краще не виводити/.test(await p.textContent('#env-self')));
await p.click('#split-now');await p.waitForTimeout(3600);
s=await st(p);const tot1=Object.values(s.bal).reduce((a,b)=>a+b,0);
ok('M7 сума по конвертах зросла рівно на 2400',tot1-tot0===2400,`${tot1-tot0}`);
ok('M8 частки: податки 144, закупівля 1200, операційні 288, маркетинг 360, резерв 120, собі 288',
  s.bal.tax-51426===144&&s.bal.buy-38400===1200&&s.bal.ops-18880===288&&s.bal.mkt-9600===360&&s.bal.res-12000===120&&s.bal.self-6800===288,JSON.stringify(s.bal));
ok('M9 платіж у списку операцій',s.tx[0].a===2400&&s.tx[0].src==='Імітація');
// сума 0 → 1 ₴, не ламає
await p.click('#pay-env');await p.waitForTimeout(500);await p.fill('#pay-amt','0');await p.click('#pay-sim');await p.waitForTimeout(800);await p.click('#split-now');await p.waitForTimeout(3000);s=await st(p);
ok('M10 сума 0 не ламає розподіл (рахується як 1 ₴)',s.tx[0].a===1,`${s.tx[0].a}`);
// «Собі» = 0%: розподіл має завершитись
await p.click('#edit-pct');await p.waitForTimeout(500);await p.fill('#p-res','17');await p.dispatchEvent('#p-res','input');await p.click('#pct-save');await p.waitForTimeout(600);
const before=await st(p);await p.click('#pay-env');await p.waitForTimeout(500);await p.fill('#pay-amt','1000');await p.click('#pay-sim');await p.waitForTimeout(800);await p.click('#split-now');await p.waitForTimeout(3400);const after=await st(p);
ok('M10b при «Собі» = 0% платіж 1000 повністю розкладено і збережено',Object.values(after.bal).reduce((a,b)=>a+b,0)-Object.values(before.bal).reduce((a,b)=>a+b,0)===1000&&after.bal.self===before.bal.self);
await p.click('#edit-pct');await p.waitForTimeout(500);await p.fill('#p-res','5');await p.dispatchEvent('#p-res','input');await p.click('#pct-save');await p.waitForTimeout(600);s=await st(p);
// радар
await p.click('[data-tab=radar]');await p.waitForTimeout(700);await p.click('#run');await p.waitForTimeout(2300);
const pushT=await p.textContent('.push .b');const need=+(await p.textContent('#c-alert .big')).replace(/[^\d]/g,'');
ok('M11 пуш про розрив зʼявився',/Оренда складу/.test(pushT),pushT);
ok('M12 дефіцит = 40 000 − (операційні + 2 дні надходжень)',need===Math.round(40000-(s.bal.ops+2*13000*0.12)),`${need}`);
await p.click('#cover');await p.waitForTimeout(500);const odAmt=+(await p.textContent('.panel .big')).replace(/[^\d]/g,'');
ok('M13 овердрафт = дефіцит + погашення до дати платежу, округлено до сотні',odAmt>=need&&odAmt-need<2400&&odAmt%100===0,`дефіцит ${need}, овердрафт ${odAmt}`);
await p.click('#nx');await p.waitForTimeout(2600);await p.click('#nx');await p.waitForTimeout(800);await p.click('#cl');await p.waitForTimeout(900);
s=await st(p);ok('M14 після овердрафту розривів немає',await p.locator('#c-radar .chip').textContent()==='усе покрито');
const sd=await st(p);await p.click('[data-tab=env]');await p.waitForTimeout(600);await p.click('#pay-env');await p.waitForTimeout(500);await p.fill('#pay-amt','3000');await p.click('#pay-sim');await p.waitForTimeout(800);
const pendTxt=await p.textContent('#c-pending');await p.click('#split-now');await p.waitForTimeout(3600);const sa=await st(p);
ok('N3 погашення 30% знімається до поділу',/погашення овердрафту/.test(pendTxt)&&sd.debt-sa.debt===900,`борг ${sd.debt} → ${sa.debt}`);
ok('N4 по конвертах розкладено тільки 2 100',Object.values(sa.bal).reduce((a,b)=>a+b,0)-Object.values(sd.bal).reduce((a,b)=>a+b,0)===2100);
await p.click('[data-tab=radar]');await p.waitForTimeout(700);ok('N5 після овердрафту і погашень розривів немає',await p.locator('#c-radar .chip').textContent()==='усе покрито');
ok('N6 кабінет не заважає демо (вхід виконано за замовчуванням)',await p.locator('.auth').count()===0);
ok('M15 усі 5 кроків сценарію виконано',['dash','pct','pay','env','gap'].every(k=>s.done[k]),JSON.stringify(s.done));
ok('M16 немає горизонтальної прокрутки 390px',await p.evaluate(()=>document.documentElement.scrollWidth)<=390);
// ---------- WEB (спільний стан) ----------
const w=await ctx.newPage();await w.setViewportSize({width:1440,height:900});w.on('pageerror',e=>errs.push('web:'+e.message));
await w.goto(BASE+'/web/');await w.waitForTimeout(1200);
ok('W1 вебверсія бачить ті самі дані (овердрафт у списку)',/Овердрафт/.test(await w.textContent('.a-tx')));
// скидання
await w.click('#reset');await w.waitForTimeout(800);let ws=await st(w);
ok('W2 скидання повертає стартові баланси',ws.bal.ops===18880&&ws.tx.length===4&&ws.done.dash===true);
await w.click('[data-page=env]');await w.waitForTimeout(700);
await w.fill('#p-ops','20');await w.dispatchEvent('#p-ops','input');ok('W3 незбережені зміни підсвічені кнопкою',!(await w.isDisabled('#pct-save')));
await w.click('#pct-save');await w.waitForTimeout(400);await w.fill('#pay-amt','3100');await w.click('#pay-sim');await w.waitForTimeout(800);await w.click('#split-now');await w.waitForTimeout(3600);ws=await st(w);
ok('W4 платіж 3100 при операційних 20%: +620 в «Операційні»',ws.bal.ops-18880===620,`${ws.bal.ops-18880}`);
await w.click('[data-page=radar]');await w.waitForTimeout(700);await w.click('#run');await w.waitForTimeout(2300);
const wneed=+(await w.textContent('#c-alert .big')).replace(/[^\d]/g,'');ok('W5 дефіцит на вебі рахується тією ж формулою',wneed===Math.round(40000-(ws.bal.ops+2*13000*0.20)),`${wneed}`);
await w.setViewportSize({width:360,height:800});await w.waitForTimeout(400);ok('W6 веб без горизонтальної прокрутки на 360px',await w.evaluate(()=>document.documentElement.scrollWidth)<=360);
// HMAC підпис (той самий алгоритм, що на сторінці)
const sig=await p.evaluate(()=>window.__hmacMD5('Jefe','what do ya want for nothing?'));   // тестовий вектор RFC 2104
ok('S1 HMAC-MD5 для підпису WayForPay рахується правильно',sig==='750c783e6ab0b503eaa86e310a5db738',sig);
ok('E1 помилок у консолі немає',errs.length===0,errs.join(' | '));
console.log(R.map(r=>r.join(' · ')).join('\n'));await b.close();})();
