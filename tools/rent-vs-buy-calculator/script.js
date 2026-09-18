const $ = id => document.getElementById(id);
let chart;
let currentView = 'networth';
let mortgageTerm = 30;

function fmt(n){
  return n.toLocaleString('en-US', {style:'currency', currency:'USD', maximumFractionDigits:0});
}
function fmt2(n){
  return n.toLocaleString('en-US', {style:'currency', currency:'USD', maximumFractionDigits:2});
}

document.querySelectorAll('[data-term]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('[data-term]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    mortgageTerm = parseInt(btn.dataset.term);
    update();
  });
});

document.querySelectorAll('.view-tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.view-tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    const subs = {
      networth:'Projected net worth under each scenario, year by year',
      monthly:'Out-of-pocket monthly cost under each scenario',
      cumulative:'Total cash spent (not invested) under each scenario over time'
    };
    $('chartSub').textContent = subs[currentView];
    update();
  });
});

const yearsInput = $('years');
yearsInput.addEventListener('input', ()=>{
  $('yearsLabel').textContent = yearsInput.value;
  update();
});

function resetData() {
  $('price').value = 450000;
  $('downPct').value = 20;
  $('mortRate').value = 6.75;
  mortgageTerm = 30;
  document.querySelectorAll('[data-term]').forEach(b => {
    b.classList.toggle('active', b.dataset.term === '30');
  });
  $('taxPct').value = 1.1;
  $('insurance').value = 150;
  $('hoa').value = 0;
  $('maintPct').value = 1;
  $('closingPct').value = 3;
  $('sellingPct').value = 7;
  $('appreciation').value = 3.5;
  $('rent').value = 2400;
  $('rentGrowth').value = 3;
  $('investReturn').value = 7;
  yearsInput.value = 7;
  $('yearsLabel').textContent = '7';
  update();
}

['price','downPct','mortRate','taxPct','insurance','hoa','maintPct','closingPct','sellingPct','appreciation',
 'rent','rentGrowth','investReturn'].forEach(id=>{
  $(id).addEventListener('input', update);
});

function calculate(){
  const price = parseFloat($('price').value) || 0;
  const downPct = parseFloat($('downPct').value) || 0;
  const mortRate = parseFloat($('mortRate').value) || 0;
  const taxPct = parseFloat($('taxPct').value) || 0;
  const insurance = parseFloat($('insurance').value) || 0;
  const hoa = parseFloat($('hoa').value) || 0;
  const maintPct = parseFloat($('maintPct').value) || 0;
  const closingPct = parseFloat($('closingPct').value) || 0;
  const sellingPct = parseFloat($('sellingPct').value) || 0;
  const appreciation = parseFloat($('appreciation').value) || 0;

  const rentStart = parseFloat($('rent').value) || 0;
  const rentGrowth = parseFloat($('rentGrowth').value) || 0;
  const investReturn = parseFloat($('investReturn').value) || 0;

  const years = parseInt(yearsInput.value) || 1;
  const totalMonths = years * 12;

  const downPayment = price * downPct/100;
  const loanAmount = price - downPayment;
  const closingCosts = price * closingPct/100;
  const monthlyMortRate = (mortRate/100)/12;
  const mortMonths = mortgageTerm * 12;

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
    mortgageBalance = Math.max(mortgageBalance - principalPortion, 0);

    const buyMonthlyCost = actualMortgagePayment + monthlyTax + insurance + hoa + monthlyMaint;
    const rentMonthlyCost = currentRent;

    if (firstMonthBuyCost === null){ firstMonthBuyCost = buyMonthlyCost; firstMonthRentCost = rentMonthlyCost; }

    const diff = buyMonthlyCost - rentMonthlyCost;
    renterPortfolio *= (1 + monthlyInvestReturn);
    if (diff > 0){
      renterPortfolio += diff;
    }

    homeValue *= Math.pow(1 + appreciation/100, 1/12);

    if (m % 12 === 0){
      const equity = homeValue - mortgageBalance - (homeValue * sellingPct/100);
      yearlyData.push({
        year: m/12,
        buyMonthly: buyMonthlyCost,
        rentMonthly: rentMonthlyCost,
        buyNetWorth: equity,
        rentNetWorth: renterPortfolio,
        homeValue, mortgageBalance
      });
    }
  }

  const final = yearlyData[yearlyData.length-1];

  let breakevenYear = null;
  for (const row of yearlyData){
    if (row.buyNetWorth >= row.rentNetWorth){ breakevenYear = row.year; break; }
  }

  return {
    yearlyData, final, breakevenYear,
    firstMonthBuyCost, firstMonthRentCost,
    downPayment, closingCosts
  };
}

function renderVerdict(r){
  const diff = r.final.buyNetWorth - r.final.rentNetWorth;
  const buyWins = diff >= 0;
  const headline = $('verdictHeadline');
  const sub = $('verdictSub');

  if (buyWins){
    headline.innerHTML = `Buying is better by <span style="color:var(--good);">${fmt(Math.abs(diff))}</span>`;
  } else {
    headline.innerHTML = `Renting is better by <span style="color:var(--good);">${fmt(Math.abs(diff))}</span>`;
  }
  sub.textContent = `Projected net worth comparison after ${r.final.year} year${r.final.year==1?'':'s'}`;
}

function renderResults(r){
  $('outBuyNet').textContent = fmt(r.final.buyNetWorth);
  $('outRentNet').textContent = fmt(r.final.rentNetWorth);$('outBuyDetail').textContent = `Home value ${fmt(r.final.homeValue)} − mortgage balance ${fmt(r.final.mortgageBalance)} − selling costs`;
  $('outRentDetail').textContent = `${fmt(r.downPayment + r.closingCosts)} upfront + monthly savings, invested`;
}

function renderTable(yearlyData){
  const body = $('scheduleBody');
  body.innerHTML = '';
  yearlyData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.year}</td>
      <td>${fmt2(row.buyMonthly)}</td>
      <td>${fmt2(row.rentMonthly)}</td>
      <td>${fmt2(row.buyNetWorth)}</td>
      <td>${fmt2(row.rentNetWorth)}</td>
    `;
    body.appendChild(tr);
  });
}

function getThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    ink: styles.getPropertyValue('--ink').trim() || '#1C2430',
    soft: styles.getPropertyValue('--ink-soft').trim() || '#5B6472',
    border: styles.getPropertyValue('--border').trim() || '#D8D3C7',
    buy: styles.getPropertyValue('--buy').trim() || '#2C3E50',
    rent: styles.getPropertyValue('--rent').trim() || '#9B6B43'
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
      x:{title:{display:true, text:xLabel||'Year', color:colors.soft}, grid:{color:colors.border}, ticks:{color:colors.soft}},
      y:{title:{display:true, text:yLabel||'', color:colors.soft}, grid:{color:colors.border}, ticks:{color:colors.soft, callback:v=>'$'+Number(v).toLocaleString()}}
    }
  };
}

function buildChartConfig(yearlyData, view, colors){
  const labels = yearlyData.map(r => r.year);

  if (view === 'networth'){
    return {
      type:'line',
      data:{
        labels,
        datasets:[
          {label:'Net Worth (Buy)', data: yearlyData.map(r=>r.buyNetWorth.toFixed(2)), borderColor: colors.buy, backgroundColor: colors.buy + '12', fill:false, tension:0.2, pointRadius:0, borderWidth:2.5},
          {label:'Net Worth (Rent)', data: yearlyData.map(r=>r.rentNetWorth.toFixed(2)), borderColor: colors.rent, backgroundColor: colors.rent + '12', fill:false, tension:0.2, pointRadius:0, borderWidth:2.5}
        ]
      },
      options: baseOptions('Year','Net Worth ($)', colors)
    };
  }

  if (view === 'monthly'){
    return {
      type:'line',
      data:{
        labels,
        datasets:[
          {label:'Buy — Monthly Cost', data: yearlyData.map(r=>r.buyMonthly.toFixed(2)), borderColor: colors.buy, backgroundColor: colors.buy + '12', fill:false, tension:0.2, pointRadius:0, borderWidth:2.5},
          {label:'Rent — Monthly Cost', data: yearlyData.map(r=>r.rentMonthly.toFixed(2)), borderColor: colors.rent, backgroundColor: colors.rent + '12', fill:false, tension:0.2, pointRadius:0, borderWidth:2.5}
        ]
      },
      options: baseOptions('Year','Monthly Cost ($)', colors)
    };
  }

  let cumBuy = 0, cumRent = 0;
  const cumBuyArr = [], cumRentArr = [];
  yearlyData.forEach(r=>{
    cumBuy += r.buyMonthly * 12;
    cumRent += r.rentMonthly * 12;
    cumBuyArr.push(cumBuy.toFixed(2));
    cumRentArr.push(cumRent.toFixed(2));
  });
  return {
    type:'line',
    data:{
      labels,
      datasets:[
        {label:'Cumulative Cost (Buy)', data: cumBuyArr, borderColor: colors.buy, backgroundColor: colors.buy + '15', fill:true, tension:0.15, pointRadius:0, borderWidth:2},
        {label:'Cumulative Cost (Rent)', data: cumRentArr, borderColor: colors.rent, backgroundColor: colors.rent + '18', fill:true, tension:0.15, pointRadius:0, borderWidth:2}
      ]
    },
    options: baseOptions('Year','Cumulative Cash Spent ($)', colors)
  };
}

function renderChart(yearlyData){
  if (!document.getElementById('compareChart')) return;
  const cfg = buildChartConfig(yearlyData, currentView, getThemeColors());
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('compareChart').getContext('2d'), cfg);
}

function update(){
  const r = calculate();
  renderVerdict(r);
  renderResults(r);
  renderTable(r.yearlyData);
  renderChart(r.yearlyData);
}

update();