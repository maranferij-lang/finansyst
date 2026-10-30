(()=>{
'use strict';
const $=id=>document.getElementById(id);
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const visible=el=>!!el&&el.getClientRects().length>0;
const ROOT=new URL('./',document.currentScript.src);   // корінь сайту: від нього рахуємо посилання й sw.js на всіх трьох сторінках

/* ---------- захардкоджені дані демо ---------- */
const KEY='targo-state', V=2, BASE=new Date(2026,9,28), QTY=160, GOODS='Товари для дому (посуд і текстиль)', DEAL_NO='TRG-8492';
// ліміт = сума за валідними ТТН × (1 − зважені відмови) × (1 − захист постачальника), не більше стелі за історією, мінус активні борги
const PROT=0.20, W=[0.6,0.3,0.1], R_NEW=0.25, TIERS=[[3,100000],[1,50000],[0,15000]], MIN_BASE=15000, MAX_BASE=100000;
const SUP0={name:'ТОВ «Оселя-Опт»',code:'44556677',iban:'UA469999990000026001234567890',head:'Гнатенко В. С.'};   // IBAN вигадані: МФО 999999 не існує
const BUY0={name:'ФОП Коваль Олена Петрівна',short:'Олена Коваль',shop:'«Затишок»',code:'3123456789',iban:'UA519999990000026009876543210'};
let SUP=SUP0,BUY=BUY0;   // ЄДРПОУ/ІПН та IBAN беруться з реєстрації (S.reg, S.breg), назви лишаються демо
// посилки Олени з післяплатою: eta = день, коли NovaPay виплатить гроші; st: created (ЕН є, товару на пошті ще немає), ret (відмова); w: відмова під час «хвилі відмов»
const PARCELS=[['20450123456781',16400,4,null,1],['20450123456798',13800,5,null,1],['20450123456804',12600,5],['20450123456811',11200,6],['20450123456828',10500,6],['20450123456835',8900,7],['20450123456842',6700,10],['20450123456859',4900,12],
  ['20450123456866',7800,null,'created'],['20450123456873',6300,null,'ret']].map(([n,a,eta,st,w])=>({n,a,eta,st,w}));
const TRANSIT=[{src:'Prom',no:'41822',a:9400,en:true},{src:'Rozetka',no:'7731',a:5600,en:true},{src:'Prom',no:'41907',a:5200,en:false},{src:'Rozetka',no:'7745',a:3900,en:true,dispute:true}];
// відмови за 90 днів по періодах [завершених ТТН, відмов]: 1–30, 31–60, 61–90 днів; paid = угод на Targo без прострочок
const HIST={orders:400,avg:1840,per:[[200,18],[100,11],[100,13]],paid:3}, WAVE_REF=8;
const REGS=['Статус ФОП чинний, не «Припинено»','Платник єдиного податку','Немає податкового боргу','Немає в Єдиному реєстрі боржників','Немає відкритих проваджень в АСВП','Немає в Blacklist Targo'];
const OTHERS=[
  {id:'bondar',name:'ФОП Бондар Ігор',shop:'«Кухня Плюс»',total:64000,adv:30,sum:48000,per:[[90,18],[60,10],[40,6]],paid:1,active:8000},
  {id:'tkachuk',name:'ФОП Ткачук Світлана',shop:'«Домовичок»',total:38000,adv:30,sum:55000,per:[[120,8],[80,6],[60,4]],paid:2,active:0,si:4,stop:'Відкрите провадження в АСВП: рахунки можуть арештувати протягом години'}];
const OLD=[
  {no:'TRG-8390',buyer:'ФОП Мельник Андрій',code:'2987654321',tr:[{id:'T1',a:16200,due:-20,paid:-20,adv:true},{id:'T2',a:18900,due:-13,paid:-13},{id:'T3',a:18900,due:-1,paid:-1}]},
  {no:'TRG-8455',buyer:'ФОП Бойко Наталія',code:'3011223344',tr:[{id:'T1',a:23484,due:-9,paid:-9,adv:true},{id:'T2',a:27398,due:-2,paid:-2},{id:'T3',a:27398,due:5,paid:null}]}];
const STMT0=[
  {day:-2,from:'ФОП Бойко Наталія',code:'3011223344',a:27398,p:'Оплата за товар згідно рахунку #TRG-8455-T2',m:'TRG-8455-T2',by:'id'},
  {day:-1,from:'ФОП Мельник Андрій',code:'2987654321',a:18900,p:'#TRG-8390-T3 оплата за посуд',m:'TRG-8390-T3',by:'id'}];
// надходження, що прийдуть самі, коли в демо минають дні
const SCHED=[
  {day:4,from:'ФОП Бойко Наталія',code:'3011223344',a:27398,p:'Оплата #TRG-8455-T3, без ПДВ'},
  {day:6,from:'ФОП Гнатюк Роман',code:'3399887766',a:5200,p:'оплата за товар'}];
const DEF={v:V,reg:null,inv:null,breg:null,day:0,b:'none',src:{},keys:{},wave:false,deal:null,snap:null,old:OLD,stmt:STMT0,bot:[],ev:{},done:{},seen:{stmt:STMT0.length,bot:0}};
const clone=o=>JSON.parse(JSON.stringify(o));
let S=load();
function load(){try{const r=JSON.parse(localStorage.getItem(KEY));if(r&&r.v===V&&r.s)return r.s}catch(e){}return clone(DEF)}   // стан старої версії не підходить: починаємо спочатку
function save(){try{localStorage.setItem(KEY,JSON.stringify({v:V,s:S}))}catch(e){}}

/* ---------- формат ---------- */
const fmt=n=>n.toLocaleString('uk-UA',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2})+' ₴';
const dec=(n,f=2)=>n.toLocaleString('uk-UA',{minimumFractionDigits:f,maximumFractionDigits:f});
const pct=r=>dec(r*100,1)+'%';
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
// відмови за 90 днів: свіжі 30 днів важать 60%, наступні 30%, найстаріші 10%; без історії беремо обережні 25%
const retRate=per=>per&&per.length?per.reduce((s,[n,f],i)=>s+W[i]*f/n,0):R_NEW;
const capOf=paid=>TIERS.find(([n])=>paid>=n)[1];   // стартова стеля для нових покупців росте після вчасно закритих угод
function score(x){const r=retRate(x.per),raw=Math.round(x.sum*(1-r)*(1-PROT)),cap=capOf(x.paid);
  const limit=x.stop?0:Math.max(0,Math.floor((Math.min(raw,cap)-x.active)/100)*100);
  const parts=[[`Відмови ${pct(r)} × 150`,-Math.round(r*150)],[`Угод без прострочок на Targo: ${Math.min(x.paid,3)} з 3`,-Math.max(0,3-x.paid)*10],['Активні зобов’язання на Targo',x.active>0?-5:0]];
  const pts=x.stop?0:Math.max(0,Math.min(100,100+parts.reduce((s,p)=>s+p[1],0)));
  return {r,raw,cap,limit,pts,parts,light:x.stop?'red':pts>=70?'green':'yellow'}}
const advFor=(sc,total)=>Math.min(90,Math.max(0,Math.ceil((1-sc.limit/total)*20)*5));   // найменший аванс (крок 5%), з яким кредит вкладається в ліміт
const gone=(p,st)=>p.st!=null||(st.wave&&p.w);   // створена ЕН і відмова не дають ні ліміту, ні виплати
const inTransit=(p,day,st=S)=>!gone(p,st)&&p.eta>day;
const paidOut=(p,day,st=S)=>!gone(p,st)&&p.eta<=day;
const isSigned=st=>!!st.deal&&st.deal.stage==='signed';
// знімок даних Олени: валідні ТТН (у дорозі й у відділенні) + Prom/Rozetka з ЕН без спору
function oSnap(day,st=S){const act=PARCELS.filter(p=>inTransit(p,day,st)),tr=TRANSIT.filter(t=>t.en&&!t.dispute),dl=isSigned(st)?st.deal:null;
  const over=!!dl&&dl.tr.some(t=>t.paid==null&&day>t.due);
  return {sum:act.reduce((s,p)=>s+p.a,0)+tr.reduce((s,t)=>s+t.a,0),cod:act.reduce((s,p)=>s+p.a,0),n:act.length,
    per:HIST.per.map((x,i)=>i===0&&st.wave?[x[0],x[1]+WAVE_REF]:x),paid:HIST.paid,
    active:dl?dl.tr.filter(t=>!t.adv&&t.paid==null).reduce((s,t)=>s+t.a,0):0,
    stop:over?'Прострочка за договором на Targo: покупця внесено в Blacklist до погашення':null,si:5}}
function pStatus(p){if(p.st==='created')return ['Створено ЕН, ще не на пошті','grey',0];if(gone(p,S))return ['Відмова, повернення','crit',0];
  const l=p.eta-S.day;return l<=0?['Отримано, NovaPay виплатив','ok',0]:l<=2?['Прибув у відділення','warn',1]:['Прямує до одержувача','grey',1]}
const signed=()=>isSigned(S);
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
const keyOk=k=>/^[A-Za-z0-9_-]{20,64}$/.test(k);
const mask=k=>'…'+k.slice(-4);   // повний ключ у браузері не зберігаємо, лише останні 4 символи для підпису
const clean=s=>s.replace(/\s/g,'').toUpperCase();
const invite=()=>'targo.demo/i/'+(+SUP.code).toString(36).toUpperCase();   // посилання-запрошення постачальника, одне на всіх його клієнтів
function syncP(){SUP={...SUP0,...S.reg};BUY={...BUY0,...S.breg}}

/* ---------- дії ---------- */
const CALC0={base:80000,adv:30,term:14,parts:2,mk:3};
let calc={...CALC0},sTab=S.deal?'apps':'new',bTab='pass',sel=null,wz=null,wzg=0,curInv=null,fresh=-1,keyFor=null;
let uiT=[];const ui=(ms,fn)=>uiT.push(setTimeout(fn,ms));
const err=(id,msg)=>{const el=$(id);if(el){el.textContent=msg;el.hidden=false}};
// реєстрація постачальника: назву й керівника «знаходимо» в ЄДР, реквізити беремо з форми, NDA обов'язкове
function register(code,iban,nda){code=clean(code);iban=clean(iban);const e=reqErr(code,iban)||(nda?'':'Підпишіть NDA: без нього дані покупців не відкриваються');
  if(e)return err('rg-err',e);
  S.reg={code,iban,nda:S.day};S.done.reg=true;sTab='new';render();toast('sup',`Реєстрацію завершено. Ваше посилання: ${invite()}`)}
function sendInvite(ch){if(!S.reg||S.inv)return;S.inv={ch,day:S.day};S.b='invite';S.done.invite=true;render();toast('sup',`Запрошення надіслано Олені Коваль у ${ch} (імітація)`);
  ui(700,()=>pushB(`${ch} · ${SUP.name}`,`Олено, замість знижки пропонуємо товар у розстрочку. Пройдіть перевірку за 60 секунд: ${invite()}`,openOffer))}
// ФОП перейшов за запрошенням: свій ІПН/ЄДРПОУ, IBAN і згода на обробку даних
function buyerId(){const code=clean($('wz-code').value),iban=clean($('wz-iban').value),e=reqErr(code,iban,true)||($('wz-ok').checked?'':'Потрібна згода на обробку даних: без неї платформа нічого не зчитує');
  if(e)return err('wz-err',e);
  S.breg={code,iban,consent:S.day};syncP();save();openWizard('src')}
function addKey(){const k=$('wz-key').value.trim();if(!keyOk(k))return err('wz-err','Ключ має бути від 20 символів: латинські літери, цифри, _ або -');
  S.src[keyFor]=true;S.keys[keyFor]=mask(k);keyFor=null;save();openWizard('src')}
function completeCheck(){if(!S.inv||S.b==='ok')return;
  if(!Object.values(S.src).some(Boolean)){S.src.keycrm=true;S.keys.keycrm=mask(DKEY.keycrm)}
  S.breg=S.breg||{code:BUY0.code,iban:BUY0.iban,consent:S.day};
  S.b='ok';S.snap=oSnap(S.day);S.done.connect=S.done.score=true;sel='olena';sTab='apps';closeB();render();
  const sc=score(S.snap);toast('sup',`Нова заявка: Олена Коваль, бал ${sc.pts}/100, ліміт ${fmt(sc.limit)}`)}
// угода тільки після перевірки: дані оновлюємо ще раз, і кредит не може перевищити ліміт
function makeDeal(silent){if(S.deal||S.b!=='ok'||!(calc.base>=MIN_BASE&&calc.base<=MAX_BASE))return;const p=plan(calc);
  S.snap=oSnap(S.day);const sc=score(S.snap);
  if(sc.light==='red'||p.credit>sc.limit){render();return toast('sup',`Дані оновлено: ліміт ${fmt(sc.limit)}. Угоду з кредитом ${fmt(p.credit)} створити не можна`)}
  S.deal={no:DEAL_NO,buyer:BUY.name,code:BUY.code,...calc,total:p.total,credit:p.credit,tr:p.tr.map(t=>({...t,paid:null})),stage:'approved',sigS:false,sigB:false,shipped:false};
  S.done.deal=true;render();if(!silent){openDoc('contract');toast('sup',`Дані перевірено ще раз: ліміт ${fmt(sc.limit)}. Договір сформовано`)}}
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
// події дня: виплати NovaPay, надходження інших клієнтів, нагадування бота, прострочка
function advance(n){const b0=S.bot.length;let od='';
  for(let i=0;i<n;i++){const d=++S.day;
    SCHED.forEach((x,j)=>{if(x.day===d&&!S.ev[j]){S.ev[j]=1;const e={...x};S.stmt.push(e);reconcile(e,deals());fresh=S.stmt.length-1}});
    if(!signed())continue;const dl=S.deal,po=PARCELS.filter(p=>paidOut(p,d)),out=po.reduce((s,p)=>s+p.a,0);
    const used=dl.tr.filter(t=>!t.adv&&t.paid!=null).reduce((s,t)=>s+t.a,0),t=dl.tr.find(t=>t.paid==null&&!t.adv);
    if(!t)continue;
    if(!t.nt&&out-used>=t.a&&t.due-d<=3){t.nt=1;bot(d,`NovaPay зарахував ${fmt(out)} за ${pl(po.length,'посилку','посилки','посилок')}. Цього вистачає на транш ${t.id}: ${fmt(t.a)} до ${dOf(t.due)}.`,t.id)}
    if(d===t.due&&!t.dr){t.dr=1;bot(d,`Сьогодні строк ${t.id}. Чернетку платежу на ${fmt(t.a)} уже створено в «Приват24 для бізнесу», лишилось підтвердити (імітація).`,t.id)}
    if(d===t.due+1){bot(d,`Транш ${t.id} прострочено. Постачальник бачить це в дебіторці, а нові угоди на Targo призупинено до оплати.`,t.id);od=`Олена Коваль прострочила ${t.id}: претензія готова в «Дебіторці»`}}
  if(S.day>=7)S.done.day7=true;render();toast('sup',od||`Сьогодні ${dFull(S.day)}`);
  if(S.bot.length>b0){const m=S.bot[S.bot.length-1];pushB('Targo Bot',m.t.length>110?m.t.slice(0,108)+'…':m.t,()=>setBTab('bot'))}}
// стрес-сценарій: покупці масово відмовляються від посилок, ліміт перераховується сам
function wave(){if(S.wave)return;S.wave=true;if(S.b==='ok'&&!S.deal)S.snap=oSnap(S.day);render();
  toast('sup',`Хвиля відмов: 2 посилки повертаються. Ліміт Олени тепер ${fmt(score(oSnap(S.day)).limit)}`)}

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
    <label class="chk"><input type="checkbox" id="rg-nda"><span>Підписую NDA: дані покупців використовую лише для рішення про відстрочку і не передаю третім особам.</span></label>
    <p class="hint crit" id="rg-err" role="alert" hidden></p>
    <button class="btn accent" id="rg-go">Зареєструватися і отримати посилання</button></div>
  <div class="card"><div class="ct">Як це працює</div><div class="steps3"><div><span>1</span>Реєструєтесь і отримуєте своє посилання-запрошення.</div><div><span>2</span>Надсилаєте його в Telegram чи Viber клієнту, який просить товар у борг.</div><div><span>3</span>Клієнт проходить перевірку, а ви бачите його бал і ліміт. Угоду створюєте в межах ліміту.</div></div>
    <p class="note">Демо: будь-який код ЄДРПОУ «знаходить» ${SUP0.name}.</p></div></div>`}
const edrHTML=c=>/^\d{8}$/.test(c)?`Знайдено в ЄДР: <b>${SUP0.name}</b>, директор ${SUP0.head}`:'Назва з’явиться, коли введете 8 цифр';
function trList(tr,no,st){return `<div class="trl">${tr.map(t=>{const [l,c]=trSt(t);
  return `<div class="trli"><span><b>${t.adv?'Аванс':'Транш '+t.id}</b><small>${!st&&t.due===0?'сьогодні':'до '+dOf(t.due)}${no?` · #${no}-${t.id}`:''}</small></span><span class="amt">${fmt(t.a)}</span>${st?chip(l,c):'<span></span>'}</div>`}).join('')}</div>`}
function inviteCard(){const v=S.inv;
  return `<div class="card"><div class="ct">Посилання-запрошення ${v?chip('Надіслано','ok'):''}</div><div class="linkbox">${invite()}</div>
    ${v?`<p class="small">Надіслано Олені Коваль у ${v.ch} ${dOf(v.day)} (імітація). Одне посилання на всіх клієнтів.</p>`
      :`<p class="small">Одне на всіх клієнтів. Олена Коваль, ${BUY.shop}, просить знижку 7% на наступну партію: замість знижки запросіть її до розстрочки.</p>
    <div class="altrow"><button class="btn accent" id="mk-link">Надіслати в Telegram</button><button class="btn" id="mk-viber">Надіслати у Viber</button></div>`}</div>`}
function newHTML(){
  if(S.deal){const d=S.deal,st=d.stage==='signed'?['Договір підписано','ok']:['Договір на підписі','warn'];return `<div class="col2"><div class="card"><div class="ct">Угода ${d.no} ${chip(...st)}</div>
    <p class="small">${BUY.name}, магазин ${BUY.shop}. Кредит ${fmt(d.credit)} у межах ліміту.</p>
    <div class="big num">${fmt(d.total)}</div>${trList(d.tr,d.no,d.stage==='signed')}</div>
    <div class="card"><div class="ct">Що далі</div><div class="steps3"><div><span>1</span>Обидві сторони підписують договір КЕП.</div><div><span>2</span>Олена платить аванс за QR-кодом, звірка закриває транш сама.</div><div><span>3</span>Решта приходить траншами, коли NovaPay виплатить їй гроші.</div></div>
    <p class="note">Нова угода в демо: «Скинути демо».</p></div></div>`}
  return `<div class="col2"><div style="display:grid;gap:12px">${inviteCard()}
    <div class="card">
    <div class="ct">Розстрочка замість знижки</div>
    <p class="small">Покупець: <b>${BUY.name}</b>, ${BUY.shop}. Сума накладної від 15 000 до 100 000 ₴.</p>
    <label class="field">Сума накладної, ₴<input id="c-base" data-c="base" inputmode="numeric" value="${calc.base}"></label>
    <div class="prow"><span>Аванс</span><span class="v" data-cv="adv">${calc.adv}%</span><input type="range" min="0" max="90" step="5" value="${calc.adv}" data-c="adv" aria-label="Аванс"></div>
    <div class="frow"><span class="lbl">Строк розстрочки</span><div class="gchips">${[7,14,21,30].map(v=>`<button class="gchip" data-cc="term:${v}" aria-pressed="${calc.term===v}">${v} днів</button>`).join('')}</div></div>
    <div class="frow"><span class="lbl">Платежів після авансу</span><div class="gchips">${[1,2,3].map(v=>`<button class="gchip" data-cc="parts:${v}" aria-pressed="${calc.parts===v}">${v}</button>`).join('')}</div></div>
    <div class="prow"><span>Надбавка за відстрочку, у ціні товару</span><span class="v" data-cv="mk">${calc.mk}%</span><input type="range" min="0" max="10" step="0.5" value="${calc.mk}" data-c="mk" aria-label="Надбавка"></div>
  </div></div><div id="calc-prev">${calcPrev()}</div></div>`}
function calcPrev(){if(!(calc.base>=MIN_BASE&&calc.base<=MAX_BASE))return `<div class="card"><p class="hint crit">Сума накладної від 15 000 до 100 000 ₴</p><button class="btn accent" id="mk-deal" disabled>Сформувати договір</button></div>`;
  const p=plan(calc),disc=Math.round(calc.base*7)/100,mk=Math.round((p.total-calc.base)*100)/100,sc=S.b==='ok'?score(S.snap):null,over=!!sc&&p.credit>sc.limit,no=!sc||over||sc.light==='red';
  const lim=!sc?`<p class="hint">Ліміт з’явиться, коли Олена пройде перевірку за посиланням. Без ліміту договір не формується.</p>`
    :sc.light==='red'?`<p class="hint crit">Стоп-фактор, ліміт 0 ₴: угоду створити не можна.</p>`
    :over?`<p class="hint crit">Кредит ${fmt(p.credit)} більший за ліміт ${fmt(sc.limit)}. Потрібен аванс щонайменше ${advFor(sc,p.total)}%.</p>`
    :`<p class="hint ok">Кредит ${fmt(p.credit)} вкладається в ліміт Олени ${fmt(sc.limit)}.</p>`;
  return `<div class="card"><div class="ct">Що отримає покупець</div><div class="big num">${fmt(p.total)}</div>
    <p class="small">з них ${fmt(mk)} за відстрочку, вшито в ціну товару. Відсотків у договорі немає.</p>${trList(p.tr)}
    <div class="cmp"><div>Знижка 7%<b class="neg num">−${fmt(disc)}</b>з вашого прибутку</div><div>Розстрочка<b class="pos num">+${fmt(mk)}</b>гроші за графіком</div></div>
    ${lim}<button class="btn accent" id="mk-deal"${no?' disabled':''}>Сформувати договір</button></div>`}
function regsHTML(x){return REGS.map((r,i)=>{const bad=x.stop&&i===x.si;return `<li class="${bad?'bad':''}"><i>${bad?'✕':'✓'}</i>${bad?x.stop:r}</li>`}).join('')}
function appList(){const L=OTHERS.map(o=>({id:o.id,name:o.name,shop:o.shop,total:o.total,adv:o.adv,credit:o.total*(100-o.adv)/100,x:o,st:['Нова','grey']}));
  if(S.b==='ok'){const d=S.deal;L.unshift({id:'olena',name:'ФОП Коваль Олена',shop:BUY.shop,total:d?d.total:null,adv:d?d.adv:null,credit:d?d.credit:null,x:S.snap,
    st:!d?['Нова','grey']:d.stage==='signed'?['Договір підписано','ok']:['Договір на підписі','warn']})}
  L.forEach(a=>a.sc=score(a.x));return L}
function appsHTML(){const L=appList();if(!L.find(a=>a.id===sel))sel=L[0].id;const a=L.find(x=>x.id===sel);
  const wait=S.inv&&S.b!=='ok'?`<div class="ahint">Заявка Олени Коваль з’явиться тут, щойно вона пройде перевірку на телефоні.</div>`:'';
  return `<div class="apps"><div class="alist">${wait}${L.map(x=>`<button class="arow${x.id===sel?' on':''}" data-app="${x.id}"><i class="dot ${x.sc.light}"></i><span><b>${x.name}</b><small>${x.shop} · бал ${x.sc.pts} · ліміт ${fmt(x.sc.limit)}</small></span>${chip(...x.st)}</button>`).join('')}</div>
    <div class="adet">${detailHTML(a)}</div></div>`}
// постачальник бачить лише бал, ліміт і результат перевірки реєстрів: продажі й посилки магазину лишаються в покупця
function detailHTML(a){const s=a.sc,[ln,lc]=LIGHT[s.light],x=a.x,me=a.id==='olena',d=S.deal,over=a.credit!=null&&a.credit>s.limit;
  const verdict=s.light==='red'?`Стоп-фактор: ${x.stop}. Ліміт 0 ₴, співпраця не рекомендована.`
    :me&&!d?`Можна створити угоду з кредитом до ${fmt(s.limit)}. Система не дасть вийти за ліміт.`
    :me?`Угода ${d.no}: кредит ${fmt(d.credit)} у межах ліміту ${fmt(s.limit)}.`
    :over?`Запит: кредит ${fmt(a.credit)} більший за ліміт ${fmt(s.limit)}. Погодити можна з авансом ${advFor(s,a.total)}%.`
    :`Запит: кредит ${fmt(a.credit)} у межах ліміту.`;
  let acts;
  if(me)acts=!d?`<div class="altrow"><button class="btn ghost" id="ap-no">Відхилити</button><button class="btn accent" id="ap-ok">Створити угоду до ${fmt(s.limit)}</button></div>`
    :`<button class="btn ghost" data-doc="contract">Відкрити договір ${d.no}</button>`;
  else acts=s.light==='red'?`<button class="btn" disabled>Погодити неможливо: стоп-фактор</button>`:`<div class="altrow"><button class="btn ghost" id="ap-no">Відхилити</button><button class="btn" id="ap-adv">${over?`Запропонувати аванс ${advFor(s,a.total)}%`:'Погодити'}</button></div>`;
  return `<div class="ct"><h3>${a.name}<br><span class="small">${a.shop}${a.total?` · накладна ${fmt(a.total)}, аванс ${a.adv}%`:''}</span></h3>${chip(ln,lc)}</div>
    <div class="g4" style="grid-template-columns:1fr 1fr"><div>Скоринговий бал<b>${s.pts} / 100</b></div><div>Ліміт розстрочки<b>${fmt(s.limit)}</b></div></div>
    <p class="hint ${lc==='ok'?'ok':lc}">${verdict}</p>
    <div class="lvl"><h4>Реєстри й виконавчі провадження</h4><ul class="regs">${regsHTML(x)}</ul></div>
    <p class="note">Продажі, посилки й клієнтів магазину бачить лише покупець: ви отримуєте бал і ліміт (NDA). Дані оновлюються щогодини, перед угодою перевіряємо ще раз.</p>
    ${me&&d?`<div class="lvl"><h4>Графік</h4>${trList(d.tr,d.no,d.stage==='signed')}</div>`:''}${acts}`}
function arHTML(){const rows=[];deals().forEach(d=>d.tr.forEach(t=>rows.push({d,t})));rows.sort((a,b)=>a.t.due-b.t.due||a.d.no.localeCompare(b.d.no));
  let wait=0,over=0,paid=0;rows.forEach(({t})=>{const c=trSt(t)[1];if(c==='ok'){if(t.paid>S.day-30)paid+=t.a}else if(c==='crit')over+=t.a;else wait+=t.a});
  const row=({d,t})=>{const [l,c]=trSt(t);return `<div class="trow"><span class="tid">#${d.no}-${t.id}</span><span>${d.buyer}</span><span class="amt">${fmt(t.a)}</span>${chip(l+(t.paid!=null&&t.paid!==t.due?' '+dOf(t.paid):''),c)}</div>`};
  const od=rows.filter(r=>r.t.paid==null&&S.day>r.t.due);
  const odH=od.length?`<div class="card"><div class="ct">Прострочено ${chip(pl(od.length,'платіж','платежі','платежів'),'crit')}</div>${od.map(({d,t})=>`<div class="trli"><span><b>#${d.no}-${t.id}</b><small>${d.buyer} · ${pl(S.day-t.due,'день','дні','днів')} прострочки</small></span><span class="amt">${fmt(t.a)}</span><button class="btn ghost sm" data-claim="${d.no}:${t.id}">Претензія</button></div>`).join('')}
    <p class="note">Покупця внесено в Blacklist Targo: нові позитивні рекомендації призупинено до погашення. Претензія з розрахунком 3% річних готова до відправки.</p></div>`:'';
  // очікувані: найближчі зверху, згруповані за датою; сплачені: свіжі зверху
  let last=null,h='';rows.filter(r=>r.t.paid==null).forEach(r=>{if(r.t.due!==last){last=r.t.due;h+=`<div class="dayh">${dOf(r.t.due)}${r.t.due===S.day?' · сьогодні':''}</div>`}h+=row(r)});
  const done=rows.filter(r=>r.t.paid!=null).sort((a,b)=>b.t.paid-a.t.paid);
  return `<div class="kpis"><div class="kpi">Очікується<b class="num">${fmt(wait)}</b></div><div class="kpi${over?' crit':''}">Прострочено<b class="num">${fmt(over)}</b></div><div class="kpi">Сплачено за 30 днів<b class="num">${fmt(paid)}</b></div></div>
    ${signed()?'':`<p class="note">Угода ${DEAL_NO} з Оленою з’явиться тут після підписання договору.</p>`}${odH}
    <div class="ct">Календар надходжень</div>${h||'<p class="small">Усі транші сплачено.</p>'}
    <div class="ct">Сплачено</div>${done.map(row).join('')}`}
function stmtHTML(){return `<p class="note">Рахунок ${SUP.iban}. Виписку передає банк-партнер (Райффайзен, імітація) за вашою згодою. Звірка: код траншу в призначенні, інакше ІПН і сума. Що не розпізнано, підтверджуєте вручну.</p>
  ${S.stmt.map((e,i)=>({e,i})).reverse().map(({e,i})=>`<div class="srow${i===fresh?' new':''}"><span class="d">${dOf(e.day)}</span><span><b>${e.from}</b><br><span class="small">ІПН/ЄДРПОУ ${e.code}</span></span><span class="amt in">+${fmt(e.a)}</span>
    <span class="p">${e.p.replace(/#?TRG-\d+-T\d+/i,m=>`<mark>${m}</mark>`)}</span>
    ${e.m?chip((e.by==='code'?'Звірено за ІПН: ':'Звірено автоматично: ')+e.m,'ok'):e.man?chip('Перевірено вручну: не за договорами Targo','grey'):`<span>${chip('Не розпізнано','warn')} <button class="linkbtn" data-man="${i}">Перевірити вручну</button></span>`}</div>`).join('')}`}
function docsHTML(){const d=S.deal;if(!d)return `<div class="card"><div class="ct">Документи</div><p class="small">Договір, специфікація й видаткова накладна з’являться, коли ви створите угоду в межах ліміту покупця.</p></div>`;
  const st=d.sigS&&d.sigB?'Підписано обома сторонами (КЕП, імітація)':d.sigS?'Ви підписали, чекає підпису покупця':'Чернетка, чекає вашого підпису';
  return `<button class="drow" data-doc="contract"><span><b>Договір поставки з розстроченням № ${d.no}</b><small>з Додатком 1: специфікація і графік платежів · ${st}</small></span>${chip(d.sigS&&d.sigB?'Підписано':'Підпис',d.sigS&&d.sigB?'ok':'warn')}</button>
    ${d.shipped?`<button class="drow" data-doc="waybill"><span><b>Видаткова накладна № ВН-${d.no}</b><small>від ${dFull(d.shipDay)} · ${QTY} шт.</small></span>${chip('Відвантажено','ok')}</button>`:''}
    <p class="note">Відправка в «Вчасно» або Paperless у прототипі не підключена.</p>`}

/* ---------- кабінет покупця ---------- */
function setBTab(t){bTab=t;render();const sc=$('bscr');sc.scrollTop=t==='bot'?sc.scrollHeight:0;scrollTo(0,t==='bot'?document.body.scrollHeight:0)}
function renderBuy(){document.querySelectorAll('[data-btab]').forEach(b=>b.setAttribute('aria-current',b.dataset.btab===bTab?'page':'false'));
  $('bscr').dataset.t=bTab;$('bscr').innerHTML=({pass:passHTML,pay:payHTML,inv:invHTML,bot:botHTML})[bTab]();if(bTab==='bot')$('bscr').scrollTop=$('bscr').scrollHeight}
function passHTML(){const d=S.deal;
  if(S.b!=='ok')return `<div class="hero"><div class="lab">Паспорт селера</div><div class="v">Товар у розстрочку</div><p class="small">під гроші, які вже їдуть до ваших покупців Новою поштою.</p></div>
    ${S.inv?`<div class="card"><div class="ct">Запрошення від ${SUP.name} ${chip('Нове','warn')}</div><p class="small">Замість знижки постачальник пропонує товар у розстрочку без відсотків. Перевірка займає хвилину.</p><button class="btn accent" id="of-open">Переглянути</button></div>`
      :`<div class="card"><div class="ct">Поки немає запрошень</div><p class="small">Коли постачальник надішле посилання-запрошення, воно з’явиться тут.</p></div>`}
    <div class="card"><div class="ct">Як це працює</div><div class="steps3"><div><span>1</span>Підключаєте CRM чи Нову пошту API-ключем лише для читання.</div><div><span>2</span>За хвилину отримуєте бал і ліміт відстрочки.</div><div><span>3</span>Платите постачальнику частинами, коли NovaPay виплатить вам гроші.</div></div></div>`;
  const sc=score(S.snap),x=S.snap,now=oSnap(S.day),live=score(now),[ln,lc]=LIGHT[sc.light];
  const dealC=!d?`<div class="card"><div class="ct">Заявку надіслано ${chip('Очікує','grey')}</div><p class="small">${SUP.name} бачить ваш бал і ліміт і створить угоду в його межах.</p></div>`
    :d.sigS&&!d.sigB?`<div class="card"><div class="ct">Договір ${d.no} на підпис ${chip('Нове','warn')}</div><div class="big num">${fmt(d.total)}</div><button class="btn accent" id="sg-open">Переглянути й підписати</button></div>`
    :!d.sigS?`<div class="card"><div class="ct">Постачальник готує договір ${d.no}</div><p class="small">На ${fmt(d.total)}, кредит ${fmt(d.credit)} у межах вашого ліміту.</p></div>`:'';
  return `<div class="hero"><div class="lab">Ліміт відстрочки</div><div class="v num">${fmt(sc.limit)}</div>${chip('Бал '+sc.pts+' / 100',lc)} <span class="small">розраховано ${dOf(0)}</span></div>
    ${dealC}
    <div class="tiles"><div class="tile"><span class="h">Доступно зараз</span><span class="v num">${fmt(live.limit)}</span><span class="s">${now.stop?'нові угоди призупинено':'з урахуванням відкритих траншів'}</span></div>
      <div class="tile"><span class="h">Гроші в дорозі</span><span class="v num">${fmt(now.sum)}</span><span class="s">${pl(now.n,'посилка','посилки','посилок')} + Prom/Rozetka</span></div>
      <div class="tile"><span class="h">Відмови</span><span class="v">${pct(live.r)}</span><span class="s">зважено за 90 днів</span></div>
      <div class="tile"><span class="h">Угод на Targo</span><span class="v">${HIST.paid}</span><span class="s">без прострочок, стеля ${fmt(sc.cap)}</span></div></div>
    <div class="card"><div class="ct">Як рахуємо ліміт</div><div class="formula">Сума за валідними ТТН <b>${fmt(x.sum)}</b><br>× (1 − відмови ${pct(sc.r)}) × (1 − захист постачальника ${pct(PROT)})<br>= <b>${fmt(sc.raw)}</b>, стеля за історією <b>${fmt(sc.cap)}</b>${x.active?`, мінус активні борги <b>${fmt(x.active)}</b>`:''}<br>Ліміт <b>${fmt(sc.limit)}</b></div>
      <p class="small">Валідні ТТН: «Прямує до одержувача» і «Прибув у відділення». Не враховуємо створені ЕН, отримані посилки й відмови.</p></div>
    <div class="card"><div class="ct">Відмови за 90 днів</div>${x.per.map(([n,f],i)=>`<div class="li"><span class="ic">${['1–30','31–60','61–90'][i]}</span><span><span class="t">${f} з ${n} ТТН</span><span class="s">днів тому · вага ${dec(W[i],1)}</span></span><span class="amt">${pct(f/n)}</span></div>`).join('')}<p class="small">Зважено: ${pct(sc.r)}. Свіжі дані важать більше.</p></div>
    <div class="card"><div class="ct">Бал ${sc.pts} / 100</div><div class="kv"><span>Старт</span><span>100</span>${sc.parts.map(([l,v])=>`<span>${l}</span><span>${v?v:'0'}</span>`).join('')}</div></div>
    <div class="card"><div class="ct">Перевірки</div><ul class="regs">${regsHTML(now)}</ul></div>
    <div class="card"><div class="ct">Посилки Нової пошти</div>${PARCELS.map(p=>{const [l,c,inl]=pStatus(p);return `<div class="li"><span class="ic">НП</span><span><span class="t num">${p.n}</span><span class="s">післяплата · ${inl?'у ліміті':'не в ліміті'}</span></span><span class="r"><span class="amt">${fmt(p.a)}</span>${chip(l,c)}</span></div>`}).join('')}</div>
    <div class="card"><div class="ct">Prom і Rozetka</div>${TRANSIT.map(t=>{const inc=t.en&&!t.dispute;return `<div class="li"><span class="ic">${t.src==='Prom'?'PR':'RZ'}</span><span><span class="t">${t.src} №${t.no}</span><span class="s">${inc?'оплачено, ЕН є':t.dispute?'відкрито спір':'ще немає ЕН'}</span></span><span class="r"><span class="amt">${fmt(t.a)}</span>${inc?chip('У ліміті','ok'):chip('Не враховано','grey')}</span></div>`}).join('')}</div>
    <div class="card"><div class="ct">Підключені дані</div>${SRC.filter(([k])=>S.src[k]).map(([k,ic,t])=>`<div class="li"><span class="ic">${ic}</span><span><span class="t">${t}</span><span class="s">лише читання · ключ ${S.keys[k]||'…'}</span></span></div>`).join('')}
      <p class="small">Імена, телефони й адреси ваших покупців платформа не зчитує: лише номер ТТН, статус і суму. Згоду надано ${S.breg&&S.breg.consent!=null?dFull(S.breg.consent):dFull(0)}.</p></div>`}
function payHTML(){const d=S.deal;if(!signed())return `<div class="card"><div class="ct">Графік погашень</div><p class="small">З’явиться після підписання договору з постачальником.</p></div>`;
  const out=PARCELS.filter(p=>paidOut(p,S.day)).reduce((s,p)=>s+p.a,0),used=d.tr.filter(t=>!t.adv&&t.paid!=null).reduce((s,t)=>s+t.a,0),t=d.tr.find(x=>x.paid==null);
  let env='';
  if(!t)env=`<div class="card"><div class="ct">Конверт погашення ${chip('Усе сплачено','ok')}</div><p class="small">Угоду ${d.no} закрито без прострочок.</p></div>`;
  else if(t.adv)env=`<div class="card"><div class="ct">Аванс ${fmt(t.a)}</div><p class="small">Сплатіть аванс, і постачальник відвантажить товар. Рахунок у вкладці «Рахунки».</p></div>`;
  else{const has=Math.max(0,out-used),set=Math.min(has,t.a),full=set>=t.a;
    env=`<div class="card"><div class="ct">Віртуальний конверт погашення ${full?chip('Можна платити','ok'):chip('Наповнюється','grey')}</div>
      <div class="big num">${fmt(set)} <span class="small">з ${fmt(t.a)}</span></div><div class="bar"><i style="width:${Math.round(set/t.a*100)}%"></i></div>
      <p class="small">${full?`NovaPay уже виплатив достатньо. Транш ${t.id} до ${dOf(t.due)}.`:`Відкладаємо з виплат NovaPay під транш ${t.id} до ${dOf(t.due)}. Бракує ${fmt(t.a-set)}.`}</p></div>`}
  const exp={};PARCELS.filter(p=>inTransit(p,S.day)).forEach(p=>{(exp[p.eta]=exp[p.eta]||[]).push(p)});
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
function closeB(){wzT.forEach(clearTimeout);wzT=[];wz=null;curInv=null;keyFor=null;$('blayer').innerHTML=''}
function openOffer(){if(!S.inv)return;hidePush();
  sheetB(`<h3>Запрошення від ${SUP.name}</h3><p class="small">Замість знижки постачальник пропонує товар у розстрочку: частина зараз, решта за 14–30 днів, без відсотків і без банку.</p>
    <div class="steps3"><div><span>1</span>Вкажіть ІПН та IBAN свого ФОП і дайте згоду на перевірку.</div><div><span>2</span>Підключіть CRM чи Нову пошту API-ключем лише для читання.</div><div><span>3</span>За хвилину отримаєте ліміт. Постачальник побачить лише бал і ліміт.</div></div>
    <div class="btncol">${S.b==='ok'?`<button class="btn" disabled>Перевірку пройдено</button>`:`<button class="btn accent" id="of-go">Пройти перевірку за 60 секунд</button>`}<button class="btn ghost" id="b-close">Пізніше</button></div>`)}
let wzT=[];
const CHK=[['Реєстри','статус ФОП, єдиний податок, податковий борг, боржники, АСВП, Blacklist'],['ТТН з CRM','звіряємо напряму з API Нової пошти: чи посилка справді їде'],['Відмови за 90 днів','зважено: свіжі 30 днів важать 60%']];
const SRC=[['keycrm','KC','KeyCRM','замовлення Prom, Rozetka, Instagram і реєстри NovaPay'],['salesdrive','SD','SalesDrive','CRM для інтернет-магазинів'],['np','НП','Нова пошта','бізнес-кабінет: статуси ТТН і післяплата'],['rozetka','RZ','Rozetka Seller','замовлення і доставки'],['prom','PR','Prom.ua','замовлення і Пром-оплата']];
// демо-ключі для авто-показу; справжній ключ користувач копіює у своїй CRM
const DKEY={keycrm:'kc_ro_7F3aQ9xL2mT8vR4nB6yW1',np:'3f9a1c7e5b2d8046a9e1c3f7b5d20e84'};
function openWizard(step){if(!S.inv)return;hidePush();wz=step;const bar=n=>`<div class="stp">${[1,2,3].map(i=>`<i class="${i<=n?'on':''}"></i>`).join('')}</div>`;
  if(step==='id')sheetB(`${bar(1)}<h3>Хто ви</h3><p class="small">Ви перейшли за запрошенням ${SUP.name}. Вкажіть реквізити свого ФОП.</p>
    <label class="field">ІПН або ЄДРПОУ<input id="wz-code" class="req" inputmode="numeric" maxlength="10" autocomplete="off" value="${BUY.code}"></label>
    <label class="field">Ваш IBAN<input id="wz-iban" class="req" autocomplete="off" spellcheck="false" value="${BUY.iban}"></label>
    <label class="chk"><input type="checkbox" id="wz-ok"${S.breg&&S.breg.consent!=null?' checked':''}><span>Даю згоду на обробку даних магазину для оцінки платоспроможності. Без згоди платформа нічого не зчитує.</span></label>
    <p class="hint crit" id="wz-err" role="alert" hidden></p>
    <p class="small">${BUY.name}. Особу підтвердимо через Дія.Підпис (імітація).</p><button class="btn accent" id="wz-next">Далі</button>`);
  else if(step==='src'){const any=Object.values(S.src).some(Boolean);
    sheetB(`${bar(2)}<h3>Дані магазину</h3><p class="small">Створіть у CRM чи кабінеті Нової пошти API-ключ з правами лише на читання модулів «Замовлення» і «Доставка» та вставте його сюди.</p><div>${SRC.map(([k,ic,t,s])=>`<div class="srcrow"><span class="ic">${ic}</span><span><b>${t}</b><small>${S.src[k]?`Підключено, лише читання · ключ ${S.keys[k]}`:s}</small></span><button data-src="${k}" aria-pressed="${!!S.src[k]}">${S.src[k]?'Відключити':'Підключити'}</button></div>
      ${keyFor===k?`<div class="keyform"><label class="field">API-ключ ${t}<input id="wz-key" class="req" autocomplete="off" spellcheck="false" placeholder="вставте ключ"></label><p class="hint crit" id="wz-err" role="alert" hidden></p><button class="btn accent sm" id="wz-key-ok">Підключити ${t}</button></div>`:''}`).join('')}</div>
      <p class="note">Імена, телефони й адреси ваших покупців платформа не зчитує: лише номер ТТН, статус і суму.</p>
      <button class="btn accent" id="wz-check"${any?'':' disabled'}>Перевірити</button>`)}
  else if(step==='check')sheetB(`${bar(3)}<h3>Перевіряємо</h3><p class="small">Зазвичай до 60 секунд.</p><div class="checks">${CHK.map(([t,s],i)=>`<div class="${i<wzg?'done':i===wzg?'busy':''}"><span class="c">${i<wzg?'✓':''}</span><span><b>${t}</b><small>${s}</small></span></div>`).join('')}</div>`);
  else{const x=oSnap(S.day),sc=score(x),[ln,lc]=LIGHT[sc.light];
    sheetB(`<svg class="success" viewBox="0 0 56 56" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="28" cy="28" r="25" pathLength="1"/><path d="M17 29l7 7 15-16" pathLength="1"/></svg>
      <h3 style="text-align:center">Ліміт відстрочки ${fmt(sc.limit)}</h3><div style="text-align:center">${chip(`Бал ${sc.pts} / 100 · ${ln.toLowerCase()}`,lc)}</div>
      <div class="kv"><span>Сума за валідними ТТН</span><span class="num">${fmt(x.sum)}</span><span>× (1 − відмови)</span><span>${dec(1-sc.r)}</span><span>× (1 − захист)</span><span>${dec(1-PROT)}</span><span>Стеля за історією</span><span class="num">${fmt(sc.cap)}</span></div>
      <p class="hint ok">Постачальник побачить лише бал і ліміт. Ваші посилки й клієнти лишаються у вас.</p>
      <button class="btn accent" id="wz-send">Надіслати результат постачальнику</button>`)}}
function runCheck(){if(!Object.values(S.src).some(Boolean))return;S.done.connect=true;save();paintSteps();wzg=0;openWizard('check');const step=RM?100:1200;
  [1,2,3].forEach(i=>wzT.push(setTimeout(()=>{wzg=i;openWizard('check')},step*i)));wzT.push(setTimeout(()=>openWizard('res'),step*3+400))}
function openSign(){const d=S.deal;if(!d)return;hidePush();
  sheetB(`<h3>Договір № ${d.no}</h3><p class="small">Договір поставки з розстроченням платежу. ${SUP.name} ${d.sigS?'вже підписало його КЕП.':'ще готує підпис.'}</p>
    <div class="kv"><span>Сума</span><span class="num">${fmt(d.total)}</span><span>Платежів</span><span>${d.tr.length}</span><span>Розрахунки</span><span>лише на IBAN</span></div>
    <div class="btncol">${d.sigB?`<button class="btn" disabled>Підписано</button>`:d.sigS?`<button class="btn accent" id="sg-buy">Підписати КЕП (імітація)</button>`:''}<button class="btn ghost" data-doc="contract">Переглянути договір</button></div>`)}
function openInv(id){const d=S.deal;if(!signed())return;const t=d.tr.find(x=>x.id===id);if(!t)return;hidePush();curInv=id;const [l,c]=trSt(t),purpose=`Оплата за договором поставки ${d.no}, #${d.no}-${id}, без ПДВ`;
  sheetB(`<h3>Рахунок #${d.no}-${id}</h3><div class="ct"><span class="big num">${fmt(t.a)}</span>${chip(l,c)}</div><p class="small">${t.adv?'Аванс':'Транш'} до ${dFull(t.due)}</p>
    <div class="qrbox" id="qrbox"></div><p class="note" style="text-align:center">QR за стандартом НБУ. Демо: не платіть за цим кодом.</p>
    <div class="req"><div><span>Отримувач</span>${SUP.name}, ЄДРПОУ ${SUP.code}</div><div><span>IBAN</span>${SUP.iban}</div><div><span>Призначення</span>${purpose}</div></div>
    <div class="btncol">${t.paid!=null?`<button class="btn" disabled>Сплачено ${dOf(t.paid)}</button>`:`<button class="btn accent" id="inv-pay">Оплатити в банку (імітація)</button><button class="btn ghost" id="inv-draft">Чернетка в «Приват24 для бізнесу»</button>`}</div>`);
  const box=$('qrbox'),link=nbuQR(t.a,purpose);
  if(window.QRCode){new QRCode(box,{text:link,width:168,height:168,correctLevel:QRCode.CorrectLevel.M});box.insertAdjacentHTML('beforeend','<span class="uah">₴</span>')}
  else box.innerHTML='<div class="off">QR-код не завантажився: немає інтернету</div>'}

/* ---------- документи ---------- */
function openDoc(kind,arg){const d=S.deal;if(!d)return;const o=$('ovl');o.hidden=false;
  const sign=kind==='contract'&&d.stage==='approved'&&!d.sigS?`<button class="btn accent sm" id="sg-sup">Підписати КЕП (імітація)</button>`:'';
  const t=kind==='claim'&&d.tr.find(x=>x.id===arg);
  o.innerHTML=`<div class="docbar"><b>${kind==='contract'?'Договір № '+d.no:kind==='claim'?'Претензія за #'+d.no+'-'+arg:'Видаткова накладна'}</b><span class="acts">${sign}<button class="btn ghost sm" id="doc-print">Завантажити PDF</button><button class="btn ghost sm" id="doc-close">Закрити</button></span></div>${kind==='contract'?contractHTML(d):t?claimHTML(d,t):waybillHTML(d)}`}
function closeDoc(){$('ovl').hidden=true;$('ovl').innerHTML=''}
const codeL=c=>c.length===10?'РНОКПП':'код ЄДРПОУ';
function contractHTML(d){const price=Math.round(d.total/QTY*100)/100;
  return `<article class="doc"><p class="demo-note">Шаблон для демонстрації. Перед використанням потребує перевірки юристом.</p>
  <h1>ДОГОВІР ПОСТАВКИ ТОВАРУ<br>НА УМОВАХ РОЗСТРОЧЕННЯ ПЛАТЕЖУ № ${d.no}</h1><p class="row2"><span>м. Київ</span><span>${dFull(0)}</span></p>
  <p>${SUP.name} (код ЄДРПОУ ${SUP.code}), далі «Постачальник», в особі директора ${SUP.head}, з одного боку, та ${BUY.name} (${codeL(BUY.code)} ${BUY.code}, IBAN ${BUY.iban}), далі «Покупець», з другого боку, уклали цей Договір відповідно до статей 694, 695 і 1057 Цивільного кодексу України.</p>
  <h2>1. Предмет договору</h2><p>1.1. Постачальник передає у власність Покупця товар за Специфікацією (Додаток 1), а Покупець приймає товар і оплачує його частинами за графіком (продаж товару в кредит із розстроченням платежу).</p>
  <h2>2. Ціна</h2><p>2.1. Загальна вартість товару становить ${fmt(d.total)}, без ПДВ.</p><p>2.2. Ціна товару враховує умови розстрочення. Проценти за користування товарним кредитом не нараховуються.</p>
  <h2>3. Порядок розрахунків</h2><p>3.1. Усі розрахунки за цим Договором Покупець здійснює виключно в безготівковій грошовій формі в гривні шляхом прямого банківського переказу на поточний рахунок Постачальника ${SUP.iban}.</p>
  <p>3.2. Сторони домовилися не застосовувати негрошові форми розрахунків, зокрема бартер, зарахування зустрічних однорідних вимог або відступлення права вимоги третім особам.</p><p>3.3. У призначенні кожного платежу Покупець зазначає код траншу з графіка (наприклад, #${d.no}-T1).</p>
  <h2>4. Поставка</h2><p>4.1. Постачальник відвантажує товар протягом одного робочого дня після ${d.tr[0].adv?'отримання авансу':'підписання Договору'}. Передача товару оформлюється видатковою накладною.</p>
  <h2>5. Інші умови</h2><p>5.1. Договір укладено в електронній формі та підписано кваліфікованими електронними підписами Сторін. Він діє до повного виконання зобов’язань.</p>
  <h2>Додаток 1. Специфікація і графік платежів</h2>
  <table><tr><th>Товар</th><th class="r">Кількість</th><th class="r">Ціна</th><th class="r">Сума</th></tr><tr><td>${GOODS}, асортимент згідно із замовленням</td><td class="r">${QTY} шт.</td><td class="r">${fmt(price)}</td><td class="r">${fmt(d.total)}</td></tr></table>
  <table><tr><th>Платіж</th><th>Строк</th><th>Код у призначенні</th><th class="r">Сума</th></tr>${d.tr.map(t=>`<tr><td>${t.adv?'Аванс':'Транш '+t.id}</td><td>до ${dFull(t.due)}</td><td>#${d.no}-${t.id}</td><td class="r">${fmt(t.a)}</td></tr>`).join('')}</table>
  <div class="sigs"><div><b>Постачальник</b><br>${SUP.name}<br><span class="sigst${d.sigS?' ok':''}">${d.sigS?'Підписано КЕП (імітація)':'Очікує підпису'}</span></div>
    <div><b>Покупець</b><br>${BUY.name}<br><span class="sigst${d.sigB?' ok':''}">${d.sigB?'Підписано КЕП (імітація)':'Очікує підпису'}</span></div></div></article>`}
function waybillHTML(d){const price=Math.round(d.total/QTY*100)/100;
  return `<article class="doc"><p class="demo-note">Шаблон для демонстрації.</p><h1>ВИДАТКОВА НАКЛАДНА № ВН-${d.no}<br>від ${dFull(d.shipDay)}</h1>
  <p>Постачальник: ${SUP.name}, ЄДРПОУ ${SUP.code}, IBAN ${SUP.iban}</p><p>Покупець: ${BUY.name}, ${codeL(BUY.code)} ${BUY.code}, IBAN ${BUY.iban}</p><p>Підстава: договір поставки на умовах розстрочення платежу № ${d.no} від ${dFull(0)}</p>
  <table><tr><th>Товар</th><th class="r">Кількість</th><th class="r">Ціна</th><th class="r">Сума</th></tr><tr><td>${GOODS}</td><td class="r">${QTY} шт.</td><td class="r">${fmt(price)}</td><td class="r">${fmt(d.total)}</td></tr></table>
  <p><b>Разом: ${fmt(d.total)}, без ПДВ.</b> Оплата за графіком Додатка 1 до договору.</p>
  <div class="sigs"><div><b>Відвантажив</b><br>${SUP.name}</div><div><b>Отримав</b><br>${BUY.name}</div></div></article>`}
// претензія для стягнення: сума боргу і 3% річних за ст. 625 ЦК
function claimHTML(d,t){const days=Math.max(0,S.day-t.due),pen=Math.round(t.a*0.03*days/365*100)/100;
  return `<article class="doc"><p class="demo-note">Шаблон для демонстрації. Перед відправкою потребує перевірки юристом.</p>
  <h1>ПРЕТЕНЗІЯ<br>про сплату заборгованості за договором № ${d.no}</h1><p class="row2"><span>м. Київ</span><span>${dFull(S.day)}</span></p>
  <p>Від: ${SUP.name}, код ЄДРПОУ ${SUP.code}.<br>Кому: ${BUY.name}, ${codeL(BUY.code)} ${BUY.code}.</p>
  <p>За договором поставки на умовах розстрочення платежу № ${d.no} від ${dFull(0)} Покупець мав сплатити транш ${t.id} у сумі ${fmt(t.a)} до ${dFull(t.due)}. Товар передано за видатковою накладною № ВН-${d.no}. Станом на ${dFull(S.day)} оплату не отримано, прострочення становить ${pl(days,'день','дні','днів')}.</p>
  <p>Відповідно до статей 692 і 625 Цивільного кодексу України Покупець зобов’язаний оплатити товар і сплатити 3% річних від простроченої суми: ${fmt(pen)}.</p>
  <table><tr><th>Що</th><th class="r">Сума</th></tr><tr><td>Борг за траншем ${t.id}</td><td class="r">${fmt(t.a)}</td></tr><tr><td>3% річних за ${pl(days,'день','дні','днів')}</td><td class="r">${fmt(pen)}</td></tr><tr><td><b>Разом</b></td><td class="r"><b>${fmt(Math.round((t.a+pen)*100)/100)}</b></td></tr></table>
  <p>Просимо сплатити заборгованість протягом 7 календарних днів на рахунок ${SUP.iban} з призначенням «#${d.no}-${t.id}». Інакше Постачальник звернеться до суду.</p>
  <div class="sigs"><div><b>Постачальник</b><br>${SUP.name}<br>${SUP.head}</div><div></div></div></article>`}

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
  return {apps:S.b==='ok'&&!d,                                           // заявка з лімітом чекає на угоду
    docs:!!d&&d.stage==='approved'&&!d.sigS,                             // договір чекає підпису постачальника
    stmt:S.stmt.length>S.seen.stmt,                                      // нові надходження у виписці
    ar:deals().some(x=>x.tr.some(r=>r.paid==null&&S.day>r.due)),         // є прострочка
    pass:S.b==='invite'||(!!d&&d.sigS&&!d.sigB),                         // нове запрошення або договір на підпис
    inv:t.some(r=>r.due<=S.day||r.nt),                                   // настав строк або гроші на транш уже є
    bot:S.bot.length>S.seen.bot}}                                        // непрочитані повідомлення
const SIDE={sup:['new','apps','ar','stmt','docs'],buy:['pass','pay','inv','bot']};
function dots(){if(sTab==='stmt'&&visible($('sup')))S.seen.stmt=S.stmt.length;   // відкрита вкладка = переглянуто
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
  {k:'reg',    t:'Реєстрація постачальника',  s:'ЄДРПОУ, IBAN, NDA', d:9000,
    fast(){register(SUP0.code,SUP0.iban,true)}, go(){closeDoc();role('sup');setSTab('new')}, pts:[['#rg-code',800,SUP0.code],['#rg-iban',2400,SUP0.iban],['#rg-nda',5000],['#rg-go',6400]]},
  {k:'invite', t:'Запрошення замість знижки', s:'посилання в Telegram', d:7000,
    fast(){sendInvite('Telegram')}, go(){closeDoc();role('sup');setSTab('new')}, pts:[['#mk-link',1600]]},
  {k:'connect',t:'Покупець за посиланням',    s:'ІПН, IBAN, згода, API-ключ', d:13000,
    fast(){S.breg={code:BUY0.code,iban:BUY0.iban,consent:S.day};S.src.keycrm=true;S.keys.keycrm=mask(DKEY.keycrm);S.done.connect=true},
    go(){role('buy');openOffer()},
    pts:[['#of-go',1300],['#wz-code',2600,BUY0.code],['#wz-iban',4000,BUY0.iban],['#wz-ok',6000],['#wz-next',7000],['[data-src="keycrm"]',8400],['#wz-key',9700,DKEY.keycrm],['#wz-key-ok',11600]]},
  {k:'score',  t:'Перевірка за 60 секунд',    s:'реєстри, ТТН, відмови', d:9000,
    fast(){completeCheck()}, go(){role('buy');if(S.b==='ok'){setBTab('pass')}else openWizard('src')}, pts:[['#wz-check',900],['#wz-send',6200]]},
  {k:'deal',   t:'Бал, ліміт і угода',        s:'кредит не більший за ліміт', d:9000,
    fast(){makeDeal(true)}, go(){closeDoc();role('sup');sel='olena';setSTab('apps')}, pts:[['[data-app="tkachuk"]',900],['[data-app="olena"]',2600],['#ap-ok',4300],['#mk-deal',6200]]},
  {k:'sign',   t:'Договір і КЕП',             s:'обидві сторони підписують', d:8000,
    fast(){const d=S.deal;if(d&&d.stage==='approved'){d.sigS=true;signB()}}, go(){const d=S.deal;if(d.sigS)openSign();else{role('sup');openDoc('contract')}}, pts:[['#sg-sup',1500],['#bpush',3600],['#sg-buy',5200]]},
  {k:'adv',    t:'Аванс за QR-кодом',         s:'звірка закриває транш', d:7000,
    fast(){payTr('T1')}, go(){closeDoc();role('buy');setBTab('inv');if(auto)later(4600,()=>role('sup'))}, pts:[['[data-inv="T1"]',1000],['#inv-pay',2800]]},
  {k:'day7',   t:'Минає тиждень',             s:'NovaPay виплатив, бот нагадує', d:7000,
    fast(){if(S.day<7)advance(7-S.day)}, go(){role('buy');setBTab('pay')}, pts:[['#day7',1200],['#bpush',3400]]},
  {k:'pay2',   t:'Другий транш',              s:'дебіторка без прострочок', d:7000,
    fast(){payTr('T2')}, go(){role('buy');setBTab('bot');if(auto)later(5000,()=>{role('sup');setSTab('ar')})}, pts:[['[data-bot-pay="T2"]',1000],['#inv-pay',2800]]},
];
const CAPS={
  reg:'Гуртовня «Оселя-Опт» реєструється в Targo: код ЄДРПОУ, IBAN і NDA. Назву й директора платформа бере з ЄДР, а постачальник отримує своє посилання-запрошення.',
  invite:'Олена просить знижку 7%, а це 5 600 ₴ прибутку. Замість знижки менеджер надсилає їй у Telegram запрошення: товар у розстрочку після перевірки.',
  connect:'Олена відкриває посилання, вводить ІПН та IBAN, дає згоду на обробку даних і вставляє API-ключ KeyCRM лише для читання замовлень і доставок.',
  score:'За хвилину платформа перевіряє реєстри, звіряє ТТН з Новою поштою і зважує відмови за 90 днів. 100 000 ₴ у дорозі × 0,9 × 0,8 = ліміт 72 000 ₴, бал 85 зі 100.',
  deal:'Постачальник бачить лише бал і ліміт. У Ткачук відкрите провадження, тож ліміт 0. Для Олени менеджер створює угоду, і система не дасть вийти за ліміт.',
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
function resetDemo(){S=clone(DEF);uiT.forEach(clearTimeout);uiT=[];sel=null;fresh=-1;calc={...CALC0};sTab='new';bTab='pass';
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
  if(ds.src){const k=ds.src;if(S.src[k]){S.src[k]=false;delete S.keys[k];save()}else keyFor=keyFor===k?null:k;openWizard('src');if(keyFor)$('wz-key').focus();return}
  if(ds.inv)return openInv(ds.inv);
  if(ds.botPay)return openInv(ds.botPay);
  if(ds.doc)return openDoc(ds.doc);
  if(ds.claim)return openDoc('claim',ds.claim.split(':')[1]);
  if(ds.man!=null){S.stmt[+ds.man].man=true;return render()}
  if(ds.role)return role(ds.role);
  if(ds.mode){const a=ds.mode==='auto';if(a!==auto)setMode(a);return}
  if(ds.j!=null){if(auto)return;document.body.classList.remove('jury');return runStep(+ds.j)}
  const A={'rg-go':()=>register($('rg-code').value,$('rg-iban').value,$('rg-nda').checked),'mk-link':()=>sendInvite('Telegram'),'mk-viber':()=>sendInvite('Viber'),
    'of-open':openOffer,'of-go':()=>openWizard('id'),'wz-next':buyerId,'wz-key-ok':addKey,'wz-check':runCheck,'wz-send':completeCheck,
    'ap-ok':()=>setSTab('new'),'mk-deal':()=>makeDeal(),'ap-no':()=>toast('sup','У демо відхилення не зберігається'),'ap-adv':()=>toast('sup','Покупцю надіслано пропозицію з авансом (імітація)'),
    'sg-sup':signS,'sg-buy':signB,'sg-open':openSign,'inv-pay':()=>payTr(curInv),'inv-draft':()=>toast('buy','Чернетку створено в «Приват24 для бізнесу» (імітація)'),
    'b-close':closeB,'doc-close':closeDoc,'doc-print':()=>print(),reset:()=>auto?restartDemo():resetDemo(),day1:()=>advance(1),day7:()=>advance(7),wave,
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
  if(e.key==='Enter'&&e.target.id==='wz-key'){e.preventDefault();return addKey()}
  if(auto&&(e.key===' '||e.key==='ArrowRight')){e.preventDefault();if(di<DEMO.length-1)runStep(di+1);else setMode(false)}});   // у ручному режимі клавіші нічого не роблять

/* ---------- самоперевірка: ?selftest, результат у консолі ---------- */
function selftest(){const R=[],ok=(n,c)=>R.push((c?'ok   ':'FAIL ')+n),D=clone(DEF);
  [[80000,30,14,2,3],[99999,25,21,3,2.5],[15001,0,7,3,0],[57333,35,30,3,7]].forEach(([base,adv,term,parts,mk])=>{const p=plan({base,adv,term,parts,mk});
    ok(`сума траншів = сумі угоди (${base} ₴, аванс ${adv}%, ${parts} платежі)`,p.tr.reduce((s,t)=>s+Math.round(t.a*100),0)===Math.round(p.total*100))});
  const p=plan(CALC0);ok('чернетка: 82 400 = 24 720 + 28 840 + 28 840, строки 0/7/14',p.total===82400&&p.tr.map(t=>t.a+'@'+t.due).join()==='24720@0,28840@7,28840@14');
  const x0=oSnap(0,D),sc=score(x0);
  ok('валідні ТТН Олени = 100 000 ₴ (без створених ЕН, відмов і спору)',x0.sum===100000);
  ok('зважені відмови: 9% × 0,6 + 11% × 0,3 + 13% × 0,1 = 10%',Math.abs(sc.r-0.1)<1e-9);
  ok('ліміт Олени 100 000 × 0,9 × 0,8 = 72 000, бал 85, зелений',sc.limit===72000&&sc.pts===85&&sc.light==='green');
  ok('кредит чернетки 57 680 вкладається в ліміт',p.credit<=sc.limit);
  const tk=OTHERS.find(o=>o.stop),st=score(tk);ok('АСВП: червоний, ліміт 0',st.light==='red'&&st.limit===0&&st.pts===0);
  const bo=OTHERS.find(o=>o.id==='bondar'),sb=score(bo);ok('Бондар: стеля 50 000, мінус борг 8 000 → ліміт 23 200, бал 47, аванс 65%',sb.limit===23200&&sb.pts===47&&sb.light==='yellow'&&advFor(sb,bo.total)===65&&bo.total*(100-65)/100<=sb.limit);
  const nw=score({sum:100000,per:[],paid:0,active:0});ok('новий ФОП без історії: відмови 25%, стартова стеля 15 000',nw.r===R_NEW&&nw.limit===15000);
  ok('хвиля відмов знижує ліміт Олени до 48 900',score(oSnap(0,{...D,wave:true})).limit===48900);
  const od={...D,deal:{stage:'signed',tr:[{id:'T2',a:100,due:3,paid:null}]}};ok('прострочка: Blacklist, ліміт 0',score(oSnap(4,od)).limit===0&&score(oSnap(3,od)).limit>0);
  const dl=[{no:'TRG-1',code:'111',tr:[{id:'T1',a:100,paid:null},{id:'T2',a:200,paid:null}]}];
  ok('платіж без коду від незнайомого не закриває транш',!reconcile({day:0,from:'X',code:'999',a:100,p:'оплата за товар'},dl)&&dl[0].tr.every(t=>t.paid==null));
  ok('недоплата з кодом не закриває транш',!reconcile({day:0,code:'999',a:50,p:'#TRG-1-T1'},dl)&&dl[0].tr[0].paid==null);
  ok('платіж з #TRG-1-T2 закриває T2',!!reconcile({day:1,code:'999',a:200,p:'Оплата #TRG-1-T2'},dl)&&dl[0].tr[1].paid===1);
  ok('повторний платіж на сплачений T2 не зараховується вдруге',!reconcile({day:1,code:'999',a:200,p:'#TRG-1-T2'},dl));
  ok('за ІПН: одна відкрита сума, що збігається',!!reconcile({day:2,code:'111',a:100,p:'за посуд'},dl)&&dl[0].tr[0].paid===2);
  ok('IBAN демо проходить контроль mod 97',ibanOk(SUP0.iban)&&ibanOk(BUY0.iban));
  ok('реєстрація: демо-реквізити постачальника й покупця приймаються',!reqErr(SUP0.code,SUP0.iban)&&!reqErr(BUY0.code,BUY0.iban,true)&&!reqErr('12345678',BUY0.iban,true));
  ok('реєстрація: 10 цифр для постачальника, 9 для покупця, IBAN з помилкою відхиляються',!!reqErr('3123456789',SUP0.iban)&&!!reqErr('312345678',BUY0.iban,true)&&!!reqErr(SUP0.code,SUP0.iban.replace(/0$/,'1'))&&!!reqErr(SUP0.code,'UA46999999'));
  ok('пробіли й малі літери в IBAN не заважають',!reqErr(SUP0.code,clean(' ua46 9999 9900 0002 6001 2345 6789 0')));
  ok('API-ключ: демо-ключі проходять, короткий і з пробілом ні',Object.values(DKEY).every(keyOk)&&!keyOk('abc123')&&!keyOk('kc_ro_7F3aQ9xL2mT8 vR4nB6yW1'));
  ok('посилання НБУ: bank.gov.ua/qr/ + base64url',/^https:\/\/bank\.gov\.ua\/qr\/[A-Za-z0-9_-]+$/.test(nbuQR(24720,'тест #TRG-8492-T1')));
  ok('6 посилок, виплачених до 7-го дня, = 73 400 ₴',PARCELS.filter(x=>paidOut(x,7,D)).reduce((s,x)=>s+x.a,0)===73400);
  console.log('[selftest]\n'+R.join('\n'));window.TARGO_SELFTEST=R;return R}
if(/[?&]selftest/.test(location.search))selftest();

/* ---------- панель «Демо для журі»: однакова на всіх сторінках, тому малюємо її тут ---------- */
const PAGES=[['','Мобільна версія'],['web/','Вебверсія'],['demo/','Демо: обидва кабінети поруч']];
const here=PAGES.find(([p])=>{const u=new URL(p,ROOT).pathname;return location.pathname===u||location.pathname===u+'index.html'});
if($('presenter'))$('presenter').innerHTML=`<div class="ph"><b>Демо для журі</b><button class="linkbtn" id="p-hide">Сховати</button></div>
  <div class="pbox"><h2>Сценарій</h2><div class="jsteps" id="jsteps"></div><button class="linkbtn" id="reset">Скинути демо</button></div>
  <div class="pbox"><h2>Час у демо</h2><div class="daynow" id="daynow"></div>
    <div class="altrow"><button class="btn ghost sm" id="day1">+1 день</button><button class="btn ghost sm" id="day7">+7 днів</button></div>
    <p class="note">Посилки доїжджають до покупців, NovaPay виплачує післяплату, наближаються строки траншів.</p>
    <button class="btn ghost sm" id="wave">Хвиля відмов</button><p class="note">Покупці Олени відмовляються від двох посилок: ліміт перераховується сам, нові угоди обмежуються.</p></div>
  <div class="pbox"><h2>Інші версії</h2>${PAGES.filter(p=>p!==here).map(([p,t])=>`<a class="linkbtn" href="${new URL(p,ROOT).href}">${t}</a>`).join('')}
    <p class="note">Стан спільний: відкрийте мобільну й вебверсію в сусідніх вікнах, і вони оновлюватимуть одна одну.</p></div>
  <div class="pbox"><h2>Що імітовано</h2><p class="note">Реєстри, KeyCRM, Нова пошта, банк і КЕП не підключені, усі дані вигадані. IBAN не справжній: не платіть за цим QR-кодом.</p></div>`;
// інша вкладка змінила стан: перемальовуємо без запису, щоб вкладки не перебивали одна одну
addEventListener('storage',e=>{if(e.key===KEY){S=load();syncP();renderSup();renderBuy();paintSteps();dots()}});

render();
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register(new URL('sw.js',ROOT)).catch(()=>{});
})();
