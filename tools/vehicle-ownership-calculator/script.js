const $ = id => document.getElementById(id);
let chart;
let currentView = 'stacked';
let fuelType = 'gas';

function fmt(n){ return n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}); }
function fmt2(n){ return n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}); }
function fmt3(n){ return n.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:3}); }

document.querySelectorAll('[data-fuel]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('[data-fuel]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    fuelType = btn.dataset.fuel;
    $('gasPanel').style.display = fuelType === 'gas' ? 'block' : 'none';$('electricPanel').style.display = fuelType === 'electric' ? 'block' : 'none';
    update();
  });
});

document.querySelectorAll('.view-tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.view-tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    const subs = {
      stacked:'How each cost category builds up over your ownership period',
      value:'Vehicle resale value declining over time',
      total:'Running total of true ownership cost'
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
  $('price').value = 38000;
  $('down').value = 6000;
  $('salesTax').value = 7;
  $('rate').value = 6.5;
  $('loanTerm').value = 60;
  $('oneTimeFees').value = 500;
  $('depreciation').value = 15;
  yearsInput.value = 7;
  $('yearsLabel').textContent = '7';$('insurance').value = 140;
  fuelType = 'gas';
  document.querySelectorAll('[data-fuel]').forEach(b => {
    b.classList.toggle('active', b.dataset.fuel === 'gas');
  });
  $('gasPanel').style.display = 'block';
  $('electricPanel').style.display = 'none';$('mpg').value = 30;
  $('gasPrice').value = 3.40;
  $('kwhPer100').value = 30;
  $('elecPrice').value = 0.16;
  $('miles').value = 12000;
  $('maintenance').value = 700;
  $('registration').value = 150;
  $('inflation').value = 3;
  update();
}

['price','down','salesTax','rate','loanTerm','oneTimeFees','depreciation',
 'insurance','mpg','gasPrice','kwhPer100','elecPrice','miles','maintenance','registration','inflation'
].forEach(id=>{ $(id).addEventListener('input', update); });

function calculate(){
  const price = parseFloat($('price').value) || 0;
  const down = parseFloat($('down').value) || 0;
  const salesTaxPct = parseFloat($('salesTax').value) || 0;
  const rate = parseFloat($('rate').value) || 0;
  const loanTermMonths = parseInt($('loanTerm').value) || 60;
  const oneTimeFees = parseFloat($('oneTimeFees').value) || 0;
  const depreciationPct = parseFloat($('depreciation').value) || 0;
  const years = parseInt(yearsInput.value) || 1;

  const insuranceMonthly = parseFloat($('insurance').value) || 0;
  const mpg = parseFloat($('mpg').value) || 1;
  const gasPrice = parseFloat($('gasPrice').value) || 0;
  const kwhPer100 = parseFloat($('kwhPer100').value) || 1;
  const elecPrice = parseFloat($('elecPrice').value) || 0;
  const miles = parseFloat($('miles').value) || 0;
  const maintenanceAnnual = parseFloat($('maintenance').value) || 0;
  const registrationAnnual = parseFloat($('registration').value) || 0;
  const escalation = parseFloat($('inflation').value) || 0;

  const salesTax = price * salesTaxPct/100;
  const loanAmount = Math.max(price - down, 0);
  const monthlyRate = (rate/100)/12;

  let basePayment;
  if (monthlyRate === 0){
    basePayment = loanAmount / loanTermMonths;
  } else {
    basePayment = loanAmount * (monthlyRate * Math.pow(1+monthlyRate, loanTermMonths)) / (Math.pow(1+monthlyRate, loanTermMonths) - 1);
  }
  if (!isFinite(basePayment)) basePayment = 0;

  const annualFuelCost = () => {
    if (fuelType === 'gas'){
      return (miles / mpg) * gasPrice;
    } else {
      return (miles / 100) * kwhPer100 * elecPrice;
    }
  };

  const totalMonths = years * 12;
  let balance = loanAmount;
  let cumInterest = 0;
  const yearlyData = [];
  let cumInsurance = 0, cumFuel = 0, cumMaint = 0, cumReg = 0;

  for (let m = 1; m <= totalMonths; m++){
    const yearIndex = Math.floor((m-1)/12);

    if (balance > 0 && m <= loanTermMonths){
      const interestPortion = balance * monthlyRate;
      let principalPortion = basePayment - interestPortion;
      if (m === loanTermMonths) principalPortion = balance;
      balance = Math.max(balance - principalPortion, 0);
      cumInterest += interestPortion;
    }

    const escFactor = Math.pow(1 + escalation/100, yearIndex);
    cumInsurance += insuranceMonthly * escFactor;
    cumFuel += (annualFuelCost() * escFactor) / 12;
    cumMaint += (maintenanceAnnual * escFactor) / 12;
    cumReg += (registrationAnnual * escFactor) / 12;

    if (m % 12 === 0){
      const yr = m/12;
      const vehicleValue = price * Math.pow(1 - depreciationPct/100, yr);
      const depreciationToDate = price - vehicleValue;
      const operatingCostsToDate = cumInsurance + cumFuel + cumMaint + cumReg;
      const totalCostToDate = depreciationToDate + cumInterest + operatingCostsToDate + salesTax + oneTimeFees;
      yearlyData.push({
        year: yr,
        vehicleValue,
        interestToDate: cumInterest,
        operatingCostsToDate,
        insuranceToDate: cumInsurance,
        fuelToDate: cumFuel,
        maintToDate: cumMaint,
        regToDate: cumReg,
        totalCostToDate
      });
    }
  }

  const final = yearlyData[yearlyData.length-1];
  const totalMiles = miles * years;

  return {
    yearlyData, final, price, salesTax, oneTimeFees,
    totalMiles, years
  };
}

function renderVerdict(r){
  $('verdictHeadline').textContent = `${fmt(r.final.totalCostToDate)} true cost over ${r.years} year${r.years==1?'':'s'}`;
  $('verdictSub').textContent = `That's ${fmt(r.final.totalCostToDate/r.years)}/year — far more than just the loan payment`;
}

function renderResults(r){
  $('outPerYear').textContent = fmt(r.final.totalCostToDate / r.years);
  $('outPerMonth').textContent = fmt(r.final.totalCostToDate / (r.years*12));$('outPerMile').textContent = fmt3(r.final.totalCostToDate / Math.max(r.totalMiles,1));
}

function renderBreakdown(r){
  const depreciation = r.price - r.final.vehicleValue;
  const items = [
    {name:'Depreciation', val: depreciation, color:'var(--buy)'},
    {name:'Loan Interest', val: r.final.interestToDate, color:'var(--rent)'},
    {name:'Insurance', val: r.final.insuranceToDate, color:'var(--good)'},
    {name:'Fuel / Energy', val: r.final.fuelToDate, color:'var(--danger)'},
    {name:'Maintenance & Registration', val: r.final.maintToDate + r.final.regToDate, color:'var(--ink-soft)'},
    {name:'Taxes & Fees (one-time)', val: r.salesTax + r.oneTimeFees, color:'var(--ink)'}
  ];
  const list = $('breakdownList');
  list.innerHTML = items.map(it=>
    `<div class="breakdown-item" style="display:flex; justify-content:space-between; align-items:center; font-size:13px; padding-bottom:8px; border-bottom:1px solid var(--border);"><span class="name" style="display:flex; align-items:center; gap:8px; color:var(--ink-soft);"><span class="dot" style="width:10px; height:10px; display:inline-block; border-radius:2px; background:${it.color}"></span>${it.name}</span><span class="amt" style="font-weight:600; color:var(--ink);">${fmt(it.val)}</span></div>`
  ).join('');
}

function renderTable(yearlyData){
  const body = $('scheduleBody');
  body.innerHTML = '';
  yearlyData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.year}</td>
      <td>${fmt2(row.vehicleValue)}</td>
      <td>${fmt2(row.interestToDate)}</td>
      <td>${fmt2(row.operatingCostsToDate)}</td>
      <td>${fmt2(row.totalCostToDate)}</td>
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
      legend:{display:true, labels:{font:{family:'inherit', size:11}, color:colors.soft, boxWidth:12}},
      tooltip:{callbacks:{label: ctx => `${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})}`}}
    },
    scales:{
      x:{title:{display:true, text:xLabel||'Year', color:colors.soft}, grid:{color:colors.border}, ticks:{color:colors.soft}},
      y:{title:{display:true, text:yLabel||'', color:colors.soft}, grid:{color:colors.border}, ticks:{color:colors.soft, callback:v=>'$'+Number(v).toLocaleString()}}
    }
  };
}

function buildChartConfig(yearlyData, view, r, colors){
  const labels = yearlyData.map(row=>row.year);

  if (view === 'stacked'){
    const opts = baseOptions('Year','Cost ($)', colors);
    opts.scales.x.stacked = true;
    opts.scales.y.stacked = true;
    const taxesFeesFlat = r.salesTax + r.oneTimeFees;
    return {
      type:'bar',
      data:{
        labels,
        datasets:[
          {label:'Depreciation', data: yearlyData.map(row=>(r.price-row.vehicleValue).toFixed(2)), backgroundColor:'#2C3E50', stack:'s'},
          {label:'Loan Interest', data: yearlyData.map(row=>row.interestToDate.toFixed(2)), backgroundColor:'#9B6B43', stack:'s'},
          {label:'Insurance', data: yearlyData.map(row=>row.insuranceToDate.toFixed(2)), backgroundColor:'#4A7C6C', stack:'s'},
          {label:'Fuel / Energy', data: yearlyData.map(row=>row.fuelToDate.toFixed(2)), backgroundColor:'#9B2C2C', stack:'s'},
          {label:'Maintenance & Reg.', data: yearlyData.map(row=>(row.maintToDate+row.regToDate).toFixed(2)), backgroundColor:'#7A5C3E', stack:'s'},
          {label:'Taxes & Fees', data: yearlyData.map(()=>taxesFeesFlat.toFixed(2)), backgroundColor:'#7A8B99', stack:'s'}
        ]
      },
      options: opts
    };
  }

  if (view === 'value'){
    return {
      type:'line',
      data:{
        labels,
        datasets:[{
          label:'Vehicle Value',
          data: yearlyData.map(row=>row.vehicleValue.toFixed(2)),
          borderColor:colors.buy, backgroundColor: colors.buy + '12',
          fill:true, tension:0.2, pointRadius:0, borderWidth:2.5
        }]
      },
      options: baseOptions('Year','Value ($)', colors)
    };
  }

  return {
    type:'line',
    data:{
      labels,
      datasets:[{
        label:'Total True Cost to Date',
        data: yearlyData.map(row=>row.totalCostToDate.toFixed(2)),
        borderColor:colors.rent, backgroundColor: colors.rent + '15',
        fill:true, tension:0.2, pointRadius:0, borderWidth:2.5
      }]
    },
    options: baseOptions('Year','Total Cost ($)', colors)
  };
}

function renderChart(yearlyData, r){
  if (!document.getElementById('ownershipChart')) return;
  const cfg = buildChartConfig(yearlyData, currentView, r, getThemeColors());
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('ownershipChart').getContext('2d'), cfg);
}

function update(){
  const r = calculate();
  renderVerdict(r);
  renderResults(r);
  renderBreakdown(r);
  renderTable(r.yearlyData);
  renderChart(r.yearlyData, r);
}

update();