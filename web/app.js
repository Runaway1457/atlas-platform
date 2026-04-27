// ===================== Utils =====================
function fmtBRL(v){return 'R$ '+(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmtBRLk(v){if(!v)return 'R$ 0';if(v>=1e6)return 'R$ '+(v/1e6).toFixed(2)+'M';if(v>=1e3)return 'R$ '+(v/1e3).toFixed(0)+'k';return 'R$ '+v}
function rnd(seed){let t=seed+=0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}
function fmtCNPJ(n){const s=String(n).padStart(14,'0');return `${s.slice(0,2)}.${s.slice(2,5)}.${s.slice(5,8)}/${s.slice(8,12)}-${s.slice(12)}`}
function hex(n){return Math.floor(n*0xffffff).toString(16).padStart(6,'0')}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

// ===================== Mocked data =====================
const SETORES=['varejo vestuário','alimentação','TI','atacado','serviços B2B','indústria','construção','transportes','saúde','educação','agro','beleza','automotivo'];
const RAZOES=['Comercial','Distribuidora','Indústria','Padaria','Lanchonete','Mercearia','Auto Peças','Tecnologia','Confecções','Construtora','Transportadora','Farma','Empório','Logística','Restaurante','Estética','Agropastoril','Editora','Atacado','Engenharia'];
const REGIOES=['Norte','Sul','Aurora','Recanto','Boa Vista','Vale Verde','Atlas','Itacaré','Aragua','Atlântico','Recife','Centro'];
const SUFIXOS=['LTDA','EIRELI','ME','S.A.'];
const RISCOS=['A','A','B','B','B','C','C','D','E'];
const STATUSES=['ativa','ativa','ativa','ativa','ativa','atraso','atraso','renegociacao','bloqueada','cobranca_externa'];

const EMPRESAS=[];
const CURATED=[
  ['12.345.678/0001-90','Comercial Aurora Norte LTDA','varejo vestuário',145000,48000,'B','ativa'],
  ['22.118.453/0001-71','Padaria Centro Comércio LTDA','alimentação',62000,18000,'C','atraso'],
  ['17.882.901/0001-65','Tecnologia Recanto Serviços ME','TI',38000,22000,'A','ativa'],
  ['09.452.118/0001-04','Distribuidora Sul Atlântico LTDA','atacado',412000,180000,'B','ativa'],
  ['28.991.337/0001-29','Móveis e Estofados Aragua LTDA','varejo vestuário',88000,0,'E','cobranca_externa'],
  ['14.665.218/0001-58','Construtora Vale Verde EIRELI','construção',1850000,420000,'B','ativa'],
  ['31.118.402/0001-13','Lanchonete Bom Sabor 2 LTDA','alimentação',24000,6000,'D','renegociacao'],
  ['04.218.991/0001-77','Auto Peças Recife Gerais LTDA','automotivo',98000,32000,'C','atraso'],
  ['37.884.119/0001-08','Farma Cuidar Saúde LTDA','saúde',280000,95000,'A','ativa'],
  ['45.118.227/0001-91','Transportadora Itacaré Logística','transportes',520000,210000,'B','ativa'],
  ['19.882.110/0001-23','Atelier Belezza Studio LTDA','beleza',42000,14000,'C','ativa'],
  ['08.117.342/0001-66','Indústria Plástica Norte LTDA','indústria',980000,340000,'A','ativa'],
  ['27.119.884/0001-37','Educa Mais Cursos EIRELI','educação',128000,0,'D','bloqueada'],
  ['33.498.117/0001-50','Agropastoril Boa Vista LTDA','agro',1240000,380000,'B','ativa'],
];
CURATED.forEach((r,i)=>{
  EMPRESAS.push({cnpj:r[0],razao:r[1],setor:r[2],faturamento:r[3],limite:r[4],risco:r[5],status:r[6],ultDecisao:`DEC-2026-04-${String(15+(i%6)).padStart(2,'0')}-${(0xaa00+i*171).toString(16)}`});
});
for(let i=0;i<86;i++){
  const r=rnd(i*977+13),r2=rnd(i*1031+7),r3=rnd(i*1097+11),r4=rnd(i*1213+9);
  const cnpj=fmtCNPJ(Math.floor(r*89999999999999)+10000000000000);
  const razao=`${RAZOES[Math.floor(r*RAZOES.length)]} ${REGIOES[Math.floor(r2*REGIOES.length)]} ${i+15} ${SUFIXOS[Math.floor(r3*SUFIXOS.length)]}`;
  const fat=Math.floor(20000+r*4980000);
  const risco=RISCOS[Math.floor(r2*RISCOS.length)];
  const status=STATUSES[Math.floor(r3*STATUSES.length)];
  const limite=(status==='bloqueada'||status==='cobranca_externa')?0:risco==='A'?Math.floor(fat*.40):risco==='B'?Math.floor(fat*.30):risco==='C'?Math.floor(fat*.20):risco==='D'?Math.floor(fat*.10):0;
  EMPRESAS.push({cnpj,razao,setor:SETORES[Math.floor(r4*SETORES.length)],faturamento:fat,limite,risco,status,ultDecisao:`DEC-2026-04-${String(Math.floor(r*21)+1).padStart(2,'0')}-${hex(r2)}`});
}

const COBRANCA=[
  {prio:'P1',case:'CASE-2026-04-21-339a0e',cnpj:'22.118.453/0001-71',razao:'Padaria Centro Comércio LTDA',valor:2380,atraso:7,prob:0.62,estrategia:'pix_whatsapp_cordial',canal:'whatsapp',ticket:4200,tom:'cordial',atrasos12m:1,template:'TPL-COBR-CORDIAL-PIX-V12'},
  {prio:'P1',case:'CASE-2026-04-21-aa11ee',cnpj:'04.218.991/0001-77',razao:'Auto Peças Recife Gerais LTDA',valor:8420,atraso:12,prob:0.41,estrategia:'ligacao_humana',canal:'ligacao',ticket:6800,tom:'firme',atrasos12m:3,template:'TPL-COBR-LIGAR-FIRME-V08'},
  {prio:'P1',case:'CASE-2026-04-21-bb22aa',cnpj:'19.882.110/0001-23',razao:'Atelier Belezza Studio LTDA',valor:1180,atraso:14,prob:0.28,estrategia:'whatsapp_firme_pix',canal:'whatsapp',ticket:1450,tom:'firme',atrasos12m:4,template:'TPL-COBR-FIRME-PIX-V05'},
  {prio:'P1',case:'CASE-2026-04-21-cc88aa',cnpj:'37.884.119/0001-08',razao:'Farma Cuidar Saúde LTDA',valor:18420,atraso:9,prob:0.55,estrategia:'email_ligacao',canal:'email',ticket:24000,tom:'formal',atrasos12m:0,template:'TPL-COBR-FORMAL-V03'},
  {prio:'P2',case:'CASE-2026-04-21-09a8b2',cnpj:'17.882.901/0001-65',razao:'Tecnologia Recanto Serviços ME',valor:1480,atraso:3,prob:0.78,estrategia:'pix_cordial_email',canal:'email',ticket:3200,tom:'cordial',atrasos12m:0,template:'TPL-COBR-CORDIAL-EMAIL-V14'},
  {prio:'P2',case:'CASE-2026-04-21-12cc88',cnpj:'09.452.118/0001-04',razao:'Distribuidora Sul Atlântico LTDA',valor:42100,atraso:5,prob:0.71,estrategia:'pix_whatsapp_cordial',canal:'whatsapp',ticket:38000,tom:'cordial',atrasos12m:1,template:'TPL-COBR-CORDIAL-PIX-V12'},
  {prio:'P2',case:'CASE-2026-04-21-99ee01',cnpj:'08.117.342/0001-66',razao:'Indústria Plástica Norte LTDA',valor:24200,atraso:6,prob:0.66,estrategia:'pix_whatsapp_cordial',canal:'whatsapp',ticket:32000,tom:'cordial',atrasos12m:0,template:'TPL-COBR-CORDIAL-PIX-V12'},
  {prio:'P2',case:'CASE-2026-04-21-aa00ee',cnpj:'45.118.227/0001-91',razao:'Transportadora Itacaré Logística',valor:18420,atraso:4,prob:0.81,estrategia:'email_cordial',canal:'email',ticket:21000,tom:'cordial',atrasos12m:0,template:'TPL-COBR-CORDIAL-EMAIL-V14'},
  {prio:'P3',case:'CASE-2026-04-21-aa01ee',cnpj:'33.498.117/0001-50',razao:'Agropastoril Boa Vista LTDA',valor:920,atraso:2,prob:0.84,estrategia:'aguardar_24h',canal:'aguardar',ticket:1800,tom:'cordial',atrasos12m:0,template:'-'},
  {prio:'P3',case:'CASE-2026-04-21-bb01ee',cnpj:'14.665.218/0001-58',razao:'Construtora Vale Verde EIRELI',valor:3200,atraso:3,prob:0.79,estrategia:'pix_cordial_email',canal:'email',ticket:8400,tom:'formal',atrasos12m:0,template:'TPL-COBR-CORDIAL-EMAIL-V14'},
  {prio:'P3',case:'CASE-2026-04-21-cc01ee',cnpj:'12.345.678/0001-90',razao:'Comercial Aurora Norte LTDA',valor:1850,atraso:1,prob:0.88,estrategia:'sms_lembrete',canal:'sms',ticket:2200,tom:'cordial',atrasos12m:1,template:'TPL-LEMB-SMS-V02'},
  {prio:'P4',case:'CASE-2026-04-21-dd01ee',cnpj:'31.118.402/0001-13',razao:'Lanchonete Bom Sabor 2 LTDA',valor:480,atraso:0,prob:0.92,estrategia:'aguardar',canal:'aguardar',ticket:680,tom:'cordial',atrasos12m:0,template:'-'},
];

// ===================== Navigation =====================
document.querySelectorAll('.nav-item').forEach(item=>{
  item.addEventListener('click',()=>{
    const page=item.dataset.page;
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.getElementById('page-'+page).classList.add('active');
    document.getElementById('crumb').textContent=page;
    document.querySelector('.content').scrollTop=0;
  });
});

// ===================== Dashboard period switch =====================
const PERIOD_DATA={
  '24h':{
    kpis1:[
      {l:'Inadimplência 90+',v:'4.9',u:'%',d:'↓ 1.9pp · vs Q1/2025',cls:'delta-up',spark:[15,12,14,10,11,9,7,8,5],c:'#166534'},
      {l:'Recuperação 0-30d',v:'58',u:'%',d:'↑ 17pp',cls:'delta-up',spark:[16,14,12,11,9,8,6,5,4],c:'#166534'},
      {l:'Risco médio (PD 90d)',v:'0.071',u:'',d:'— estável (PSI 0.04)',cls:'delta-neutral',spark:[10,11,9,10,11,10,9,10,9],c:'#7a7468'},
      {l:'Decisões 24h',v:'312.487',u:'',d:'↑ 4.2% vs ontem',cls:'delta-up',spark:[12,10,11,8,9,7,8,6,7],c:'#1d3557'},
    ],
    kpis2:[
      {l:'Custo médio/decisão',v:'R$ 0,072',u:'',d:'↓ 8% (cache hit ↑)',cls:'delta-up'},
      {l:'p95 originação',v:'781',u:'ms',d:'SLO 800ms · ok',cls:'delta-neutral'},
      {l:'Override manual',v:'5.1',u:'%',d:'↓ 4.1pp vs Q1/25',cls:'delta-up'},
      {l:'Pendentes humano',v:'28',u:'',d:'SLA médio 4h12min',cls:'delta-neutral'},
    ],
    verdicts:[{l:'aprovado',v:71.2,c:'#166534'},{l:'aprovado_com_restricao',v:15.8,c:'#3f6212'},{l:'pendente_revisao_humana',v:3.4,c:'#5b21b6'},{l:'reprovado',v:9.6,c:'#991b1b'}],
    volume:{orig:[.6,.55,.5,.45,.4,.45,.55,.65,.75,.85,.9,.85,.8,.75,.78,.82,.85,.78,.72,.65,.6,.55,.55,.5],rean:[.4,.38,.35,.32,.3,.32,.4,.5,.6,.7,.72,.7,.65,.6,.62,.66,.68,.6,.55,.5,.45,.42,.4,.38],cob:[.2,.18,.15,.12,.1,.12,.18,.25,.32,.4,.45,.4,.35,.32,.34,.38,.42,.36,.3,.25,.22,.2,.2,.18]},
  },
  '7d':{
    kpis1:[
      {l:'Inadimplência 90+',v:'5.0',u:'%',d:'↓ 0.4pp · 7d',cls:'delta-up',spark:[14,13,12,12,11,11,10],c:'#166534'},
      {l:'Recuperação 0-30d',v:'56',u:'%',d:'↑ 2pp · 7d',cls:'delta-up',spark:[18,16,15,14,13,12,11],c:'#166534'},
      {l:'Risco médio (PD 90d)',v:'0.073',u:'',d:'— estável (PSI 0.06)',cls:'delta-neutral',spark:[10,11,10,11,10,11,10],c:'#7a7468'},
      {l:'Decisões 7d',v:'2.18M',u:'',d:'↑ 6.1% vs semana anterior',cls:'delta-up',spark:[14,12,11,9,10,8,7],c:'#1d3557'},
    ],
    kpis2:[
      {l:'Custo médio/decisão',v:'R$ 0,074',u:'',d:'↓ 5% · 7d',cls:'delta-up'},
      {l:'p95 originação · 7d',v:'792',u:'ms',d:'SLO 800ms · ok',cls:'delta-neutral'},
      {l:'Override manual',v:'5.4',u:'%',d:'↑ 0.3pp · 7d',cls:'delta-down'},
      {l:'Pendentes humano',v:'31',u:'',d:'SLA médio 4h44min',cls:'delta-down'},
    ],
    verdicts:[{l:'aprovado',v:70.1,c:'#166534'},{l:'aprovado_com_restricao',v:16.4,c:'#3f6212'},{l:'pendente_revisao_humana',v:3.7,c:'#5b21b6'},{l:'reprovado',v:9.8,c:'#991b1b'}],
    volume:{orig:Array.from({length:24},(_,i)=>0.55+0.18*Math.sin(i/2)+0.05*Math.cos(i/3)),rean:Array.from({length:24},(_,i)=>0.42+0.15*Math.sin(i/2+0.5)),cob:Array.from({length:24},(_,i)=>0.22+0.12*Math.sin(i/2+1))},
  },
  '30d':{
    kpis1:[
      {l:'Inadimplência 90+',v:'5.2',u:'%',d:'↓ 1.6pp · 30d',cls:'delta-up',spark:[16,15,14,13,12,11,10,9,8],c:'#166534'},
      {l:'Recuperação 0-30d',v:'54',u:'%',d:'↑ 13pp · 30d',cls:'delta-up',spark:[18,17,15,14,13,11,10,9,8],c:'#166534'},
      {l:'Risco médio (PD 90d)',v:'0.075',u:'',d:'— PSI 0.09',cls:'delta-neutral',spark:[10,11,11,10,11,10,11,10,10],c:'#7a7468'},
      {l:'Decisões 30d',v:'9.41M',u:'',d:'↑ 8.4% vs mês anterior',cls:'delta-up',spark:[14,13,11,10,9,8,7,7,6],c:'#1d3557'},
    ],
    kpis2:[
      {l:'Custo médio/decisão',v:'R$ 0,078',u:'',d:'↓ 11% · 30d',cls:'delta-up'},
      {l:'p95 originação · 30d',v:'804',u:'ms',d:'SLO 800ms · burn 4%',cls:'delta-down'},
      {l:'Override manual',v:'5.3',u:'%',d:'↓ 0.2pp · 30d',cls:'delta-up'},
      {l:'Pendentes humano',v:'29',u:'',d:'SLA médio 4h21min',cls:'delta-neutral'},
    ],
    verdicts:[{l:'aprovado',v:69.8,c:'#166534'},{l:'aprovado_com_restricao',v:16.9,c:'#3f6212'},{l:'pendente_revisao_humana',v:3.5,c:'#5b21b6'},{l:'reprovado',v:9.8,c:'#991b1b'}],
    volume:{orig:Array.from({length:24},(_,i)=>0.5+0.2*Math.sin(i/3)),rean:Array.from({length:24},(_,i)=>0.38+0.18*Math.sin(i/3+1)),cob:Array.from({length:24},(_,i)=>0.2+0.14*Math.sin(i/3+2))},
  },
};

function renderDashboard(period){
  const d=PERIOD_DATA[period];
  document.getElementById('kpi-grid-1').innerHTML=d.kpis1.map(k=>{
    const sparkPath=k.spark?'<svg class="kpi-spark" width="64" height="20" viewBox="0 0 64 20"><polyline points="'+k.spark.map((y,i)=>`${i*8},${y}`).join(' ')+'" fill="none" stroke="'+k.c+'" stroke-width="1.5"/></svg>':'';
    return `<div class="kpi"><div class="kpi-label">${k.l}</div><div class="kpi-value">${k.v}<small>${k.u}</small></div><div class="kpi-delta ${k.cls}">${k.d}</div>${sparkPath}</div>`;
  }).join('');
  document.getElementById('kpi-grid-2').innerHTML=d.kpis2.map(k=>`<div class="kpi"><div class="kpi-label">${k.l}</div><div class="kpi-value">${k.v}<small>${k.u}</small></div><div class="kpi-delta ${k.cls}">${k.d}</div></div>`).join('');
  document.getElementById('verdict-dist').innerHTML=d.verdicts.map(v=>`
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:11px;margin-bottom:4px"><span>${v.l}</span><span class="text-secondary">${v.v}%</span></div>
      <div class="driver-bar"><div class="driver-bar-fill" style="width:${v.v}%;background:${v.c}"></div></div>
    </div>`).join('');
  document.getElementById('volume-period').textContent=period==='24h'?'últimas 24h':period==='7d'?'últimos 7 dias':'últimos 30 dias';
  document.getElementById('verdict-period').textContent=period;
  renderVolumeChart(d.volume);
}

function makePath(points,w,h){
  return points.map((p,i)=>(i===0?'M':'L')+(40+(i/(points.length-1))*(w-50))+','+(h-22-p*(h-44))).join(' ');
}
function renderVolumeChart(vol){
  const svg=document.getElementById('chart-volume-svg');
  const grid=[0.25,0.5,0.75].map(y=>`<line x1="40" y1="${22+y*156}" x2="590" y2="${22+y*156}"/>`).join('');
  svg.innerHTML=`
    <g class="grid">${grid}</g>
    <g class="axis">
      <line x1="40" y1="178" x2="590" y2="178"/>
      <text x="40" y="194">00h</text><text x="180" y="194">06h</text><text x="320" y="194">12h</text><text x="460" y="194">18h</text><text x="572" y="194">24h</text>
    </g>
    <path d="${makePath(vol.orig,600,200)}" fill="none" stroke="#1d3557" stroke-width="1.8"/>
    <path d="${makePath(vol.rean,600,200)}" fill="none" stroke="#1e40af" stroke-width="1.8"/>
    <path d="${makePath(vol.cob,600,200)}" fill="none" stroke="#92400e" stroke-width="1.8"/>
  `;
}

document.querySelectorAll('#period-tabs button').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('#period-tabs button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    renderDashboard(b.dataset.period);
  });
});

// ===================== Latency chart (monitoring) =====================
function renderLatencyChart(){
  const svg=document.getElementById('chart-latency-svg');
  if(!svg)return;
  const p50=Array.from({length:24},(_,i)=>0.32+0.08*Math.sin(i/3)+rnd(i*7)*0.04);
  const p95=Array.from({length:24},(_,i)=>0.55+0.14*Math.sin(i/3+1)+rnd(i*11)*0.06);
  const p99=Array.from({length:24},(_,i)=>0.72+0.16*Math.sin(i/3+2)+rnd(i*13)*0.08);
  const grid=[0.25,0.5,0.75].map(y=>`<line x1="40" y1="${22+y*156}" x2="590" y2="${22+y*156}"/>`).join('');
  svg.innerHTML=`
    <g class="grid">${grid}</g>
    <g class="axis"><line x1="40" y1="178" x2="590" y2="178"/></g>
    <path d="${makePath(p50,600,200)}" fill="none" stroke="#1d3557" stroke-width="1.8"/>
    <path d="${makePath(p95,600,200)}" fill="none" stroke="#92400e" stroke-width="1.8"/>
    <path d="${makePath(p99,600,200)}" fill="none" stroke="#991b1b" stroke-width="1.8"/>
  `;
}

// ===================== Empresas =====================
function renderEmpresas(){
  const search=(document.getElementById('empresa-search').value||'').toLowerCase();
  const riskF=document.getElementById('empresa-risk-filter').value;
  const statusF=document.getElementById('empresa-status-filter').value;
  const filtered=EMPRESAS.filter(e=>{
    if(search && !e.cnpj.toLowerCase().includes(search) && !e.razao.toLowerCase().includes(search))return false;
    if(riskF && e.risco!==riskF)return false;
    if(statusF && e.status!==statusF)return false;
    return true;
  });
  document.querySelector('#empresa-table tbody').innerHTML=filtered.slice(0,200).map(e=>`
    <tr>
      <td class="mono">${e.cnpj}</td>
      <td>${e.razao}</td>
      <td class="text-secondary">${e.setor}</td>
      <td class="num">${fmtBRLk(e.faturamento)}</td>
      <td class="num">${e.limite?fmtBRLk(e.limite):'<span class="text-muted">—</span>'}</td>
      <td><span class="badge risk-${e.risco}">${e.risco}</span></td>
      <td><span class="badge status-${e.status}">${e.status.replace('_',' ')}</span></td>
      <td class="mono text-secondary" style="font-size:10px">${e.ultDecisao}</td>
    </tr>
  `).join('');
  document.getElementById('empresa-count').textContent=`${filtered.length} resultados`;
}
document.getElementById('empresa-search').addEventListener('input',renderEmpresas);
document.getElementById('empresa-risk-filter').addEventListener('change',renderEmpresas);
document.getElementById('empresa-status-filter').addEventListener('change',renderEmpresas);

// ===================== Crédito — Receita Federal mock =====================
const RECEITA_DB={
  '12345678000190':{razao:'Comercial Aurora Norte LTDA',cnae:'4781-4/00 · Comércio varejista de artigos do vestuário',aberta:'2021-08-14',porte:'EPP',situacao:'ativa',uf:'SP',municipio:'São Paulo',sociosN:2},
  '17882901000165':{razao:'Tecnologia Recanto Serviços ME',cnae:'6201-5/01 · Desenvolvimento de programas',aberta:'2019-03-22',porte:'ME',situacao:'ativa',uf:'SP',municipio:'Campinas',sociosN:1},
  '37884119000108':{razao:'Farma Cuidar Saúde LTDA',cnae:'4771-7/01 · Comércio varejista de produtos farmacêuticos',aberta:'2017-11-08',porte:'EPP',situacao:'ativa',uf:'MG',municipio:'Belo Horizonte',sociosN:3},
};
function digits(s){return (s||'').replace(/\D/g,'')}
function onCNPJBlur(){
  const c=digits(document.getElementById('cred-cnpj').value);
  const card=document.getElementById('receita-card');
  if(c.length!==14){card.innerHTML='';return}
  const dat=RECEITA_DB[c];
  if(!dat){
    card.innerHTML=`<div style="padding:10px 12px;background:var(--bg-surface-2);border:1px solid var(--border-subtle);border-radius:6px;font-family:var(--mono);font-size:10px;color:var(--text-muted);margin-bottom:14px">CNPJ não encontrado em cache · receita federal será consultada na execução</div>`;
    return;
  }
  card.innerHTML=`
    <div style="padding:10px 12px;background:#fff;border:1px solid var(--border);border-radius:6px;margin-bottom:14px">
      <div style="font-family:var(--mono);font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:6px">Receita Federal · cache 24h</div>
      <div style="font-size:12px;font-weight:500">${dat.razao}</div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--text-secondary);margin-top:4px;line-height:1.6">
        ${dat.cnae}<br>
        ${dat.porte} · ${dat.situacao} · aberta ${dat.aberta}<br>
        ${dat.municipio}/${dat.uf} · ${dat.sociosN} sócios
      </div>
    </div>`;
}
onCNPJBlur();

// ===================== Crédito — exemplos rápidos =====================
function loadCreditExample(kind){
  if(kind==='aurora'){
    document.getElementById('cred-cnpj').value='12.345.678/0001-90';
    document.getElementById('cred-valor').value='80000.00';
    document.getElementById('cred-faturamento').value='145000.00';
    document.getElementById('cred-of').value='true';
    document.getElementById('cred-abertura').value='2021-08-14';
  }else if(kind==='coldstart'){
    document.getElementById('cred-cnpj').value='99.118.227/0001-44';
    document.getElementById('cred-valor').value='12000.00';
    document.getElementById('cred-faturamento').value='28000.00';
    document.getElementById('cred-of').value='false';
    document.getElementById('cred-abertura').value='2026-01-04';
  }else if(kind==='reprovado'){
    document.getElementById('cred-cnpj').value='44.882.119/0001-12';
    document.getElementById('cred-valor').value='250000.00';
    document.getElementById('cred-faturamento').value='90000.00';
    document.getElementById('cred-of').value='true';
    document.getElementById('cred-abertura').value='2024-09-22';
  }
  onCNPJBlur();
}

// ===================== Crédito — engine de decisão simulada =====================
async function runDecision(){
  const btn=document.getElementById('cred-submit-btn');
  btn.disabled=true;btn.innerHTML='<span class="spinner" style="border-top-color:#fff"></span> Processando...';
  btn.style.display='inline-flex';btn.style.alignItems='center';btn.style.gap='8px';btn.style.justifyContent='center';

  const valor=parseFloat(document.getElementById('cred-valor').value.replace(',','.'))||0;
  const fat=parseFloat(document.getElementById('cred-faturamento').value.replace(',','.'))||1;
  const ofAuth=document.getElementById('cred-of').value==='true';
  const cnpj=document.getElementById('cred-cnpj').value;
  const razao=(RECEITA_DB[digits(cnpj)]||{}).razao||document.getElementById('cred-cnpj').value;
  const aberturaDate=new Date(document.getElementById('cred-abertura').value);
  const mesesAtivo=Math.max(1,(new Date()-aberturaDate)/(1000*60*60*24*30));

  // Pipeline progressivo: vai mostrando steps com latência simulada
  const trace=hex(Math.random()).slice(0,6);
  const decId=`DEC-2026-04-21-${hex(Math.random())}`;
  const reqId=`REQ-2026-04-21-${hex(Math.random()).slice(0,6)}`;
  document.getElementById('cred-req-id').textContent=reqId;

  const area=document.getElementById('cred-result-area');
  area.innerHTML=`
    <div class="card">
      <div class="card-head"><div class="card-title">Pipeline de decisão</div><span class="card-sub">trace · ${trace}…</span></div>
      <div class="card-body">
        <div class="pipeline" id="pipeline-steps"></div>
      </div>
    </div>`;
  const steps=[
    {id:'snap',name:'feature_store.snapshot',det:'Feast online · 47 features',ms:18,status:'OK'},
    {id:'rfb',name:'receita_federal.lookup',det:'cache 24h',ms:12,status:'CACHE'},
    {id:'serasa',name:'bureau.serasa',det:'concentre · score PJ',ms:184,status:'OK'},
    {id:'quod',name:'bureau.quod',det:'score PJ + tendência',ms:312,status:'WARN',warn:true},
    {id:'of',name:'open_finance.fetch',det:ofAuth?'belvo · 4 contas':'NÃO autorizado',ms:ofAuth?92:0,status:ofAuth?'OK':'SKIP',skip:!ofAuth},
    {id:'risk',name:'risk-pj-v7.4.2',det:'XGBoost · PD 90d',ms:22,status:'OK'},
    {id:'cash',name:'cashflow-fcst-v3.2.1',det:'LightGBM · projeção 30d',ms:18,status:'OK'},
    {id:'fraud',name:'fraud-pj-v5.1.0',det:'IF + XGB stack',ms:14,status:'OK'},
    {id:'pol',name:'policy-cred-2026-q2-r3',det:'caps + requires_human',ms:3,status:'OK'},
    {id:'llm',name:'llm.justificativa',det:'sonnet · grounding feature',ms:151,status:'OK'},
  ];
  const cont=document.getElementById('pipeline-steps');
  for(const [i,s] of steps.entries()){
    const div=document.createElement('div');
    div.className='pipeline-step pending';
    div.innerHTML=`
      <span class="pipeline-marker"><span class="spinner"></span></span>
      <div><div class="pipeline-name">${s.name}</div><div class="pipeline-detail">${s.det}</div></div>
      <div class="pipeline-time">—</div>
      <div class="pipeline-status text-muted">running…</div>`;
    cont.appendChild(div);
    await sleep(80+rnd(i*7)*150);
    div.classList.remove('pending');
    if(s.skip){div.classList.add('warn');div.querySelector('.pipeline-marker').textContent='—';div.querySelector('.pipeline-time').textContent='skip';div.querySelector('.pipeline-status').className='pipeline-status text-muted';div.querySelector('.pipeline-status').textContent=s.status;}
    else if(s.warn){div.classList.add('warn');div.querySelector('.pipeline-marker').textContent='!';div.querySelector('.pipeline-time').textContent=s.ms+'ms';div.querySelector('.pipeline-status').className='pipeline-status text-warning';div.querySelector('.pipeline-status').textContent=s.status;}
    else{div.classList.add('done');div.querySelector('.pipeline-marker').innerHTML='✓';div.querySelector('.pipeline-time').textContent=s.ms+'ms';div.querySelector('.pipeline-status').className='pipeline-status text-success';div.querySelector('.pipeline-status').textContent=s.status;}
  }

  // Cálculos
  const pdRaw=mesesAtivo<6?(0.18+rnd(valor)*0.05):valor>fat*1.5?(0.20+rnd(valor)*0.04):0.04+rnd(valor)*0.06;
  const pd=Math.min(0.5,Math.max(0.02,pdRaw));
  const reprovaPorRisco=pd>0.18;
  const ofInferred=fat*(0.65+rnd(fat)*0.4);
  const divFat=Math.abs(fat-ofInferred)/fat;
  const sugerido=Math.min(valor,fat*1.3*0.4);
  const cap=fat/1.3;
  let limite=Math.min(sugerido,cap);
  const flags=[];
  let cashflowAlert=false;
  if(divFat>0.25)flags.push('divergencia_faturamento');
  if(rnd(valor*7)>0.55){flags.push('cashflow_alerta');cashflowAlert=true;limite=Math.min(limite,sugerido*0.6);}
  if(mesesAtivo<6){flags.push('cold_start');limite=Math.min(limite,8000);}
  let veredicto,veredictoCls;
  if(reprovaPorRisco){veredicto='REPROVADO';veredictoCls='err';limite=0;}
  else if(flags.length){veredicto='APROVADO_COM_RESTRICAO';veredictoCls='warn';}
  else{veredicto='APROVADO';veredictoCls='';}

  await sleep(120);

  // Bureau scores realistas
  const serasa=Math.max(280,Math.min(900,Math.floor(700-pd*1500+rnd(pd*100)*60)));
  const quod=Math.max(260,Math.min(900,Math.floor(serasa-30+rnd(quod=>0)*40)));
  const boavista=mesesAtivo<6?'sem_histórico':Math.floor(serasa-15+rnd(serasa)*30);

  // Drivers SHAP
  const drivers=[
    {f:'cashflow_projecao_30d_min',v:cashflowAlert?'-R$ 4.200':'+R$ 12.380',w:cashflowAlert?-0.21:0.18},
    {f:'atraso_medio_60d',v:'4.2 dias',w:-0.18},
    {f:'divergencia_faturamento_of',v:divFat.toFixed(2),w:divFat>0.25?-0.14:-0.04},
    {f:'tempo_relacionamento_meses',v:Math.floor(mesesAtivo)+'',w:mesesAtivo>12?0.13:-0.12},
    {f:'score_serasa_pj',v:serasa+'',w:serasa>600?0.11:-0.15},
    {f:'razao_solicitado_faturamento',v:(valor/fat).toFixed(2),w:(valor/fat)>1?-0.16:0.07},
    {f:'n_atrasos_12m',v:'1',w:-0.06},
  ];
  const totalAbs=drivers.reduce((s,d)=>s+Math.abs(d.w),0);

  // Resultado completo
  const html=`
    <div class="verdict">
      <div>
        <div class="verdict-head">veredicto · ${decId}</div>
        <div class="verdict-text ${veredictoCls}">${veredicto.replace(/_/g,' ').toLowerCase()}</div>
      </div>
      <div class="verdict-amount">
        ${reprovaPorRisco?'—':fmtBRL(limite)}
        <small>${reprovaPorRisco?'limite negado':'limite aprovado · taxa 3.12% a.a. · 45d'}</small>
      </div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-head"><div class="card-title">Bureaus consultados</div><span class="card-sub">3 fontes · 1 com latência alta</span></div>
      <div class="card-body">
        <div class="bureau-grid">
          <div class="bureau-card has-data">
            <div class="bureau-name">Serasa Concentre</div>
            <div class="bureau-score">${serasa}</div>
            <div class="bureau-status">${serasa>700?'baixo risco':serasa>500?'risco médio':'alto risco'} · ${serasa>500?'PJ ativa':'restrições'}</div>
          </div>
          <div class="bureau-card has-data warn">
            <div class="bureau-name">Quod PJ <span style="color:var(--warning)">●</span></div>
            <div class="bureau-score">${quod}</div>
            <div class="bureau-status">latência 312ms acima do baseline · sem retry</div>
          </div>
          <div class="bureau-card has-data">
            <div class="bureau-name">Boa Vista (fallback)</div>
            <div class="bureau-score">${boavista}</div>
            <div class="bureau-status">${typeof boavista==='string'?'CNPJ jovem · histórico insuficiente':'consulta ok · usado como cross-check'}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="col-2-eq" style="margin-bottom:14px">
      <div class="card">
        <div class="card-head"><div class="card-title">Drivers (SHAP)</div><span class="card-sub">risk-pj-v7.4.2</span></div>
        <div class="card-body">
          ${drivers.map(d=>`
            <div class="driver-row">
              <span class="driver-name">${d.f}</span>
              <div class="driver-bar"><div class="driver-bar-fill ${d.w>0?'pos':'neg'}" style="width:${Math.abs(d.w)/totalAbs*100}%"></div></div>
              <span class="driver-val">${d.v} <span class="${d.w>0?'text-success':'text-danger'}">${d.w>0?'+':''}${d.w.toFixed(2)}</span></span>
            </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Projeção de cashflow · 30d</div><span class="card-sub">cashflow-fcst-v3.2.1 · IC 90%</span></div>
        <div class="card-body" style="padding:12px">
          ${cashflowChart(cashflowAlert,fat)}
          <div class="kv-row" style="border-bottom:0;padding-top:10px"><span class="k">mín. projetado</span><span class="v ${cashflowAlert?'text-danger':'text-success'}">${cashflowAlert?'-R$ 4.200':'+R$ 12.380'}</span></div>
          <div class="kv-row" style="border-bottom:0"><span class="k">dias em déficit</span><span class="v">${cashflowAlert?'22 / 30':'0 / 30'}</span></div>
          <div class="kv-row" style="border-bottom:0"><span class="k">volatilidade (CV)</span><span class="v">0.42</span></div>
        </div>
      </div>
    </div>

    ${flags.length?`
    <div class="card" style="margin-bottom:14px">
      <div class="card-head"><div class="card-title">Flags e divergências</div><span class="card-sub">policy aplicou ${flags.length} regras</span></div>
      <div class="card-body" style="padding:6px 18px 14px">
        ${cashflowAlert?`<div class="callout"><div class="callout-head">divergência entre modelos · risk_vs_cashflow</div>risk-pj-v7 sugeriu APROVAR <b>${fmtBRL(sugerido)}</b> (PD ${pd.toFixed(3)}). cashflow-fcst-v3 detectou déficit projetado de R$ 4.200 em 22 dos próximos 30 dias. Política aplicou cap de 60%. Decisão final: <b>${fmtBRL(limite)}</b>.</div>`:''}
        ${divFat>0.25?`<div class="callout info"><div class="callout-head">inconsistência · faturamento declarado vs Open Finance</div>Declarado <b>R$ ${fat.toLocaleString('pt-BR')}</b>. Open Finance inferido <b>R$ ${ofInferred.toLocaleString('pt-BR',{maximumFractionDigits:0})}</b> (Δ ${(divFat*100).toFixed(0)}%). Política: peso maior em Open Finance, flag <code>divergencia_faturamento</code> setada, analista será notificado se cliente solicitar aumento.</div>`:''}
        ${mesesAtivo<6?`<div class="callout"><div class="callout-head">cold-start · CNPJ &lt; 6 meses</div>Empresa aberta há ${Math.floor(mesesAtivo)} meses. ${ofAuth?'Open Finance autorizado mitiga parcialmente.':'Open Finance NÃO autorizado.'} Cap automático em <b>R$ 8.000</b>. AUC do modelo de risco nesse segmento: 0.71 (vs 0.83 geral).</div>`:''}
        ${reprovaPorRisco?`<div class="callout err"><div class="callout-head">PD acima do threshold · reprovação automática</div>PD 90d projetada em <b>${pd.toFixed(3)}</b> (limite 0.18). Razão solicitado/faturamento em <b>${(valor/fat).toFixed(2)}x</b>. Modelo concordou com regra de exposição máxima.</div>`:''}
      </div>
    </div>`:''}

    <div class="col-2-eq" style="margin-bottom:14px">
      <div class="card">
        <div class="card-head"><div class="card-title">Justificativa textual</div><span class="card-sub">llm sonnet · 4/4 features grounded</span></div>
        <div class="card-body" style="font-size:13px;line-height:1.65">
          ${reprovaPorRisco
            ? `${razao.split(' ').slice(0,3).join(' ')} apresenta PD 90d projetada em <span class="text-danger" style="font-weight:600">${pd.toFixed(3)}</span>, acima do threshold de reprovação automática (0.18). Razão solicitado/faturamento de <span class="text-danger" style="font-weight:600">${(valor/fat).toFixed(2)}x</span> está acima do limite de exposição da política. Modelo de risco e regra concordam. Analista pode reabrir o caso para revisão se houver justificativa qualitativa.`
            : `${razao.split(' ').slice(0,3).join(' ')} apresenta histórico de relacionamento de <span style="font-weight:600">${Math.floor(mesesAtivo)} meses</span> e score Serasa <span style="font-weight:600">${serasa}</span>. ${divFat>0.25?`Open Finance indica faturamento <span class="text-warning" style="font-weight:600">${(divFat*100).toFixed(0)}% abaixo</span> do declarado.`:''} ${cashflowAlert?`Projeção de fluxo de caixa mostra déficit nos próximos 30 dias.`:`Fluxo de caixa projetado positivo.`} Limite ${cashflowAlert?'reduzido':'aprovado'} de <span style="font-weight:600">${fmtBRL(sugerido)}</span> (sugerido pelo modelo) para <span style="font-weight:600">${fmtBRL(limite)}</span> ${flags.length?'pelas regras de cap aplicadas':'sem ajustes'}. ${flags.length?'Recomenda-se revisão humana se cliente solicitar aumento.':''}`}
        </div>
        <div style="padding:0 18px 14px;font-family:var(--mono);font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;font-weight:600">
          features citadas: ${(reprovaPorRisco?['pd_90d','razao_solicitado_faturamento']:['tempo_relacionamento_meses','score_serasa_pj','cashflow_min_30d',divFat>0.25?'divergencia_faturamento':null].filter(Boolean)).map(f=>`<span class="tl-tag">${f}</span>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Trace · audit</div><span class="card-sub">trace_id ${trace}…</span></div>
        <div class="card-body" style="padding:6px 18px 14px">
          <div class="kv-row"><span class="k">decisão</span><span class="v">${decId}</span></div>
          <div class="kv-row"><span class="k">request</span><span class="v">${reqId}</span></div>
          <div class="kv-row"><span class="k">policy</span><span class="v">policy-cred-2026-q2-r3</span></div>
          <div class="kv-row"><span class="k">risk model</span><span class="v">risk-pj-v7.4.2 · MLflow#1284</span></div>
          <div class="kv-row"><span class="k">cashflow</span><span class="v">cashflow-fcst-v3.2.1</span></div>
          <div class="kv-row"><span class="k">fraud</span><span class="v">fraud-pj-v5.1.0 · score 0.08</span></div>
          <div class="kv-row"><span class="k">llm</span><span class="v">claude-sonnet · 1842→187 tok</span></div>
          <div class="kv-row"><span class="k">shadow</span><span class="v text-muted">risk-pj-v8-rc1 (sugeriu ${fmtBRL(sugerido*1.05)})</span></div>
          <div class="kv-row"><span class="k">latência total</span><span class="v">${steps.reduce((s,x)=>s+x.ms,0)}ms</span></div>
          <div class="kv-row"><span class="k">custo total</span><span class="v">${fmtBRL(0.04+rnd(valor*3)*0.05)}</span></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">Ações disponíveis</div><span class="card-sub">RBAC · risco-analista</span></div>
      <div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap">
        ${reprovaPorRisco?`
          <button class="btn btn-primary">Manter reprovação</button>
          <button class="btn">Encaminhar para comitê</button>
          <button class="btn btn-ghost">Pedir documentação extra</button>
        `:`
          <button class="btn btn-primary">Confirmar e enviar contrato</button>
          <button class="btn">Override · ajustar limite</button>
          <button class="btn">Encaminhar para revisão humana</button>
          <button class="btn btn-ghost">Solicitar Open Finance</button>
          <button class="btn btn-danger">Negar caso</button>
        `}
        <div style="flex:1"></div>
        <button class="btn btn-ghost">📋 Copiar trace</button>
        <button class="btn btn-ghost">⤓ Exportar JSON</button>
      </div>
    </div>
  `;
  area.innerHTML+=html;
  btn.disabled=false;btn.innerHTML='▸ Executar decisão';btn.style.display='block';
  area.scrollIntoView({behavior:'smooth',block:'start'});
}

function cashflowChart(deficit,fat){
  const days=30;
  const points=[];
  const base=fat/30;
  for(let i=0;i<days;i++){
    const noise=(rnd(i*7)-0.5)*base*0.6;
    const trend=deficit?-base*0.08*i:base*0.02*i;
    points.push(base+noise+trend - (deficit&&i>10?base*0.5:0));
  }
  const maxV=Math.max(...points,base*1.5);
  const minV=Math.min(...points,deficit?-base:0);
  const w=300,h=110;
  const xs=points.map((_,i)=>10+(i/(days-1))*(w-20));
  const ys=points.map(p=>h-10-((p-minV)/(maxV-minV))*(h-20));
  const path=points.map((p,i)=>(i?'L':'M')+xs[i]+','+ys[i]).join(' ');
  const fill=path+` L${xs[xs.length-1]},${h-10} L${xs[0]},${h-10} Z`;
  const zeroY=h-10-((0-minV)/(maxV-minV))*(h-20);
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:110px;display:block">
    <line x1="10" y1="${zeroY}" x2="${w-10}" y2="${zeroY}" stroke="var(--border)" stroke-dasharray="2,3"/>
    <path d="${fill}" fill="${deficit?'rgba(153,27,27,.12)':'rgba(22,101,52,.12)'}"/>
    <path d="${path}" fill="none" stroke="${deficit?'var(--danger)':'var(--success)'}" stroke-width="1.6"/>
  </svg>`;
}

// ===================== Cobrança =====================
let cobrancaFilter='';let selectedCase=null;
function renderCobrancaList(){
  const filtered=COBRANCA.filter(c=>!cobrancaFilter||c.prio===cobrancaFilter);
  document.querySelector('#cobranca-table tbody').innerHTML=filtered.map(c=>`
    <tr onclick="selectCobranca('${c.case}')" data-case="${c.case}" class="${selectedCase===c.case?'selected':''}">
      <td><span class="prio ${c.prio}">${c.prio}</span></td>
      <td class="mono" style="font-size:10px">${c.case.slice(-8)}</td>
      <td>${c.razao}</td>
      <td class="num">${fmtBRL(c.valor)}</td>
      <td class="num">${c.atraso}d</td>
      <td class="num">${(c.prob*100).toFixed(0)}%</td>
      <td class="text-secondary" style="font-size:11px">${c.estrategia}</td>
    </tr>`).join('');
}
document.querySelectorAll('#cobranca-tabs button').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('#cobranca-tabs button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    cobrancaFilter=b.dataset.prio;
    renderCobrancaList();
  });
});

function selectCobranca(caseId){
  selectedCase=caseId;
  const c=COBRANCA.find(x=>x.case===caseId);
  if(!c)return;
  renderCobrancaList();
  document.getElementById('cob-detail-id').textContent=c.case.slice(-10);

  // Histórico (timeline) — gerado de forma realista por caso
  const today=new Date();
  const dt=(d)=>{const x=new Date(today);x.setDate(x.getDate()-d);return x.toLocaleDateString('pt-BR')+' '+(8+Math.floor(rnd(d)*10))+':'+String(Math.floor(rnd(d*7)*60)).padStart(2,'0')};
  const timeline=[
    {t:dt(c.atraso+30),tag:'fatura',cls:'',txt:`fatura ${c.case.slice(-6).toUpperCase()} emitida · ${fmtBRL(c.valor)} · vencimento em 30d`},
    {t:dt(c.atraso+1),tag:'sistema',cls:'warn',txt:`fatura venceu sem pagamento · evento <code>atlas.payment.late.v2</code> publicado`},
    {t:dt(c.atraso),tag:'agente',cls:'',txt:`collection-strategy-v4.3 calculou estratégia · canal=${c.canal} · template=${c.template}`},
  ];
  if(c.atraso>=2)timeline.push({t:dt(c.atraso-1),tag:c.canal,cls:'',txt:`tentativa #1 · ${c.canal} · template ${c.template} · <span class="text-muted">sem resposta</span>`});
  if(c.atraso>=5)timeline.push({t:dt(c.atraso-3),tag:c.canal,cls:'',txt:`tentativa #2 · ${c.canal==='whatsapp'?'whatsapp visualizado às 14:22':'email aberto · sem clique'}`});
  if(c.atraso>=8)timeline.push({t:dt(c.atraso-5),tag:'cliente',cls:'success',txt:`cliente respondeu: "vou pagar até sexta" · classificação=<code>promessa_pagamento</code>`});
  if(c.atraso>=10)timeline.push({t:dt(c.atraso-7),tag:'sistema',cls:'warn',txt:`promessa expirou sem pagamento · estratégia escalou para <code>${c.canal==='whatsapp'?'firme':'ligação'}</code>`});
  if(c.atrasos12m>=3)timeline.push({t:dt(c.atraso-9),tag:'risco',cls:'err',txt:`reanálise disparada · score caiu de B → C · limite congelado`});

  // Comparativo de canais (uplift) — relativo ao perfil
  const uplift={
    whatsapp:0.31+rnd(c.atraso)*0.1,
    email:0.08+rnd(c.atraso*3)*0.05,
    sms:0.14+rnd(c.atraso*5)*0.06,
    ligacao:0.22+rnd(c.atraso*7)*0.08,
    boleto_2via:0.06+rnd(c.atraso*9)*0.04,
  };
  const recommended=c.canal;
  const channelOrder=['whatsapp','email','sms','ligacao','boleto_2via'];

  // Mensagem gerada baseada em tom + canal
  const greet=c.razao.split(' ').slice(0,2).join(' ');
  const msg=c.canal==='whatsapp'&&c.tom==='cordial'?`Olá, ${greet}! 👋 Identificamos a fatura <b>${c.case.slice(-6).toUpperCase()}</b> em aberto há ${c.atraso} ${c.atraso===1?'dia':'dias'}. Para facilitar, geramos um PIX-cobrança que você pode pagar direto pelo app do banco. Qualquer dúvida, é só responder por aqui que a gente ajuda.`
    :c.canal==='whatsapp'&&c.tom==='firme'?`Olá ${greet}, a fatura <b>${c.case.slice(-6).toUpperCase()}</b> está em aberto há ${c.atraso} dias. Para evitar restrição de crédito e cobrança externa, recomendamos a regularização hoje. PIX disponível abaixo. Caso precise renegociar, responda por aqui.`
    :c.canal==='email'?`Prezado(a) ${greet},\n\nIdentificamos que a fatura ${c.case.slice(-6).toUpperCase()} no valor de ${fmtBRL(c.valor)} permanece em aberto há ${c.atraso} dias. Para regularizar, acesse o portal pelo link abaixo ou utilize o PIX-cobrança.\n\nAtenciosamente,\nEquipe Atlas`
    :c.canal==='ligacao'?`[ligação humana — sem mensagem auto-gerada · roteiro sugerido pelo agente]`
    :c.canal==='sms'?`Atlas: fatura ${c.case.slice(-6).toUpperCase()} vence hoje. Pague pelo PIX: pix.atlas/${c.case.slice(-6)}`
    :`—`;

  document.getElementById('cobranca-detail').innerHTML=`
    <div class="tabs" id="cob-tabs">
      <div class="tab active" data-tab="resumo">Resumo</div>
      <div class="tab" data-tab="historico">Histórico</div>
      <div class="tab" data-tab="canais">Canais</div>
      <div class="tab" data-tab="mensagem">Mensagem</div>
    </div>

    <div class="tab-pane" data-pane="resumo" style="padding:0 18px">
      <div class="kv-row"><span class="k">caso</span><span class="v">${c.case}</span></div>
      <div class="kv-row"><span class="k">empresa</span><span class="v">${c.razao}<br><span class="text-muted" style="font-size:10px">${c.cnpj}</span></span></div>
      <div class="kv-row"><span class="k">fatura em aberto</span><span class="v">${fmtBRL(c.valor)} · ${c.atraso} ${c.atraso===1?'dia':'dias'} de atraso</span></div>
      <div class="kv-row"><span class="k">ticket médio mensal</span><span class="v">${fmtBRL(c.ticket)}</span></div>
      <div class="kv-row"><span class="k">atrasos 12m</span><span class="v">${c.atrasos12m} ocorrências</span></div>
      <div class="kv-row"><span class="k">tom inferido</span><span class="v">${c.tom} · <span class="text-muted">classifier-tom-v3</span></span></div>
      <hr class="divider"/>
      <div class="meta-line">por que essa estratégia?</div>
      <div style="font-size:12px;line-height:1.55;color:var(--text-secondary);margin-bottom:14px">
        <code>pay-prob-v4.3</code> projeta <b style="color:var(--text)">${(c.prob*100).toFixed(0)}% de pagamento espontâneo em 7 dias</b>. <code>channel-uplift-v2.5</code> aponta ${c.canal} como melhor canal (+${(uplift[c.canal]*100).toFixed(0)}pp). Tom <b>${c.tom}</b> escolhido pelo classifier baseado em ${c.atrasos12m} atrasos prévios e ticket de ${fmtBRLk(c.ticket)}. Template <code>${c.template}</code> aprovado pelo Jurídico em 2026-03.
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;padding-bottom:14px">
        <button class="btn btn-primary" style="flex:1">▸ Disparar agora</button>
        <button class="btn">Adiar 24h</button>
        <button class="btn">Renegociar</button>
        <button class="btn btn-ghost">Escalar humano</button>
      </div>
    </div>

    <div class="tab-pane" data-pane="historico" style="display:none;padding:14px 18px">
      <div class="meta-line">linha do tempo</div>
      <div class="timeline">
        ${timeline.map(t=>`
          <div class="tl-item ${t.cls}">
            <div class="tl-time">${t.t}</div>
            <div class="tl-text"><span class="tl-tag">${t.tag}</span>${t.txt}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="tab-pane" data-pane="canais" style="display:none;padding:14px 18px">
      <div class="meta-line">channel-uplift-v2.5.1 · uplift estimado em P(pagamento 7d)</div>
      ${channelOrder.map(ch=>`
        <div class="channel-row ${ch===recommended?'recommended':''}">
          <span class="channel-name">${ch}${ch===recommended?' <span class="text-accent" style="font-size:9px;font-weight:600">RECOMENDADO</span>':''}</span>
          <div class="channel-bar"><div class="channel-bar-fill" style="width:${uplift[ch]/Math.max(...Object.values(uplift))*100}%;background:${ch===recommended?'var(--accent)':'var(--text-muted)'}"></div></div>
          <span class="channel-uplift">+${(uplift[ch]*100).toFixed(0)}pp</span>
          <span class="channel-cost">${ch==='ligacao'?'R$ 4,80':ch==='whatsapp'?'R$ 0,11':ch==='sms'?'R$ 0,06':ch==='email'?'R$ 0,01':'R$ 0,30'}</span>
        </div>
      `).join('')}
      <hr class="divider"/>
      <div class="meta-line">políticas e restrições</div>
      <ul style="font-size:11px;color:var(--text-secondary);line-height:1.75;padding-left:16px;font-family:var(--mono)">
        <li>WhatsApp · janela 24h pós-conversa · template Meta-aprovado</li>
        <li>Ligação · seg-sex 09–18h · após 2 tentativas falhas em outros canais</li>
        <li>SMS · evitar após 21h e antes 08h (LGPD/regulatório)</li>
        <li>Limite diário por cliente: 1 ação principal + lembretes passivos</li>
      </ul>
    </div>

    <div class="tab-pane" data-pane="mensagem" style="display:none;padding:14px 18px">
      <div class="meta-line">${c.canal} · template ${c.template}</div>
      <div class="thread">
        ${c.canal==='whatsapp'?`
          <div class="bubble system">${dt(c.atraso-1).split(' ')[0]}</div>
          <div class="bubble us">${msg}<span class="bubble-meta">▶ não enviado · pendente aprovação</span></div>
        `:c.canal==='email'?`
          <div style="background:#fff;padding:14px;border-radius:6px;border:1px solid var(--border-subtle);font-family:var(--sans);font-size:12px;line-height:1.55;white-space:pre-line">${msg}</div>
        `:c.canal==='ligacao'?`
          <div style="font-size:12px;color:var(--text-secondary);font-style:italic;padding:18px;text-align:center">[ligação humana · roteiro entregue ao operador no callcenter]</div>
        `:`<div style="font-size:12.5px;background:#fff;padding:12px;border-radius:6px;border:1px solid var(--border-subtle)">${msg}</div>`}
      </div>
      <hr class="divider"/>
      <div class="meta-line">validações automáticas</div>
      <div class="kv-row"><span class="k">template match</span><span class="v text-success">ok · levenshtein 0.04</span></div>
      <div class="kv-row"><span class="k">pii check</span><span class="v text-success">ok</span></div>
      <div class="kv-row"><span class="k">jurídico</span><span class="v text-success">aprovado em 2026-03 · review #441</span></div>
      <div class="kv-row"><span class="k">tom-eval</span><span class="v text-success">${c.tom} · score 0.91</span></div>
      <div class="kv-row" style="border-bottom:0"><span class="k">llm</span><span class="v">claude-haiku · 287ms · R$ 0,011</span></div>
      <div style="display:flex;gap:6px;margin-top:14px;padding-bottom:14px">
        <button class="btn btn-primary" style="flex:1">Aprovar e disparar</button>
        <button class="btn">Editar</button>
        <button class="btn btn-ghost">Regenerar</button>
      </div>
    </div>
  `;
  document.querySelectorAll('#cob-tabs .tab').forEach(t=>{
    t.addEventListener('click',()=>{
      document.querySelectorAll('#cob-tabs .tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      document.querySelectorAll('.tab-pane').forEach(p=>p.style.display=p.dataset.pane===t.dataset.tab?'block':'none');
    });
  });
}

// ===================== Routing & LLM usage =====================
const ROUTES=[
  {l:'orchestrator → credit_risk',v:'68.412',pct:84,c:'#1d3557'},
  {l:'orchestrator → collection',v:'12.881',pct:54,c:'#1e40af'},
  {l:'credit → fraud (encadeado)',v:'68.412',pct:84,c:'#92400e'},
  {l:'credit → cashflow_fcst',v:'68.412',pct:84,c:'#166534'},
  {l:'→ pendente_humano (handoff)',v:'2.318',pct:14,c:'#5b21b6'},
  {l:'→ revenue_opt (batch)',v:'batch',pct:6,c:'#7a7468'}
];
function renderRouting(){
  document.getElementById('routing-bars').innerHTML=ROUTES.map(r=>`
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:11px;margin-bottom:4px"><span>${r.l}</span><span class="text-secondary">${r.v}</span></div>
      <div class="driver-bar"><div class="driver-bar-fill" style="width:${r.pct}%;background:${r.c}"></div></div>
    </div>`).join('')+`
    <hr class="divider"/>
    <div class="meta-line">divergências entre modelos · 24h</div>
    <div class="row" style="justify-content:space-between"><span class="mono">risk vs cashflow</span><span class="num">2.318 (3.4%)</span></div>
    <div class="row" style="justify-content:space-between"><span class="mono">risk vs llm-2nd-opinion</span><span class="num">441 (0.6%)</span></div>
    <div class="row" style="justify-content:space-between"><span class="mono">fraud-rules vs fraud-model</span><span class="num">89 (0.1%)</span></div>
    <hr class="divider"/>
    <div class="meta-line">policy ativa</div>
    <div class="mono" style="font-size:11px">policy-cred-2026-q2-r3</div>
    <div class="text-muted mono" style="font-size:10px">deployed 2026-04-08 · @ana.r + @leo.s</div>`;
}

const LLM_USAGE=[
  {m:'claude-haiku',d:'cobrança · classif',calls:'14.281',cost:'R$ 412,80'},
  {m:'claude-sonnet',d:'justificativas · 2nd op',calls:'2.118',cost:'R$ 1.108,40'},
  {m:'gpt-4o-mini',d:'fallback',calls:'389',cost:'R$ 31,12'},
  {m:'gpt-4o',d:'fallback sonnet',calls:'87',cost:'R$ 188,40'},
  {m:'llama-3.3-70b',d:'self-hosted · last-resort',calls:'12',cost:'R$ 6,80'}
];
function renderLLMUsage(){
  document.getElementById('llm-usage').innerHTML=LLM_USAGE.map((l,i)=>`
    <div class="row" style="justify-content:space-between;padding:8px 0;${i<LLM_USAGE.length-1?'border-bottom:1px solid var(--border-subtle)':''}">
      <div>
        <div class="mono" style="font-size:12px;font-weight:500">${l.m}</div>
        <div class="text-muted mono" style="font-size:10px">${l.d}</div>
      </div>
      <div style="text-align:right">
        <div class="num" style="font-size:13px;font-weight:500">${l.calls} calls</div>
        <div class="text-secondary mono" style="font-size:10px">${l.cost}</div>
      </div>
    </div>`).join('');
}

const DRIFT=[
  {f:'cashflow_volatilidade',psi:0.18,c:'warn'},
  {f:'atraso_medio_60d',psi:0.11,c:'ok'},
  {f:'tempo_relacionamento_meses',psi:0.04,c:'ok'},
  {f:'media_diaria_30d',psi:0.07,c:'ok'},
  {f:'score_serasa_pj',psi:0.09,c:'ok'},
  {f:'n_atrasos_12m',psi:0.13,c:'ok'},
  {f:'cnpj_idade_meses',psi:0.05,c:'ok'},
  {f:'razao_solicitado_faturamento',psi:0.21,c:'err'}
];
function renderDrift(){
  document.getElementById('drift-list').innerHTML=DRIFT.map(d=>`
    <div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-subtle)">
      <span class="mono" style="font-size:12px">${d.f}</span>
      <div class="row" style="gap:10px">
        <div class="driver-bar" style="width:120px"><div class="driver-bar-fill" style="width:${d.psi*333}%;background:${d.c==='err'?'var(--danger)':d.c==='warn'?'var(--warning)':'var(--success)'}"></div></div>
        <span class="num" style="width:42px;text-align:right;font-weight:500">${d.psi.toFixed(2)}</span>
      </div>
    </div>`).join('');
}

// ===================== Live event stream =====================
const EVENT_TEMPLATES=[
  {l:'INFO',m:'decision_emitted id=DEC-{ID} veredicto=APROVADO limite=R$ {LIM} total_latency_ms={LAT}'},
  {l:'INFO',m:'cobranca_strategy_emitted case=CASE-{ID} acao=pix_whatsapp_cordial canal=whatsapp uplift=0.31'},
  {l:'INFO',m:'payment_received case=CASE-{ID} valor=R$ {VAL} → reanalise_disparada'},
  {l:'WARN',m:'model_disagreement case=CASE-{ID} risk=approve cashflow=block policy_action=cap_60pct'},
  {l:'INFO',m:'bureau_call provider=serasa latency_ms={LAT} cache=miss status=200'},
  {l:'WARN',m:'data_inconsistency kind=faturamento_vs_openfinance diff_pct=0.31 flag=divergencia_faturamento'},
  {l:'INFO',m:'llm_call task=justificativa model=sonnet tokens_in=1842 tokens_out=187 latency_ms=151 cost_brl=0.038'},
  {l:'WARN',m:'llm_validation check=feature_grounding mentioned=4 validated=4 status=ok'},
  {l:'ERROR',m:'upstream_timeout provider=anthropic timeout_ms=4000 → fallback to=openai-gpt-4o'},
  {l:'INFO',m:'fraud_score case=CASE-{ID} score=0.08 block=false'},
  {l:'WARN',m:'cold_start_detected cnpj_age_months=4 of_authorized=false → cap_aplicado=R$ 8000'},
  {l:'INFO',m:'cache_hit type=semantic similarity=0.96 saved_brl=0.038'},
  {l:'INFO',m:'event_received topic=atlas.openfinance.transaction.v3 partition=12 offset=98231447'},
  {l:'WARN',m:'feature_completeness_low value=0.62 features_missing=[score_quod_pj]'},
  {l:'INFO',m:'human_review_required reason=fraud_score+llm_alert assigned=ana.r'},
  {l:'WARN',m:'idempotency_dedup_window event_id=evt-{ID} dropped=true reason=duplicate_60s'},
  {l:'ERROR',m:'webhook_signature_invalid origin=erp-omie-adapter → rejected'},
];
function makeEvent(tpl){
  const t=new Date(Date.now()-Math.floor(Math.random()*60000));
  const time=t.toISOString().slice(11,19);
  const msg=tpl.m.replace('{ID}',hex(Math.random())).replace('{LIM}',(Math.floor(Math.random()*200)*1000).toLocaleString('pt-BR')).replace('{LAT}',Math.floor(50+Math.random()*900)).replace('{VAL}',(Math.floor(Math.random()*50)*100).toLocaleString('pt-BR'));
  const colored=msg.replace(/(case=|id=|provider=|model=|topic=|cnpj=)([A-Za-z0-9._-]+)/g,'<span class="k">$1</span><span class="hl">$2</span>').replace(/(latency_ms=|cost_brl=|score=|tokens_in=|tokens_out=|valor=R\$ |limite=R\$ )([0-9.,]+)/g,'<span class="k">$1</span><span class="v">$2</span>');
  return {time,level:tpl.l,msg:colored};
}
let evtCount=0;
function pushEvent(){
  const stream=document.getElementById('event-stream');
  if(!stream)return;
  const tpl=EVENT_TEMPLATES[Math.floor(Math.random()*EVENT_TEMPLATES.length)];
  const e=makeEvent(tpl);
  const div=document.createElement('div');
  div.className='log-line';
  div.innerHTML=`<span class="log-time">${e.time}</span><span class="log-level ${e.level}">${e.level}</span><span class="log-msg">${e.msg}</span>`;
  stream.insertBefore(div,stream.firstChild);
  if(stream.childElementCount>40)stream.lastChild.remove();
  evtCount++;
  const c=document.getElementById('event-counter');
  if(c)c.textContent=evtCount;
}

// ===================== Agent log =====================
const AGENT_LOG_TEMPLATES=[
  {t:'all',l:'INFO',m:'orchestrator.node_enter node=credit_risk case=CASE-{ID} state=hot_path'},
  {t:'all',l:'INFO',m:'credit_risk.score pd_90d=0.087 limite_sugerido=R$ 65000 model=risk-pj-v7.4.2 latency_ms=22'},
  {t:'all',l:'INFO',m:'cashflow_fcst.forecast cashflow_min_30d=-4200 deficit_days=22 alert=true'},
  {t:'conflict',l:'WARN',m:'model_disagreement risk_vs_cashflow case=CASE-{ID} risk=approve cashflow=block delta_limite=R$ 26000'},
  {t:'all',l:'INFO',m:'policy.apply rule=cap_cashflow_60pct from=R$ 65000 to=R$ 39000'},
  {t:'llm',l:'INFO',m:'llm_router.call task=justificativa model=claude-sonnet tokens=2029 latency_ms=151'},
  {t:'llm',l:'WARN',m:'llm_validation grounding mentioned=5 validated=4 unbounded=cashflow_min_30d → regenerated'},
  {t:'conflict',l:'WARN',m:'fraud_rules_vs_model rules=ok model_score=0.34 → escalate_to_llm_2nd_opinion'},
  {t:'conflict',l:'WARN',m:'llm_2nd_opinion alert=true reason="4 contrapartes recém-cadastradas em 30d" → handoff=human_review'},
  {t:'error',l:'ERROR',m:'upstream_timeout provider=anthropic route=justificativa attempt=1 timeout_ms=4000'},
  {t:'error',l:'WARN',m:'fallback_triggered from=anthropic-sonnet to=openai-gpt-4o cost_delta=+R$ 0.018'},
  {t:'error',l:'ERROR',m:'bureau_outage provider=serasa retries_exhausted=3 → fallback bureau_missing=true'},
  {t:'all',l:'INFO',m:'collection.strategize case=CASE-{ID} pay_prob=0.62 channel=whatsapp uplift=0.31'},
  {t:'all',l:'INFO',m:'orchestrator.persist case=CASE-{ID} state=decision_emitted'},
  {t:'conflict',l:'WARN',m:'data_inconsistency type=razao_social_diff source=receita vs bureau → trust=receita'},
  {t:'all',l:'INFO',m:'cache_hit type=exact ttl_remaining=14h savings=R$ 0.038'},
  {t:'error',l:'ERROR',m:'feature_store.miss key=cashflow_volatilidade → using_default_with_flag'},
  {t:'all',l:'INFO',m:'orchestrator.transition from=credit_risk to=fraud edge=conditional condition=valor>10000'},
  {t:'conflict',l:'WARN',m:'shadow_disagreement champion=v7.4.2(R$ 48k) challenger=v8-rc1(R$ 52k) recorded'},
  {t:'all',l:'INFO',m:'decision_emitted id=DEC-{ID} veredicto=APROVADO_COM_RESTRICAO total_latency_ms=612 cost=R$ 0.081'},
  {t:'llm',l:'INFO',m:'llm_router.call task=mensagem_cobranca model=haiku tokens=380 latency_ms=287 cost=R$ 0.011'},
  {t:'llm',l:'WARN',m:'levenshtein_distance template=TPL-COBR-CORDIAL-PIX-V12 distance=0.18 → fallback_to_template'},
];
let agentFilter='all';
function pushAgentEvent(){
  const agentLog=document.getElementById('agent-log');
  if(!agentLog)return;
  const pool=AGENT_LOG_TEMPLATES.filter(t=>agentFilter==='all'||t.t===agentFilter);
  const tpl=pool[Math.floor(Math.random()*pool.length)];
  if(!tpl)return;
  const e=makeEvent(tpl);
  const div=document.createElement('div');
  div.className='log-line';
  div.innerHTML=`<span class="log-time">${e.time}</span><span class="log-level ${e.level}">${e.level}</span><span class="log-msg">${e.msg}</span>`;
  agentLog.insertBefore(div,agentLog.firstChild);
  if(agentLog.childElementCount>60)agentLog.lastChild.remove();
}
document.querySelectorAll('#agent-log-filter button').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('#agent-log-filter button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    agentFilter=b.dataset.flt;
    document.getElementById('agent-log').innerHTML='';
    for(let i=0;i<24;i++)pushAgentEvent();
  });
});

// ===================== Init =====================
renderDashboard('24h');
renderEmpresas();
renderCobrancaList();
renderRouting();
renderLLMUsage();
renderDrift();
renderLatencyChart();
for(let i=0;i<14;i++)pushEvent();
for(let i=0;i<28;i++)pushAgentEvent();
setInterval(pushEvent,1400+Math.random()*1200);
setInterval(pushAgentEvent,900+Math.random()*900);
