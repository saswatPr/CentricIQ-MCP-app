/**
 * data/dummy-data.js
 *
 * Standalone stand-in for the real CentricIQ pipeline
 * (Snowflake:routing_tool -> Cortex Analyst -> Snowflake:*_agent stored procs).
 *
 * There is NO live warehouse connection here. Each "subject area" below is a
 * small hand-authored dataset. routeQuestion() does simple keyword matching —
 * exactly the kind of fast-path a real domain_hint would short-circuit —
 * and returns a payload shaped for the CentricIQ answer_shell:
 *   { domain, period, chart_hint, title, categories, series, rows, bullets, suggestions }
 *
 * Swap routeQuestion()'s body for a real MCP/Snowflake call when you're ready
 * to go from demo -> production; the tool and UI layers don't need to change.
 */

const SUBJECT_AREAS = [
  "Brand Performance (growth & margin)",
  "Revenue (trend by region)",
  "Rebates (leakage by account)",
  "Order Pipeline (generic fallback table)",
];

// ---- Subject area 1: Brand growth & margin -------------------------------
const BRAND_GROWTH = {
  domain: "Brand Performance",
  period: "YoY",
  chart_hint: "grouped_bar",
  title: "Revenue Growth % & Margin % by Brand — YoY",
  categories: ["Aria", "Northline", "Kestrel", "Vantage", "Solace"],
  series: [
    { name: "YoY Growth %", color: "#0F2A5C", data: [18.4, 14.2, 9.8, 6.1, -3.2] },
    { name: "Margin %", color: "#2563EB", data: [32.1, 27.6, 24.9, 21.3, 19.8] },
  ],
  rows: [
    { brand: "Aria", growth_pct: 18.4, margin_pct: 32.1, revenue_m: 42.7 },
    { brand: "Northline", growth_pct: 14.2, margin_pct: 27.6, revenue_m: 35.1 },
    { brand: "Kestrel", growth_pct: 9.8, margin_pct: 24.9, revenue_m: 28.4 },
    { brand: "Vantage", growth_pct: 6.1, margin_pct: 21.3, revenue_m: 22.9 },
    { brand: "Solace", growth_pct: -3.2, margin_pct: 19.8, revenue_m: 15.6 },
  ],
  bullets: [
    "**Aria** leads YoY growth at **+18.4%**, holding the highest margin at **32.1%**.",
    "Combined revenue across all 5 brands is **$144.7M** for the period.",
    "**Solace** is the only brand in decline, down **-3.2%** YoY.",
    "Margin and growth move together — the top 2 brands by growth also lead on margin %.",
  ],
  suggestions: [
    "Which brands grew the most YoY and what's their margin %?",
    "Show revenue trend by region",
  ],
};

// ---- Subject area 2: Revenue trend by region -----------------------------
const REVENUE_TREND = {
  domain: "Revenue",
  period: "Last 6 Months",
  chart_hint: "line",
  title: "Revenue Trend by Region — Last 6 Months",
  categories: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
  series: [
    { name: "North America", color: "#0F2A5C", data: [21.3, 22.1, 23.0, 24.2, 25.1, 26.4] },
    { name: "EMEA", color: "#2563EB", data: [14.8, 15.0, 14.6, 15.4, 16.0, 16.9] },
    { name: "APAC", color: "#1E3A8A", data: [9.2, 9.6, 10.1, 10.5, 11.0, 11.8] },
  ],
  rows: [
    { region: "North America", latest_m: 26.4, prior_m: 21.3, change_pct: 24.0 },
    { region: "EMEA", latest_m: 16.9, prior_m: 14.8, change_pct: 14.2 },
    { region: "APAC", latest_m: 11.8, prior_m: 9.2, change_pct: 28.3 },
  ],
  bullets: [
    "**North America** is the largest region at **$26.4M** this month, **48.6%** of total.",
    "Total revenue across all regions this month is **$54.3M**.",
    "**APAC** grew fastest over the window, up **+28.3%** since Feb.",
    "All three regions trended up every month — no region declined in the window.",
  ],
  suggestions: [
    "Top accounts by rebate leakage %",
    "Which brands grew the most YoY and what's their margin %?",
  ],
};

// ---- Subject area 3: Rebate leakage by account ---------------------------
const REBATE_LEAKAGE = {
  domain: "Rebates",
  period: "YTD",
  chart_hint: "bar_horizontal",
  title: "Rebate Leakage % by Account — YTD",
  categories: ["Meridian Foods", "Colton Retail Group", "Harbor & Vine", "Ashgrove Supply", "Ridgeline Co-op"],
  series: [
    { name: "Leakage %", color: "#0F2A5C", data: [12.8, 9.4, 7.1, 5.6, 3.9] },
  ],
  rows: [
    { account: "Meridian Foods", leakage_pct: 12.8, rebate_owed_k: 184.2, rebate_paid_k: 160.7 },
    { account: "Colton Retail Group", leakage_pct: 9.4, rebate_owed_k: 142.0, rebate_paid_k: 128.7 },
    { account: "Harbor & Vine", leakage_pct: 7.1, rebate_owed_k: 98.5, rebate_paid_k: 91.5 },
    { account: "Ashgrove Supply", leakage_pct: 5.6, rebate_owed_k: 76.3, rebate_paid_k: 72.0 },
    { account: "Ridgeline Co-op", leakage_pct: 3.9, rebate_owed_k: 61.1, rebate_paid_k: 58.7 },
  ],
  bullets: [
    "**Meridian Foods** has the highest leakage at **12.8%**, the top account by share of unpaid rebate.",
    "Total rebate owed across these 5 accounts is **$562.1K**, of which **$511.6K** was paid.",
    "Leakage is concentrated: the top 2 accounts account for over **60%** of total dollars at risk.",
    "**Ridgeline Co-op** has the tightest leakage at just **3.9%**.",
  ],
  suggestions: [
    "Show revenue trend by region",
    "Which brands grew the most YoY and what's their margin %?",
  ],
};

// ---- Fallback: generic table for anything unmatched ----------------------
function genericFallback(question) {
  return {
    domain: "Order Pipeline",
    period: "YTD",
    chart_hint: "table",
    title: `Results — "${question}"`,
    categories: ["Order ID", "Account", "Status", "Value ($K)"],
    series: [],
    rows: [
      { order_id: "ORD-10421", account: "Meridian Foods", status: "on time", value_k: 84.2 },
      { order_id: "ORD-10433", account: "Colton Retail Group", status: "at risk", value_k: 61.0 },
      { order_id: "ORD-10457", account: "Harbor & Vine", status: "high risk", value_k: 39.7 },
      { order_id: "ORD-10462", account: "Ashgrove Supply", status: "on time", value_k: 52.4 },
    ],
    bullets: [
      "This is a **dummy** general-purpose result — no subject area keyword matched confidently.",
      "**4** sample orders shown, totalling **$237.3K** in value.",
      "**1** order is flagged **high risk** and **1** is **at risk**.",
      "Try one of the suggested questions below, or mention a subject area (brand, revenue, rebate) explicitly.",
    ],
    suggestions: [
      "Which brands grew the most YoY and what's their margin %?",
      "Top accounts by rebate leakage %",
    ],
  };
}

/**
 * routeQuestion — the dummy equivalent of Snowflake:routing_tool.
 * Real implementation: check_user_access -> routing_tool -> domain agent.
 * Demo implementation: keyword match on question / domain_hint text.
 */
export function routeQuestion(question = "", domainHint = "") {
  const q = `${domainHint} ${question}`.toLowerCase();

  if (/\brebate|leakage\b/.test(q)) {
    return REBATE_LEAKAGE;
  }
  if (/\brevenue|region|trend\b/.test(q)) {
    return REVENUE_TREND;
  }
  if (/\bbrand|growth|margin\b/.test(q)) {
    return BRAND_GROWTH;
  }
  return genericFallback(question || "(empty question)");
}

export function listSubjectAreas() {
  return SUBJECT_AREAS;
}
