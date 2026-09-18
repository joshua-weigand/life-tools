const $ = id => document.getElementById(id);
let chart;
let currentView = 'balance';
let currentTerm = 30;
let syncing = false;

function fmt(n){
  return n.toLocaleString('en-US', {style:'currency', currency:'USD', maximumFractionDigits:0});
}
function fmt2(n){
  return n.toLocaleString('en-US', {style:'currency', currency:'USD', maximumFractionDigits:2});
}

// keep down payment $and \% in sync
$('down').addEventListener('input', () => {
  if (syncing) return;
  syncing = true;
  const price = parseFloat($('price').value) || 0;
  const down = parseFloat($('down').value) || 0;
  $('downPct').value = price > 0 ? (down/price*100).toFixed(1) : 0;
  syncing = false;
  update();
});
$('downPct').addEventListener('input', () => {
  if (syncing) return;
  syncing = true;
  const price = parseFloat($('price').value) || 0;
  const pct = parseFloat($('downPct').value) || 0;
  $('down').value = Math.round(price * pct/100);
  syncing = false;
  update();
});
$('price').addEventListener('input', () => {
  syncing = true;
  const price = parseFloat($('price').value) || 0;
  const pct = parseFloat($('downPct').value) || 0;
  $('down').value = Math.round(price * pct/100);
  syncing = false;
  update();
});

document.querySelectorAll('.term-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.term-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentTerm = parseInt(btn.dataset.term);
    update();
  });
});

['rate','taxPct','taxMonthly','insurance','hoa','pmiRate'].forEach(id=>{
  $(id).addEventListener('input', update);
});

function resetData() {
  $('price').value = 450000;
  $('down').value = 90000;
  $('downPct').value = 20;
  $('rate').value = 6.75;
  currentTerm = 30;
  document.querySelectorAll('.term-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.term === '30');
  });
  $('taxPct').value = 1.1;
  $('taxMonthly').value = 0;
  $('insurance').value = 150;
  $('hoa').value = 0;
  $('pmiRate').value = 0.6;
  update();
}

function calculate(){
  const price = parseFloat($('price').value) || 0;
  const down = parseFloat($('down').value) || 0;
  const rate = parseFloat($('rate').value) || 0;
  const months = currentTerm * 12;
  const taxPct = parseFloat($('taxPct').value) || 0;
  const taxMonthlyOverride = parseFloat($('taxMonthly').value) || 0;
  const insurance = parseFloat($('insurance').value) || 0;
  const hoa = parseFloat($('hoa').value) || 0;
  const pmiRate = parseFloat($('pmiRate').value) || 0;

  const loanAmount = Math.max(price - down, 0);
  const downPct = price > 0 ? (down/price*100) : 0;
  const monthlyRate = (rate/100)/12;

  let payment;
  if (monthlyRate === 0){
    payment = loanAmount / months;
  } else {
    payment = loanAmount * (monthlyRate * Math.pow(1+monthlyRate, months)) / (Math.pow(1+monthlyRate, months) - 1);
  }
  if (!isFinite(payment)) payment = 0;

  const monthlyTax = taxMonthlyOverride > 0 ? taxMonthlyOverride : (price * taxPct/100)/12;
  const pmiThreshold = price * 0.8;
  const needsPMI = downPct < 20;

  let balance = loanAmount;
  let totalInterest = 0;
  const schedule = [];
  for (let m=1; m<=months; m++){
    const interestPortion = balance * monthlyRate;
    let principalPortion = payment - interestPortion;
    if (m === months) principalPortion = balance;
    const monthlyPMI = (needsPMI && balance > pmiThreshold) ? (loanAmount * pmiRate/100)/12 : 0;
    balance = Math.max(balance - principalPortion, 0);
    totalInterest += interestPortion;
    schedule.push({
      month: m,
      payment: principalPortion + interestPortion,
      principal: principalPortion,
      interest: interestPortion,
      balance: balance,
      pmi: monthlyPMI
    });
  }

  const firstMonthPMI = schedule.length ? schedule[0].pmi : 0;

  return {
    loanAmount, payment, totalInterest, schedule, months,
    monthlyTax, insurance, hoa, firstMonthPMI, needsPMI
  };
}

function renderResults(r){
  const totalMonthly = r.payment + r.monthlyTax + r.insurance + r.hoa + r.firstMonthPMI;
  $('outMonthly').textContent = fmt2(totalMonthly);$('outLoanAmount').textContent = fmt(r.loanAmount);
  $('outInterest').textContent = fmt(r.totalInterest);$('outTotalCost').textContent = fmt(r.loanAmount + r.totalInterest);

  const parts = [
    {label:'Principal & Interest', val:r.payment, color:'var(--ink)'},
    {label:'Tax', val:r.monthlyTax, color:'#7A8B99'},
    {label:'Insurance', val:r.insurance, color:'#9B6B43'},
  ];
  if (r.hoa > 0) parts.push({label:'HOA', val:r.hoa, color:'#6B7280'});
  if (r.needsPMI && r.firstMonthPMI > 0) parts.push({label:'PMI', val:r.firstMonthPMI, color:'#9B2C2C'});

  $('breakdownInline').innerHTML = parts.map(p=>
    `<span style="display:flex; align-items:center; gap:5px;"><span style="width:8px; height:8px; border-radius:50%; background:${p.color}; display:inline-block;"></span>${p.label}: ${fmt2(p.val)}</span>`
  ).join('');

  $('downHelper').textContent = r.needsPMI
    ? 'Less than 20% down — PMI applies until balance reaches 80% of home price'
    : '20%+ down — no PMI required';
}

function renderTable(schedule){
  const body = $('scheduleBody');
  body.innerHTML = '';
  schedule.forEach(row => {
    const tr = document.createElement('tr');
    if (row.month % 12 === 0) tr.style.fontWeight = '600';
    tr.innerHTML = `
      <td>${row.month}</td>
      <td>${fmt2(row.payment)}</td>
      <td>${fmt2(row.principal)}</td>
      <td>${fmt2(row.interest)}</td>
      <td>${fmt2(row.balance)}</td>
    `;
    body.appendChild(tr);
  });
}

function getThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    ink: styles.getPropertyValue('--ink').trim() || '#1C2430',
    soft: styles.getPropertyValue('--ink-soft').trim() || '#5B6472',
    border: styles.getPropertyValue('--border').trim() || '#D8D3C7'
  };
}

function baseOptions(xLabel, yLabel, colors){
  return {
    responsive:true,
    maintainAspectRatio:false,
    interaction:{mode:'index', intersect:false},
    plugins:{
      legend:{ labels:{ color: colors.soft, font:{ family:'inherit' } } },
      tooltip:{ callbacks:{ label: ctx => `${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})}` } }
    },
    scales:{
      x:{title:{display:true, text:xLabel||'Month', color:colors.soft}, grid:{color:colors.border}, ticks:{color:colors.soft, maxTicksLimit:12}},
      y:{title:{display:true, text:yLabel||'', color:colors.soft}, grid:{color:colors.border}, ticks:{color:colors.soft, callback:v=>'$'+Number(v).toLocaleString()}}
    }
  };
}

function buildChartConfig(schedule, view, colors){
  const labels = schedule.map(r => r.month);

  if (view === 'balance'){
    return {
      type:'line',
      data:{
        labels,
        datasets:[{
          label:'Remaining Balance',
          data: schedule.map(r=>r.balance.toFixed(2)),
          borderColor: colors.ink,
          backgroundColor: colors.ink + '15',
          fill:true,
          tension:0.15,
          pointRadius:0,
          borderWidth:2.5
        }]
      },
      options: baseOptions('Month','Balance ($)', colors)
    };
  }

  if (view === 'split'){
    const opts = baseOptions('Month','Payment ($)', colors);
    opts.scales.x.stacked = true;
    opts.scales.y.stacked = true;
    return {
      type:'bar',
      data:{
        labels,
        datasets:[
          {label:'Principal', data: schedule.map(r=>r.principal.toFixed(2)), backgroundColor: colors.ink, stack:'s'},
          {label:'Interest', data: schedule.map(r=>r.interest.toFixed(2)), backgroundColor: '#B8860B', stack:'s'}
        ]
      },
      options: opts
    };
  }

  let cumPrincipal = 0, cumInterest = 0;
  const cumP = [], cumI = [];
  schedule.forEach(r=>{
    cumPrincipal += r.principal;
    cumInterest += r.interest;
    cumP.push(cumPrincipal.toFixed(2));
    cumI.push(cumInterest.toFixed(2));
  });
  return {
    type:'line',
    data:{
      labels,
      datasets:[
        {label:'Cumulative Principal Paid', data: cumP, borderColor: colors.ink, backgroundColor: colors.ink + '15', fill:true, tension:0.15, pointRadius:0, borderWidth:2.5},
        {label:'Cumulative Interest Paid', data: cumI, borderColor: '#B8860B', backgroundColor: 'rgba(184,134,11,0.12)', fill:true, tension:0.15, pointRadius:0, borderWidth:2.5}
      ]
    },
    options: baseOptions('Month','Total Paid ($)', colors)
  };
}

function renderChart(schedule){
  if (!document.getElementById('loanChart')) return;
  const cfg = buildChartConfig(schedule, currentView, getThemeColors());
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('loanChart').getContext('2d'), cfg);
}

document.querySelectorAll('[data-view]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    const subs = {
      balance:'Remaining loan balance over the life of the mortgage',
      split:'How much of each payment goes to principal vs. interest',
      cumulative:'Running total of principal and interest paid to date'
    };
    $('chartSub').textContent = subs[currentView];
    update();
  });
});

function update(){
  const r = calculate();
  renderResults(r);
  renderTable(r.schedule);
  renderChart(r.schedule);
}

update();