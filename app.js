(()=>{
'use strict';
const $=id=>document.getElementById(id);
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const visible=el=>!!el&&el.getClientRects().length>0;
const ROOT=new URL('./',document.currentScript.src);   // корінь сайту: від нього рахуємо посилання й sw.js на всіх трьох сторінках

/* ---------- захардкоджені дані демо ---------- */
const KEY='targo-state', D_SAFE=0.65, BASE=new Date(2026,9,28), QTY=240, DEAL_NO='TRG-8492';
const SUP0={name:'ТОВ «Підошва»',code:'44556677',iban:'UA469999990000026001234567890',head:'Гнатенко В. С.'};   // IBAN вигадані: МФО 999999 не існує
const BUY0={name:'ФОП Коваль Олена Петрівна',short:'Олена Коваль',shop:'«Крок»',code:'3123456789',iban:'UA519999990000026009876543210'};
let SUP=SUP0,BUY=BUY0;   // ЄДРПОУ/ІПН та IBAN беруться з реєстрації (S.reg, S.breg), назви лишаються демо
// посилки Олени з післяплатою: eta = день, коли NovaPay виплатить гроші
const PARCELS=[['20450123456781',22300,4],['20450123456798',18400,5],['20450123456804',16900,5],['20450123456811',15600,6],['20450123456828',14800,6],['20450123456835',14200,7],['20450123456842',13500,10],['20450123456859',12300,12]].map(([n,a,eta])=>({n,a,eta}));
const TRANSIT=[{src:'Prom',no:'41822',a:12400,en:true},{src:'Rozetka',no:'7731',a:8600,en:true},{src:'Prom',no:'41907',a:5200,en:false},{src:'Rozetka',no:'7745',a:3900,en:true,dispute:true}];
const HIST={orders:412,avg:1840,k:0.88,ret:3.1};
const REGS=['Статус ФОП чинний','Платник єдиного податку','Немає в Єдиному реєстрі боржників','Немає відкритих проваджень в АСВП'];
const OTHERS=[
  {id:'bondar',name:'ФОП Бондар Ігор',shop:'«Стопа»',total:64000,adv:30,cod:42000,k:0.81,transit:6000,orders:96,avg:1450,ret:7.4},
  {id:'tkachuk',name:'ФОП Ткачук Світлана',shop:'«Туфелька»',total:38000,adv:30,cod:51000,k:0.9,transit:4000,orders:230,avg:1200,ret:2.5,stop:'Відкрите провадження в АСВП: рахунки можуть арештувати протягом години'}];
const OLD=[
  {no:'TRG-8390',buyer:'ФОП Мельник Андрій',code:'2987654321',tr:[{id:'T1',a:16200,due:-20,paid:-20,adv:true},{id:'T2',a:18900,due:-13,paid:-13},{id:'T3',a:18900,due:-1,paid:-1}]},
  {no:'TRG-8455',buyer:'ФОП Бойко Наталія',code:'3011223344',tr:[{id:'T1',a:23484,due:-9,paid:-9,adv:true},{id:'T2',a:27398,due:-2,paid:-2},{id:'T3',a:27398,due:5,paid:null}]}];
const STMT0=[
  {day:-2,from:'ФОП Бойко Наталія',code:'3011223344',a:27398,p:'Оплата за товар згідно рахунку #TRG-8455-T2',m:'TRG-8455-T2',by:'id'},
  {day:-1,from:'ФОП Мельник Андрій',code:'2987654321',a:18900,p:'#TRG-8390-T3 оплата за взуття',m:'TRG-8390-T3',by:'id'}];
// надходження, що прийдуть самі, коли в демо минають дні
const SCHED=[
  {day:4,from:'ФОП Бойко Наталія',code:'3011223344',a:27398,p:'Оплата #TRG-8455-T3, без ПДВ'},
  {day:6,from:'ФОП Гнатюк Роман',code:'3399887766',a:5200,p:'оплата за товар'}];
const DEF={v:1,reg:null,breg:null,day:0,b:'none',src:{},deal:null,snap:null,old:OLD,stmt:STMT0,bot:[],ev:{},done:{},seen:{stmt:STMT0.length,bot:0}};
const clone=o=>JSON.parse(JSON.stringify(o));
let S=load();
function load(){try{const r=JSON.parse(localStorage.getItem(KEY));if(r&&r.v===1&&r.s)return r.s}catch(e){}return clone(DEF)}
function save(){try{localStorage.setItem(KEY,JSON.stringify({v:1,s:S}))}catch(e){}}

/* ---------- формат ---------- */
const fmt=n=>n.toLocaleString('uk-UA',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2})+' ₴';
const dec=(n,f=2)=>n.toLocaleString('uk-UA',{minimumFractionDigits:f,maximumFractionDigits:f});
const pad=n=>String(n).padStart(2,'0');
const dt=n=>{const d=new Date(BASE);d.setDate(d.getDate()+n);return d};
const dOf=n=>{const d=dt(n);return pad(d.getDate())+'.'+pad(d.getMonth()+1)};
const dFull=n=>dOf(n)+'.'+dt(n).getFullYear();
const chip=(l,c)=>`<span class="chip ${c}">${l}</span>`;
const pl=(n,one,few,many)=>{const m=n%10,h=n%100;return n+' '+(m===1&&h!==11?one:m>=2&&m<=4&&(h<12||h>14)?few:many)};   // 1 посилка, 3 посилки, 5 посилок
const LIGHT={green:['Зелений','ok'],yellow:['Жовтий','warn'],red:['Червоний','crit']};

/* ---------- модель ---------- */
// графік у копійках: надбавка вшита в ціну, залишок від округлення йде в останній транш
function plan(o){const totK=Math.round(o.base*(100+o.mk)),advK=Math.round(totK*o.adv/100),rest=totK-advK,each=Math.floor(rest/o.parts),tr=[];
  if(advK>0)tr.push({id:'T1',a:advK/100,due:0,adv:true});
  for(let i=1;i<=o.parts;i++)tr.push({id:'T'+(tr.length+1),a:(i<o.parts?each:rest-each*(o.parts-1))/100,due:Math.round(o.term*i/o.parts)});
  return {total:totK/100,credit:rest/100,tr}}
// ліміт = (післяплата активних ТТН × викуп + транзит Prom/Rozetka) × дисконт безпеки
function score(x,credit,total){const cov=x.cod*x.k+x.transit,raw=cov*D_SAFE,limit=Math.floor(raw/100)*100;
  const light=x.stop?'red':credit<=limit?'green':'yellow';
  const rec=light==='yellow'?Math.min(90,Math.ceil((1-limit/total)*20)*5):null;   // найменший аванс (крок 5%), за якого кредит влазить у ліміт
  return {cov,raw,limit,light,rec,ratio:credit?cov/credit:0}}
function oSnap(day){const act=PARCELS.filter(p=>p.eta>day);
  return {cod:act.reduce((s,p)=>s+p.a,0),n:act.length,k:HIST.k,transit:TRANSIT.filter(t=>t.en&&!t.dispute).reduce((s,t)=>s+t.a,0)}}
function pStatus(p){const l=p.eta-S.day;return l<=0?['Виплачено NovaPay','ok']:l<=2?['У відділенні','warn']:['У дорозі','grey']}
const signed=()=>!!S.deal&&S.deal.stage==='signed';
const deals=()=>S.old.concat(signed()?[S.deal]:[]);
function trSt(t){return t.paid!=null?['Сплачено','ok']:S.day>t.due?['Прострочено','crit']:t.due===S.day?['Сьогодні','warn']:['Очікується','grey']}
// звірка: спершу код траншу в призначенні, інакше ІПН платника й одна відкрита сума, що збігається
function reconcile(e,list){let hit=null,by='';
  const m=/TRG-(\d+)-T(\d+)/i.exec(e.p||'');
  if(m){const d=list.find(x=>x.no==='TRG-'+m[1]),t=d&&d.tr.find(x=>x.id==='T'+m[2]);if(t&&t.paid==null&&e.a>=t.a-0.005){hit=[d,t];by='id'}}
  if(!hit){const c=[];list.forEach(d=>{if(d.code===e.code)d.tr.forEach(t=>{if(t.paid==null&&Math.abs(t.a-e.a)<0.005)c.push([d,t])})});if(c.length===1){hit=c[0];by='code'}}
  if(hit){hit[1].paid=e.day;e.m=hit[0].no+'-'+hit[1].id;e.by=by}else e.m=null;
  return hit}
function nbuQR(a,purpose){   // формат НБУ 002 (кодування 1 = UTF-8), посилання bank.gov.ua/qr/<base64url>; звірити з Правилами НБУ перед бойовим запуском
  const s=['BCD','002','1','UCT','',SUP.name,SUP.iban,'UAH'+a.toFixed(2),SUP.code,'','',purpose,''].join('\n');
  return 'https://bank.gov.ua/qr/'+btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function ibanOk(s){let m=0;for(const ch of (s.slice(4)+s.slice(0,4)).replace(/[A-Z]/g,c=>c.charCodeAt(0)-55))m=(m*10+ +ch)%97;return m===1}
// реквізити з форми реєстрації: ЄДРПОУ 8 цифр (постачальник), ІПН 10 або ЄДРПОУ 8 (ФОП-покупець), IBAN UA + 27 цифр з контрольною сумою
function reqErr(code,iban,buyer){
  if(!(buyer?/^(\d{8}|\d{10})$/:/^\d{8}$/).test(code))return buyer?'ІПН має 10 цифр, ЄДРПОУ 8 цифр':'Код ЄДРПОУ має 8 цифр';
  if(!/^UA\d{27}$/.test(iban))return 'IBAN: UA і 27 цифр';
  if(!ibanOk(iban))return 'IBAN з помилкою: не сходиться контрольна сума';
  return ''}
const clean=s=>s.replace(/\s/g,'').toUpperCase();
const invite=()=>'targo.demo/i/'+(+SUP.code).toString(36).toUpperCase();   // посилання-запрошення постачальника, одне на всіх його клієнтів
function syncP(){SUP={...SUP0,...S.reg};BUY={...BUY0,...S.breg}}

/* ---------- дії ---------- */
let calc={base:120000,adv:30,term:14,parts:2,mk:3},sTab=S.deal?'apps':'new',bTab='pass',sel=null,wz=null,wzg=0,curInv=null,fresh=-1;
let uiT=[];const ui=(ms,fn)=>uiT.push(setTimeout(fn,ms));
// реєстрація постачальника: назву й керівника «знаходимо» в ЄДР, реквізити беремо з форми
function register(code,iban){code=clean(code);iban=clean(iban);const err=reqErr(code,iban);
  if(err){const el=$('rg-err');if(el){el.textContent=err;el.hidden=false}return}
  S.reg={code,iban};S.done.reg=true;sTab='new';render();toast('sup',`Реєстрацію завершено. Ваше посилання: ${invite()}`)}
function makeOffer(ch='Telegram'){if(!S.reg||S.deal||!(calc.base>=1000&&calc.base<=1e7))return;const p=plan(calc);
  S.deal={no:DEAL_NO,buyer:BUY.name,code:BUY.code,...calc,total:p.total,credit:p.credit,tr:p.tr.map(t=>({...t,paid:null})),stage:'link',sigS:false,sigB:false,shipped:false,ch};
  S.b='invite';S.done.offer=true;render();toast('sup',`Посилання-запрошення надіслано Олені у ${ch} (імітація)`);
  const T1=p.tr[0];ui(700,()=>pushB(`${ch} · ${SUP.name}`,`Пропонуємо розстрочку на ${fmt(p.total)}: ${calc.adv?`${calc.adv}% зараз (${fmt(T1.a)}), решта`:'усе'} за ${calc.term} днів. ${invite()}`,openOffer))}
// ФОП перейшов за запрошенням: свій ІПН/ЄДРПОУ і IBAN
function buyerId(){const code=clean($('wz-code').value),iban=clean($('wz-iban').value),err=reqErr(code,iban,true);
  if(err){$('wz-err').textContent=err;$('wz-err').hidden=false;return}
  S.breg={code,iban};if(S.deal)S.deal.code=code;syncP();save();openWizard('src')}
function completeCheck(){const d=S.deal;if(!d||S.b==='ok')return;S.src.keycrm=S.src.keycrm||!Object.values(S.src).some(Boolean);
  S.b='ok';S.snap=oSnap(S.day);d.stage='scored';S.done.connect=S.done.score=true;sel='olena';sTab='apps';closeB();render();
  const [l]=LIGHT[score(S.snap,d.credit,d.total).light];toast('sup',`Нова заявка: Олена Коваль, світлофор ${l.toLowerCase()}`)}
function approve(silent){const d=S.deal;if(!d||d.stage!=='scored'||score(S.snap,d.credit,d.total).light==='red')return;d.stage='approved';S.done.approve=true;render();if(!silent)openDoc('contract')}
function signS(){const d=S.deal;if(!d||d.stage!=='approved'||d.sigS)return;d.sigS=true;render();openDoc('contract');
  ui(800,()=>{closeDoc();pushB('Targo',`Договір ${d.no} підписано постачальником. Підпишіть КЕП`,openSign)})}
function signB(){const d=S.deal;if(!d||!d.sigS||d.sigB)return;d.sigB=true;d.stage='signed';S.done.sign=true;
  if(!d.tr[0].adv){d.shipped=true;d.shipDay=S.day}
  bot(S.day,`Договір ${d.no} підписано обома сторонами. Рахунки за графіком у вкладці «Рахунки»: платіть за QR-кодом, код траншу вже в призначенні.`,d.tr[0].id);
  closeB();render();const t=d.tr[0];pushB('Targo',`Рахунок ${t.adv?'на аванс':t.id} ${fmt(t.a)} готовий`,()=>{setBTab('inv');openInv(t.id)})}
function payTr(id){const d=S.deal;if(!signed())return;const t=d.tr.find(x=>x.id===id);if(!t||t.paid!=null)return;
  const e={day:S.day,from:BUY.name,code:BUY.code,a:t.a,p:`Оплата за договором поставки ${d.no}, #${d.no}-${id}, без ПДВ`};
  S.stmt.push(e);reconcile(e,deals());fresh=S.stmt.length-1;
  const ship=!!t.adv&&!d.shipped;if(ship){d.shipped=true;d.shipDay=S.day}
  if(id==='T1')S.done.adv=true;if(id==='T2')S.done.pay2=true;
  const all=d.tr.every(x=>x.paid!=null);
  bot(S.day,`Оплату ${id} (${fmt(t.a)}) зараховано: постачальник отримав її і звірив автоматично.${ship?' Товар відвантажено, видаткова накладна вже в документах.':''}${all?` Угоду ${d.no} закрито.`:''}`);
  sTab='stmt';closeB();render();toast('sup',`Надійшло ${fmt(t.a)}: звірено з #${d.no}-${id}${ship?', товар відвантажено':''}`)}
function bot(day,t,pay){S.bot.push({d:day,t,pay:pay||null})}
// події дня: виплати NovaPay, надходження інших клієнтів, нагадування бота
function advance(n){const b0=S.bot.length;
  for(let i=0;i<n;i++){const d=++S.day;
    SCHED.forEach((x,j)=>{if(x.day===d&&!S.ev[j]){S.ev[j]=1;const e={...x};S.stmt.push(e);reconcile(e,deals());fresh=S.stmt.length-1}});
    if(!signed())continue;const dl=S.deal,paidOut=PARCELS.filter(p=>p.eta<=d),out=paidOut.reduce((s,p)=>s+p.a,0);
    const used=dl.tr.filter(t=>!t.adv&&t.paid!=null).reduce((s,t)=>s+t.a,0),t=dl.tr.find(t=>t.paid==null&&!t.adv);
    if(!t)continue;
    if(!t.nt&&out-used>=t.a&&t.due-d<=3){t.nt=1;bot(d,`NovaPay зарахував ${fmt(out)} за ${pl(paidOut.length,'посилку','посилки','посилок')}. Цього вистачає на транш ${t.id}: ${fmt(t.a)} до ${dOf(t.due)}.`,t.id)}
    if(d===t.due&&!t.dr){t.dr=1;bot(d,`Сьогодні строк ${t.id}. Чернетку платежу на ${fmt(t.a)} уже створено в «Приват24 для бізнесу», лишилось підтвердити (імітація).`,t.id)}
    if(d===t.due+1)bot(d,`Транш ${t.id} прострочено. Постачальник бачить це в дебіторці.`,t.id)}
  if(S.day>=7)S.done.day7=true;render();toast('sup',`Сьогодні ${dFull(S.day)}`);
  if(S.bot.length>b0){const m=S.bot[S.bot.length-1];pushB('Targo Bot',m.t.length>110?m.t.slice(0,108)+'…':m.t,()=>setBTab('bot'))}}

/* ---------- кабінет постачальника ---------- */
function setSTab(t){sTab=t;render();$('sbody').scrollTop=0;scrollTo(0,0)}   // у вебверсії прокручується вся сторінка
function renderSup(){$('s-today').textContent='Сьогодні '+dFull(S.day);
  document.querySelectorAll('[data-stab]').forEach(b=>b.setAttribute('aria-current',b.dataset.stab===sTab?'page':'false'));
  $('sbody').innerHTML=S.reg?({new:newHTML,apps:appsHTML,ar:arHTML,stmt:stmtHTML,docs:docsHTML})[sTab]():regHTML()}   // до реєстрації будь-яка вкладка веде на форму
function regHTML(){return `<div class="col2"><div class="card"><div class="ct">Реєстрація постачальника</div>
    <p class="small">Додайте реквізити компанії. Назву й керівника підтягнемо з ЄДР (імітація).</p>
    <label class="field">Код ЄДРПОУ<input id="rg-code" class="req" inputmode="numeric" maxlength="8" autocomplete="off" value="${SUP0.code}"></label>
    <p class="small" id="rg-found">${edrHTML(SUP0.code)}</p>
    <label class="field">IBAN, на який платитимуть покупці<input id="rg-iban" class="req" autocomplete="off" spellcheck="false" value="${SUP0.iban}"></label>
    <p class="hint crit" id="rg-err" role="alert" hidden></p>
    <button class="btn accent" id="rg-go">Зареєструватися і отримати посилання</button></div>
  <div class="card"><div class="ct">Як це працює</div><div class="steps3"><div><span>1</span>Реєструєтесь і отримуєте своє посилання-запрошення.</div><div><span>2</span>Надсилаєте його в Telegram чи Viber клієнту, який просить товар у борг.</div><div><span>3</span>Клієнт вводить свій ІПН і IBAN, підключає дані магазину, а ви бачите заявку зі світлофором.</div></div>
    <p class="note">Демо: будь-який код ЄДРПОУ «знаходить» ${SUP0.name}.</p></div></div>`}
const edrHTML=c=>/^\d{8}$/.test(c)?`Знайдено в ЄДР: <b>${SUP0.name}</b>, директор ${SUP0.head}`:'Назва з’явиться, коли введете 8 цифр';
function trList(tr,no,st){return `<div class="trl">${tr.map(t=>{const [l,c]=trSt(t);
  return `<div class="trli"><span><b>${t.adv?'Аванс':'Транш '+t.id}</b><small>${!st&&t.due===0?'сьогодні':'до '+dOf(t.due)}${no?` · #${no}-${t.id}`:''}</small></span><span class="amt">${fmt(t.a)}</span>${st?chip(l,c):'<span></span>'}</div>`}).join('')}</div>`}
const stageL=d=>({link:['Посилання надіслано','grey'],scored:['Заявка на розгляді','warn'],approved:['Погоджено, підпис','warn'],signed:['Договір підписано','ok']})[d.stage];
function newHTML(){
  if(S.deal){const d=S.deal,[l,c]=stageL(d);return `<div class="col2"><div class="card"><div class="ct">Посилання для покупця ${chip(l,c)}</div>
    <div class="linkbox">${invite()}</div><p class="small">${BUY.name}, магазин ${BUY.shop}. Надіслано у ${d.ch||'Telegram'} (імітація).</p>
    <div class="big num">${fmt(d.total)}</div>${trList(d.tr,d.no,d.stage==='signed')}</div>
    <div class="card"><div class="ct">Що далі</div><div class="steps3"><div><span>1</span>Олена підключає дані магазину й отримує ліміт.</div><div><span>2</span>Заявка з’являється в «Заявках» зі світлофором.</div><div><span>3</span>Погоджуєте, підписуєте договір КЕП, гроші приходять траншами.</div></div>
    <p class="note">Нова розстрочка в демо: «Скинути демо».</p></div></div>`}
  return `<div class="col2"><div style="display:grid;gap:12px"><div class="card"><div class="ct">Ваше посилання-запрошення</div><div class="linkbox">${invite()}</div>
    <p class="small">Одне на всіх клієнтів. Клієнт відкриває його, вводить свій ІПН і IBAN, і його заявка з’являється в «Заявках».</p></div>
    <div class="card">
    <div class="ct">Розстрочка замість знижки</div>
    <p class="small">Покупець: <b>${BUY.name}</b>, ${BUY.shop}. Просить знижку 7%.</p>
    <label class="field">Сума накладної, ₴<input id="c-base" data-c="base" inputmode="numeric" value="${calc.base}"></label>
    <div class="prow"><span>Аванс</span><span class="v" data-cv="adv">${calc.adv}%</span><input type="range" min="0" max="90" step="5" value="${calc.adv}" data-c="adv" aria-label="Аванс"></div>
    <div class="frow"><span class="lbl">Строк розстрочки</span><div class="gchips">${[7,14,21,30].map(v=>`<button class="gchip" data-cc="term:${v}" aria-pressed="${calc.term===v}">${v} днів</button>`).join('')}</div></div>
    <div class="frow"><span class="lbl">Платежів після авансу</span><div class="gchips">${[1,2,3].map(v=>`<button class="gchip" data-cc="parts:${v}" aria-pressed="${calc.parts===v}">${v}</button>`).join('')}</div></div>
    <div class="prow"><span>Надбавка за відстрочку, у ціні товару</span><span class="v" data-cv="mk">${calc.mk}%</span><input type="range" min="0" max="10" step="0.5" value="${calc.mk}" data-c="mk" aria-label="Надбавка"></div>
  </div></div><div id="calc-prev">${calcPrev()}</div></div>`}
function calcPrev(){if(!(calc.base>=1000&&calc.base<=1e7))return `<div class="card"><p class="hint crit">Сума накладної від 1 000 до 10 000 000 ₴</p><button class="btn accent" id="mk-link" disabled>Надіслати в Telegram</button></div>`;
  const p=plan(calc),disc=Math.round(calc.base*7)/100,mk=Math.round((p.total-calc.base)*100)/100;
  return `<div class="card"><div class="ct">Що отримає покупець</div><div class="big num">${fmt(p.total)}</div>
    <p class="small">з них ${fmt(mk)} за відстрочку, вшито в ціну товару. Відсотків у договорі немає.</p>${trList(p.tr)}
    <div class="cmp"><div>Знижка 7%<b class="neg num">−${fmt(disc)}</b>з вашого прибутку</div><div>Розстрочка<b class="pos num">+${fmt(mk)}</b>гроші за графіком</div></div>
    <p class="small">Надішліть клієнту посилання-запрошення з цією пропозицією:</p>
    <div class="altrow"><button class="btn accent" id="mk-link">Надіслати в Telegram</button><button class="btn" id="mk-viber">Надіслати у Viber</button></div></div>`}
function appList(){const L=OTHERS.map(o=>({id:o.id,name:o.name,shop:o.shop,total:o.total,adv:o.adv,credit:o.total*(100-o.adv)/100,x:o,h:o,st:['Нова','grey']}));
  if(S.deal&&S.b==='ok'){const d=S.deal;L.unshift({id:'olena',name:'ФОП Коваль Олена',shop:BUY.shop,total:d.total,adv:d.adv,credit:d.credit,x:S.snap,h:HIST,
    st:({scored:['Нова','grey'],approved:['Погоджено','ok'],signed:['Договір підписано','ok']})[d.stage]})}
  L.forEach(a=>a.sc=score(a.x,a.credit,a.total));return L}
function appsHTML(){const L=appList();if(!L.find(a=>a.id===sel))sel=L[0].id;const a=L.find(x=>x.id===sel);
  const wait=S.deal&&S.b!=='ok'?`<div class="ahint">Заявка Олени Коваль з’явиться тут, щойно вона пройде перевірку на телефоні.</div>`:'';
  return `<div class="apps"><div class="alist">${wait}${L.map(x=>`<button class="arow${x.id===sel?' on':''}" data-app="${x.id}"><i class="dot ${x.sc.light}"></i><span><b>${x.name}</b><small>${x.shop} · кредит ${fmt(x.credit)}</small></span>${chip(...x.st)}</button>`).join('')}</div>
    <div class="adet">${detailHTML(a)}</div></div>`}
function detailHTML(a){const s=a.sc,[ln,lc]=LIGHT[s.light],x=a.x,h=a.h,me=a.id==='olena',d=S.deal;
  const verdict=s.light==='red'?`Стоп-фактор: ${x.stop}. Погоджувати не можна.`:s.light==='yellow'?`Кредит ${fmt(a.credit)} більший за ліміт ${fmt(s.limit)}. Рекомендуємо аванс ${s.rec}%.`:`Кредит ${fmt(a.credit)} вкладається в ліміт ${fmt(s.limit)}. Гроші в дорозі перекривають його в ${dec(s.ratio)} раза.`;
  const regs=REGS.map((r,i)=>{const bad=x.stop&&i===3;return `<li class="${bad?'bad':''}"><i>${bad?'✕':'✓'}</i>${bad?x.stop:r}</li>`}).join('');
  let acts;
  if(me)acts=d.stage==='scored'?`<div class="altrow"><button class="btn ghost" id="ap-no">Відхилити</button><button class="btn accent" id="ap-ok"${s.light==='red'?' disabled':''}>Погодити і створити договір</button></div>`
    :`<button class="btn ghost" data-doc="contract">Відкрити договір ${d.no}</button>`;
  else acts=s.light==='red'?`<button class="btn" disabled>Погодити неможливо: стоп-фактор</button>`:`<div class="altrow"><button class="btn ghost" id="ap-no">Відхилити</button><button class="btn" id="ap-adv">Запропонувати аванс ${s.rec}%</button></div>`;
  return `<div class="ct"><h3>${a.name}<br><span class="small">${a.shop} · накладна ${fmt(a.total)}, аванс ${a.adv}%</span></h3>${chip(ln,lc)}</div>
    <p class="hint ${lc==='ok'?'ok':lc}">${verdict}</p>
    <div class="lvl"><h4>1. Реєстри й виконавчі провадження</h4><ul class="regs">${regs}</ul></div>
    <div class="lvl"><h4>2. Історія продажів за 90 днів</h4><div class="g4"><div>Замовлень<b>${h.orders}</b></div><div>Середній чек<b>${fmt(h.avg)}</b></div><div>Викуп<b>${Math.round(h.k*100)}%</b></div><div>Повернення<b>${dec(h.ret,1)}%</b></div></div></div>
    <div class="lvl"><h4>3. Гроші в дорозі</h4><div class="formula">Післяплата активних ТТН <b>${fmt(x.cod)}</b> × викуп <b>${dec(x.k)}</b><br>+ оплачені Prom/Rozetka з ЕН <b>${fmt(x.transit)}</b><br>× дисконт безпеки <b>${dec(D_SAFE)}</b> = ліміт <b>${fmt(s.limit)}</b></div></div>
    ${me?`<div class="lvl"><h4>Графік</h4>${trList(d.tr,d.no,d.stage==='signed')}</div>`:''}${acts}`}
function arHTML(){const rows=[];deals().forEach(d=>d.tr.forEach(t=>rows.push({d,t})));rows.sort((a,b)=>a.t.due-b.t.due||a.d.no.localeCompare(b.d.no));
  let wait=0,over=0,paid=0;rows.forEach(({t})=>{const c=trSt(t)[1];if(c==='ok'){if(t.paid>S.day-30)paid+=t.a}else if(c==='crit')over+=t.a;else wait+=t.a});
  const row=({d,t})=>{const [l,c]=trSt(t);return `<div class="trow"><span class="tid">#${d.no}-${t.id}</span><span>${d.buyer}</span><span class="amt">${fmt(t.a)}</span>${chip(l+(t.paid!=null&&t.paid!==t.due?' '+dOf(t.paid):''),c)}</div>`};
  // очікувані: найближчі зверху, згруповані за датою; сплачені: свіжі зверху
  let last=null,h='';rows.filter(r=>r.t.paid==null).forEach(r=>{if(r.t.due!==last){last=r.t.due;h+=`<div class="dayh">${dOf(r.t.due)}${r.t.due===S.day?' · сьогодні':''}</div>`}h+=row(r)});
  const done=rows.filter(r=>r.t.paid!=null).sort((a,b)=>b.t.paid-a.t.paid);
  return `<div class="kpis"><div class="kpi">Очікується<b class="num">${fmt(wait)}</b></div><div class="kpi${over?' crit':''}">Прострочено<b class="num">${fmt(over)}</b></div><div class="kpi">Сплачено за 30 днів<b class="num">${fmt(paid)}</b></div></div>
    ${signed()?'':`<p class="note">Угода ${DEAL_NO} з Оленою з’явиться тут після підписання договору.</p>`}
    <div class="ct">Календар надходжень</div>${h||'<p class="small">Усі транші сплачено.</p>'}
    <div class="ct">Сплачено</div>${done.map(row).join('')}`}
function stmtHTML(){return `<p class="note">Рахунок ${SUP.iban}. Виписку читає Opendatabot Автоклієнт (імітація). Звірка: код траншу в призначенні, інакше ІПН і сума.</p>
  ${S.stmt.map((e,i)=>({e,i})).reverse().map(({e,i})=>`<div class="srow${i===fresh?' new':''}"><span class="d">${dOf(e.day)}</span><span><b>${e.from}</b><br><span class="small">ІПН/ЄДРПОУ ${e.code}</span></span><span class="amt in">+${fmt(e.a)}</span>
    <span class="p">${e.p.replace(/#?TRG-\d+-T\d+/i,m=>`<mark>${m}</mark>`)}</span>
    ${e.m?chip((e.by==='code'?'Звірено за ІПН: ':'Звірено автоматично: ')+e.m,'ok'):chip('Не розпізнано, перевірте вручну','warn')}</div>`).join('')}`}
function docsHTML(){const d=S.deal;if(!d||d.stage==='link'||d.stage==='scored')return `<div class="card"><div class="ct">Документи</div><p class="small">Договір, специфікація й видаткова накладна з’являться після того, як ви погодите заявку.</p></div>`;
  const st=d.sigS&&d.sigB?'Підписано обома сторонами (КЕП, імітація)':d.sigS?'Ви підписали, чекає підпису покупця':'Чернетка, чекає вашого підпису';
  return `<button class="drow" data-doc="contract"><span><b>Договір поставки з розстроченням № ${d.no}</b><small>з Додатком 1: специфікація і графік платежів · ${st}</small></span>${chip(d.sigS&&d.sigB?'Підписано':'Підпис',d.sigS&&d.sigB?'ok':'warn')}</button>
    ${d.shipped?`<button class="drow" data-doc="waybill"><span><b>Видаткова накладна № ВН-${d.no}</b><small>від ${dFull(d.shipDay)} · ${QTY} пар</small></span>${chip('Відвантажено','ok')}</button>`:''}
    <p class="note">Відправка в «Вчасно» або Paperless у прототипі не підключена.</p>`}

/* ---------- кабінет покупця ---------- */
function setBTab(t){bTab=t;render();const sc=$('bscr');sc.scrollTop=t==='bot'?sc.scrollHeight:0;scrollTo(0,t==='bot'?document.body.scrollHeight:0)}
function renderBuy(){document.querySelectorAll('[data-btab]').forEach(b=>b.setAttribute('aria-current',b.dataset.btab===bTab?'page':'false'));
  $('bscr').dataset.t=bTab;$('bscr').innerHTML=({pass:passHTML,pay:payHTML,inv:invHTML,bot:botHTML})[bTab]();if(bTab==='bot')$('bscr').scrollTop=$('bscr').scrollHeight}
function passHTML(){const d=S.deal;
  if(S.b!=='ok')return `<div class="hero"><div class="lab">Паспорт селера</div><div class="v">Товар у розстрочку</div><p class="small">під гроші, які вже їдуть до ваших покупців Новою поштою.</p></div>
    ${d?`<div class="card"><div class="ct">Пропозиція від ТОВ «Підошва» ${chip('Нова','warn')}</div><div class="big num">${fmt(d.total)}</div><p class="small">${d.adv?`Аванс ${d.adv}%, решта`:'Уся сума'} за ${d.term} днів, без відсотків</p><button class="btn accent" id="of-open">Переглянути</button></div>`
      :`<div class="card"><div class="ct">Поки немає пропозицій</div><p class="small">Коли постачальник запропонує розстрочку, вона з’явиться тут, а бот напише в Telegram.</p></div>`}
    <div class="card"><div class="ct">Як це працює</div><div class="steps3"><div><span>1</span>Підключаєте CRM чи маркетплейс лише для читання.</div><div><span>2</span>За хвилину отримуєте ліміт відстрочки.</div><div><span>3</span>Платите постачальнику частинами, коли NovaPay виплатить вам гроші.</div></div></div>`;
  const sc=score(S.snap,d.credit,d.total),now=oSnap(S.day),[ln,lc]=LIGHT[sc.light];
  return `<div class="hero"><div class="lab">Ліміт відстрочки</div><div class="v num">${fmt(sc.limit)}</div>${chip('Світлофор: '+ln.toLowerCase(),lc)} <span class="small">розраховано ${dOf(0)}</span></div>
    <div class="tiles"><div class="tile"><span class="h">Гроші в дорозі</span><span class="v num">${fmt(now.cod+now.transit)}</span><span class="s">${pl(now.n,'посилка','посилки','посилок')} + Prom/Rozetka</span></div>
      <div class="tile"><span class="h">Викуп посилок</span><span class="v">${Math.round(HIST.k*100)}%</span><span class="s">за 90 днів</span></div>
      <div class="tile"><span class="h">Замовлень</span><span class="v">${HIST.orders}</span><span class="s">середній чек ${fmt(HIST.avg)}</span></div>
      <div class="tile"><span class="h">Повернення</span><span class="v">${dec(HIST.ret,1)}%</span><span class="s">протягом 14 днів</span></div></div>
    <div class="card"><div class="ct">Перевірки</div><ul class="regs">${REGS.map(r=>`<li><i>✓</i>${r}</li>`).join('')}</ul></div>
    <div class="card"><div class="ct">Посилки Нової пошти</div>${PARCELS.map(p=>{const [l,c]=pStatus(p);return `<div class="li"><span class="ic">НП</span><span><span class="t num">${p.n}</span><span class="s">післяплата</span></span><span class="r"><span class="amt">${fmt(p.a)}</span>${chip(l,c)}</span></div>`}).join('')}</div>
    <div class="card"><div class="ct">Prom і Rozetka</div>${TRANSIT.map(t=>{const inc=t.en&&!t.dispute;return `<div class="li"><span class="ic">${t.src==='Prom'?'PR':'RZ'}</span><span><span class="t">${t.src} №${t.no}</span><span class="s">${inc?'оплачено, ЕН є':t.dispute?'відкрито спір':'ще немає ЕН'}</span></span><span class="r"><span class="amt">${fmt(t.a)}</span>${inc?chip('У ліміті','ok'):chip('Не враховано','grey')}</span></div>`}).join('')}</div>`}
function payHTML(){const d=S.deal;if(!signed())return `<div class="card"><div class="ct">Графік погашень</div><p class="small">З’явиться після підписання договору з постачальником.</p></div>`;
  const out=PARCELS.filter(p=>p.eta<=S.day).reduce((s,p)=>s+p.a,0),used=d.tr.filter(t=>!t.adv&&t.paid!=null).reduce((s,t)=>s+t.a,0),t=d.tr.find(x=>x.paid==null);
  let env='';
  if(!t)env=`<div class="card"><div class="ct">Конверт погашення ${chip('Усе сплачено','ok')}</div><p class="small">Угоду ${d.no} закрито без прострочок.</p></div>`;
  else if(t.adv)env=`<div class="card"><div class="ct">Аванс ${fmt(t.a)}</div><p class="small">Сплатіть аванс, і постачальник відвантажить товар. Рахунок у вкладці «Рахунки».</p></div>`;
  else{const has=Math.max(0,out-used),set=Math.min(has,t.a),full=set>=t.a;
    env=`<div class="card"><div class="ct">Віртуальний конверт погашення ${full?chip('Можна платити','ok'):chip('Наповнюється','grey')}</div>
      <div class="big num">${fmt(set)} <span class="small">з ${fmt(t.a)}</span></div><div class="bar"><i style="width:${Math.round(set/t.a*100)}%"></i></div>
      <p class="small">${full?`NovaPay уже виплатив достатньо. Транш ${t.id} до ${dOf(t.due)}.`:`Відкладаємо з виплат NovaPay під транш ${t.id} до ${dOf(t.due)}. Бракує ${fmt(t.a-set)}.`}</p></div>`}
  const exp={};PARCELS.filter(p=>p.eta>S.day).forEach(p=>{(exp[p.eta]=exp[p.eta]||[]).push(p)});
  return env+`<div class="card"><div class="ct">Графік ${d.no}</div>${trList(d.tr,d.no,true)}</div>
    <div class="card"><div class="ct">Очікувані виплати NovaPay</div>${Object.keys(exp).length?Object.entries(exp).map(([day,ps])=>`<div class="li"><span class="ic">НП</span><span><span class="t">${dOf(+day)}</span><span class="s">${pl(ps.length,'посилка','посилки','посилок')}</span></span><span class="amt">${fmt(ps.reduce((s,p)=>s+p.a,0))}</span></div>`).join(''):'<p class="small">Усі посилки вже виплачено.</p>'}</div>`}
function invHTML(){const d=S.deal;if(!signed())return `<div class="card"><div class="ct">Рахунки</div><p class="small">Рахунки з QR-кодом з’являться після підписання договору.</p></div>`;
  return d.tr.map(t=>{const [l,c]=trSt(t);return `<button class="invbtn" data-inv="${t.id}"><b>${t.adv?'Аванс':'Транш '+t.id} · ${fmt(t.a)}</b>${chip(l,c)}<small>#${d.no}-${t.id} · до ${dOf(t.due)}</small></button>`}).join('')+
    `<p class="note">Платите напряму постачальнику на IBAN. Платформа гроші не тримає.</p>`}
function botHTML(){const d=S.deal;
  return `<div class="bothd"><span class="avatar">T</span><span><b>Targo Bot</b>Telegram, імітація</span></div>`+
    (S.bot.length?S.bot.map(m=>{const t=m.pay&&d&&d.tr.find(x=>x.id===m.pay),pd=t&&t.paid!=null;
      return `<div class="bubble">${m.t}${t?`<button class="botbtn" data-bot-pay="${t.id}"${pd?' disabled':''}>${pd?`${t.id} сплачено`:`Сплатити ${t.id}: ${fmt(t.a)}`}</button>`:''}<span class="w">${dOf(m.d)}</span></div>`}).join('')
     :`<p class="note">Бот напише, коли прийде рахунок або гроші від NovaPay.</p>`)}

/* шторки в телефоні */
function sheetB(html){role('buy');$('blayer').innerHTML=`<div class="sheet" id="bsheet"><div class="panel"><span class="grab"></span>${html}</div></div>`}
function closeB(){wzT.forEach(clearTimeout);wzT=[];wz=null;curInv=null;$('blayer').innerHTML=''}
function openOffer(){const d=S.deal;if(!d)return;hidePush();
  sheetB(`<h3>Розстрочка від ТОВ «Підошва»</h3><div class="kv"><span>Товар</span><span>Взуття, ${QTY} пар</span><span>Вартість</span><span class="num">${fmt(d.total)}</span><span>З них за відстрочку</span><span class="num">${fmt(Math.round((d.total-d.base)*100)/100)}</span></div>
    ${trList(d.tr,d.no)}<p class="hint ok">Без відсотків і без банку: платите напряму постачальнику на IBAN за договором поставки.</p>
    <div class="btncol">${S.b==='ok'?`<button class="btn" disabled>Заявку надіслано</button>`:`<button class="btn accent" id="of-go">Отримати ліміт за 60 секунд</button>`}<button class="btn ghost" id="b-close">Пізніше</button></div>`)}
let wzT=[];
const CHK=[['Реєстри й АСВП','чинність ФОП, єдиний податок, боржники, провадження'],['Історія продажів за 90 днів','замовлення, середній чек, викуп, повернення'],['Гроші в дорозі','ТТН Нової пошти, реєстри NovaPay, оплачені Prom і Rozetka']];
const SRC=[['keycrm','KC','KeyCRM','замовлення Prom, Rozetka, Instagram і реєстри NovaPay'],['salesdrive','SD','SalesDrive','CRM для інтернет-магазинів'],['rozetka','RZ','Rozetka Seller','замовлення і баланс селера'],['prom','PR','Prom.ua','замовлення і Пром-оплата']];
function openWizard(step){if(!S.deal)return;hidePush();wz=step;const bar=n=>`<div class="stp">${[1,2,3].map(i=>`<i class="${i<=n?'on':''}"></i>`).join('')}</div>`;
  if(step==='id')sheetB(`${bar(1)}<h3>Хто ви</h3><p class="small">Ви перейшли за запрошенням ${SUP.name}. Вкажіть реквізити свого ФОП.</p>
    <label class="field">ІПН або ЄДРПОУ<input id="wz-code" class="req" inputmode="numeric" maxlength="10" autocomplete="off" value="${BUY.code}"></label>
    <label class="field">Ваш IBAN<input id="wz-iban" class="req" autocomplete="off" spellcheck="false" value="${BUY.iban}"></label>
    <p class="hint crit" id="wz-err" role="alert" hidden></p>
    <p class="small">${BUY.name}. Особу підтвердимо через Дія.Підпис (імітація).</p><button class="btn accent" id="wz-next">Далі</button>`);
  else if(step==='src'){const any=Object.values(S.src).some(Boolean);
    sheetB(`${bar(2)}<h3>Дані магазину</h3><p class="small">Лише читання: платформа не бачить паролів і не рухає гроші.</p><div>${SRC.map(([k,ic,t,s])=>`<div class="srcrow"><span class="ic">${ic}</span><span><b>${t}</b><small>${S.src[k]?'Підключено, лише читання':s}</small></span><button data-src="${k}" aria-pressed="${!!S.src[k]}">${S.src[k]?'Готово':'Підключити'}</button></div>`).join('')}</div>
      <button class="btn accent" id="wz-check"${any?'':' disabled'}>Перевірити</button>`)}
  else if(step==='check')sheetB(`${bar(3)}<h3>Перевіряємо</h3><p class="small">Зазвичай до 60 секунд.</p><div class="checks">${CHK.map(([t,s],i)=>`<div class="${i<wzg?'done':i===wzg?'busy':''}"><span class="c">${i<wzg?'✓':''}</span><span><b>${t}</b><small>${s}</small></span></div>`).join('')}</div>`);
  else{const d=S.deal,x=oSnap(S.day),sc=score(x,d.credit,d.total),[ln,lc]=LIGHT[sc.light];
    sheetB(`<svg class="success" viewBox="0 0 56 56" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="28" cy="28" r="25" pathLength="1"/><path d="M17 29l7 7 15-16" pathLength="1"/></svg>
      <h3 style="text-align:center">Ліміт відстрочки ${fmt(sc.limit)}</h3><div style="text-align:center">${chip('Світлофор: '+ln.toLowerCase(),lc)}</div>
      <div class="kv"><span>Посилки в дорозі</span><span class="num">${fmt(x.cod)}</span><span>× викуп</span><span>${dec(x.k)}</span><span>Prom і Rozetka з ЕН</span><span class="num">${fmt(x.transit)}</span><span>× дисконт безпеки</span><span>${dec(D_SAFE)}</span><span>Кредит за пропозицією</span><span class="num">${fmt(d.credit)}</span></div>
      <p class="hint ${lc==='ok'?'ok':lc}">${sc.light==='green'?'Кредит вкладається в ліміт. Постачальник побачить зелений світлофор.':`Кредит більший за ліміт. Постачальник може попросити аванс ${sc.rec}%.`}</p>
      <button class="btn accent" id="wz-send">Надіслати заявку постачальнику</button>`)}}
function runCheck(){if(!Object.values(S.src).some(Boolean))return;S.done.connect=true;save();paintSteps();wzg=0;openWizard('check');const step=RM?100:1200;
  [1,2,3].forEach(i=>wzT.push(setTimeout(()=>{wzg=i;openWizard('check')},step*i)));wzT.push(setTimeout(()=>openWizard('res'),step*3+400))}
function openSign(){const d=S.deal;if(!d)return;hidePush();
  sheetB(`<h3>Договір № ${d.no}</h3><p class="small">Договір поставки з розстроченням платежу. ТОВ «Підошва» вже підписало його КЕП.</p>
    <div class="kv"><span>Сума</span><span class="num">${fmt(d.total)}</span><span>Платежів</span><span>${d.tr.length}</span><span>Розрахунки</span><span>лише на IBAN</span></div>
    <div class="btncol">${d.sigB?`<button class="btn" disabled>Підписано</button>`:`<button class="btn accent" id="sg-buy">Підписати КЕП (імітація)</button>`}<button class="btn ghost" data-doc="contract">Переглянути договір</button></div>`)}
function openInv(id){const d=S.deal;if(!signed())return;const t=d.tr.find(x=>x.id===id);if(!t)return;hidePush();curInv=id;const [l,c]=trSt(t),purpose=`Оплата за договором поставки ${d.no}, #${d.no}-${id}, без ПДВ`;
  sheetB(`<h3>Рахунок #${d.no}-${id}</h3><div class="ct"><span class="big num">${fmt(t.a)}</span>${chip(l,c)}</div><p class="small">${t.adv?'Аванс':'Транш'} до ${dFull(t.due)}</p>
    <div class="qrbox" id="qrbox"></div><p class="note" style="text-align:center">QR за стандартом НБУ. Демо: не платіть за цим кодом.</p>
    <div class="req"><div><span>Отримувач</span>${SUP.name}, ЄДРПОУ ${SUP.code}</div><div><span>IBAN</span>${SUP.iban}</div><div><span>Призначення</span>${purpose}</div></div>
    <div class="btncol">${t.paid!=null?`<button class="btn" disabled>Сплачено ${dOf(t.paid)}</button>`:`<button class="btn accent" id="inv-pay">Оплатити в банку (імітація)</button><button class="btn ghost" id="inv-draft">Чернетка в «Приват24 для бізнесу»</button>`}</div>`);
  const box=$('qrbox'),link=nbuQR(t.a,purpose);
  if(window.QRCode){new QRCode(box,{text:link,width:168,height:168,correctLevel:QRCode.CorrectLevel.M});box.insertAdjacentHTML('beforeend','<span class="uah">₴</span>')}
  else box.innerHTML='<div class="off">QR-код не завантажився: немає інтернету</div>'}

/* ---------- документи ---------- */
function openDoc(kind){const d=S.deal;if(!d)return;const o=$('ovl');o.hidden=false;
  const sign=kind==='contract'&&d.stage==='approved'&&!d.sigS?`<button class="btn accent sm" id="sg-sup">Підписати КЕП (імітація)</button>`:'';
  o.innerHTML=`<div class="docbar"><b>${kind==='contract'?'Договір № '+d.no:'Видаткова накладна'}</b><span class="acts">${sign}<button class="btn ghost sm" id="doc-print">Завантажити PDF</button><button class="btn ghost sm" id="doc-close">Закрити</button></span></div>${kind==='contract'?contractHTML(d):waybillHTML(d)}`}
function closeDoc(){$('ovl').hidden=true;$('ovl').innerHTML=''}
function contractHTML(d){const price=Math.round(d.total/QTY*100)/100;
  return `<article class="doc"><p class="demo-note">Шаблон для демонстрації. Перед використанням потребує перевірки юристом.</p>
  <h1>ДОГОВІР ПОСТАВКИ ТОВАРУ<br>НА УМОВАХ РОЗСТРОЧЕННЯ ПЛАТЕЖУ № ${d.no}</h1><p class="row2"><span>м. Київ</span><span>${dFull(0)}</span></p>
  <p>${SUP.name} (код ЄДРПОУ ${SUP.code}), далі «Постачальник», в особі директора ${SUP.head}, з одного боку, та ${BUY.name} (${BUY.code.length===10?'РНОКПП':'код ЄДРПОУ'} ${BUY.code}, IBAN ${BUY.iban}), далі «Покупець», з другого боку, уклали цей Договір відповідно до статей 694, 695 і 1057 Цивільного кодексу України.</p>
  <h2>1. Предмет договору</h2><p>1.1. Постачальник передає у власність Покупця товар за Специфікацією (Додаток 1), а Покупець приймає товар і оплачує його частинами за графіком (продаж товару в кредит із розстроченням платежу).</p>
  <h2>2. Ціна</h2><p>2.1. Загальна вартість товару становить ${fmt(d.total)}, без ПДВ.</p><p>2.2. Ціна товару враховує умови розстрочення. Проценти за користування товарним кредитом не нараховуються.</p>
  <h2>3. Порядок розрахунків</h2><p>3.1. Усі розрахунки за цим Договором Покупець здійснює виключно в безготівковій грошовій формі в гривні шляхом прямого банківського переказу на поточний рахунок Постачальника ${SUP.iban}.</p>
  <p>3.2. Сторони домовилися не застосовувати негрошові форми розрахунків, зокрема бартер, зарахування зустрічних однорідних вимог або відступлення права вимоги третім особам.</p><p>3.3. У призначенні кожного платежу Покупець зазначає код траншу з графіка (наприклад, #${d.no}-T1).</p>
  <h2>4. Поставка</h2><p>4.1. Постачальник відвантажує товар протягом одного робочого дня після ${d.tr[0].adv?'отримання авансу':'підписання Договору'}. Передача товару оформлюється видатковою накладною.</p>
  <h2>5. Інші умови</h2><p>5.1. Договір укладено в електронній формі та підписано кваліфікованими електронними підписами Сторін. Він діє до повного виконання зобов’язань.</p>
  <h2>Додаток 1. Специфікація і графік платежів</h2>
  <table><tr><th>Товар</th><th class="r">Кількість</th><th class="r">Ціна</th><th class="r">Сума</th></tr><tr><td>Взуття жіноче демісезонне, асортимент згідно із замовленням</td><td class="r">${QTY} пар</td><td class="r">${fmt(price)}</td><td class="r">${fmt(d.total)}</td></tr></table>
  <table><tr><th>Платіж</th><th>Строк</th><th>Код у призначенні</th><th class="r">Сума</th></tr>${d.tr.map(t=>`<tr><td>${t.adv?'Аванс':'Транш '+t.id}</td><td>до ${dFull(t.due)}</td><td>#${d.no}-${t.id}</td><td class="r">${fmt(t.a)}</td></tr>`).join('')}</table>
  <div class="sigs"><div><b>Постачальник</b><br>${SUP.name}<br><span class="sigst${d.sigS?' ok':''}">${d.sigS?'Підписано КЕП (імітація)':'Очікує підпису'}</span></div>
    <div><b>Покупець</b><br>${BUY.name}<br><span class="sigst${d.sigB?' ok':''}">${d.sigB?'Підписано КЕП (імітація)':'Очікує підпису'}</span></div></div></article>`}
function waybillHTML(d){const price=Math.round(d.total/QTY*100)/100;
  return `<article class="doc"><p class="demo-note">Шаблон для демонстрації.</p><h1>ВИДАТКОВА НАКЛАДНА № ВН-${d.no}<br>від ${dFull(d.shipDay)}</h1>
  <p>Постачальник: ${SUP.name}, ЄДРПОУ ${SUP.code}, IBAN ${SUP.iban}</p><p>Покупець: ${BUY.name}, ${BUY.code.length===10?'РНОКПП':'ЄДРПОУ'} ${BUY.code}, IBAN ${BUY.iban}</p><p>Підстава: договір поставки на умовах розстрочення платежу № ${d.no} від ${dFull(0)}</p>
  <table><tr><th>Товар</th><th class="r">Кількість</th><th class="r">Ціна</th><th class="r">Сума</th></tr><tr><td>Взуття жіноче демісезонне</td><td class="r">${QTY} пар</td><td class="r">${fmt(price)}</td><td class="r">${fmt(d.total)}</td></tr></table>
  <p><b>Разом: ${fmt(d.total)}, без ПДВ.</b> Оплата за графіком Додатка 1 до договору.</p>
  <div class="sigs"><div><b>Відвантажив</b><br>${SUP.name}</div><div><b>Отримав</b><br>${BUY.name}</div></div></article>`}

/* ---------- пуші, тости, ролі ---------- */
let pushT=0;
function hidePush(){clearTimeout(pushT);const p=$('bpush');if(p)p.remove()}
function pushB(t,b,go){hidePush();const el=document.createElement('button');el.className='push';el.id='bpush';
  el.innerHTML=`<span class="pi">T</span><span><span class="h"><span>${t}</span><span>зараз</span></span><span class="b">${b}</span></span>`;
  // #pushhost (мобільна, веб) видно в обох ролях; на демо-сторінці пуш живе в телефоні покупця
  el.onclick=()=>{hidePush();role('buy');if(go)go()};($('pushhost')||$('buy')).appendChild(el);pushT=setTimeout(hidePush,8000)}
function toast(where,msg){const host=$('pushhost')||$(where),old=host.querySelector(':scope>.toast');if(old)old.remove();
  const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');t.textContent=msg;host.appendChild(t);setTimeout(()=>t.remove(),2800)}
// червоні крапки рахуються зі стану: горять, поки є що зробити або непереглянуте нове
function attn(){const d=S.deal,t=signed()?d.tr.filter(x=>x.paid==null):[];
  return {apps:!!d&&d.stage==='scored',                                  // заявка чекає погодження
    docs:!!d&&d.stage==='approved'&&!d.sigS,                             // договір чекає підпису постачальника
    stmt:S.stmt.length>S.seen.stmt,                                      // нові надходження у виписці
    ar:deals().some(x=>x.tr.some(r=>r.paid==null&&S.day>r.due)),         // є прострочка
    pass:!!d&&(S.b!=='ok'||(d.sigS&&!d.sigB)),                           // нова пропозиція або договір на підпис
    inv:t.some(r=>r.due<=S.day||r.nt),                                   // настав строк або гроші на транш уже є
    bot:S.bot.length>S.seen.bot}}                                        // непрочитані повідомлення
const SIDE={sup:['new','apps','ar','stmt','docs'],buy:['pass','pay','inv','bot']};
function dots(){S.seen=S.seen||{stmt:0,bot:0};   // стан зі старої версії без seen
  if(sTab==='stmt'&&visible($('sup')))S.seen.stmt=S.stmt.length;   // відкрита вкладка = переглянуто
  if(bTab==='bot'&&visible($('buy')))S.seen.bot=S.bot.length;
  const A=attn(),mark=(b,on)=>{b.classList.toggle('ping',on);const l=b.textContent.trim();b.setAttribute('aria-label',on?l+', є нове':l)};
  document.querySelectorAll('[data-stab]').forEach(b=>mark(b,!!A[b.dataset.stab]));
  document.querySelectorAll('[data-btab]').forEach(b=>mark(b,!!A[b.dataset.btab]));
  document.querySelectorAll('[data-role]').forEach(b=>{const r=b.dataset.role;mark(b,!visible($(r))&&SIDE[r].some(k=>A[k]))});
  const n=Object.values(A).filter(Boolean).length;   // число на іконці встановленої PWA
  if('setAppBadge' in navigator)(n?navigator.setAppBadge(n):navigator.clearAppBadge()).catch(()=>{})}
function role(r){document.body.classList.toggle('role-sup',r==='sup');document.body.classList.toggle('role-buy',r==='buy');
  document.querySelectorAll('[data-role]').forEach(b=>{const on=b.dataset.role===r;b.setAttribute('aria-pressed',on);});dots();save()}
function flash(sel){const all=document.querySelectorAll(sel),el=all[all.length-1];if(!el)return;el.scrollIntoView({block:'nearest'});el.classList.remove('hl');void el.offsetWidth;el.classList.add('hl')}

/* ---------- сценарій для журі ---------- */
let auto=false,di=-1,showT=[];
const later=(ms,fn)=>showT.push(setTimeout(fn,ms));
const clearTimers=()=>{showT.forEach(clearTimeout);showT=[]};
const hideCursor=()=>$('fcur').classList.remove('on','clk');
// txt: замість кліку «друкуємо» в поле по символу, як людина
function point(sel,at,txt){later(at,()=>{if(!auto)return;const all=document.querySelectorAll(sel),el=all[all.length-1];if(!el)return;
  const side=el.closest('#sup')?'sup':el.closest('#buy')?'buy':null;if(side&&!visible(el))role(side);
  el.scrollIntoView({block:'nearest',behavior:RM?'auto':'smooth'});
  later(RM?0:250,()=>{if(!auto)return;const r=el.getBoundingClientRect(),c=$('fcur');
    if(r.width){c.classList.add('on');c.style.transform=`translate(${Math.round(r.left+r.width*.6)}px,${Math.round(r.top+r.height*.55)}px)`}
    later(RM?50:700,()=>{if(!auto)return;c.classList.remove('clk');void c.offsetWidth;c.classList.add('clk');
      if(txt==null)return el.click();el.focus();el.value='';
      [...txt].forEach((ch,i)=>later(RM?0:i*45,()=>{if(!auto)return;el.value+=ch;el.dispatchEvent(new Event('input',{bubbles:true}))}))})})})}
const DEMO=[
  {k:'reg',    t:'Реєстрація постачальника',  s:'ЄДРПОУ, IBAN, посилання-запрошення', d:9000,
    fast(){register(SUP0.code,SUP0.iban)}, go(){closeDoc();role('sup');setSTab('new')}, pts:[['#rg-code',800,SUP0.code],['#rg-iban',2400,SUP0.iban],['#rg-go',5400]]},
  {k:'offer',  t:'Розстрочка замість знижки', s:'запрошення в Telegram', d:7000,
    fast(){makeOffer()}, go(){closeDoc();role('sup');setSTab('new')}, pts:[['#mk-link',1600]]},
  {k:'connect',t:'Покупець за посиланням',    s:'ІПН, IBAN, KeyCRM лише для читання', d:10000,
    fast(){S.breg=S.breg||{code:BUY0.code,iban:BUY0.iban};S.src.keycrm=true;S.done.connect=true}, go(){role('buy');openOffer()},
    pts:[['#of-go',1300],['#wz-code',2600,BUY0.code],['#wz-iban',4000,BUY0.iban],['#wz-next',6200],['[data-src="keycrm"]',7600]]},
  {k:'score',  t:'Перевірка за 60 секунд',    s:'реєстри, історія, гроші в дорозі', d:9000,
    fast(){completeCheck()}, go(){role('buy');if(S.b==='ok'){setBTab('pass')}else openWizard('src')}, pts:[['#wz-check',900],['#wz-send',6200]]},
  {k:'approve',t:'Світлофор постачальника',  s:'зелена заявка і стоп-фактор', d:7000,
    fast(){approve(true)}, go(){closeDoc();role('sup');sel='olena';setSTab('apps')}, pts:[['[data-app="tkachuk"]',900],['[data-app="olena"]',2600],['#ap-ok',4300]]},
  {k:'sign',   t:'Договір і КЕП',             s:'обидві сторони підписують', d:8000,
    fast(){const d=S.deal;if(d.stage==='approved'){d.sigS=true;signB()}}, go(){const d=S.deal;if(d.sigS)openSign();else{role('sup');openDoc('contract')}}, pts:[['#sg-sup',1500],['#bpush',3600],['#sg-buy',5200]]},
  {k:'adv',    t:'Аванс за QR-кодом',         s:'звірка закриває транш', d:7000,
    fast(){payTr('T1')}, go(){closeDoc();role('buy');setBTab('inv');if(auto)later(4600,()=>role('sup'))}, pts:[['[data-inv="T1"]',1000],['#inv-pay',2800]]},
  {k:'day7',   t:'Минає тиждень',             s:'NovaPay виплатив, бот нагадує', d:7000,
    fast(){if(S.day<7)advance(7-S.day)}, go(){role('buy');setBTab('pay')}, pts:[['#day7',1200],['#bpush',3400]]},
  {k:'pay2',   t:'Другий транш',              s:'дебіторка без прострочок', d:7000,
    fast(){payTr('T2')}, go(){role('buy');setBTab('bot');if(auto)later(5000,()=>{role('sup');setSTab('ar')})}, pts:[['[data-bot-pay="T2"]',1000],['#inv-pay',2800]]},
];
const CAPS={
  reg:'Гуртовня «Підошва» реєструється в Targo: код ЄДРПОУ і IBAN. Назву й директора платформа бере з ЄДР, а постачальник отримує своє посилання-запрошення.',
  offer:'Олена просить знижку 7%, а це 8 400 ₴ прибутку. Замість знижки менеджер у два кліки пропонує розстрочку: 30% зараз, решта за 14 днів, і надсилає запрошення в Telegram.',
  connect:'Олена відкриває посилання на телефоні, вводить свій ІПН та IBAN і підключає KeyCRM лише для читання. Паролів і грошей платформа не бачить.',
  score:'За хвилину платформа перевіряє реєстри й АСВП, продажі за 90 днів і посилки в дорозі. До покупців Олени вже їде 149 000 ₴, тож ліміт 86 800 ₴.',
  approve:'Постачальник бачить світлофор. У Ткачук відкрите провадження, і система її зупиняє. Олена зелена: погодження одним кліком.',
  sign:'Договір поставки з розстроченням формується сам: лише прямі платежі на IBAN, без цесії й відсотків, щоб обидві сторони лишились на єдиному податку. Підпис КЕП.',
  adv:'Аванс Олена платить за QR-кодом НБУ. Код траншу вже в призначенні, тож звірка сама закриває платіж, і товар їде.',
  day7:'Минає тиждень. NovaPay виплатив Олені гроші за посилки, і саме тоді бот нагадує про платіж, а чернетка вже чекає в банку.',
  pay2:'Олена платить другий транш. У постачальника дебіторка оновилась сама, прострочок немає.'};   // чернетка, текст правте тут
DEMO.forEach(x=>{x.c=CAPS[x.k]||x.t;x.d=Math.max(x.d,Math.round(x.c.length*60))});   // тривалість кроку не менша, ніж треба, щоб дочитати підпис
const modeHTML=()=>`<span class="mode"><button data-mode="manual" aria-pressed="${!auto}">Вручну</button><button data-mode="auto" aria-pressed="${auto}">Авто</button></span>`;
function paintSteps(){const nx=DEMO.findIndex(x=>!S.done[x.k]);
  $('jsteps').innerHTML=modeHTML()+DEMO.map((x,i)=>`<button class="jstep${S.done[x.k]?' done':''}${auto&&i===di?' now':''}${!auto&&i===nx?' next':''}" data-j="${i}"><span class="n">${S.done[x.k]?'✓':i+1}</span><span>${x.t}<small>${x.s}</small></span></button>`).join('');
  $('daynow').textContent=`${dFull(S.day)} · день ${S.day}`}
function runStep(i){clearTimers();hideCursor();hidePush();closeB();
  DEMO.slice(0,i).forEach(x=>{if(!S.done[x.k])x.fast()});uiT.forEach(clearTimeout);uiT=[];hidePush();   // пуші з пропущених кроків не показуємо
  di=i;const s=DEMO[i],sb=$('subs');render();
  if(auto){sb.hidden=false;$('subs-k').textContent=`${i+1} / ${DEMO.length}`;$('subs-t').textContent=s.c;
    const bar=$('subs-bar');bar.style.transition='none';bar.style.width=(i/DEMO.length*100)+'%';void bar.offsetWidth;bar.style.transition=RM?'none':`width ${s.d}ms linear`;bar.style.width=`calc(${(i+1)/DEMO.length*100}% - 32px)`;
    later(s.d,()=>{if(i<DEMO.length-1)runStep(i+1);else{hideCursor();auto=false;sb.hidden=true;paintSteps();toast('sup','Показ завершено')}})}   // після останнього кроку показ зупиняється
  else sb.hidden=true;
  s.go();if(auto)s.pts.forEach(([sel,at,txt])=>point(sel,at,txt));else later(450,()=>flash(s.pts[0][0]));paintSteps()}
function setMode(a){auto=a;clearTimers();hideCursor();if(a){document.body.classList.remove('jury');restartDemo()}else{$('subs').hidden=true;paintSteps()}}
function resetDemo(){S=clone(DEF);uiT.forEach(clearTimeout);uiT=[];sel=null;fresh=-1;calc={base:120000,adv:30,term:14,parts:2,mk:3};sTab='new';bTab='pass';
  closeB();closeDoc();hidePush();role('sup');render();toast('sup','Демо скинуто')}
function restartDemo(){clearTimers();hideCursor();resetDemo();di=-1;if(auto)later(900,()=>runStep(0));else{$('subs').hidden=true;paintSteps()}}

/* ---------- події ---------- */
function render(){syncP();renderSup();renderBuy();paintSteps();dots();save()}
document.addEventListener('click',e=>{
  if(e.target.id==='bsheet'&&wz!=='check'){closeB();return}
  if(e.target.id==='ovl'){closeDoc();return}
  const b=e.target.closest('button');if(!b)return;const ds=b.dataset;
  if(ds.stab)return setSTab(ds.stab);
  if(ds.btab)return setBTab(ds.btab);
  if(ds.app){sel=ds.app;return renderSup()}
  if(ds.cc){const [k,v]=ds.cc.split(':');calc[k]=+v;return renderSup()}
  if(ds.src){S.src[ds.src]=!S.src[ds.src];save();return openWizard('src')}
  if(ds.inv)return openInv(ds.inv);
  if(ds.botPay)return openInv(ds.botPay);
  if(ds.doc)return openDoc(ds.doc);
  if(ds.role)return role(ds.role);
  if(ds.mode){const a=ds.mode==='auto';if(a!==auto)setMode(a);return}
  if(ds.j!=null){if(auto)return;document.body.classList.remove('jury');return runStep(+ds.j)}
  const A={'rg-go':()=>register($('rg-code').value,$('rg-iban').value),'mk-link':()=>makeOffer('Telegram'),'mk-viber':()=>makeOffer('Viber'),
    'of-open':openOffer,'of-go':()=>openWizard('id'),'wz-next':buyerId,'wz-check':runCheck,'wz-send':completeCheck,
    'ap-ok':()=>approve(),'ap-no':()=>toast('sup','У демо відхилення не зберігається'),'ap-adv':()=>toast('sup','Покупцю надіслано пропозицію з більшим авансом (імітація)'),
    'sg-sup':signS,'sg-buy':signB,'inv-pay':()=>payTr(curInv),'inv-draft':()=>toast('buy','Чернетку створено в «Приват24 для бізнесу» (імітація)'),
    'b-close':closeB,'doc-close':closeDoc,'doc-print':()=>print(),reset:()=>auto?restartDemo():resetDemo(),day1:()=>advance(1),day7:()=>advance(7),
    'p-hide':()=>{document.body.classList.remove('jury');if(visible($('presenter')))document.body.classList.add('nopanel')},
    'p-show':()=>{document.body.classList.remove('nopanel');if(!visible($('presenter')))document.body.classList.add('jury')},
    'jury-open':()=>document.body.classList.toggle('jury')};
  if(A[b.id])A[b.id]()});
document.addEventListener('input',e=>{const id=e.target.id;
  if(id==='rg-code')$('rg-found').innerHTML=edrHTML(clean(e.target.value));
  if(/^(rg|wz)-/.test(id)){const er=$(id.slice(0,2)+'-err');if(er)er.hidden=true}   // помилка ховається, щойно поле правлять
  const k=e.target.dataset.c;if(!k)return;const v=k==='base'?+e.target.value.replace(/\D/g,''):+e.target.value;calc[k]=v;
  const l=document.querySelector(`[data-cv="${k}"]`);if(l)l.textContent=v+'%';$('calc-prev').innerHTML=calcPrev()});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(!$('ovl').hidden)closeDoc();else if(wz!=='check')closeB();document.body.classList.remove('jury');return}
  if(auto&&(e.key===' '||e.key==='ArrowRight')){e.preventDefault();if(di<DEMO.length-1)runStep(di+1);else setMode(false)}});   // у ручному режимі клавіші нічого не роблять

/* ---------- самоперевірка: ?selftest, результат у консолі ---------- */
function selftest(){const R=[],ok=(n,c)=>R.push((c?'ok   ':'FAIL ')+n);
  [[120000,30,14,2,3],[99999,25,21,3,2.5],[1001,0,7,3,0],[57333,35,30,3,7]].forEach(([base,adv,term,parts,mk])=>{const p=plan({base,adv,term,parts,mk});
    ok(`сума траншів = сумі угоди (${base} ₴, аванс ${adv}%, ${parts} платежі)`,p.tr.reduce((s,t)=>s+Math.round(t.a*100),0)===Math.round(p.total*100))});
  const p=plan({base:120000,adv:30,term:14,parts:2,mk:3});ok('чернетка: 123 600 = 37 080 + 43 260 + 43 260, строки 0/7/14',p.total===123600&&p.tr.map(t=>t.a+'@'+t.due).join()==='37080@0,43260@7,43260@14');
  const sc=score(oSnap(0),p.credit,p.total);ok('ліміт Олени ≈ 86 866, показ 86 800, зелений',Math.round(sc.raw)===86866&&sc.limit===86800&&sc.light==='green');
  const tk=OTHERS.find(o=>o.stop);ok('АСВП: червоний навіть з кредитом 1 ₴',score(tk,1,tk.total).light==='red');
  const bo=OTHERS.find(o=>o.id==='bondar'),sb=score(bo,bo.total*.7,bo.total);ok('жовтий: рекомендований аванс вкладає кредит у ліміт',sb.light==='yellow'&&bo.total*(100-sb.rec)/100<=sb.limit);
  const dl=[{no:'TRG-1',code:'111',tr:[{id:'T1',a:100,paid:null},{id:'T2',a:200,paid:null}]}];
  ok('платіж без коду від незнайомого не закриває транш',!reconcile({day:0,from:'X',code:'999',a:100,p:'оплата за товар'},dl)&&dl[0].tr.every(t=>t.paid==null));
  ok('недоплата з кодом не закриває транш',!reconcile({day:0,code:'999',a:50,p:'#TRG-1-T1'},dl)&&dl[0].tr[0].paid==null);
  ok('платіж з #TRG-1-T2 закриває T2',!!reconcile({day:1,code:'999',a:200,p:'Оплата #TRG-1-T2'},dl)&&dl[0].tr[1].paid===1);
  ok('повторний платіж на сплачений T2 не зараховується вдруге',!reconcile({day:1,code:'999',a:200,p:'#TRG-1-T2'},dl));
  ok('за ІПН: одна відкрита сума, що збігається',!!reconcile({day:2,code:'111',a:100,p:'за взуття'},dl)&&dl[0].tr[0].paid===2);
  ok('IBAN демо проходить контроль mod 97',ibanOk(SUP0.iban)&&ibanOk(BUY0.iban));
  ok('реєстрація: демо-реквізити постачальника й покупця приймаються',!reqErr(SUP0.code,SUP0.iban)&&!reqErr(BUY0.code,BUY0.iban,true)&&!reqErr('12345678',BUY0.iban,true));
  ok('реєстрація: 10 цифр для постачальника, 9 для покупця, IBAN з помилкою відхиляються',!!reqErr('3123456789',SUP0.iban)&&!!reqErr('312345678',BUY0.iban,true)&&!!reqErr(SUP0.code,SUP0.iban.replace(/0$/,'1'))&&!!reqErr(SUP0.code,'UA46999999'));
  ok('пробіли й малі літери в IBAN не заважають',!reqErr(SUP0.code,clean(' ua46 9999 9900 0002 6001 2345 6789 0')));
  ok('посилання НБУ: bank.gov.ua/qr/ + base64url',/^https:\/\/bank\.gov\.ua\/qr\/[A-Za-z0-9_-]+$/.test(nbuQR(37080,'тест #TRG-8492-T1')));
  ok('6 посилок, виплачених до 7-го дня, = 102 200 ₴',PARCELS.filter(x=>x.eta<=7).reduce((s,x)=>s+x.a,0)===102200);
  console.log('[selftest]\n'+R.join('\n'));window.TARGO_SELFTEST=R;return R}
if(/[?&]selftest/.test(location.search))selftest();

/* ---------- панель «Демо для журі»: однакова на всіх сторінках, тому малюємо її тут ---------- */
const PAGES=[['','Мобільна версія'],['web/','Вебверсія'],['demo/','Демо: обидва кабінети поруч']];
const here=PAGES.find(([p])=>{const u=new URL(p,ROOT).pathname;return location.pathname===u||location.pathname===u+'index.html'});
if($('presenter'))$('presenter').innerHTML=`<div class="ph"><b>Демо для журі</b><button class="linkbtn" id="p-hide">Сховати</button></div>
  <div class="pbox"><h2>Сценарій</h2><div class="jsteps" id="jsteps"></div><button class="linkbtn" id="reset">Скинути демо</button></div>
  <div class="pbox"><h2>Час у демо</h2><div class="daynow" id="daynow"></div>
    <div class="altrow"><button class="btn ghost sm" id="day1">+1 день</button><button class="btn ghost sm" id="day7">+7 днів</button></div>
    <p class="note">Посилки доїжджають до покупців, NovaPay виплачує післяплату, наближаються строки траншів.</p></div>
  <div class="pbox"><h2>Інші версії</h2>${PAGES.filter(p=>p!==here).map(([p,t])=>`<a class="linkbtn" href="${new URL(p,ROOT).href}">${t}</a>`).join('')}    <p class="note">Стан спільний: відкрийте мобільну й вебверсію в сусідніх вікнах, і вони оновлюватимуть одна одну.</p></div>
  <div class="pbox"><h2>Що імітовано</h2><p class="note">Реєстри, KeyCRM, Нова пошта, банк і КЕП не підключені, усі дані вигадані. IBAN не справжній: не платіть за цим QR-кодом.</p></div>`;
// інша вкладка змінила стан: перемальовуємо без запису, щоб вкладки не перебивали одна одну
addEventListener('storage',e=>{if(e.key===KEY){S=load();syncP();renderSup();renderBuy();paintSteps();dots()}});

render();
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register(new URL('sw.js',ROOT)).catch(()=>{});
})();
