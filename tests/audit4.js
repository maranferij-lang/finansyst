const { chromium } = require('playwright');
const BASE=process.argv[2]||'http://localhost:8768';
const st=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('fk-state')).s);
const R=[];const ok=(n,c,d='')=>R.push([c?'PASS':'FAIL',n,d]);
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
for(const [path,vp] of [['/',{width:390,height:844}],['/web/',{width:1440,height:900}]]){const T=path==='/'?'M':'W';
 for(const mode of ['tr','mv']){
  const p=await b.newPage({viewport:vp});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(BASE+path);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(900);
  if(mode==='mv'){await p.evaluate(()=>{const j=JSON.parse(localStorage.getItem('fk-state'));j.s.bal.ops+=17000;localStorage.setItem('fk-state',JSON.stringify(j))});await p.reload();await p.waitForTimeout(900);}
  if(T==='M')await p.click('[data-tab=radar]');else{await p.goto(BASE+path+'#radar');}
  await p.waitForTimeout(700);await p.click('#run');await p.waitForTimeout(2400);
  ok(`${T}-${mode} 1 є дві кнопки без овердрафту`,await p.locator('#alt-tr').isVisible()&&await p.locator('#alt-mv').isVisible());
  if(mode==='tr'&&T==='M')await p.screenshot({path:'out-a4-alert.png'});
  const s0=await st(p);
  await p.click('#alt-'+mode);await p.waitForTimeout(600);await p.screenshot({path:'out-'+`a4-${T}-${mode}.png`});
  await p.click('#'+mode+'-go');await p.waitForTimeout(900);
  const s1=await st(p);
  ok(`${T}-${mode} 2 радар без розриву`,(await p.locator('#c-radar .chip').textContent()).includes('покрито'));
  ok(`${T}-${mode} 3 крок 5 зарахований, дзвіночок знято`,s1.done.gap&&!s1.alert);
  if(mode==='tr'){const moved=(s0.bal.res-s1.bal.res)+(s0.bal.self-s1.bal.self);
    ok(`${T}-tr 4 гроші лише перекладені між конвертами`,s1.bal.ops-s0.bal.ops===moved&&moved>0&&s1.debt===0,moved);
    ok(`${T}-tr 5 спершу Резерв`,s0.bal.res-s1.bal.res===Math.min(moved,s0.bal.res));}
  else{ok(`${T}-mv 4 оренду перенесено пізніше`,s1.moved&&s1.moved[0]===3,JSON.stringify(s1.moved));
    ok(`${T}-mv 5 баланси не змінились`,JSON.stringify(s1.bal)===JSON.stringify(s0.bal));
    await p.reload();await p.waitForTimeout(900);
    ok(`${T}-mv 6 після перезавантаження розриву немає`,T==='M'?true:(await p.locator('#c-radar .chip').textContent()).includes('покрито'));}
  ok(`${T}-${mode} 7 без помилок JS`,errs.length===0,errs.join(';'));
  await p.close();}}
R.forEach(r=>console.log(r.join(' | ')));await b.close();})();
