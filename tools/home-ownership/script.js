const $ = id => document.getElementById(id);
let currentMode = 'mortgage';
let mortgageView = 'balance';
let compareView = 'networth';
let currentTerm = 30;
let loanChart, compareChart;
let syncing = false;

function fmt(n){ return n.toLocaleString('en-US', {style:'currency', currency:'USD', maximumFractionDigits:0}); }
function fmt2(n){ return n.toLocaleString('en-US', {style:'currency', currency:'USD', maximumFractionDigits:2}); }

/* ---------- Mode switching ---------- */
document.querySelectorAll('.view-tab-btn[data-mode]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.view-tab-btn[data-mode]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    setMode(currentMode);
  });
});

function setMode(mode){
  const isCompare = mode === 'compare';
  document.querySelectorAll('.compare-only').forEach(el => el.classList.toggle('hidden', !isCompare));
  $('mortgageResults').classList.toggle('hidden', isCompare);
  $('compareResults').classList.toggle('hidden', !isCompare);$('footerMortgage').classList.toggle('hidden', isCompare);
  $('footerCompare').classList.toggle('hidden', !isCompare);$('pageTitle').textContent = isCompare ? 'Rent vs. Buy Calculator' : 'Mortgage Calculator';
  $('pageTag').textContent = isCompare ? 'Wealth Comparison Ledger' : 'Amortization Ledger';
  $('loanCardTitle').textContent = isCompare ? 'Home & Loan Basics' : 'Loan Details';
  updateAll();
}

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
  $('maintPct').value = 1;
  $('closingPct').value = 3;
  $('sellingPct').value = 7;
  $('appreciation').value = 3.5;
  $('rent').value = 2400;
  $('rentGrowth').value = 3;
  $('investReturn').value = 7;
  $('years').value = 7;
  $('yearsLabel').textContent = '7';
  updateAll();
}

/* ---------- Shared field syncing (price / down $ / down %) ---------- */
$('down').addEventListener('input', () => {
  if (syncing) return;
  syncing = true;
  const price = parseFloat($('price').value) || 0;
  const down = parseFloat($('down').value) || 0;
  $('downPct').value = price > 0 ? (down/price*100).toFixed(1) : 0;
  syncing = false;
  updateAll();
});
$('downPct').addEventListener('input', () => {
  if (syncing) return;
  syncing = true;
  const price = parseFloat($('price').value) || 0;
  const pct = parseFloat($('downPct').value) || 0;
  $('down').value = Math.round(price * pct/100);
  syncing = false;
  updateAll();
});
$('price').addEventListener('input', () => {
  syncing = true;
  const price = parseFloat($('price').value) || 0;
  const pct = parseFloat($('downPct').value) || 0;
  $('down').value = Math.round(price * pct/100);
  syncing = false;
  updateAll();
});

document.querySelectorAll('.term-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.term-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentTerm = parseInt(btn.dataset.term);
    updateAll();
  });
});

['rate','taxPct','taxMonthly','insurance','hoa','pmiRate',
 'maintPct','closingPct','sellingPct','appreciation',
 'rent','rentGrowth','investReturn'].forEach(id=>{
  $(id).addEventListener('input', updateAll);
});

const yearsInput = $('years');
yearsInput.addEventListener('input', ()=>{
  $('yearsLabel').textContent = yearsInput.value;
  updateAll();
});

/* ---------- Mortgage calculation ---------- */
function calcMortgage(){
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
    schedule.push({ month:m, payment: principalPortion + interestPortion, principal: principalPortion, interest: interestPortion, balance: balance, pmi: monthlyPMI });
  }

  const firstMonthPMI = schedule.length ? schedule[0].pmi : 0;

  return { loanAmount, payment, totalInterest, schedule, months, monthlyTax, insurance, hoa, firstMonthPMI, needsPMI };
}

function renderMortgageResults(r){
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

function renderMortgageTable(schedule){
  const body = $('scheduleBody');
  body.innerHTML = '';
  schedule.forEach(row => {
    const tr = document.createElement('tr');
    if (row.month % 12 === 0) tr.style.fontWeight = '600';
    tr.innerHTML = `<td>${row.month}</td><td>${fmt2(row.payment)}</td><td>${fmt2(row.principal)}</td><td>${fmt2(row.interest)}</td><td>${fmt2(row.balance)}</td>`;
    body.appendChild(tr);
  });
}

/* ---------- Compare (Rent vs Buy) calculation ---------- */
function calcCompare(){
  const price = parseFloat($('price').value) || 0;
  const downPct = parseFloat($('downPct').value) || 0;
  const mortRate = parseFloat($('rate').value) || 0;
  const taxPct = parseFloat($('taxPct').value) || 0;
  const insurance = parseFloat($('insurance').value) || 0;
  const hoa = parseFloat($('hoa').value) || 0;
  const pmiRate = parseFloat($('pmiRate').value) || 0;
  const maintPct = parseFloat($('maintPct').value) || 0;
  const closingPct = parseFloat($('closingPct').value) || 0;
  const sellingPct = parseFloat($('sellingPct').value) || 0;
  const appreciation = parseFloat($('appreciation').value) || 0;

  const rentStart = parseFloat($('rent').value) || 0;
  const rentGrowth = parseFloat($('rentGrowth').value) || 0;
  const investReturn = parseFloat($('investReturn').value) || 0;

  const years = parseInt($('years').value) || 1;
  const totalMonths = years * 12;

  const downPayment = price * downPct/100;
  const loanAmount = price - downPayment;
  const closingCosts = price * closingPct/100;
  const monthlyMortRate = (mortRate/100)/12;
  const mortMonths = currentTerm * 12;
  const needsPMI = downPct < 20;
  const pmiThreshold = price * 0.8;

  let mortgagePayment;
  if (monthlyMortRate === 0){
    mortgagePayment = loanAmount / mortMonths;
  } else {
    mortgagePayment = loanAmount * (monthlyMortRate * Math.pow(1+monthlyMortRate, mortMonths)) / (Math.pow(1+monthlyMortRate, mortMonths) - 1);
  }
  if (!isFinite(mortgagePayment)) mortgagePayment = 0;

  let renterPortfolio = downPayment + closingCosts;
  let mortgageBalance = loanAmount;
  let homeValue = price;
  let currentRent = rentStart;
  const monthlyInvestReturn = investReturn/100/12;

  const yearlyData = [];
  let firstMonthBuyCost = null, firstMonthRentCost = null;

  for (let m = 1; m <= totalMonths; m++){
    const yearIndex = Math.floor((m-1)/12);
    if (m > 1 && (m-1) % 12 === 0){
      currentRent = rentStart * Math.pow(1 + rentGrowth/100, yearIndex);
    } else if (m === 1){
      currentRent = rentStart;
    }

    const monthlyTax = (homeValue * taxPct/100)/12;
    const monthlyMaint = (homeValue * maintPct/100)/12;
    const interestPortion = mortgageBalance * monthlyMortRate;
    let principalPortion = mortgagePayment - interestPortion;
    if (m === mortMonths) principalPortion = mortgageBalance;
    if (mortgageBalance <= 0){ principalPortion = 0; }
    const actualMortgagePayment = mortgageBalance > 0 ? (principalPortion + interestPortion) : 0;
    const monthlyPMI = (needsPMI && mortgageBalance > pmiThreshold) ? (loanAmount * pmiRate/100)/12 : 0;
    mortgageBalance = Math.max(mortgageBalance - principalPortion, 0);

    const buyMonthlyCost = actualMortgagePayment + monthlyTax + insurance + hoa + monthlyMaint + monthlyPMI;
    const rentMonthlyCost = currentRent;

    if (firstMonthBuyCost === null){ firstMonthBuyCost = buyMonthlyCost; firstMonthRentCost = rentMonthlyCost; }

    const diff = buyMonthlyCost - rentMonthlyCost;
    renterPortfolio *= (1 + monthlyInvestReturn);
    if (diff > 0){ renterPortfolio += diff; }

    homeValue *= Math.pow(1 + appreciation/100, 1/12);

    if (m % 12 === 0){
      const equity = homeValue - mortgageBalance - (homeValue * sellingPct/100);
      yearlyData.push({ year: m/12, buyMonthly: buyMonthlyCost, rentMonthly: rentMonthlyCost, buyNetWorth: equity, rentNetWorth: renterPortfolio, homeValue, mortgageBalance });
    }
  }

  const final = yearlyData[yearlyData.length-1];

  let breakevenYear = null;
  for (const row of yearlyData){
    if (row.buyNetWorth >= row.rentNetWorth){ breakevenYear = row.year; break; }
  }

  return { yearlyData, final, breakevenYear, firstMonthBuyCost, firstMonthRentCost, downPayment, closingCosts };
}

function renderCompareVerdict(r){
  const diff = r.final.buyNetWorth - r.final.rentNetWorth;
  const buyWins = diff >= 0;
  const headline = $('verdictHeadline');
  const sub = $('verdictSub');
  if (buyWins){
    headline.innerHTML = `Buying looks better by <span style="color: #3F6B4E;">${fmt(Math.abs(diff))}</span>`;
  } else {
    headline.innerHTML = `Renting looks better by <span style="color: #3F6B4E;">${fmt(Math.abs(diff))}</span>`;
  }
  sub.textContent = `Based on projected net worth after ${r.final.year} year${r.final.year==1?'':'s'}`;
}

function renderCompareResults(r){
  $('outBuyNet').textContent = fmt(r.final.buyNetWorth);
  $('outRentNet').textContent = fmt(r.final.rentNetWorth);$('outBuyDetail').textContent = `Home value ${fmt(r.final.homeValue)} − mortgage balance ${fmt(r.final.mortgageBalance)} − selling costs`;
  $('outRentDetail').textContent = `${fmt(r.downPayment + r.closingCosts)} upfront + monthly savings, invested`;
}

function renderCompareTable(yearlyData){
  const body = $('compareScheduleBody');
  body.innerHTML = '';
  yearlyData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.year}</td><td>${fmt2(row.buyMonthly)}</td><td>${fmt2(row.rentMonthly)}</td><td>${fmt2(row.buyNetWorth)}</td><td>${fmt2(row.rentNetWorth)}</td>`;
    body.appendChild(tr);
  });
}

/* ---------- Chart helpers ---------- */
function getThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    ink: styles.getPropertyValue('--ink').trim() || '#1C2430',
    soft: styles.getPropertyValue('--ink-soft').trim() || '#5B6472',
    border: styles.getPropertyValue('--border').trim() || '#D8D3C7',
    palette: ['#2C3E50', '#B8860B', '#9B6B43', '#4A7C6C', '#7A8B99', '#9B2C2C']
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

function buildMortgageChartConfig(schedule, view, colors){
  const labels = schedule.map(r => r.month);

  if (view === 'balance'){
    return { type:'line', data:{ labels, datasets:[{ label:'Remaining Balance', data: schedule.map(r=>r.balance.toFixed(2)), borderColor: colors.ink, backgroundColor: colors.ink + '15', fill:true, tension:0.15, pointRadius:0, borderWidth:2.5 }] }, options: baseOptions('Month','Balance ($)', colors) };
  }
  if (view === 'split'){
    const opts = baseOptions('Month','Payment ($)', colors);
    opts.scales.x.stacked = true;
    opts.scales.y.stacked = true;
    return { type:'bar', data:{ labels, datasets:[
      {label:'Principal', data: schedule.map(r=>r.principal.toFixed(2)), backgroundColor: colors.ink, stack:'s'},
      {label:'Interest', data: schedule.map(r=>r.interest.toFixed(2)), backgroundColor: '#B8860B', stack:'s'}
    ] }, options: opts };
  }
  let cumPrincipal = 0, cumInterest = 0;
  const cumP = [], cumI = [];
  schedule.forEach(r=>{ cumPrincipal += r.principal; cumInterest += r.interest; cumP.push(cumPrincipal.toFixed(2)); cumI.push(cumInterest.toFixed(2)); });
  return { type:'line', data:{ labels, datasets:[
    {label:'Cumulative Principal Paid', data: cumP, borderColor: colors.ink, backgroundColor: colors.ink + '15', fill:true, tension:0.15, pointRadius:0, borderWidth:2.5},
    {label:'Cumulative Interest Paid', data: cumI, borderColor: '#B8860B', backgroundColor: 'rgba(184,134,11,0.12)', fill:true, tension:0.15, pointRadius:0, borderWidth:2.5}
  ] }, options: baseOptions('Month','Total Paid ($)', colors) };
}

function renderMortgageChart(schedule){
  if (!document.getElementById('loanChart')) return;
  const cfg = buildMortgageChartConfig(schedule, mortgageView, getThemeColors());
  if (loanChart) loanChart.destroy();
  loanChart = new Chart(document.getElementById('loanChart').getContext('2d'), cfg);
}

function buildCompareChartConfig(yearlyData, view, colors){
  const labels = yearlyData.map(r => r.year);

  if (view === 'networth'){
    return { type:'line', data:{ labels, datasets:[
      {label:'Net Worth (Buy)', data: yearlyData.map(r=>r.buyNetWorth.toFixed(2)), borderColor: colors.ink, backgroundColor: 'transparent', fill:false, tension:0.2, pointRadius:0, borderWidth:2.5},
      {label:'Net Worth (Rent)', data: yearlyData.map(r=>r.rentNetWorth.toFixed(2)), borderColor: '#9B6B43', backgroundColor: 'transparent', fill:false, tension:0.2, pointRadius:0, borderWidth:2.5}
    ] }, options: baseOptions('Year','Net Worth ($)', colors) };
  }
  if (view === 'monthly'){
    return { type:'line', data:{ labels, datasets:[
      {label:'Buy — Monthly Cost', data: yearlyData.map(r=>r.buyMonthly.toFixed(2)), borderColor: colors.ink, backgroundColor: 'transparent', fill:false, tension:0.2, pointRadius:0, borderWidth:2.5},
      {label:'Rent — Monthly Cost', data: yearlyData.map(r=>r.rentMonthly.toFixed(2)), borderColor: '#9B6B43', backgroundColor: 'transparent', fill:false, tension:0.2, pointRadius:0, borderWidth:2.5}
    ] }, options: baseOptions('Year','Monthly Cost ($)', colors) };
  }
  let cumBuy = 0, cumRent = 0;
  const cumBuyArr = [], cumRentArr = [];
  yearlyData.forEach(r=>{ cumBuy += r.buyMonthly * 12; cumRent += r.rentMonthly * 12; cumBuyArr.push(cumBuy.toFixed(2)); cumRentArr.push(cumRent.toFixed(2)); });
  return { type:'line', data:{ labels, datasets:[
    {label:'Cumulative Cost (Buy)', data: cumBuyArr, borderColor: colors.ink, backgroundColor: colors.ink + '15', fill:true, tension:0.15, pointRadius:0, borderWidth:2.5},
    {label:'Cumulative Cost (Rent)', data: cumRentArr, borderColor: '#9B6B43', backgroundColor: 'rgba(155,107,67,0.1)', fill:true, tension:0.15, pointRadius:0, borderWidth:2.5}
  ] }, options: baseOptions('Year','Cumulative Cash Spent ($)', colors) };
}

function renderCompareChart(yearlyData){
  if (!document.getElementById('compareChart')) return;
  const cfg = buildCompareChartConfig(yearlyData, compareView, getThemeColors());
  if (compareChart) compareChart.destroy();
  compareChart = new Chart(document.getElementById('compareChart').getContext('2d'), cfg);
}

/* ---------- Chart view toggles ---------- */
document.querySelectorAll('[data-mview]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('[data-mview]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    mortgageView = btn.dataset.mview;
    const subs = { balance:'Remaining loan balance over the life of the mortgage', split:'How much of each payment goes to principal vs. interest', cumulative:'Running total of principal and interest paid to date' };
    $('mortgageChartSub').textContent = subs[mortgageView];
    updateAll();
  });
});
document.querySelectorAll('[data-cview]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('[data-cview]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    compareView = btn.dataset.cview;
    const subs = { networth:'Projected net worth under each scenario, year by year', monthly:'Out-of-pocket monthly cost under each scenario', cumulative:'Total cash spent (not invested) under each scenario over time' };
    $('compareChartSub').textContent = subs[compareView];
    updateAll();
  });
});

/* ---------- Master update ---------- */
function updateAll(){
  const mortgageR = calcMortgage();
  renderMortgageResults(mortgageR);
  renderMortgageTable(mortgageR.schedule);

  const compareR = calcCompare();
  renderCompareVerdict(compareR);
  renderCompareResults(compareR);
  renderCompareTable(compareR.yearlyData);

  if (currentMode === 'mortgage'){
    renderMortgageChart(mortgageR.schedule);
  } else {
    renderCompareChart(compareR.yearlyData);
  }
}

updateAll();