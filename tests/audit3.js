const { chromium } = require('playwright');
const BASE=process.argv[2]||'http://localhost:8768';
const st=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('fk-state')).s);
const put=(p,f)=>p.evaluate(f=>{const j=JSON.parse(localStorage.getItem('fk-state'));Object.assign(j.s,f);if(f.bal)j.s.bal=f.bal;localStorage.setItem('fk-state',JSON.stringify(j))},f);
const R=[];const ok=(n,c,d='')=>R.push([c?'PASS':'FAIL',n,d]);
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
for(const [path,vp,closeSel] of [['/',{width:390,height:844},'.sheet'],['/web/',{width:1440,height:900},'.modal']]){
 const p=await b.newPage({viewport:vp});const T=path==='/'?'M':'W';
 await p.goto(BASE+path);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(1000);
 // імітуємо стан після овердрафту: борг 18600, 2400 не розподілено
 {const s0=await st(p);s0.bal.exp+=18600;await put(p,{debt:18600,od:18600,unalloc:2400,bal:s0.bal});}await p.reload();await p.waitForTimeout(900);
 if(T==='M'){await p.click('[data-tab=radar]')}else{await p.goto(BASE+path+'#radar');await p.waitForTimeout(500)}
 await p.waitForTimeout(800);
 ok(T+'1 картка овердрафту видима',await p.locator('#c-odbox').isVisible());
 ok(T+'2 автопогашення увімкнене за замовчуванням',await p.locator('#od-auto').isChecked());
 await p.click('.tgl');await p.waitForTimeout(500);
 ok(T+'3 вимкнення зберігається',(await st(p)).autoRepay===false);
 ok(T+'4 текст про вимкнене автопогашення',(await p.locator('#c-odbox').textContent()).includes('вимкнено'));
 ok(T+'5 радар без розриву',(await p.locator('#c-radar .chip').textContent()).includes('покрито'));
 await p.screenshot({path:'out-'+`a3-${T}-box.png`});
 await p.click('#od-pay');await p.waitForTimeout(600);
 await p.screenshot({path:'out-'+`a3-${T}-sheet.png`});
 const g=x=>({d:x.debt,u:x.unalloc,r:x.bal.res,exp:x.bal.exp,tax:x.bal.tax});const before=g(await st(p));
 await p.click('#rp-go');await p.waitForTimeout(700);
 const after=g(await st(p));
 ok(T+'6 спершу нерозподілені (без податку), потім резерв',after.u===0&&after.tax-before.tax===144&&before.d-after.d===(2400-144)+(before.r-after.r)&&after.r===0,JSON.stringify([before,after]));   // податок 6% з 2 400 іде в «Податки»
 ok(T+'7 Витрати не чіпаємо',after.exp===before.exp);
 ok(T+'8 залишок боргу = 18600-2256-12000',after.d===4344,after.d);
 await p.click('#od-pay');await p.waitForTimeout(600);
 ok(T+'9 коли нема з чого: без кнопки погашення',(await p.locator('#rp-go').count())===0);
 await p.click('#rp-cl');await p.waitForTimeout(400);
 await p.click('.tgl');await p.waitForTimeout(400);
 ok(T+'10 увімкнення назад',(await st(p)).autoRepay===true);
 await put(p,{debt:1000,unalloc:5000});await p.reload();await p.waitForTimeout(900);if(T==='M'){await p.click('[data-tab=radar]');await p.waitForTimeout(600)}
 await p.click('#od-pay');await p.waitForTimeout(500);await p.click('#rp-go');await p.waitForTimeout(600);
 {const z=await st(p);ok(T+'11 повне погашення ховає картку',z.debt===0&&z.unalloc===3936&&(await p.locator('#c-odbox').count())===0)};
 await p.close();}
R.forEach(r=>console.log(r.join(' | ')));await b.close();})();
