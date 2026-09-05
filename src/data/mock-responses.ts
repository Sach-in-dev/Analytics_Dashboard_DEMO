/**
 * Centralized Mock Responses — hardcoded dummy data for every API endpoint.
 *
 * Each entry returns { success: true, data: ..., meta?: ... } matching the
 * exact shape that the backend routers produce.
 *
 * ALL data here is 100% fictional / dummy — no real business data.
 */

// ────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────

/** Generate an array of dates between start and end as YYYY-MM-DD strings. */
function dateRange(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  const start = new Date(startStr);
  const end = new Date(endStr);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Simple seeded-ish random based on date string — deterministic per date. */
function pseudoRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 10000) / 10000;
}

/** Random int in range, seeded by string. */
function randInt(seed: string, min: number, max: number): number {
  return Math.floor(pseudoRandom(seed) * (max - min + 1)) + min;
}

/** Random float in range, seeded by string. */
function randFloat(seed: string, min: number, max: number, decimals = 2): number {
  return parseFloat((pseudoRandom(seed) * (max - min) + min)?.toFixed(decimals));
}

// ────────────────────────────────────────────────────────────
// DUMMY DIMENSION POOLS
// ────────────────────────────────────────────────────────────

const PRODUCT_NAMES = [
  "Product Alpha", "Product Beta", "Product Gamma", "Product Delta",
  "Product Epsilon", "Product Zeta", "Product Eta", "Product Theta",
  "Product Iota", "Product Kappa", "Product Lambda", "Product Mu",
  "Product Nu", "Product Xi", "Product Omicron", "Product Pi",
  "Product Rho", "Product Sigma", "Product Tau", "Product Upsilon",
  "Product Phi", "Product Chi", "Product Psi", "Product Omega",
  "Product A1", "Product B2", "Product C3", "Product D4", "Product E5", "Product F6"
];

const CATEGORIES = ["Skincare", "Haircare", "Makeup", "Fragrance", "Bath & Body", "Wellness"];

const COUPON_CODES = ["SAVE10", "WELCOME20", "FLAT15", "FIRST50", "LOYALTY30", "FESTIVE25", "MEGA40", "SUMMER15"];

const CITIES = ["City A", "City B", "City C", "City D", "City E", "City F", "City G", "City H"];
const STATES = ["State 1", "State 2", "State 3", "State 4", "State 5"];

const UTM_SOURCES = ["google", "facebook", "instagram", "email", "direct", "organic", "referral", "tiktok"];
const UTM_MEDIUMS = ["cpc", "social", "email", "organic", "referral"];
const UTM_CAMPAIGNS = ["brand_awareness", "retargeting", "seasonal_sale", "new_launch", "loyalty_program"];

const COURIER_NAMES = ["Courier A", "Courier B", "Courier C", "Courier D", "Courier E"];

const INFLUENCER_NAMES = ["Influencer 1", "Influencer 2", "Influencer 3", "Influencer 4", "Influencer 5", "Influencer 6"];

const CUSTOMER_NAMES = [
  "Customer A", "Customer B", "Customer C", "Customer D", "Customer E",
  "Customer F", "Customer G", "Customer H", "Customer I", "Customer J",
  "Customer K", "Customer L", "Customer M", "Customer N", "Customer O",
  "Customer P", "Customer Q", "Customer R", "Customer S", "Customer T",
];

const RFM_SEGMENTS = ["Champions", "Loyal Customers", "Potential Loyalists", "At Risk", "Lost Customers", "New Customers", "Promising", "About to Sleep", "Hibernating", "Can't Lose Them"];

const CREATIVE_NAMES = ["Creative Ad 1", "Creative Ad 2", "Creative Ad 3", "Creative Ad 4", "Creative Ad 5", "Creative Ad 6"];

const ADSET_NAMES = ["Audience Set A", "Audience Set B", "Audience Set C", "Audience Set D", "Audience Set E"];

const FLOW_NAMES = ["Welcome Series", "Post Purchase", "Abandoned Cart", "Win Back", "VIP Exclusive", "Birthday Flow"];

const SEARCH_KEYWORDS = ["serum", "shampoo", "sunscreen", "lipstick", "moisturizer", "face wash", "hair oil", "perfume", "body lotion", "foundation"];

// ────────────────────────────────────────────────────────────
// MOCK RESPONSE BUILDERS
// ────────────────────────────────────────────────────────────

function wrap(data: any, meta?: any) {
  return { success: true, statusCode: 200, data, meta: meta || {}, message: "Success", path: "" };
}

function buildDailyOrders(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  const rows = dates.map((d, i) => ({
    id: i + 1,
    date: d,
    total: randInt(d + "t", 80000, 250000),
    discountTotal: randInt(d + "disc", 3000, 15000),
    shippingTotal: randInt(d + "ship", 2000, 8000),
    subTotal: randInt(d + "sub", 70000, 240000),
    redeemedPoints: randInt(d + "pts", 0, 5000),
    ordersCount: randInt(d + "oc", 15, 45),
    aov: randInt(d + "aov", 800, 1800),
    newCustomerOrdersCount: randInt(d + "nc", 5, 20),
    newCustomerTotal: randInt(d + "nct", 30000, 100000),
    newCustomerAov: randInt(d + "nca", 700, 1500),
    returningCustomerOrdersCount: randInt(d + "rc", 8, 25),
    returningCustomerTotal: randInt(d + "rct", 40000, 150000),
    returningCustomerAov: randInt(d + "rca", 900, 2000),
    webOrdersCount: randInt(d + "wo", 8, 25),
    webTotal: randInt(d + "wt", 40000, 120000),
    webAov: randInt(d + "wa", 800, 1800),
    appOrdersCount: randInt(d + "ao", 5, 20),
    appTotal: randInt(d + "at", 30000, 100000),
    appAov: randInt(d + "aa", 800, 1800),
    interval: "daily",
  }));
  return wrap(rows);
}

function buildProducts(params: any) {
  const metric = params.metric_type || "revenue";
  const data = PRODUCT_NAMES.map((name, i) => ({
    product_title: name,
    value: metric === "revenue" ? randInt(name, 10000, 500000) : randInt(name, 50, 2000),
  }));
  data.sort((a, b) => b.value - a.value);
  const page = parseInt(params.page || "1");
  const limit = parseInt(params.limit || "15");
  const sliced = data.slice((page - 1) * limit, page * limit);
  return wrap(sliced, { total: data.length, page, limit, lastPage: Math.ceil(data.length / limit) });
}

function buildProductCategoryData() {
  return wrap(CATEGORIES.map((cat, i) => ({
    category: cat,
    stickiness_rate: randFloat(cat, 20, 70),
    cross_sell_rate: randFloat(cat + "cs", 5, 35),
    new_trial_rate: randFloat(cat + "nt", 10, 40),
    customer_count: randInt(cat, 100, 2000),
  })));
}

function buildCarts(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  const data = dates.map((d, i) => ({
    date: d,
    totalCarts: randInt(d + "tc", 30, 120),
    abandonedCarts: randInt(d + "ac", 15, 80),
    abandonmentRate: randFloat(d + "ar", 30, 70),
    recoveredCarts: randInt(d + "rec", 2, 15),
    recoveryRate: randFloat(d + "rr", 5, 25),
    avgCartValue: randInt(d + "acv", 800, 3000),
    totalCartValue: randInt(d + "tcv", 30000, 200000),
    abandonedCartValue: randInt(d + "abv", 15000, 120000),
  }));
  return wrap(data);
}

function buildCartsAbandonedProducts(params: any) {
  return wrap(PRODUCT_NAMES.slice(0, 10).map((name, i) => ({
    product_title: name,
    abandoned_count: randInt(name + "ab", 10, 200),
    abandoned_value: randInt(name + "abv", 5000, 100000),
  })));
}

function buildCoupons(params: any) {
  const code = params.coupon_code;
  if (code) {
    const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
    return wrap(dates.map(d => ({
      date: d,
      usageCount: randInt(d + code, 1, 20),
      revenue: randInt(d + code + "r", 5000, 50000),
      discount: randInt(d + code + "d", 500, 5000),
    })));
  }
  return wrap(COUPON_CODES.map((c, i) => ({
    coupon_code: c,
    usage_count: randInt(c, 20, 500),
    total_discount: randInt(c + "d", 5000, 100000),
    total_revenue: randInt(c + "r", 50000, 500000),
    avg_order_value: randInt(c + "aov", 800, 2500),
  })));
}

function buildUtm(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  const data = dates.map((d) => ({
    date: d,
    source: UTM_SOURCES[randInt(d, 0, UTM_SOURCES.length - 1)],
    medium: UTM_MEDIUMS[randInt(d + "m", 0, UTM_MEDIUMS.length - 1)],
    campaign: UTM_CAMPAIGNS[randInt(d + "c", 0, UTM_CAMPAIGNS.length - 1)],
    sessions: randInt(d + "s", 50, 500),
    users: randInt(d + "u", 30, 300),
    orders: randInt(d + "o", 2, 30),
    revenue: randInt(d + "r", 5000, 100000),
  }));
  return wrap(data);
}

function buildSearches(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap(dates.map(d => ({
    date: d,
    total_searches: randInt(d + "ts", 50, 500),
    unique_searches: randInt(d + "us", 30, 300),
    search_exits: randInt(d + "se", 5, 50),
    results_click_rate: randFloat(d + "cr", 20, 75),
  })));
}

function buildSearchKeywords() {
  return wrap(SEARCH_KEYWORDS.map((kw, i) => ({
    keyword: kw,
    search_count: randInt(kw, 50, 2000),
    click_count: randInt(kw + "c", 10, 500),
    conversion_count: randInt(kw + "cv", 1, 100),
    click_rate: randFloat(kw + "cr", 10, 60),
  })));
}

function buildSearchAnalytics() {
  return wrap({
    total_searches: 15420,
    unique_keywords: 892,
    avg_results_per_search: 12.5,
    zero_result_rate: 8.3,
    search_to_purchase_rate: 4.2,
    top_zero_result_keywords: ["unknown term 1", "unknown term 2", "unknown term 3"],
  });
}

function buildActiveUsers(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap(
    dates.map(d => ({
      date: d,
      searches: randInt(d + "s", 100, 800),
      visitors: randInt(d + "v", 200, 1500),
      orders: randInt(d + "o", 10, 60),
    })),
    {
      user_type_summary: [
        { type: "New Visitors", count: 4520 },
        { type: "Returning Visitors", count: 2380 },
        { type: "Buyers", count: 890 },
      ]
    }
  );
}

function buildReviewsSummary(params: any) {
  return wrap({
    total_reviews: 1245,
    avg_rating: 4.2,
    five_star: 620,
    four_star: 310,
    three_star: 145,
    two_star: 95,
    one_star: 75,
    rating_distribution: [
      { stars: 5, count: 620, pct: 49.8 },
      { stars: 4, count: 310, pct: 24.9 },
      { stars: 3, count: 145, pct: 11.6 },
      { stars: 2, count: 95, pct: 7.6 },
      { stars: 1, count: 75, pct: 6.0 },
    ],
    sentiment_summary: { positive: 74.7, neutral: 11.6, negative: 13.6 },
  });
}

function buildReviewsRecent() {
  return wrap([
    { id: 1, product: "Product Alpha", reviewer: "Customer A", rating: 5, text: "Great product, highly recommend!", date: "2025-08-28" },
    { id: 2, product: "Product Beta", reviewer: "Customer B", rating: 4, text: "Good quality, fast delivery.", date: "2025-08-27" },
    { id: 3, product: "Product Gamma", reviewer: "Customer C", rating: 3, text: "Average, expected better.", date: "2025-08-26" },
    { id: 4, product: "Product Delta", reviewer: "Customer D", rating: 5, text: "Absolutely love it!", date: "2025-08-25" },
    { id: 5, product: "Product Epsilon", reviewer: "Customer E", rating: 2, text: "Not as described.", date: "2025-08-24" },
  ]);
}

function buildReviewsProductRatings() {
  return wrap(PRODUCT_NAMES.slice(0, 15).map((name, i) => ({
    product_title: name,
    avg_rating: randFloat(name + "r", 2.5, 5.0, 1),
    review_count: randInt(name + "rc", 5, 200),
    five_star_pct: randFloat(name + "5s", 20, 70),
  })));
}

function buildInventorySummary() {
  return wrap({
    total_skus: 450,
    in_stock: 380,
    out_of_stock: 35,
    low_stock: 35,
    total_value: 25400000,
    dead_stock_count: 22,
    dead_stock_value: 1800000,
    dead_stock_pct: 7.1,
    avg_days_on_hand: 45,
    stockout_rate: 7.8,
    coverage_days: 62,
    turnover_rate: 5.9,
    sku_details: PRODUCT_NAMES.slice(0, 20).map((name, i) => ({
      sku: `SKU-${String(i + 1).padStart(3, "0")}`,
      product_title: name,
      category: CATEGORIES[i % CATEGORIES.length],
      quantity: randInt(name + "q", 0, 500),
      value: randInt(name + "v", 10000, 500000),
      status: i < 16 ? "in_stock" : i < 18 ? "low_stock" : "out_of_stock",
      days_on_hand: randInt(name + "doh", 5, 120),
    })),
    aging_breakdown: [
      { range: "0-30 days", count: 200, value: 12000000 },
      { range: "31-60 days", count: 100, value: 7000000 },
      { range: "61-90 days", count: 80, value: 4000000 },
      { range: "90+ days", count: 70, value: 2400000 },
    ],
  });
}

function buildCorrelationsSummary(params: any) {
  return wrap({
    total_customers: 4500,
    correlation_score: 0.72,
    avg_basket_size: 2.3,
    cross_sell_rate: 18.5,
    top_correlations: [
      { product_a: "Product Alpha", product_b: "Product Beta", correlation: 0.85, support: 12.3 },
      { product_a: "Product Gamma", product_b: "Product Delta", correlation: 0.78, support: 9.7 },
      { product_a: "Product Epsilon", product_b: "Product Zeta", correlation: 0.71, support: 8.1 },
      { product_a: "Product Eta", product_b: "Product Theta", correlation: 0.65, support: 6.5 },
    ],
  });
}

function buildFrequentPairs(params: any) {
  return wrap([
    { product_a: "Product Alpha", product_b: "Product Beta", pair_count: 234, support_pct: 12.3 },
    { product_a: "Product Gamma", product_b: "Product Delta", pair_count: 187, support_pct: 9.7 },
    { product_a: "Product Epsilon", product_b: "Product Zeta", pair_count: 156, support_pct: 8.1 },
    { product_a: "Product Eta", product_b: "Product Theta", pair_count: 123, support_pct: 6.5 },
    { product_a: "Product Iota", product_b: "Product Kappa", pair_count: 98, support_pct: 5.1 },
  ]);
}

function buildRfmSummary(params: any) {
  return wrap({
    total_customers: 4500,
    segments: RFM_SEGMENTS.map((seg, i) => ({
      segment: seg,
      customer_count: randInt(seg, 100, 800),
      avg_recency: randInt(seg + "r", 5, 180),
      avg_frequency: randFloat(seg + "f", 1, 15),
      avg_monetary: randInt(seg + "m", 500, 50000),
      share_pct: randFloat(seg + "s", 3, 25),
    })),
    migration_matrix: RFM_SEGMENTS.slice(0, 5).map(from => ({
      from_segment: from,
      to_segments: RFM_SEGMENTS.slice(0, 5).map(to => ({
        segment: to,
        count: randInt(from + to, 0, 50),
      })),
    })),
  });
}

function buildRfmSegments(params: any) {
  const page = parseInt(params.page || "1");
  const limit = parseInt(params.limit || "20");
  const data = CUSTOMER_NAMES.map((name, i) => ({
    id: i + 1,
    customer_id: `CUST-${String(i + 1).padStart(4, "0")}`,
    customer_name: name,
    email: `${name.toLowerCase().replace(/\s/g, ".")}@demo.com`,
    segment: RFM_SEGMENTS[i % RFM_SEGMENTS.length],
    recency: randInt(name + "r", 1, 180),
    frequency: randInt(name + "f", 1, 30),
    monetary: randInt(name + "m", 500, 100000),
    r_score: randInt(name + "rs", 1, 5),
    f_score: randInt(name + "fs", 1, 5),
    m_score: randInt(name + "ms", 1, 5),
  }));
  const sliced = data.slice((page - 1) * limit, page * limit);
  return wrap(sliced, { total: data.length, page, limit, lastPage: Math.ceil(data.length / limit) });
}

function buildLtvBySegment(params: any) {
  return wrap({
    summary: {
      total_customers: 4500,
      avg_ltv: 4200,
      median_ltv: 3100,
      top_10_pct_ltv: 18500,
    },
    segments: RFM_SEGMENTS.slice(0, 6).map((seg, i) => ({
      segment: seg,
      customer_count: randInt(seg + "lc", 100, 800),
      avg_ltv: randInt(seg + "ltv", 1000, 25000),
      median_ltv: randInt(seg + "mltv", 800, 20000),
      total_revenue: randInt(seg + "tr", 500000, 5000000),
    })),
    trend: dateRange("2025-01-01", "2025-08-30").filter((_, i) => i % 30 === 0).map(d => ({
      date: d,
      avg_ltv: randInt(d + "ltv", 3500, 5000),
    })),
  });
}

function buildRpr(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap({
    summary: {
      rpr_percentage: 28.5,
      total_customers: 4500,
      repeat_customers: 1283,
      one_time_customers: 3217,
    },
    daily_trend: dates.map(d => ({
      date: d,
      rpr_percentage: randFloat(d + "rpr", 22, 35),
      total_customers: randInt(d + "tc", 100, 300),
      repeat_customers: randInt(d + "rc", 20, 90),
    })),
  });
}

function buildFunnelMetrics(params: any) {
  return wrap({
    stages: [
      { stage: "Sessions", count: 12500, rate: 100 },
      { stage: "Product Views", count: 6800, rate: 54.4 },
      { stage: "Add to Cart", count: 2400, rate: 19.2 },
      { stage: "Checkout Initiated", count: 1200, rate: 9.6 },
      { stage: "Payment", count: 850, rate: 6.8 },
      { stage: "Order Placed", count: 720, rate: 5.8 },
    ],
    conversion_rate: 5.8,
    cart_to_order_rate: 30.0,
    checkout_completion_rate: 60.0,
    drop_offs: [
      { from: "Sessions", to: "Product Views", drop_pct: 45.6 },
      { from: "Product Views", to: "Add to Cart", drop_pct: 64.7 },
      { from: "Add to Cart", to: "Checkout Initiated", drop_pct: 50.0 },
      { from: "Checkout Initiated", to: "Payment", drop_pct: 29.2 },
      { from: "Payment", to: "Order Placed", drop_pct: 15.3 },
    ],
  });
}

function buildRepeatCohorts(params: any) {
  const months = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"];
  return wrap({
    cohorts: months.map((m, mi) => ({
      cohort_month: m,
      initial_customers: randInt(m, 200, 600),
      months: Array.from({ length: 6 - mi }, (_, i) => ({
        month_index: i,
        retention_rate: Math.max(5, randFloat(m + i, 40 - i * 8, 50 - i * 6)),
        customers: randInt(m + i + "c", 10, 200),
        revenue: randInt(m + i + "r", 20000, 200000),
      })),
    })),
  });
}

function buildLifetimeCohorts(params: any) {
  const months = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"];
  return wrap({
    cohorts: months.map((m, mi) => ({
      cohort_month: m,
      initial_customers: randInt(m + "lc", 200, 600),
      total_revenue: randInt(m + "lr", 500000, 2000000),
      avg_ltv: randInt(m + "al", 1500, 5000),
      months: Array.from({ length: 6 - mi }, (_, i) => ({
        month_index: i,
        cumulative_revenue: randInt(m + i + "cr", 100000, 1000000),
        avg_ltv: randInt(m + i + "al", 1000, 5000),
        customer_count: randInt(m + i + "cc", 50, 400),
      })),
    })),
  });
}

function buildUtmAttribution(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap({
    summary: {
      total_sessions: 25000,
      total_revenue: 4500000,
      total_orders: 1200,
      attributed_revenue: 3200000,
    },
    by_source: UTM_SOURCES.map(src => ({
      source: src,
      sessions: randInt(src + "s", 500, 5000),
      users: randInt(src + "u", 300, 3000),
      orders: randInt(src + "o", 10, 300),
      revenue: randInt(src + "r", 50000, 800000),
      conversion_rate: randFloat(src + "cr", 1, 8),
    })),
    daily: dates.map(d => ({
      date: d,
      sessions: randInt(d + "us", 200, 1500),
      orders: randInt(d + "uo", 5, 60),
      revenue: randInt(d + "ur", 20000, 200000),
    })),
  });
}

function buildFlowAttribution(params: any) {
  return wrap({
    flows: FLOW_NAMES.map((f, i) => ({
      flow_name: f,
      emails_sent: randInt(f + "es", 500, 10000),
      emails_opened: randInt(f + "eo", 200, 5000),
      emails_clicked: randInt(f + "ec", 50, 2000),
      orders: randInt(f + "o", 5, 200),
      revenue: randInt(f + "r", 20000, 500000),
      open_rate: randFloat(f + "or", 15, 45),
      click_rate: randFloat(f + "cr", 3, 15),
      conversion_rate: randFloat(f + "cvr", 0.5, 8),
    })),
    summary: {
      total_emails_sent: 45000,
      total_revenue: 1200000,
      total_orders: 580,
      avg_open_rate: 28.5,
      avg_click_rate: 8.2,
    },
  });
}

function buildRtoRate(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap({
    summary: {
      total_orders: 3500,
      rto_orders: 280,
      rto_rate: 8.0,
      rto_loss: 420000,
      avg_rto_value: 1500,
    },
    daily: dates.map(d => ({
      date: d,
      total_orders: randInt(d + "to", 80, 200),
      rto_orders: randInt(d + "rto", 3, 20),
      rto_rate: randFloat(d + "rr", 3, 15),
    })),
    by_reason: [
      { reason: "Customer Unavailable", count: 95, pct: 33.9 },
      { reason: "Wrong Address", count: 65, pct: 23.2 },
      { reason: "Refused Delivery", count: 55, pct: 19.6 },
      { reason: "Damaged in Transit", count: 35, pct: 12.5 },
      { reason: "Other", count: 30, pct: 10.7 },
    ],
  });
}

function buildDeliveryTime(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap({
    summary: {
      avg_delivery_time: 4.2,
      median_delivery_time: 3.8,
      p90_delivery_time: 6.5,
      sla_adherence: 87.5,
      total_delivered: 3200,
    },
    daily: dates.map(d => ({
      date: d,
      avg_delivery_time: randFloat(d + "adt", 3.0, 6.0, 1),
      total_delivered: randInt(d + "td", 50, 180),
      sla_pct: randFloat(d + "sla", 75, 95),
    })),
    by_zone: [
      { zone: "Metro", avg_days: 2.8, orders: 1200 },
      { zone: "Tier 1", avg_days: 3.5, orders: 900 },
      { zone: "Tier 2", avg_days: 4.8, orders: 650 },
      { zone: "Tier 3", avg_days: 6.2, orders: 450 },
    ],
  });
}

function buildFailureZones(params: any) {
  return wrap({
    summary: {
      total_zones: 25,
      total_failures: 350,
      failure_rate: 8.5,
    },
    zones: CITIES.map((city, i) => ({
      city,
      state: STATES[i % STATES.length],
      total_orders: randInt(city + "to", 100, 1000),
      failed_orders: randInt(city + "fo", 5, 80),
      failure_rate: randFloat(city + "fr", 2, 15),
      top_reason: ["Address Issue", "Customer Unavailable", "Wrong PIN", "Refused"][i % 4],
    })),
  });
}

function buildReturnRate(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap({
    summary: {
      total_orders: 3500,
      returned_orders: 245,
      return_rate: 7.0,
      return_value: 367500,
      avg_return_value: 1500,
    },
    daily: dates.map(d => ({
      date: d,
      total_orders: randInt(d + "to", 80, 200),
      returned_orders: randInt(d + "ro", 2, 15),
      return_rate: randFloat(d + "rr", 3, 12),
    })),
  });
}

function buildGeographyRevenue(params: any) {
  return wrap({
    summary: {
      total_revenue: 4500000,
      total_orders: 3500,
      top_city: "City A",
      top_state: "State 1",
    },
    by_state: STATES.map((state, i) => ({
      state,
      revenue: randInt(state + "r", 200000, 1500000),
      orders: randInt(state + "o", 200, 1200),
      aov: randInt(state + "aov", 800, 2000),
      pct: randFloat(state + "p", 8, 35),
    })),
    by_city: CITIES.map((city, i) => ({
      city,
      state: STATES[i % STATES.length],
      revenue: randInt(city + "r", 100000, 800000),
      orders: randInt(city + "o", 50, 500),
      aov: randInt(city + "aov", 800, 2200),
    })),
  });
}

function buildCourierPerformance(params: any) {
  return wrap({
    summary: {
      total_shipments: 3500,
      avg_delivery_days: 4.2,
      on_time_pct: 87.5,
    },
    couriers: COURIER_NAMES.map((name, i) => ({
      courier_partner: name,
      total_orders: randInt(name + "to", 200, 1200),
      delivered: randInt(name + "del", 180, 1100),
      rto_count: randInt(name + "rto", 5, 80),
      rto_rate: randFloat(name + "rr", 3, 12),
      avg_delivery_days: randFloat(name + "add", 2.5, 6.5, 1),
      on_time_pct: randFloat(name + "otp", 70, 95),
      cost_per_shipment: randInt(name + "cps", 40, 120),
    })),
  });
}

function buildReturnReasons(params: any) {
  const reasons = ["Size/Fit Issue", "Product Damaged", "Wrong Product Received", "Quality Not As Expected", "Changed Mind", "Better Price Found", "Late Delivery"];
  return wrap({
    summary: {
      total_returns: 245,
      return_rate: 7.0,
    },
    reasons: reasons.map((reason, i) => ({
      reason,
      count: randInt(reason, 10, 80),
      pct: randFloat(reason + "p", 5, 30),
      value: randInt(reason + "v", 10000, 120000),
    })),
    by_category: CATEGORIES.map(cat => ({
      category: cat,
      return_rate: randFloat(cat + "rr", 3, 15),
      top_reason: reasons[randInt(cat, 0, reasons.length - 1)],
    })),
  });
}

function buildChannelRoi(params: any) {
  const channels = ["Meta Ads", "Google Ads", "Email", "SMS", "Influencer", "Organic", "Direct"];
  return wrap({
    summary: {
      total_spend: 850000,
      total_revenue: 4500000,
      blended_roas: 5.29,
    },
    channels: channels.map((ch, i) => ({
      channel: ch,
      spend: randInt(ch + "sp", 20000, 300000),
      revenue: randInt(ch + "r", 100000, 1500000),
      orders: randInt(ch + "o", 30, 500),
      new_customers: randInt(ch + "nc", 10, 200),
      roas: randFloat(ch + "roas", 1.5, 8.0),
      cpa: randInt(ch + "cpa", 100, 800),
    })),
  });
}

function buildCampaignCac(params: any) {
  const campaigns = ["Brand Awareness Q3", "Retargeting August", "Monsoon Sale", "New Launch Sep", "Loyalty Drive", "Performance Max"];
  return wrap({
    summary: {
      total_spend: 850000,
      new_customers: 2800,
      avg_cac: 304,
      target_cac: 350,
    },
    campaigns: campaigns.map((c, i) => ({
      campaign_name: c,
      spend: randInt(c + "sp", 50000, 250000),
      new_customers: randInt(c + "nc", 100, 800),
      cac: randInt(c + "cac", 150, 600),
      orders: randInt(c + "o", 50, 400),
      revenue: randInt(c + "r", 100000, 800000),
      roas: randFloat(c + "roas", 1.5, 6.0),
    })),
    daily: dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30").map(d => ({
      date: d,
      spend: randInt(d + "csp", 15000, 45000),
      new_customers: randInt(d + "cnc", 30, 150),
      cac: randInt(d + "ccac", 150, 500),
    })),
  });
}

function buildMarketingCost(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap({
    summary: {
      total_spend: 850000,
      total_orders: 3500,
      cost_per_order: 243,
      revenue: 4500000,
      roas: 5.29,
    },
    daily: dates.map(d => ({
      date: d,
      total_spend: randInt(d + "ms", 15000, 45000),
      orders: randInt(d + "mo", 50, 200),
      cost_per_order: randInt(d + "cpo", 100, 500),
      revenue: randInt(d + "mr", 50000, 250000),
    })),
  });
}

function buildCreativePerformance(params: any) {
  return wrap({
    summary: {
      total_creatives: 6,
      total_spend: 650000,
      total_revenue: 2800000,
      avg_roas: 4.31,
    },
    creatives: CREATIVE_NAMES.map((name, i) => ({
      creative_name: name,
      spend: randInt(name + "sp", 50000, 200000),
      impressions: randInt(name + "imp", 50000, 500000),
      clicks: randInt(name + "cl", 2000, 30000),
      ctr: randFloat(name + "ctr", 0.5, 5.0),
      orders: randInt(name + "o", 20, 300),
      revenue: randInt(name + "r", 80000, 600000),
      roas: randFloat(name + "roas", 1.5, 8.0),
      cpa: randInt(name + "cpa", 150, 600),
      revenue_actual: randInt(name + "ra", 80000, 600000),
    })),
  });
}

function buildAudienceRoas(params: any) {
  return wrap({
    summary: {
      total_audiences: 5,
      total_spend: 650000,
      total_revenue: 2800000,
    },
    audiences: ADSET_NAMES.map((name, i) => ({
      adset_name: name,
      spend: randInt(name + "sp", 50000, 250000),
      revenue: randInt(name + "r", 100000, 800000),
      impressions: randInt(name + "imp", 50000, 500000),
      clicks: randInt(name + "cl", 2000, 30000),
      orders: randInt(name + "o", 20, 300),
      roas: randFloat(name + "roas", 1.5, 8.0),
      cpa: randInt(name + "cpa", 150, 600),
      new_customers: randInt(name + "nc", 10, 200),
    })),
  });
}

function buildInfluencerAttribution(params: any) {
  return wrap({
    summary: {
      total_influencers: 6,
      total_revenue: 1200000,
      total_orders: 580,
      avg_roas: 3.8,
    },
    influencers: INFLUENCER_NAMES.map((name, i) => ({
      influencer_name: name,
      utm_code: `inf_${name.toLowerCase().replace(/\s/g, "_")}`,
      sessions: randInt(name + "s", 500, 5000),
      orders: randInt(name + "o", 20, 200),
      total_revenue: randInt(name + "r", 50000, 400000),
      spend: randInt(name + "sp", 10000, 100000),
      roas: randFloat(name + "roas", 1.5, 8.0),
      new_customers: randInt(name + "nc", 10, 100),
      conversion_rate: randFloat(name + "cr", 1, 8),
    })),
  });
}

function buildPaymentFailure(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap({
    summary: {
      total_attempts: 5200,
      failed_attempts: 420,
      failure_rate: 8.1,
      failed_value: 630000,
      recovered: 180,
      recovery_rate: 42.9,
    },
    daily: dates.map(d => ({
      date: d,
      total_attempts: randInt(d + "pa", 100, 300),
      failed: randInt(d + "pf", 5, 30),
      failure_rate: randFloat(d + "pfr", 3, 15),
    })),
    by_method: [
      { method: "UPI", attempts: 2500, failures: 150, rate: 6.0 },
      { method: "Credit Card", attempts: 1200, failures: 120, rate: 10.0 },
      { method: "Debit Card", attempts: 800, failures: 80, rate: 10.0 },
      { method: "Net Banking", attempts: 500, failures: 50, rate: 10.0 },
      { method: "Wallet", attempts: 200, failures: 20, rate: 10.0 },
    ],
  });
}

function buildGrowth(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap({
    summary: {
      qualified_sessions: 8500,
      total_users: 6200,
      session_to_order_rate: 4.8,
      mer: 3.85,
      total_revenue: 4500000,
      total_spend: 1168831,
      new_customers_paid: 1850,
      new_customer_orders: 2100,
      total_orders: 3500,
    },
    daily_trend: dates.map(d => ({
      date: d,
      orders: randInt(d + "go", 50, 200),
      revenue: randInt(d + "gr", 50000, 250000),
      spend: randInt(d + "gs", 15000, 60000),
      mer: randFloat(d + "gm", 2.0, 6.0),
    })),
  });
}

function buildMetricLibrary(params: any) {
  return wrap({
    metrics: [
      { name: "GMV", value: 4500000, format: "currency", category: "Revenue", description: "Gross Merchandise Value" },
      { name: "AOV", value: 1285, format: "currency", category: "Revenue", description: "Average Order Value" },
      { name: "Orders", value: 3500, format: "number", category: "Revenue", description: "Total orders placed" },
      { name: "MER", value: 3.85, format: "ratio", category: "Marketing", description: "Marketing Efficiency Ratio" },
      { name: "CAC", value: 304, format: "currency", category: "Marketing", description: "Customer Acquisition Cost" },
      { name: "ROAS", value: 5.29, format: "ratio", category: "Marketing", description: "Return on Ad Spend" },
      { name: "RPR", value: 28.5, format: "percent", category: "Retention", description: "Repeat Purchase Rate" },
      { name: "RTO Rate", value: 8.0, format: "percent", category: "Operations", description: "Return to Origin Rate" },
      { name: "Avg Delivery", value: 4.2, format: "days", category: "Operations", description: "Average delivery time" },
      { name: "Return Rate", value: 7.0, format: "percent", category: "Operations", description: "Product return rate" },
      { name: "Conversion Rate", value: 5.8, format: "percent", category: "Funnel", description: "Session to order" },
      { name: "Cart Abandonment", value: 62.0, format: "percent", category: "Funnel", description: "Cart abandonment rate" },
    ],
    mer: 3.85,
    avg_cac: 304,
    avg_aov: 1285,
    cac_payback_months: 2.1,
    total_revenue: 4500000,
    total_spend: 1168831,
    new_customers: 1850,
  });
}

function buildRetention(params: any) {
  return wrap({
    summary: {
      rpr_pct: 28.5,
      total_customers: 4500,
      repeat_customers: 1283,
      avg_cac: 304,
      avg_aov: 1285,
      estimated_ltv: 4565,
      gross_profit_ltv: 1917,
      ltv_cac_ratio: 15.02,
      cac_payback_months: 2.1,
      gross_margin_pct: 42.0,
    },
    retention_stack: RFM_SEGMENTS.slice(0, 6).map((seg, i) => ({
      segment: seg,
      count: randInt(seg + "rsc", 100, 800),
      share_pct: randFloat(seg + "rsp", 5, 25),
      avg_ltv: randInt(seg + "rsltv", 1000, 25000),
    })),
    gross_profit_ltv_by_segment: RFM_SEGMENTS.slice(0, 6).map((seg, i) => ({
      segment: seg,
      customer_count: randInt(seg + "gplc", 100, 800),
      avg_ltv: randInt(seg + "gpltv", 1000, 25000),
      gross_profit_ltv: randInt(seg + "gpgp", 400, 10000),
      total_ltv: randInt(seg + "gptl", 500000, 5000000),
    })),
    cohort_month1_trend: ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"].map(m => ({
      cohort_month: m,
      month1_retention: randFloat(m + "m1r", 18, 35),
    })),
    rpr_trend: dateRange(params.start_date || "2025-06-01", params.end_date || "2025-08-30").filter((_, i) => i % 7 === 0).map(d => ({
      date: d,
      rpr_pct: randFloat(d + "rprt", 22, 35),
    })),
  });
}

function buildMarketingPlatforms(params: any) {
  const platforms = ["Meta Ads", "Google Ads", "Email Marketing", "SMS", "Affiliate", "Organic Social"];
  return wrap({
    summary: {
      total_spend: 1168831,
      total_revenue: 4500000,
      blended_roas: 3.85,
      total_orders: 3500,
    },
    platforms: platforms.map((p, i) => ({
      platform: p,
      spend: randInt(p + "sp", 20000, 500000),
      revenue: randInt(p + "r", 50000, 1500000),
      orders: randInt(p + "o", 20, 800),
      new_customers: randInt(p + "nc", 10, 400),
      roas: randFloat(p + "roas", 1.0, 8.0),
      cac: randInt(p + "cac", 100, 800),
      impressions: randInt(p + "imp", 50000, 2000000),
      clicks: randInt(p + "cl", 2000, 100000),
      ctr: randFloat(p + "ctr", 0.5, 5.0),
    })),
    daily: dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30").map(d => ({
      date: d,
      spend: randInt(d + "mps", 20000, 60000),
      revenue: randInt(d + "mpr", 80000, 300000),
      roas: randFloat(d + "mproas", 2.0, 6.0),
    })),
  });
}

function buildClv(params: any) {
  const page = parseInt(params.page || "1");
  const limit = parseInt(params.limit || "20");
  const total = 200;
  const data = Array.from({ length: Math.min(limit, total - (page - 1) * limit) }, (_, i) => {
    const idx = (page - 1) * limit + i;
    const name = CUSTOMER_NAMES[idx % CUSTOMER_NAMES.length] + (idx >= CUSTOMER_NAMES.length ? ` ${Math.floor(idx / CUSTOMER_NAMES.length) + 1}` : "");
    return {
      customer_id: `CUST-${String(idx + 1).padStart(4, "0")}`,
      customer_name: name,
      email: `customer${idx + 1}@demo.com`,
      order_count: randInt(name + "oc", 1, 25),
      total_spend: randInt(name + "ts", 500, 150000),
      avg_order_value: randInt(name + "aov", 500, 5000),
      first_purchase_date: "2024-03-15",
      last_purchase_date: "2025-08-20",
      prev_month_orders: randInt(name + "pmo", 0, 5),
      curr_month_orders: randInt(name + "cmo", 0, 5),
      mom_growth_pct: randFloat(name + "mgp", -50, 100, 1),
    };
  });
  return wrap(data, {
    total,
    page,
    limit,
    lastPage: Math.ceil(total / limit),
    summary: {
      total_customers: total,
      total_revenue: 18500000,
      avg_order_value: 1285,
      avg_orders_per_customer: 3.8,
    },
  });
}

function buildEngagement(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap({
    sessions: 25000,
    visitors: 18500,
    pageviews: 82000,
    bounces: 8750,
    avg_session_duration_seconds: 185,
    avg_session_duration_formatted: "3m 5s",
    avg_pages_per_session: 3.28,
    bounce_rate_pct: 35.0,
    daily_trend: dates.map(d => ({
      date: d,
      pageviews: randInt(d + "epv", 1500, 4500),
      sessions: randInt(d + "es", 500, 1500),
    })),
    source: "demo",
    summary: {
      sessions: 25000,
      visitors: 18500,
      pageviews: 82000,
      bounces: 8750,
      avg_session_duration_seconds: 185,
      avg_pages_per_session: 3.28,
      bounce_rate_pct: 35.0,
    },
  });
}

function buildAcquisitionRetention(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap({
    summary: {
      new_customers: 1850,
      returning_customers: 1650,
      new_customer_revenue: 2100000,
      returning_customer_revenue: 2400000,
      new_pct: 52.9,
      returning_pct: 47.1,
    },
    daily: dates.map(d => ({
      date: d,
      new_customers: randInt(d + "anc", 30, 100),
      returning_customers: randInt(d + "arc", 25, 90),
      new_revenue: randInt(d + "anr", 30000, 120000),
      returning_revenue: randInt(d + "arr", 25000, 130000),
    })),
  });
}

function buildSignupCohorts(params: any) {
  const months = ["2024-07", "2024-08", "2024-09", "2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"];
  return wrap({
    cohorts: months.map((m, mi) => ({
      signup_month: m,
      total_signups: randInt(m + "ts", 200, 800),
      converted: randInt(m + "cv", 50, 300),
      conversion_rate: randFloat(m + "cr", 15, 50),
      total_revenue: randInt(m + "tr", 100000, 800000),
      avg_first_order_days: randFloat(m + "afod", 2, 30, 1),
    })),
  });
}

function buildCeoDashboard(params: any) {
  const today = new Date();
  const endStr = params.end_date || today.toISOString().slice(0, 10);
  const startStr = params.start_date || new Date(today.getTime() - 90 * 86400000).toISOString().slice(0, 10);
  const rangeDays = Math.max(7, Math.round((new Date(endStr).getTime() - new Date(startStr).getTime()) / 86400000));
  
  return wrap({
    week_number: 35,
    period: {
      current_start: startStr,
      current_end: endStr,
      prev_start: new Date(new Date(startStr).getTime() - rangeDays * 86400000).toISOString().slice(0, 10),
      prev_end: new Date(new Date(startStr).getTime() - 86400000).toISOString().slice(0, 10),
    },
    executive_summary: {
      gmv: { current: 4500000, target: 5000000, target_baseline: 5000000, target_baseline_days: 30, range_days: rangeDays, status: "on_track" },
      cac: { current: 304, target: 350, target_baseline: 350, range_days: rangeDays, status: "on_track" },
      conversion_rate: { current: 5.8, target: 6.0, target_baseline: 6.0, range_days: rangeDays, status: "watch" },
      aov: { current: 1285, target: 1300, target_baseline: 1300, range_days: rangeDays, status: "on_track" },
      rpr_60d: { current: 28.5, target: 30, target_baseline: 30, range_days: rangeDays, status: "watch" },
      dead_inventory: { current: 7.1, target: 5.0, target_baseline: 5.0, range_days: rangeDays, status: "needs_attention" },
      marketing_salary: { target: 250000 },
    },
    demand: {
      sessions: { current: 25000, previous: 22500, delta: 2500, delta_pct: 11.1 },
      new_users: { current: 18500, previous: 16800, delta: 1700, delta_pct: 10.1 },
      paid_vs_organic: { paid_pct: 45, organic_pct: 55, prev_paid_pct: 48, prev_organic_pct: 52 },
      influencer_traffic: { current: 3200, previous: 2800, delta: 400, delta_pct: 14.3 },
    },
    conversion: {
      add_to_cart_rate: { current: 19.2, previous: 17.8, delta: 1.4, delta_pct: 7.9 },
      checkout_completion: { current: 60.0, previous: 55.5, delta: 4.5, delta_pct: 8.1 },
      hero_sku_sellthrough: { current: 72.5, previous: 68.0, delta: 4.5, delta_pct: 6.6 },
      discount_dependency: { current: 35.0, previous: 38.0, delta: -3.0, delta_pct: -7.9 },
    },
    inventory: {
      stock_out_skus: { current: 35, previous: 42, delta: -7, delta_pct: -16.7 },
      inventory_coverage_days: { current: 62, previous: 58, delta: 4, delta_pct: 6.9 },
      aging_stock_pct: { current: 15.5, previous: 18.0, delta: -2.5, delta_pct: -13.9 },
      gross_margin: { current: 42.0, previous: 41.2, delta: 0.8, delta_pct: 1.9 },
    },
    fulfillment: {
      avg_delivery_days: { current: 4.2, previous: 4.5, delta: -0.3, delta_pct: -6.7 },
      sla_pct: { current: 87.5, previous: 84.0, delta: 3.5, delta_pct: 4.2 },
      rto_rate: { current: 8.0, previous: 9.2, delta: -1.2, delta_pct: -13.0 },
      support_tickets_per_1k: { current: 12, previous: 15, delta: -3, delta_pct: -20.0 },
    },
    retention: {
      cohort_rebuy_30d: { current: 28.5, previous: 26.0, delta: 2.5, delta_pct: 9.6 },
      email_revenue_share: { current: 0, previous: 0, delta: 0, static: true },
      nps: { current: 0, previous: 0, delta: 0, static: true },
      complaint_rate: { current: 0, previous: 0, delta: 0, static: true },
    },
    issues: [
      { area: "Logistics", issue: "Delivery SLA dip in Region B", owner: "Ops Lead", week: "W35", status: "in_progress" },
      { area: "Marketing", issue: "CAC spike on campaign X", owner: "Growth Lead", week: "W34", status: "open" },
      { area: "Product", issue: "High return rate on Product Delta", owner: "Product Lead", week: "W33", status: "resolved" },
    ],
    contribution_margin: {
      total_revenue: 4500000,
      cogs_estimate: 2610000,
      gross_profit: 1890000,
      marketing_spend: 1168831,
      contribution_margin: 721169,
      contribution_margin_pct: 16.0,
      gross_margin_pct: 42.0,
      note: "COGS estimated at 58% of revenue",
    },
    north_star_trend: dateRange(startStr, endStr).filter((_, i) => i % 3 === 0).map(d => ({
      date: d,
      gmv: randInt(d + "nsg", 80000, 250000),
      orders: randInt(d + "nso", 15, 60),
    })),
    channel_drilldown: UTM_SOURCES.slice(0, 6).map(src => ({
      source: src,
      revenue: randInt(src + "cdr", 100000, 1000000),
      orders: randInt(src + "cdo", 50, 500),
      sessions: randInt(src + "cds", 500, 5000),
    })),
    metric_library: {
      mer: 3.85,
      avg_cac: 304,
      avg_aov: 1285,
      cac_payback_months: 2.1,
      total_revenue: 4500000,
      total_spend: 1168831,
      new_customers: 1850,
    },
    operations: {
      rto_rate: 8.0,
      avg_delivery_days: 4.2,
      p90_delivery_days: 6.5,
      top_couriers: COURIER_NAMES.slice(0, 3).map(c => ({ name: c, orders: randInt(c + "coo", 200, 800) })),
      top_failure_zones: CITIES.slice(0, 3).map(c => ({ city: c, state: STATES[0], orders: randInt(c + "fzo", 100, 500), failed: randInt(c + "fzf", 5, 50) })),
    },
  });
}

function buildUsers() {
  return wrap([
    { id: "1", email: "admin@demo.com", name: "Admin User", role: "admin", permissions: ["all"], is_active: true },
    { id: "2", email: "analyst@demo.com", name: "Analyst User", role: "user", permissions: ["orders", "products", "ceo_dashboard"], is_active: true },
    { id: "3", email: "viewer@demo.com", name: "Viewer User", role: "user", permissions: ["orders"], is_active: true },
  ]);
}

function buildMetaEvents() {
  return wrap({
    events: [
      { event_name: "PageView", count: 45000, value: 0 },
      { event_name: "ViewContent", count: 12000, value: 0 },
      { event_name: "AddToCart", count: 3500, value: 5250000 },
      { event_name: "InitiateCheckout", count: 1800, value: 2700000 },
      { event_name: "Purchase", count: 850, value: 1275000 },
    ],
  });
}

function buildSignupCohortsApi(params: any) {
  const months = ["2024-07", "2024-08", "2024-09", "2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"];
  return wrap({
    cohorts: months.map((m, mi) => ({
      signup_month: m,
      total_signups: randInt(m + "ts", 200, 800),
      converted: randInt(m + "cv", 50, 300),
      conversion_rate: randFloat(m + "cr", 15, 50),
      total_revenue: randInt(m + "tr", 100000, 800000),
      avg_first_order_days: randFloat(m + "afod", 2, 30, 1),
    })),
  });
}

// ────────────────────────────────────────────────────────────
// ROUTE MATCHING
// ────────────────────────────────────────────────────────────

const ROUTE_HANDLERS: [RegExp, (params: any) => any][] = [
  // Orders
  [/^\/orders$/, buildDailyOrders],

  // Products
  [/^\/products\/category-stickiness$/, buildProductCategoryData],
  [/^\/products\/cross-category$/, buildProductCategoryData],
  [/^\/products\/new-category-trials$/, buildProductCategoryData],
  [/^\/products$/, buildProducts],

  // Carts
  [/^\/carts\/abandoned-products$/, buildCartsAbandonedProducts],
  [/^\/carts$/, buildCarts],

  // Coupons (with dynamic path)
  [/^\/coupons\/[^/]+$/, (p: any) => buildCoupons({ ...p, coupon_code: "DYNAMIC" })],
  [/^\/coupons$/, buildCoupons],

  // UTM
  [/^\/utm$/, buildUtm],

  // Searches
  [/^\/searches\/keywords$/, buildSearchKeywords],
  [/^\/searches\/analytics$/, buildSearchAnalytics],
  [/^\/searches$/, buildSearches],

  // Active Users
  [/^\/active-users$/, buildActiveUsers],

  // Reviews
  [/^\/reviews\/summary$/, buildReviewsSummary],
  [/^\/reviews\/recent$/, buildReviewsRecent],
  [/^\/reviews\/product-ratings$/, buildReviewsProductRatings],

  // Inventory
  [/^\/inventory\/summary$/, buildInventorySummary],

  // Correlations
  [/^\/correlations\/frequent-pairs$/, buildFrequentPairs],
  [/^\/correlations\/summary$/, buildCorrelationsSummary],

  // RFM
  [/^\/rfm-segments\/summary$/, buildRfmSummary],
  [/^\/rfm-segments$/, buildRfmSegments],

  // LTV
  [/^\/ltv-by-segment$/, buildLtvBySegment],

  // RPR
  [/^\/repeat-purchase-rate$/, buildRpr],

  // Funnel
  [/^\/funnel-metrics$/, buildFunnelMetrics],

  // Cohorts
  [/^\/repeat-cohorts$/, buildRepeatCohorts],
  [/^\/lifetime-cohorts$/, buildLifetimeCohorts],

  // Attribution
  [/^\/utm-attribution$/, buildUtmAttribution],
  [/^\/flow-attribution$/, buildFlowAttribution],

  // CEO Dashboard
  [/^\/ceo-dashboard(\/targets)?$/, buildCeoDashboard],

  // Operations
  [/^\/rto-rate$/, buildRtoRate],
  [/^\/delivery-time$/, buildDeliveryTime],
  [/^\/failure-zones$/, buildFailureZones],
  [/^\/return-rate$/, buildReturnRate],
  [/^\/geography-revenue$/, buildGeographyRevenue],
  [/^\/courier-performance$/, buildCourierPerformance],
  [/^\/return-reasons$/, buildReturnReasons],

  // Marketing
  [/^\/channel-roi$/, buildChannelRoi],
  [/^\/campaign-cac$/, buildCampaignCac],
  [/^\/marketing-cost-per-order$/, buildMarketingCost],
  [/^\/creative-performance$/, buildCreativePerformance],
  [/^\/audience-roas$/, buildAudienceRoas],
  [/^\/influencer-attribution$/, buildInfluencerAttribution],

  // Payment
  [/^\/payment-failure$/, buildPaymentFailure],

  // New dashboards
  [/^\/growth$/, buildGrowth],
  [/^\/metric-library$/, buildMetricLibrary],
  [/^\/retention$/, buildRetention],
  [/^\/marketing-platforms$/, buildMarketingPlatforms],
  [/^\/clv$/, buildClv],
  [/^\/engagement$/, buildEngagement],
  [/^\/acquisition-retention$/, buildAcquisitionRetention],
  [/^\/signup-cohorts$/, buildSignupCohorts],

  // Admin
  [/^\/users$/, buildUsers],

  // Meta Events
  [/^\/meta-events/, buildMetaEvents],

  // Auth
  [/^\/auth\/me$/, () => wrap({ id: "1", email: "admin@demo.com", name: "Demo Admin", role: "admin", permissions: ["all"] })],
  [/^\/auth\/logout$/, () => wrap({ message: "Logged out" })],
];

/**
 * Look up a mock response for the given URL path and query params.
 * Returns the response body object, or null if no match found.
 */
export function getMockResponse(url: string, params: Record<string, any> = {}): any {
  for (const [pattern, handler] of ROUTE_HANDLERS) {
    if (pattern.test(url)) {
      return handler(params);
    }
  }
  return null;
}
