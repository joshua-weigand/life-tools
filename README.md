# Life Tools

A collection of lightweight, client-side web calculators designed to help you analyze personal finance decisions, loans, and long-term investments without tracking or server dependencies.

**🌐 Live Demo:** [https://joshua-weigand.github.io/life-tools/](https://joshua-weigand.github.io/life-tools/)

## App Architecture & Features

* **App Shell Layout**: Built with a persistent desktop sidebar navigation and a seamless `iframe` viewer (`tool-frame`) to load tools dynamically[cite: 5].
* **Responsive Mobile Design**: Features a slide-out mobile drawer menu accessed via a clean hamburger icon (`☰`) with high-priority layout layering and a background dimming overlay.
* **GitHub Pages Ready**: Includes custom `404.html` error page handling for seamless redirection on static hosting.

## Included Calculators

### Retirement & Wealth
* **Retirement Income** (`/tools/retirement`) — Model 30-year account burn-down, safe withdrawal rates, and estimated federal income tax brackets.
* **Compound Interest** (`/tools/compound-interest`) — Project investment growth over time with recurring contributions.

### Housing & Real Estate
* **Home Ownership** (`/tools/home-ownership`) — Calculate total monthly housing costs, including principal, interest, taxes, and insurance (PITI).
* **Mortgage Calculator** (`/tools/mortgage-calculator`) — Plan mortgage schedules and fixed amortization tracks.
* **Rent vs. Buy Calculator** (`/tools/rent-vs-buy-calculator`) — Compare long-term wealth outcomes between renting and purchasing a home.

### Automotive
* **Auto Loan** (`/tools/auto-loan`) — Estimate monthly car payments, total interest, and loan amortization.
* **Vehicle Payoff** (`/tools/vehicle-payoff-calculator`) — Model accelerated loan payoff schedules, extra monthly payments, and interest savings[cite: 5].
* **Vehicle Ownership** (`/tools/vehicle-ownership-calculator`) — Estimate the true cost of ownership (TCO) including depreciation, gas/energy, maintenance, insurance, and taxes.

### Debt & Credit
* **Credit Card Payoff** (`/tools/credit-card-payoff`) — Model payoff timelines and interest saved using extra monthly payments.

## Local Development & Usage

1. Clone the repository.
2. Open `index.html` in your browser or run a local static server (e.g., Live Server in VS Code). 
3. All computations happen 100% client-side in the browser.