// Оплата з календаря, підказка «Вивести собі», пробіл у ручному режимі
const { chromium } = require('playwright');
const BASE=process.argv[2]||'http://localhost:8768';
const st=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('fk-state')).s);
const put=(p,f)=>p.evaluate(f=>{const j=JSON.parse(localStorage.getItem('fk-state'));Object.assign(j.s,f);localStorage.setItem('fk-state',JSON.stringify(j))},f);
const R=[];const ok=(n,c,d='')=>R.push([c?'PASS':'FAIL',n,d]);
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
for(const [path,vp] of [['/',{width:390,height:844}],['/web/',{width:1440,height:900}]]){const T=path==='/'?'M':'W';
 const p=await b.newPage({viewport:vp});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 const CL=T==='M'?'.sheet':'.modal';
 const fresh=async(extra)=>{await p.goto(BASE+path);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(900);
   if(extra){const s0=await st(p);s0.bal.ops+=extra;await put(p,{bal:s0.bal});await p.reload();await p.waitForTimeout(900)}};
 const toRadar=async()=>{if(T==='M'){await p.click('[data-tab=radar]')}else{await p.goto(BASE+path+'#radar')}await p.waitForTimeout(700)};
 const toHome=async()=>{if(T==='M'){await p.click('[data-tab=home]')}else{await p.goto(BASE+path+'#over')}await p.waitForTimeout(700)};
 // 1. підказка у «Вивести собі»
 await fresh();await toHome();await p.click('#spend-open');await p.waitForTimeout(500);
 ok(T+'1 при розриві підказка бежева (не радимо)',await p.getAttribute('#wd-res','class')==='hint');
 await p.fill('#wd-amt','999999');ok(T+'2 сума більша за конверт: червона',await p.getAttribute('#wd-res','class')==='hint crit');
 await fresh(30000);await toHome();await p.click('#spend-open');await p.waitForTimeout(500);
 ok(T+'3 без розриву підказка зелена',await p.getAttribute('#wd-res','class')==='hint ok',await p.textContent('#wd-res'));
 // 2. календар замість двох списків
 await fresh();await toRadar();
 ok(T+'4 один список платежів',(await p.locator('text=Платежі з конверта').count())===0&&(await p.locator('#c-cal .li').count())===6);
 // 3. оренда при розриві: не можна, є кнопка перекрити
 await p.click('[data-bill=o0]');await p.waitForTimeout(500);
 ok(T+'5 оренда при розриві: попередження і «Перекрити розрив»',await p.locator('#bl-gap').isVisible()&&(await p.locator('#bl-go').count())===0);
 await p.click('#bl-cl');await p.waitForTimeout(400);
 // 4. Prom.ua при розриві теж не платимо наперед
 await p.click('[data-bill=o2]');await p.waitForTimeout(500);
 ok(T+'6 Prom.ua при розриві: спершу перекрити',(await p.locator('#bl-gap').count())===1&&(await p.locator('#bl-go').count())===0);
 await p.click('#bl-cl');await p.waitForTimeout(400);
 // Meta з наповненим конвертом: оплата одразу через LiqPay
 {const sx=await st(p);sx.bal.mkt=20000;await put(p,{bal:sx.bal});await p.reload();await p.waitForTimeout(900);if(T==='M'){await p.click('[data-tab=radar]');await p.waitForTimeout(600)}}
 await p.click('[data-bill=meta]');await p.waitForTimeout(500);await p.click('[data-m=liqpay]');await p.click('#bl-go');await p.waitForTimeout(1700);
 {const s1=await st(p);ok(T+'7 Meta сплачено одразу: «Маркетинг» −18 000, рядок позначено',s1.paid.meta==='paid'&&s1.bal.mkt===2000&&(await p.locator('[data-bill=meta]').count())===0&&(await p.locator('#c-cal .paidli').count())===1,JSON.stringify(s1.paid))}
 {const sx=await st(p);sx.bal.mkt=9600;sx.paid={};await put(p,{bal:sx.bal,paid:{}});await p.reload();await p.waitForTimeout(900);if(T==='M'){await p.click('[data-tab=radar]');await p.waitForTimeout(600)}}
 // 5. реклама: у конверті не вистачає
 await p.click('[data-bill=meta]');await p.waitForTimeout(500);
 ok(T+'8 Meta: не вистачає, без кнопки оплати',(await p.locator('#bl-go').count())===0&&(await p.locator('#bl-gap').count())===0);
 await p.click('#bl-cl');await p.waitForTimeout(400);
 // 6. оренда без розриву, але сьогодні не вистачає: запланувати
 await fresh(20000);await toRadar();const a0=await st(p);
 await p.click('[data-bill=o0]');await p.waitForTimeout(500);ok(T+'9 кнопка «Запланувати»',(await p.textContent('#bl-go')).includes('Запланувати'));
 await p.click('#bl-go');await p.waitForTimeout(1700);const a1=await st(p);
 ok(T+'10 заплановано, баланс не змінився',a1.paid.o0==='sched'&&a1.bal.ops===a0.bal.ops&&(await p.locator('.billst').count())===1);
 // 7. пробіл у ручному режимі нічого не запускає
 await fresh();await p.mouse.click(5,5);await p.keyboard.press('Space');await p.waitForTimeout(900);
 ok(T+'11 пробіл у ручному режимі не відкриває кроки',(await p.locator(CL).count())===0&&await p.evaluate(()=>document.getElementById('subs').hidden));
 ok(T+'12 без помилок JS',errs.length===0,errs.join(';'));
 await p.close()}
R.forEach(r=>console.log(r.join(' | ')));await b.close()})();
