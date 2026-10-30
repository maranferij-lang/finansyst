// Аудит прототипу Targo (демо, мобільна, веб): node tests/audit.js http://localhost:8768
const { chromium } = require('playwright');
const BASE=process.argv[2]||'http://localhost:8768';
const R=[];const ok=(n,c,d='')=>{R.push([c?'PASS':'FAIL',n,d])};
const st=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('targo-state')).s);
const last=(p,sel)=>p.locator(sel).last().click();
const dot=(p,sel)=>p.locator(sel+'.ping').count().then(n=>n>0);
const KC='kc_ro_7F3aQ9xL2mT8vR4nB6yW1';
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts|favicon|ServiceWorker|fetching the script/.test(m.text()))errs.push(m.text())});
// самоперевірка моделі
await p.goto(BASE+'/demo/?selftest');await p.waitForTimeout(800);
const self=await p.evaluate(()=>window.TARGO_SELFTEST||[]);
ok('S1 самоперевірка: усе ok',self.length>20&&self.every(x=>x.startsWith('ok')),self.filter(x=>!x.startsWith('ok')).join('; '));
await p.evaluate(()=>localStorage.clear());await p.goto(BASE+'/demo/');await p.waitForTimeout(800);
// 1. реєстрація постачальника
ok('R1 до реєстрації кабінет показує форму, вкладки теж',await p.isVisible('#rg-go')&&await p.click('[data-stab="apps"]').then(()=>p.isVisible('#rg-go')));
await p.fill('#rg-iban','UA469999990000026001234567891');await p.click('#rg-go');let s=await st(p);
ok('R2 IBAN з помилкою: реєстрації немає, видно причину',!s.reg&&/контрольна сума/.test(await p.textContent('#rg-err')));
await p.fill('#rg-code','4455667');await p.click('#rg-go');
ok('R3 ЄДРПОУ з 7 цифр не приймається',/8 цифр/.test(await p.textContent('#rg-err')));
await p.fill('#rg-code','44556677');await p.fill('#rg-iban','ua46 9999 9900 0002 6001 2345 6789 0');await p.click('#rg-go');s=await st(p);
ok('R4 без NDA реєстрації немає',!s.reg&&/NDA/.test(await p.textContent('#rg-err')));
await p.check('#rg-nda');await p.click('#rg-go');s=await st(p);
ok('R5 реєстрація з NDA, пробіли в IBAN не заважають, є посилання-запрошення',s.reg&&s.reg.nda===0&&s.reg.iban==='UA469999990000026001234567890'&&/targo\.demo\/i\//.test(await p.textContent('.linkbox')));
ok('R6 до перевірки покупця договір сформувати не можна',await p.isDisabled('#mk-deal'));
// 2. запрошення
await p.click('#mk-link');await p.waitForTimeout(900);s=await st(p);
ok('W1 запрошення надіслано в Telegram, угоди ще немає',s.inv&&s.inv.ch==='Telegram'&&!s.deal&&s.b==='invite');
ok('W2 покупцю прийшов пуш',await p.locator('#bpush').count()===1);
ok('D1 крапка на «Паспорті»: нове запрошення',await dot(p,'[data-btab="pass"]'));
// 3. покупець за посиланням
await p.click('#bpush');await p.click('#of-go');
await p.fill('#wz-iban','UA00');await p.click('#wz-next');
ok('B1 ФОП: неправильний IBAN не пускає далі',await p.isVisible('#wz-err')&&await p.isVisible('#wz-code'));
await p.fill('#wz-code','3123456789');await p.fill('#wz-iban','UA519999990000026009876543210');await p.click('#wz-next');
ok('B2 ФОП: без згоди на обробку даних далі не пускає',/згода/i.test(await p.textContent('#wz-err'))&&!(await st(p)).breg);
await p.check('#wz-ok');await p.click('#wz-next');
ok('B3 ФОП: ІПН, IBAN і згоду збережено',(await st(p)).breg.iban==='UA519999990000026009876543210'&&(await st(p)).breg.consent===0);
ok('W3 «Перевірити» неактивна без джерела даних',await p.isDisabled('#wz-check'));
await p.click('[data-src="keycrm"]');await p.fill('#wz-key','abc');await p.click('#wz-key-ok');
ok('K1 короткий API-ключ не приймається',/20 символів/.test(await p.textContent('#wz-err')));
await p.fill('#wz-key',KC);await p.click('#wz-key-ok');s=await st(p);
ok('K2 ключ KeyCRM підключено, у браузері лише останні 4 символи',s.src.keycrm&&s.keys.keycrm==='…6yW1'&&!JSON.stringify(s).includes(KC));
ok('K3 серед джерел є Нова пошта',await p.locator('[data-src="np"]').count()===1);
await p.click('#wz-check');await p.waitForTimeout(4400);
ok('W4 ліміт 72 000 ₴ і бал 85',/72\s000/.test(await p.textContent('#blayer h3'))&&/85 \/ 100/.test(await p.textContent('#blayer')));
await p.click('#wz-send');await p.waitForTimeout(300);s=await st(p);
ok('W5 заявка в постачальника, зелена',s.b==='ok'&&!s.deal&&await p.locator('[data-app="olena"] .dot.green').count()===1);
const det=await p.textContent('.adet');
ok('P1 постачальник бачить бал і ліміт, але не продажі й посилки',/85 \/ 100/.test(det)&&/72\s000/.test(det)&&!/Середній чек|Замовлень|Післяплата|2045012/.test(det));
ok('D2 крапка на «Заявках» є, на «Паспорті» зникла',await dot(p,'[data-stab="apps"]')&&!(await dot(p,'[data-btab="pass"]')));
await p.click('[data-app="tkachuk"]');ok('W6 АСВП: погодити неможливо, ліміт 0',await p.locator('.adet .btn').first().isDisabled()&&/Ліміт 0/.test(await p.textContent('.adet')));
await p.click('[data-app="bondar"]');ok('W7 жовта заявка: рекомендовано аванс 65%',/65%/.test(await p.textContent('.adet')));
// 4. угода в межах ліміту
await p.click('[data-app="olena"]');await p.click('#ap-ok');await p.waitForTimeout(200);
await p.fill('#c-base','100000');await p.evaluate(()=>{const r=document.querySelector('input[data-c="adv"]');r.value='0';r.dispatchEvent(new Event('input',{bubbles:true}))});
ok('L1 кредит понад ліміт: договір не формується, видно потрібний аванс',await p.isDisabled('#mk-deal')&&/більший за ліміт/.test(await p.textContent('#calc-prev')));
await p.fill('#c-base','200000');ok('L2 сума понад 100 000 ₴ не приймається',await p.isDisabled('#mk-deal')&&/100 000/.test(await p.textContent('#calc-prev')));
await p.fill('#c-base','80000');await p.evaluate(()=>{const r=document.querySelector('input[data-c="adv"]');r.value='30';r.dispatchEvent(new Event('input',{bubbles:true}))});
await p.click('#mk-deal');await p.waitForTimeout(300);s=await st(p);
ok('W8 договір сформовано: 82 400 = 24 720 + 28 840 + 28 840',s.deal&&s.deal.stage==='approved'&&s.deal.tr.map(t=>t.a).join()==='24720,28840,28840'&&await p.isVisible('#ovl'));
ok('D3 крапка на «Документах»: договір чекає підпису',await dot(p,'[data-stab="docs"]')&&!(await dot(p,'[data-stab="apps"]')));
// 5. підписи
await p.click('#sg-sup');await p.waitForTimeout(1200);await p.click('#bpush');await p.click('#sg-buy');await p.waitForTimeout(300);s=await st(p);
ok('W9 договір підписано обома',s.deal.stage==='signed'&&s.deal.sigS&&s.deal.sigB);
ok('D4 крапки на «Рахунках» (аванс) і «Боті», «Документи» чисті',await dot(p,'[data-btab="inv"]')&&await dot(p,'[data-btab="bot"]')&&!(await dot(p,'[data-stab="docs"]')));
// 6. аванс
await p.click('[data-btab="inv"]');await p.click('[data-inv="T1"]');await p.waitForTimeout(500);
ok('W10 рахунок з QR',await p.locator('#qrbox canvas, #qrbox img').count()>0);
await p.click('#inv-pay');await p.waitForTimeout(300);s=await st(p);
ok('W11 аванс звірено автоматично, товар відвантажено',s.deal.tr[0].paid===0&&s.deal.shipped&&s.stmt.at(-1).m==='TRG-8492-T1');
ok('D5 відкрита виписка не світиться, «Рахунки» згасли',!(await dot(p,'[data-stab="stmt"]'))&&!(await dot(p,'[data-btab="inv"]')));
// 7. тиждень
await p.click('#day7');await p.waitForTimeout(400);s=await st(p);
ok('W12 день 7, бот написав про NovaPay і чернетку',s.day===7&&s.bot.some(m=>/NovaPay/.test(m.t))&&s.bot.some(m=>/Чернетку/.test(m.t)));
ok('W13 Бойко T3 закрито за кодом, Гнатюк не розпізнано',s.old[1].tr[2].paid===4&&s.stmt.find(e=>e.code==='3399887766').m===null);
await p.click('[data-stab="stmt"]');await p.click('[data-man]');s=await st(p);
ok('M0 нерозпізнаний платіж можна перевірити вручну',s.stmt.find(e=>e.code==='3399887766').man===true);
// 8. другий транш
await p.click('[data-btab="bot"]');await last(p,'[data-bot-pay="T2"]');await p.waitForTimeout(300);await p.click('#inv-pay');await p.waitForTimeout(300);s=await st(p);
await p.click('[data-stab="ar"]');
ok('W14 T2 сплачено, прострочок нуль',s.deal.tr[1].paid===7&&await p.locator('.trow .chip.crit').count()===0);
ok('W15 усі 9 кроків сценарію позначено',['reg','invite','connect','score','deal','sign','adv','day7','pay2'].every(k=>s.done[k]));
await p.click('#day7');await p.click('#day7');await p.waitForTimeout(300);await p.click('[data-stab="ar"]');
ok('W16 через 21 день T3 прострочено',/TRG-8492-T3/.test(await p.locator('.trow:has(.chip.crit)').first().textContent()));
ok('D6 крапка на «Дебіторці» через прострочку',await dot(p,'[data-stab="ar"]'));
await p.click('[data-claim]');ok('C1 претензія з боргом і 3% річних',await p.isVisible('#ovl')&&/ПРЕТЕНЗІЯ/.test(await p.textContent('#ovl'))&&/3% річних/.test(await p.textContent('#ovl')));
await p.click('#doc-close');await p.click('[data-btab="pass"]');
ok('C2 прострочка: покупець у Blacklist, нові угоди призупинено',/Blacklist/.test(await p.textContent('#bscr'))&&/призупинено/.test(await p.textContent('#bscr')));
// хвиля відмов до угоди: ліміт знижується, договір блокується
await p.click('#reset');await p.click('[data-j="4"]');await p.waitForTimeout(500);await p.click('#wave');await p.waitForTimeout(200);s=await st(p);
ok('WV хвиля відмов: ліміт Олени 48 900 ₴, у заявці новий ліміт',/48\s900/.test(await p.textContent('.adet')));
await p.click('#ap-ok');ok('WV2 після хвилі угода 82 400 з авансом 30% не формується',await p.isDisabled('#mk-deal'));
// ручний режим: крок 6 доганяє попередні
await p.click('#reset');await p.click('[data-j="5"]');await p.waitForTimeout(600);s=await st(p);
ok('W17 крок 6 вручну доганяє 1–5 і відкриває договір',s.deal.stage==='approved'&&await p.isVisible('#sg-sup'));
// телефон
await p.setViewportSize({width:390,height:844});await p.click('#doc-close');await p.waitForTimeout(200);
ok('M1 без горизонтальної прокрутки на 390px',await p.evaluate(()=>document.documentElement.scrollWidth<=390));
await p.click('[data-role="buy"]');ok('M2 перемикач ролей показує телефон покупця',await p.isVisible('#bscr')&&!(await p.isVisible('#sbody')));
// мобільна і вебверсія: та сама логіка й стан, обидві ролі
for(const [path,w] of [['/',390],['/',1440],['/web/',1440],['/web/',390]]){
  await p.setViewportSize({width:w,height:844});await p.goto(BASE+path);await p.waitForTimeout(700);const tag=`${path} @${w}`;
  ok(`V1 ${tag}: без горизонтальної прокрутки`,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(path==='/'&&w===390)ok('D7 мобільна: крапка на перемикачі «Покупець», коли в нього нове',await dot(p,'[data-role="buy"]'));
  await p.click('[data-role="buy"]');ok(`V2 ${tag}: «Покупець» показує його кабінет`,await p.isVisible('#bscr')&&!(await p.isVisible('#sbody')));
  await p.click('[data-role="sup"]');ok(`V3 ${tag}: «Постачальник» показує свій`,await p.isVisible('#sbody')&&!(await p.isVisible('#bscr')))}
// дві вкладки: зміна в мобільній видна у вебверсії
const p2=await ctx.newPage();await p2.goto(BASE+'/web/');await p2.waitForTimeout(500);await p.evaluate(()=>document.getElementById('day1').click());await p2.waitForTimeout(500);
ok('V4 стан синхронізується між вкладками',(await p2.textContent('#s-today')).includes(await p.evaluate(()=>document.getElementById('s-today').textContent.slice(9))));
ok('E1 без помилок у консолі',errs.length===0,errs.join(' | '));
await b.close();
R.forEach(r=>console.log(r[0],r[1],r[2]?'· '+r[2]:''));console.log(`\n${R.filter(r=>r[0]==='PASS').length}/${R.length}`);
process.exit(R.some(r=>r[0]==='FAIL')?1:0)})();
