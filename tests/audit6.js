// Перехід зі старого стану, сповіщення, нагадування про незавершену дію, лист на пошту (веб)
const { chromium } = require('playwright');
const BASE=process.argv[2]||'http://localhost:8768';
const st=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('fk-state')));
const R=[];const ok=(n,c,d='')=>R.push([c?'PASS':'FAIL',n,d]);
// перемикає document.hidden, як коли людина йде з вкладки
const vis=(p,hidden)=>p.evaluate(h=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>h});document.dispatchEvent(new Event('visibilitychange'))},hidden);
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
for(const [path,vp] of [['/',{width:390,height:844}],['/web/',{width:1440,height:900}]]){const T=path==='/'?'M':'W';
 const p=await b.newPage({viewport:vp});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 const CL=T==='M'?'.sheet':'.modal';
 // 1. старий стан v3 з «Операційними» і «Маркетингом»
 await p.goto(BASE+path);await p.evaluate(()=>{localStorage.setItem('fk-state',JSON.stringify({v:3,s:{group:'3',pct:{buy:50,ops:12,mkt:15,res:5},bal:{tax:100,buy:200,ops:300,mkt:400,res:500,self:600},tx:[],od:0,debt:0,unalloc:0,autoRepay:true,done:{},alert:false}}))});
 await p.reload();await p.waitForTimeout(900);
 {const j=await st(p);ok(T+'1 старий стан переведено: Витрати = операційні + маркетинг',j.v===4&&j.s.bal.exp===700&&j.s.bal.ops===undefined&&j.s.bal.mkt===undefined,JSON.stringify(j.s.bal))}
 // 2. платіж → запис у центрі сповіщень
 await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(900);
 if(T==='M'){await p.click('[data-tab=env]');await p.waitForTimeout(400);await p.click('#pay-env');await p.waitForTimeout(500)}else{await p.goto(BASE+path+'#env');await p.waitForTimeout(600)}
 await p.click('#pay-sim');await p.waitForTimeout(1000);
 ok(T+'2 є червона крапка на дзвіночку',await p.locator('#badge').isVisible());
 await p.click('#bell');await p.waitForTimeout(500);
 ok(T+'3 у сповіщеннях є надходження',/на рахунку/.test(await p.textContent(T==='M'?'.sheet':'.npanel')));
 if(T==='W'){await p.click('[data-mail]');await p.waitForTimeout(500);
   ok('W4 лист на пошту: адреса з профілю і тема',/olena@krok\.shop/.test(await p.textContent('.mail'))&&/на рахунку/.test(await p.textContent('.mail .mh')));
   await p.click('#ml-cl');await p.waitForTimeout(400)}
 else{await p.keyboard.press('Escape');await p.waitForTimeout(600);ok('M4 сповіщення закриваються',(await p.locator('.sheet').count())===0)}
 // 3. людина пішла з вкладки, не розподіливши гроші → повернулась і бачить нагадування
 await p.evaluate(()=>document.querySelectorAll('.push').forEach(x=>x.remove()));
 await vis(p,true);await p.waitForTimeout(300);await vis(p,false);await p.waitForTimeout(600);
 ok(T+'5 нагадування після повернення: гроші чекають розподілу',/чекають розподілу/.test(await p.locator('.push').textContent().catch(()=>'')));
 await p.evaluate(()=>document.querySelectorAll('.push').forEach(x=>x.remove()));
 await vis(p,true);await p.waitForTimeout(300);await vis(p,false);await p.waitForTimeout(600);
 ok(T+'6 те саме нагадування вдруге не показується',(await p.locator('.push').count())===0);
 // 4. після розподілу нагадувати нема про що
 await p.evaluate(()=>document.querySelectorAll('.push').forEach(x=>x.remove()));
 if(T==='M'){await p.click('[data-tab=env]');await p.waitForTimeout(500)}
 await p.click('#split-now');await p.waitForTimeout(3500);
 await vis(p,true);await p.waitForTimeout(300);await vis(p,false);await p.waitForTimeout(600);
 ok(T+'7 після розподілу нагадування немає',(await p.locator('.push').count())===0);
 ok(T+'8 без помилок JS',errs.length===0,errs.join(';'));
 await p.close()}
R.forEach(r=>console.log(r.join(' | ')));await b.close()})();
