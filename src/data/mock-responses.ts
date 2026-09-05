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
  const data = dates.map((d) => {
    const total = randInt(d + "tc", 40, 140);
    const abandoned = randInt(d + "ac", 15, Math.max(20, Math.round(total * 0.65)));
    const completed = total - abandoned;
    const avgValue = randInt(d + "acv", 800, 3000);
    return {
      date: d,
      interval: "daily",
      total_carts: total,
      completed_carts: completed,
      abandoned_carts: abandoned,
      total_cart_value: total * avgValue,
      completed_cart_value: completed * avgValue,
      abandoned_cart_value: abandoned * avgValue,
    };
  });
  return wrap(data);
}

function buildCartsAbandonedProducts(params: any) {
  const items = PRODUCT_NAMES.slice(0, 12).map((name) => ({
    title: name,
    product_title: name,
    count: randInt(name + "ab", 10, 200),
    abandoned_count: randInt(name + "ab", 10, 200),
    abandoned_value: randInt(name + "abv", 5000, 100000),
  })).sort((a, b) => b.count - a.count);
  return wrap({ items, total: items.length });
}

const COUPON_TYPES: Record<string, string> = {
  SAVE10: "Percentage (10%)", WELCOME20: "Percentage (20%)", FLAT15: "Flat ₹150",
  FIRST50: "Flat ₹500", LOYALTY30: "Percentage (30%)", FESTIVE25: "Percentage (25%)",
  MEGA40: "Percentage (40%)", SUMMER15: "Flat ₹150",
};

function buildCoupons(params: any) {
  const code = params.coupon_code;
  if (code) {
    // Per-coupon detail metrics
    const realCode = code === "DYNAMIC" ? "SAVE10" : code;
    const orders = randInt(realCode + "o", 120, 900);
    const revenue = randInt(realCode + "r", 200000, 1500000);
    const discount = randInt(realCode + "d", 20000, 180000);
    return wrap({
      coupon_code: realCode,
      coupon_name: realCode,
      discount_type: COUPON_TYPES[realCode] || "Percentage (10%)",
      total_orders: orders,
      total_revenue: revenue,
      total_discount: discount,
      total_subtotal_amount: revenue + discount,
      average_order_value: Math.round(revenue / Math.max(1, orders)),
      redeemed_points: randInt(realCode + "pts", 500, 15000).toLocaleString(),
    });
  }
  return wrap(
    COUPON_CODES.map((c) => {
      const usage = randInt(c, 20, 500);
      return {
        coupon_code: c,
        coupon_name: c,
        discount_type: COUPON_TYPES[c] || "Percentage (10%)",
        usage_count: usage,
        total_discount: randInt(c + "d", 5000, 100000),
        total_revenue: randInt(c + "r", 50000, 500000),
        avg_order_value: randInt(c + "aov", 800, 2500),
      };
    }),
    { total: COUPON_CODES.length, page: 1, limit: 20, lastPage: 1 }
  );
}

function buildUtm(params: any) {
  // The UTM Analytics page groups by a single dimension (utm_type) and
  // reads rows of { key, views }.
  const type = params.utm_type || "source";
  const pool =
    type === "medium" ? UTM_MEDIUMS :
    type === "campaign" ? UTM_CAMPAIGNS :
    UTM_SOURCES;
  const rows = pool
    .map((key) => ({ key, views: randInt(type + key, 400, 12000) }))
    .sort((a, b) => b.views - a.views);
  const page = parseInt(params.page || "1");
  const limit = parseInt(params.limit || "10");
  const sliced = rows.slice((page - 1) * limit, page * limit);
  return wrap(sliced, { total: rows.length, page, limit, lastPage: Math.ceil(rows.length / limit) });
}

function buildSearches(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap(dates.map(d => {
    const total = randInt(d + "ts", 80, 600);
    const withResults = Math.round(total * randFloat(d + "wr", 0.7, 0.95));
    return {
      date: d,
      interval: "daily",
      total_searches: total,
      unique_searchers: randInt(d + "us", 40, Math.max(50, Math.round(total * 0.7))),
      with_results: withResults,
      zero_results: total - withResults,
    };
  }));
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
  const BRANDS = ["Lakmé", "Maybelline", "L'Oréal", "Nykaa", "Mamaearth", "Plum", "The Ordinary", "Minimalist"];
  const ATTRIBUTES = ["oily skin", "dry skin", "sensitive skin", "anti-aging", "brightening", "acne-prone", "SPF 50", "fragrance-free"];
  const kw = (i: number) => SEARCH_KEYWORDS[i % SEARCH_KEYWORDS.length];

  const top_keywords = SEARCH_KEYWORDS.map((k, i) => {
    const lastWeek = randInt(k + "lw", 200, 3000);
    const prevWeek = randInt(k + "pw", 150, 2800);
    return {
      keyword: k,
      top_search_volume_last_week: lastWeek,
      top_search_volume_last_week_2: prevWeek,
      rank_by_count: i + 1,
      trending_pct_change: parseFloat((((lastWeek - prevWeek) / Math.max(1, prevWeek)) * 100).toFixed(1)),
      sum_total_results: randInt(k + "sr", 50, 800),
      count_search_keywords: randInt(k + "ck", 5, 120),
    };
  }).sort((a, b) => b.top_search_volume_last_week - a.top_search_volume_last_week);

  const zero_result = ["glass skin serum", "vegan kajal", "waterproof sindoor", "korean sunscreen spf100", "ayurvedic retinol"].map((k, i) => ({
    keyword: k,
    sum_total_results: 0,
    top_search_volume_last_week: randInt(k + "zw", 40, 400),
    count_search_keywords: randInt(k + "zc", 3, 40),
  }));

  const low_result = ["blue lipstick", "men face serum", "SPF lip balm", "hair growth oil combo"].map((k, i) => ({
    keyword: k,
    sum_total_results: randInt(k + "lr", 1, 2),
    top_search_volume_last_week: randInt(k + "lw", 60, 500),
    count_search_keywords: randInt(k + "lc", 4, 50),
  }));

  const high_exit = SEARCH_KEYWORDS.slice(0, 6).map((k, i) => ({
    keyword: k,
    rank_exit_keywords: i + 1,
    exit_search_count: randInt(k + "ex", 30, 400),
    sum_total_results: randInt(k + "exr", 40, 600),
  }));

  const brand_volume = BRANDS.map((b) => ({
    brand: b,
    sum_total_results: randInt(b + "br", 100, 1500),
    top_search_volume_last_week: randInt(b + "bw", 200, 4000),
    count_search_keywords: randInt(b + "bc", 10, 200),
  })).sort((a, b) => b.top_search_volume_last_week - a.top_search_volume_last_week);

  const category_demand = CATEGORIES.map((c) => ({
    category: c,
    sum_total_results: randInt(c + "cr", 200, 2500),
    top_search_volume_last_week: randInt(c + "cw", 300, 5000),
    count_search_keywords: randInt(c + "cc", 20, 300),
  })).sort((a, b) => b.top_search_volume_last_week - a.top_search_volume_last_week);

  const attributes_frequency = ATTRIBUTES.map((a) => ({
    attributes: a,
    top_search_volume_last_week: randInt(a + "aw", 100, 2000),
    sum_total_results: randInt(a + "ar", 80, 1200),
    count_search_keywords: randInt(a + "ac", 8, 150),
  })).sort((a, b) => b.top_search_volume_last_week - a.top_search_volume_last_week);

  const new_vs_returning = ["New Customers", "Returning Customers"].map((t, i) => {
    const brand = randInt(t + "bs", 30, 70);
    return {
      user_type: t,
      brand_searches: randInt(t + "bsc", 500, 5000),
      brand_search_pct: brand,
      concern_searches: randInt(t + "cs", 400, 4500),
      concern_search_pct: 100 - brand,
    };
  });

  const high_intent_demand = SEARCH_KEYWORDS.slice(0, 8).map((k, i) => ({
    keyword: k,
    category: CATEGORIES[i % CATEGORIES.length],
    brand: BRANDS[i % BRANDS.length],
    search_count: randInt(k + "hisc", 300, 4000),
    avg_results: randInt(k + "har", 5, 40),
    last_7d_searches: randInt(k + "h7", 50, 900),
  }));

  const not_purchased_products = SEARCH_KEYWORDS.slice(0, 8).map((k, i) => {
    const vol = randInt(k + "npv", 400, 5000);
    const purchases = randInt(k + "npp", 1, 40);
    return {
      keyword: k,
      search_volume: vol,
      last_7d_searches: randInt(k + "np7", 60, 800),
      purchase_count: purchases,
      purchase_to_search_pct: parseFloat(((purchases / vol) * 100).toFixed(2)),
    };
  });

  return wrap({
    total_searches: 15420,
    unique_keywords: 892,
    avg_results_per_search: 12.5,
    zero_result_rate: 8.3,
    search_to_purchase_rate: 4.2,
    top_keywords,
    zero_result,
    low_result,
    high_exit,
    brand_volume,
    category_demand,
    attributes_frequency,
    new_vs_returning,
    high_intent_demand,
    not_purchased_products,
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
  const five = 620, four = 310, three = 145, two = 95, one = 75;
  const total = five + four + three + two + one;
  return wrap({
    total_reviews: total,
    average_rating: 4.2,
    avg_rating: 4.2,
    // Page reads summary.distribution["5"] … ["1"]
    distribution: { "5": five, "4": four, "3": three, "2": two, "1": one },
    five_star: five,
    four_star: four,
    three_star: three,
    two_star: two,
    one_star: one,
    rating_distribution: [
      { stars: 5, count: five, pct: 49.8 },
      { stars: 4, count: four, pct: 24.9 },
      { stars: 3, count: three, pct: 11.6 },
      { stars: 2, count: two, pct: 7.6 },
      { stars: 1, count: one, pct: 6.0 },
    ],
    sentiment_summary: { positive: 74.7, neutral: 11.6, negative: 13.6 },
  });
}

function buildReviewsRecent() {
  const titles = [
    "Absolutely love it!", "Great value for money", "Good but could be better",
    "Exceeded my expectations", "Not as described", "Will buy again",
    "Fast delivery, great product", "Average experience", "Highly recommend",
    "Perfect for daily use",
  ];
  const comments = [
    "Great product, highly recommend to everyone!",
    "Good quality and fast delivery. Very happy.",
    "Average, expected a little better for the price.",
    "Absolutely love it, will definitely reorder.",
    "Not exactly as described but still decent.",
    "Works really well, my skin feels amazing.",
    "Packaging was premium and product is genuine.",
    "Decent product, delivery took a bit long.",
    "Best purchase this month, five stars!",
    "Gentle and effective, perfect for sensitive skin.",
  ];
  const first = ["Aarav", "Diya", "Vivaan", "Anaya", "Aditya", "Ishaan", "Saanvi", "Kabir", "Myra", "Arjun"];
  const last = ["Sharma", "Patel", "Reddy", "Nair", "Gupta", "Singh", "Iyer", "Mehta", "Bose", "Kapoor"];
  return wrap(
    Array.from({ length: 10 }, (_, i) => {
      const seed = "rev" + i;
      const rating = randInt(seed + "rt", 3, 5);
      const day = 28 - i;
      return {
        id: i + 1,
        product_title: PRODUCT_NAMES[i % PRODUCT_NAMES.length],
        first_name: first[i % first.length],
        last_name: last[i % last.length],
        rating,
        title: titles[i % titles.length],
        comment: comments[i % comments.length],
        created_at: `2025-08-${String(day).padStart(2, "0")}`,
      };
    })
  );
}

function buildReviewsProductRatings(params: any = {}) {
  const page = parseInt(params.page || "1");
  const limit = parseInt(params.limit || "10");
  const all = PRODUCT_NAMES.map((name, i) => ({
    product_id: `PRD-${String(i + 1).padStart(4, "0")}`,
    product_title: name,
    average_rating: randFloat(name + "r", 2.5, 5.0, 1),
    avg_rating: randFloat(name + "r", 2.5, 5.0, 1),
    review_count: randInt(name + "rc", 5, 200),
    five_star_pct: randFloat(name + "5s", 20, 70),
  }));
  // Sort by rating desc / asc based on sort_by
  if (params.sort_by === "lowest") all.sort((a, b) => a.average_rating - b.average_rating);
  else all.sort((a, b) => b.average_rating - a.average_rating);
  const sliced = all.slice((page - 1) * limit, page * limit);
  return wrap(sliced, { total: all.length, page, limit, lastPage: Math.ceil(all.length / limit) });
}

function buildInventorySummary() {
  return wrap({
    // Field names the inventory page reads:
    total_tracked_variants: 450,
    total_locked_capital: 25400000,
    dead_stock_variants: 22,
    dead_stock_value: 1800000,
    total_stock_outs: 35,
    // Extra fields kept for completeness:
    total_skus: 450,
    in_stock: 380,
    out_of_stock: 35,
    low_stock: 35,
    total_value: 25400000,
    dead_stock_count: 22,
    dead_stock_pct: 7.1,
    avg_days_on_hand: 45,
    stockout_rate: 7.8,
    coverage_days: 62,
    turnover_rate: 5.9,
    aging_breakdown: [
      { range: "0-30 days", count: 200, value: 12000000 },
      { range: "31-60 days", count: 100, value: 7000000 },
      { range: "61-90 days", count: 80, value: 4000000 },
      { range: "90+ days", count: 70, value: 2400000 },
    ],
  });
}

// Shared pool of SKU-level rows for the inventory tab tables.
function inventoryRow(i: number, opts: { zeroQty?: boolean } = {}) {
  const name = PRODUCT_NAMES[i % PRODUCT_NAMES.length];
  const seed = name + i;
  const daysAgo = randInt(seed + "d", 30, 240);
  const created = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
  return {
    product_title: `${name} — ${CATEGORIES[i % CATEGORIES.length]} Variant`,
    sku: `SKU-${String(i + 1).padStart(4, "0")}`,
    inventory_quantity: opts.zeroQty ? 0 : randInt(seed + "q", 1, 400),
    total_value: randInt(seed + "v", 8000, 480000),
    created_at: created,
    updated_at: created,
  };
}

function paginateRows(rows: any[], params: any) {
  const page = parseInt(params.page || "1");
  const limit = parseInt(params.limit || "12");
  const sliced = rows.slice((page - 1) * limit, page * limit);
  return wrap(sliced, { total: rows.length, page, limit, lastPage: Math.ceil(rows.length / limit) });
}

function buildInventoryDeadStock(params: any) {
  const rows = Array.from({ length: 22 }, (_, i) => inventoryRow(i + 100));
  return paginateRows(rows, params);
}

function buildInventoryStockOuts(params: any) {
  const rows = Array.from({ length: 35 }, (_, i) => inventoryRow(i + 200, { zeroQty: true }));
  return paginateRows(rows, params);
}

function buildInventoryAging(params: any) {
  const rows = Array.from({ length: 48 }, (_, i) => inventoryRow(i + 300));
  return paginateRows(rows, params);
}

function buildInventoryMerchandisingGaps() {
  return wrap(
    Array.from({ length: 12 }, (_, i) => {
      const r = inventoryRow(i + 400, { zeroQty: true });
      return { ...r, search_demand: randInt("gap" + i, 50, 3000) };
    })
  );
}

function buildInventoryDemandForecast() {
  const signals = ["CRITICAL", "REORDER_SOON", "HEALTHY"];
  return wrap(
    Array.from({ length: 15 }, (_, i) => {
      const name = PRODUCT_NAMES[i % PRODUCT_NAMES.length];
      const velocity = randInt(name + "vel", 2, 40);
      const stock = randInt(name + "stk", 0, 600);
      const days = velocity > 0 ? Math.round(stock / velocity) : 0;
      const signal = days <= 7 ? "CRITICAL" : days <= 21 ? "REORDER_SOON" : "HEALTHY";
      return {
        product_title: `${name} — ${CATEGORIES[i % CATEGORIES.length]} Variant`,
        daily_velocity: velocity,
        current_stock: stock,
        days_of_stock: days,
        reorder_signal: signal,
      };
    })
  );
}

function buildCorrelationsSummary(params: any) {
  return wrap({
    // Field names the correlations page reads:
    total_active_orders: 8420,
    multi_item_orders: 3970,
    bundling_percentage: 47.1,
    // Extras:
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
  // Build many deterministic pairs so the table has plenty of rows.
  const pairs: any[] = [];
  for (let i = 0; i < PRODUCT_NAMES.length - 1 && pairs.length < 25; i += 2) {
    const a = PRODUCT_NAMES[i];
    const b = PRODUCT_NAMES[i + 1];
    pairs.push({
      product_a: a,
      product_b: b,
      co_occurrences: randInt(a + b + "co", 40, 480),
      pair_count: randInt(a + b + "pc", 40, 480),
      support_pct: randFloat(a + b + "s", 3, 15),
      lift: randFloat(a + b + "l", 1.2, 4.5),
    });
  }
  pairs.sort((x, y) => y.co_occurrences - x.co_occurrences);
  const page = parseInt(params.page || "1");
  const limit = parseInt(params.limit || "10");
  const sliced = pairs.slice((page - 1) * limit, page * limit);
  return wrap(sliced, { total: pairs.length, page, limit, lastPage: Math.ceil(pairs.length / limit) });
}

function buildRfmSummary(params: any) {
  return wrap({
    total_customers: 4500,
    segments: RFM_SEGMENTS.map((seg, i) => {
      const count = randInt(seg, 100, 800);
      return {
        segment: seg,
        count,
        customer_count: count,
        percentage: randFloat(seg + "s", 3, 25),
        share_pct: randFloat(seg + "s", 3, 25),
        avg_recency_days: randInt(seg + "r", 5, 180),
        avg_recency: randInt(seg + "r", 5, 180),
        avg_frequency: randFloat(seg + "f", 1, 15),
        avg_monetary: randInt(seg + "m", 500, 50000),
      };
    }),
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
      total_revenue: 18900000,
      avg_ltv: 4200,
      median_ltv: 3100,
      top_10_pct_ltv: 18500,
    },
    segments: RFM_SEGMENTS.slice(0, 6).map((seg, i) => {
      const custs = randInt(seg + "lc", 100, 800);
      return {
        segment: seg,
        total_customers: custs,
        customer_count: custs,
        avg_ltv: randInt(seg + "ltv", 1000, 25000),
        median_ltv: randInt(seg + "mltv", 800, 20000),
        total_revenue: randInt(seg + "tr", 500000, 5000000),
      };
    }),
    trend: dateRange("2025-01-01", "2025-08-30").filter((_, i) => i % 30 === 0).map(d => ({
      date: d,
      avg_ltv: randInt(d + "ltv", 3500, 5000),
    })),
  });
}

function buildRpr(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap({
    // Page reads these directly off data:
    rpr_percentage: 28.5,
    total_customers: 4500,
    repeat_customers: 1283,
    one_time_customers: 3217,
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
  const total_users = 12500;
  const open_users = 6800;
  const click_users = 2400;
  const payment_failure_users = 350;
  const converted_users = 720;
  const rate = (n: number) => parseFloat(((n / total_users) * 100).toFixed(1));
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap({
    totals: {
      total_users,
      open_users,
      click_users,
      payment_failure_users,
      converted_users,
    },
    rates: {
      open_rate: rate(open_users),
      click_rate: rate(click_users),
      payment_failure_rate: rate(payment_failure_users),
      conversion_rate: rate(converted_users),
    },
    funnel_drop: {
      open_to_click_drop: parseFloat((((open_users - click_users) / open_users) * 100).toFixed(1)),
      click_to_conversion_drop: parseFloat((((click_users - converted_users) / click_users) * 100).toFixed(1)),
    },
    trend: dates.map((d) => ({
      date: d,
      open_rate: randFloat(d + "or", 45, 62, 1),
      click_rate: randFloat(d + "cr", 14, 24, 1),
      conversion_rate: randFloat(d + "cvr", 3.5, 8, 1),
      payment_failure_rate: randFloat(d + "pfr", 1.5, 4.5, 1),
    })),
    // Legacy fields kept for any other consumer:
    conversion_rate: rate(converted_users),
    stages: [
      { stage: "Total Users", count: total_users, rate: 100 },
      { stage: "Opened", count: open_users, rate: rate(open_users) },
      { stage: "Clicked", count: click_users, rate: rate(click_users) },
      { stage: "Converted", count: converted_users, rate: rate(converted_users) },
    ],
  });
}

function buildRepeatCohorts(params: any) {
  const months = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"];
  const cohorts = months.map((m, mi) => {
    const cohort_size = randInt(m + "sz", 200, 600);
    const data = Array.from({ length: 7 - mi }, (_, i) => ({
      index: i,
      rate: i === 0 ? 100 : Math.max(4, Math.round(randFloat(m + i + "rt", 38 - i * 6, 48 - i * 5))),
      customers: i === 0 ? cohort_size : randInt(m + i + "c", 10, cohort_size),
      revenue: randInt(m + i + "r", 20000, 200000),
    }));
    return { cohort_month: m, cohort_size, data };
  });

  const month1 = cohorts.map((c) => ({
    month: c.cohort_month,
    size: c.cohort_size,
    month_1_rate: c.data.find((d) => d.index === 1)?.rate ?? 0,
  }));
  const best = month1.reduce((b, c) => (c.month_1_rate > b.month_1_rate ? c : b), month1[0]);
  const worst = month1.reduce((w, c) => (c.month_1_rate < w.month_1_rate ? c : w), month1[0]);
  const avgM1 = parseFloat((month1.reduce((s, c) => s + c.month_1_rate, 0) / month1.length).toFixed(1));

  return wrap({
    cohorts,
    summary: {
      total_cohorts: cohorts.length,
      avg_retention_month_1: avgM1,
      best_cohort: best,
      worst_cohort: worst,
    },
  });
}

function buildLifetimeCohorts(params: any) {
  const months = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"];
  const cohorts = months.map((m, mi) => {
    const cohort_size = randInt(m + "lsz", 200, 600);
    let cumulative = 0;
    const data = Array.from({ length: 7 - mi }, (_, i) => {
      const revenue = randInt(m + i + "rev", 40000, 260000) - i * 3000;
      const rev = Math.max(8000, revenue);
      cumulative += rev;
      return {
        index: i,
        revenue: rev,
        cumulative_revenue: cumulative,
        avg_ltv: Math.round(cumulative / cohort_size),
      };
    });
    return { cohort_month: m, cohort_size, data };
  });

  const perCohort = cohorts.map((c) => {
    const last = c.data[c.data.length - 1];
    const m0 = c.data.find((d) => d.index === 0)?.revenue ?? 0;
    const m1 = c.data.find((d) => d.index === 1)?.revenue ?? 0;
    return {
      month: c.cohort_month,
      size: c.cohort_size,
      avg_ltv: last.avg_ltv,
      cumulative_revenue: last.cumulative_revenue,
      m0_revenue: m0,
      m1_revenue: m1,
      growth_pct: m0 > 0 ? parseFloat((((m1 - m0) / m0) * 100).toFixed(1)) : 0,
    };
  });
  const best = perCohort.reduce((b, c) => (c.avg_ltv > b.avg_ltv ? c : b), perCohort[0]);
  const fastest = perCohort.reduce((f, c) => (c.growth_pct > f.growth_pct ? c : f), perCohort[0]);
  const total_revenue = cohorts.reduce((s, c) => s + c.data[c.data.length - 1].cumulative_revenue, 0);
  const avg_ltv = Math.round(perCohort.reduce((s, c) => s + c.avg_ltv, 0) / perCohort.length);

  return wrap({
    cohorts,
    summary: {
      total_cohorts: cohorts.length,
      total_revenue,
      avg_ltv,
      best_cohort: { month: best.month, size: best.size, avg_ltv: best.avg_ltv, cumulative_revenue: best.cumulative_revenue },
      fastest_growing: { month: fastest.month, size: fastest.size, m0_revenue: fastest.m0_revenue, m1_revenue: fastest.m1_revenue, growth_pct: fastest.growth_pct },
    },
  });
}

function buildUtmAttribution(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  const by_source = UTM_SOURCES.map(src => {
    const sessions = randInt(src + "s", 500, 5000);
    const orders = randInt(src + "o", 10, 300);
    const revenue = randInt(src + "r", 50000, 800000);
    return {
      source: src,
      sessions,
      users: randInt(src + "u", 300, 3000),
      orders,
      revenue,
      conversion_rate: parseFloat(((orders / sessions) * 100).toFixed(2)),
      aov: Math.round(revenue / Math.max(1, orders)),
    };
  });
  const by_campaign = UTM_CAMPAIGNS.map(c => {
    const sessions = randInt(c + "s", 400, 4000);
    const orders = randInt(c + "o", 8, 250);
    const revenue = randInt(c + "r", 40000, 700000);
    return {
      campaign: c,
      sessions,
      orders,
      revenue,
      conversion_rate: parseFloat(((orders / sessions) * 100).toFixed(2)),
      aov: Math.round(revenue / Math.max(1, orders)),
    };
  });
  // Detailed source/medium/campaign rows for the table (data.data)
  const detail: any[] = [];
  UTM_SOURCES.forEach((src) => {
    UTM_MEDIUMS.slice(0, 2).forEach((med) => {
      const campaign = UTM_CAMPAIGNS[randInt(src + med, 0, UTM_CAMPAIGNS.length - 1)];
      const sessions = randInt(src + med + "s", 200, 3000);
      const orders = randInt(src + med + "o", 5, 180);
      const revenue = randInt(src + med + "r", 20000, 500000);
      detail.push({
        utm_source: src,
        utm_medium: med,
        utm_campaign: campaign,
        sessions,
        orders,
        revenue,
        conversion_rate: parseFloat(((orders / sessions) * 100).toFixed(2)),
        aov: Math.round(revenue / Math.max(1, orders)),
      });
    });
  });
  detail.sort((a, b) => b.revenue - a.revenue);

  const totalSessions = by_source.reduce((s, r) => s + r.sessions, 0);
  const totalOrders = by_source.reduce((s, r) => s + r.orders, 0);
  const totalRevenue = by_source.reduce((s, r) => s + r.revenue, 0);
  const topSource = [...by_source].sort((a, b) => b.revenue - a.revenue)[0];
  const topCampaign = [...by_campaign].sort((a, b) => b.revenue - a.revenue)[0];

  return wrap({
    data: detail,
    summary: {
      total_sessions: totalSessions,
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      attributed_revenue: Math.round(totalRevenue * 0.72),
      avg_conversion_rate: parseFloat(((totalOrders / totalSessions) * 100).toFixed(2)),
      avg_aov: Math.round(totalRevenue / Math.max(1, totalOrders)),
      top_source: topSource,
      top_campaign: topCampaign,
    },
    by_source,
    by_campaign,
    daily: dates.map(d => ({
      date: d,
      sessions: randInt(d + "us", 200, 1500),
      orders: randInt(d + "uo", 5, 60),
      revenue: randInt(d + "ur", 20000, 200000),
    })),
  });
}

function buildFlowAttribution(params: any) {
  const STEPS = ["website_visit", "paid_ad", "signup", "login", "wishlist", "add_to_cart", "cart_created", "purchase"];
  const PATHS = [
    "website_visit > add_to_cart > purchase",
    "paid_ad > website_visit > add_to_cart > purchase",
    "website_visit > signup > add_to_cart > cart_created > purchase",
    "paid_ad > signup > login > add_to_cart > purchase",
    "website_visit > wishlist > add_to_cart > purchase",
    "login > add_to_cart > cart_created > purchase",
    "paid_ad > website_visit > wishlist > add_to_cart > cart_created > purchase",
    "website_visit > signup > wishlist > purchase",
    "paid_ad > add_to_cart > purchase",
    "website_visit > login > add_to_cart > cart_created > purchase",
  ];
  const flows = PATHS.map((path) => {
    const users = randInt(path + "u", 200, 4000);
    const orders = randInt(path + "o", 20, Math.max(30, Math.round(users * 0.25)));
    const revenue = randInt(path + "r", 40000, 700000);
    return {
      flow_path: path,
      steps_count: path.split(" > ").length,
      users,
      orders,
      revenue,
      conversion_rate: parseFloat(((orders / users) * 100).toFixed(2)),
      aov: Math.round(revenue / Math.max(1, orders)),
    };
  });
  const sorted = [...flows].sort((a, b) => b.revenue - a.revenue);
  const totalUsers = flows.reduce((s, f) => s + f.users, 0);
  const totalOrders = flows.reduce((s, f) => s + f.orders, 0);
  const totalRevenue = flows.reduce((s, f) => s + f.revenue, 0);

  // Step-to-step transition volumes
  const transitions = [
    ["paid_ad", "website_visit"], ["website_visit", "signup"], ["signup", "login"],
    ["website_visit", "add_to_cart"], ["login", "add_to_cart"], ["website_visit", "wishlist"],
    ["wishlist", "add_to_cart"], ["add_to_cart", "cart_created"], ["cart_created", "purchase"],
    ["add_to_cart", "purchase"], ["signup", "wishlist"], ["paid_ad", "add_to_cart"],
  ];
  const step_transitions = transitions.map(([from, to]) => ({
    from,
    to,
    value: randInt(from + to, 500, 8000),
  }));

  return wrap({
    flows: sorted,
    top_flows: sorted.slice(0, 10),
    step_transitions,
    summary: {
      total_users: totalUsers,
      total_orders: totalOrders,
      total_revenue: totalRevenue,
      avg_conversion_rate: parseFloat(((totalOrders / totalUsers) * 100).toFixed(2)),
      avg_aov: Math.round(totalRevenue / Math.max(1, totalOrders)),
      total_unique_flows: flows.length,
      top_flow: sorted[0],
    },
  });
}

function buildRtoRate(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  const trend = dates.map(d => {
    const total = randInt(d + "to", 80, 200);
    const rto = randInt(d + "rto", 3, 20);
    return {
      date: d,
      total_orders: total,
      rto_orders: rto,
      rto_rate: parseFloat(((rto / total) * 100).toFixed(1)),
      rto_revenue_loss: rto * randInt(d + "v", 1200, 1800),
    };
  });
  return wrap({
    summary: {
      total_orders: 3500,
      rto_orders: 280,
      rto_rate: 8.0,
      rto_revenue_loss: 420000,
      rto_loss: 420000,
      avg_rto_value: 1500,
    },
    trend,
    daily: trend,
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
  const trend = dates.map(d => {
    const total = randInt(d + "to", 50, 180);
    return {
      date: d,
      total_orders: total,
      avg_delivery_time: randFloat(d + "adt", 3.0, 6.0, 1),
      median_delivery_time: randFloat(d + "med", 2.5, 5.0, 1),
      p90_delivery_time: randFloat(d + "p90", 5.5, 8.5, 1),
      delayed_orders: randInt(d + "del", 2, 30),
    };
  });
  return wrap({
    summary: {
      total_orders: 3500,
      avg_delivery_time: 4.2,
      median_delivery_time: 3.8,
      p90_delivery_time: 6.5,
      delayed_orders: 438,
      sla_adherence: 87.5,
      total_delivered: 3200,
      delays_by_carrier: COURIER_NAMES.map((c) => ({ name: c, count: randInt(c + "dc", 20, 160) })),
      delays_by_state: STATES.map((s) => ({ name: s, count: randInt(s + "ds", 15, 140) })),
    },
    trend,
    daily: trend,
    by_zone: [
      { zone: "Metro", avg_days: 2.8, orders: 1200 },
      { zone: "Tier 1", avg_days: 3.5, orders: 900 },
      { zone: "Tier 2", avg_days: 4.8, orders: 650 },
      { zone: "Tier 3", avg_days: 6.2, orders: 450 },
    ],
  });
}

function buildFailureZones(params: any) {
  const zones = CITIES.map((city, i) => {
    const total = randInt(city + "to", 200, 1200);
    const failed = randInt(city + "fo", 8, Math.round(total * 0.18));
    const rto = randInt(city + "ro", 5, Math.round(total * 0.15));
    return {
      city,
      state: STATES[i % STATES.length],
      total_orders: total,
      failed_orders: failed,
      rto_orders: rto,
      failure_rate: parseFloat(((failed / total) * 100).toFixed(1)),
      rto_rate: parseFloat(((rto / total) * 100).toFixed(1)),
      top_reason: ["Address Issue", "Customer Unavailable", "Wrong PIN", "Refused"][i % 4],
    };
  });

  const totalOrders = zones.reduce((s, z) => s + z.total_orders, 0);
  const failedOrders = zones.reduce((s, z) => s + z.failed_orders, 0);
  const rtoOrders = zones.reduce((s, z) => s + z.rto_orders, 0);

  // Aggregate by state for top_rto_states
  const stateAgg: Record<string, { total: number; rto: number }> = {};
  zones.forEach((z) => {
    if (!stateAgg[z.state]) stateAgg[z.state] = { total: 0, rto: 0 };
    stateAgg[z.state].total += z.total_orders;
    stateAgg[z.state].rto += z.rto_orders;
  });
  const top_rto_states = Object.entries(stateAgg)
    .map(([state, v]) => ({
      state,
      total_orders: v.total,
      rto_orders: v.rto,
      rto_rate: parseFloat(((v.rto / v.total) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.rto_rate - a.rto_rate);

  return wrap({
    summary: {
      total_orders: totalOrders,
      failed_orders: failedOrders,
      rto_orders: rtoOrders,
      avg_failure_rate: parseFloat(((failedOrders / totalOrders) * 100).toFixed(1)),
      avg_rto_rate: parseFloat(((rtoOrders / totalOrders) * 100).toFixed(1)),
    },
    zones,
    top_failure_cities: [...zones].sort((a, b) => b.failure_rate - a.failure_rate).slice(0, 10),
    top_rto_states,
  });
}

function buildReturnRate(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  const trend = dates.map(d => {
    const delivered = randInt(d + "to", 80, 200);
    const returned = randInt(d + "ro", 2, 15);
    return {
      date: d,
      total_delivered_orders: delivered,
      returned_orders: returned,
      return_rate: parseFloat(((returned / delivered) * 100).toFixed(1)),
      return_revenue_loss: returned * randInt(d + "v", 1200, 1800),
    };
  });
  return wrap({
    summary: {
      total_delivered_orders: 3500,
      returned_orders: 245,
      return_rate: 7.0,
      return_revenue_loss: 367500,
      avg_return_value: 1500,
    },
    trend,
    daily: trend,
  });
}

function buildGeographyRevenue(params: any) {
  const top_cities = CITIES.map((city, i) => {
    const orders = randInt(city + "o", 120, 700);
    const revenue = randInt(city + "r", 150000, 900000);
    return {
      city,
      state: STATES[i % STATES.length],
      total_orders: orders,
      total_revenue: revenue,
      avg_order_value: Math.round(revenue / orders),
      unique_customers: randInt(city + "uc", 80, 550),
    };
  }).sort((a, b) => b.total_revenue - a.total_revenue);

  const stateAgg: Record<string, { orders: number; revenue: number }> = {};
  top_cities.forEach((c) => {
    if (!stateAgg[c.state]) stateAgg[c.state] = { orders: 0, revenue: 0 };
    stateAgg[c.state].orders += c.total_orders;
    stateAgg[c.state].revenue += c.total_revenue;
  });
  const top_states = Object.entries(stateAgg)
    .map(([state, v]) => ({
      state,
      total_orders: v.orders,
      total_revenue: v.revenue,
      avg_order_value: Math.round(v.revenue / Math.max(1, v.orders)),
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue);

  const totalRevenue = top_cities.reduce((s, c) => s + c.total_revenue, 0);
  const totalOrders = top_cities.reduce((s, c) => s + c.total_orders, 0);

  return wrap({
    summary: {
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      avg_order_value: Math.round(totalRevenue / Math.max(1, totalOrders)),
      unique_customers: top_cities.reduce((s, c) => s + c.unique_customers, 0),
    },
    top_cities,
    top_states,
    top_city: top_cities[0],
    // Legacy aliases:
    by_city: top_cities,
    by_state: top_states,
  });
}

function buildCourierPerformance(params: any) {
  const couriers = COURIER_NAMES.map((name, i) => {
    const total = randInt(name + "to", 300, 1300);
    const rto = randInt(name + "rto", 8, Math.round(total * 0.12));
    const failed = randInt(name + "fo", 5, Math.round(total * 0.08));
    const delivered = total - rto - failed;
    return {
      courier_partner: name,
      total_orders: total,
      delivered_orders: delivered,
      rto_orders: rto,
      failed_orders: failed,
      rto_rate: parseFloat(((rto / total) * 100).toFixed(1)),
      failure_rate: parseFloat(((failed / total) * 100).toFixed(1)),
      avg_delivery_time: randFloat(name + "add", 2.5, 6.5, 1),
      on_time_pct: randFloat(name + "otp", 70, 95),
      cost_per_shipment: randInt(name + "cps", 40, 120),
    };
  });

  const totalOrders = couriers.reduce((s, c) => s + c.total_orders, 0);
  const deliveredOrders = couriers.reduce((s, c) => s + c.delivered_orders, 0);
  const rtoOrders = couriers.reduce((s, c) => s + c.rto_orders, 0);
  const failedOrders = couriers.reduce((s, c) => s + c.failed_orders, 0);
  // Best courier = lowest RTO rate among those with enough volume
  const best_courier = [...couriers].filter(c => c.total_orders >= 5).sort((a, b) => a.rto_rate - b.rto_rate)[0];

  return wrap({
    summary: {
      total_orders: totalOrders,
      delivered_orders: deliveredOrders,
      rto_orders: rtoOrders,
      failed_orders: failedOrders,
      rto_rate: parseFloat(((rtoOrders / totalOrders) * 100).toFixed(1)),
      failure_rate: parseFloat(((failedOrders / totalOrders) * 100).toFixed(1)),
      avg_delivery_time: parseFloat((couriers.reduce((s, c) => s + c.avg_delivery_time, 0) / couriers.length).toFixed(1)),
    },
    couriers,
    best_courier,
  });
}

function buildReturnReasons(params: any) {
  const reasonDefs = [
    { code: "SIZE_FIT", text: "Size / Fit Issue" },
    { code: "DAMAGED", text: "Product Damaged" },
    { code: "WRONG_ITEM", text: "Wrong Product Received" },
    { code: "QUALITY", text: "Quality Not As Expected" },
    { code: "CHANGED_MIND", text: "Changed Mind" },
    { code: "BETTER_PRICE", text: "Better Price Found" },
    { code: "LATE_DELIVERY", text: "Late Delivery" },
    { code: "NOT_AS_DESCRIBED", text: "Not As Described" },
  ];
  const rows = reasonDefs.map((r) => ({
    reason_code: r.code,
    reason_text: r.text,
    total_cases: randInt(r.code, 12, 90),
    total_revenue_loss: randInt(r.code + "v", 15000, 140000),
  }));
  const totalCases = rows.reduce((s, r) => s + r.total_cases, 0);
  const totalLoss = rows.reduce((s, r) => s + r.total_revenue_loss, 0);
  const data = rows
    .map((r) => ({ ...r, percentage: parseFloat(((r.total_cases / totalCases) * 100).toFixed(1)) }))
    .sort((a, b) => b.total_cases - a.total_cases);

  const topReason = data[0];
  const highestLoss = [...data].sort((a, b) => b.total_revenue_loss - a.total_revenue_loss)[0];

  return wrap({
    data,
    summary: {
      total_returns: totalCases,
      total_revenue_loss: totalLoss,
      top_reason: topReason.reason_text,
      top_reason_percentage: topReason.percentage,
      highest_loss_reason: highestLoss.reason_text,
      highest_loss_amount: highestLoss.total_revenue_loss,
      return_rate: 7.0,
    },
    // Legacy:
    reasons: data,
  });
}

function buildChannelRoi(params: any) {
  const channelNames = ["Meta Ads", "Google Ads", "Email", "SMS", "Influencer", "Organic", "Direct"];
  const channels = channelNames.map((ch, i) => {
    const spend = randInt(ch + "sp", 20000, 300000);
    const revenue = randInt(ch + "r", 100000, 1500000);
    const orders = randInt(ch + "o", 30, 500);
    return {
      channel: ch,
      total_spend: spend,
      total_revenue: revenue,
      total_orders: orders,
      new_customers: randInt(ch + "nc", 10, 200),
      roas: parseFloat((revenue / Math.max(1, spend)).toFixed(2)),
      roi: parseFloat(((revenue - spend) / Math.max(1, spend)).toFixed(2)),
      cpa: Math.round(spend / Math.max(1, orders)),
    };
  });
  const totalSpend = channels.reduce((s, c) => s + c.total_spend, 0);
  const totalRevenue = channels.reduce((s, c) => s + c.total_revenue, 0);
  const totalOrders = channels.reduce((s, c) => s + c.total_orders, 0);
  const best = [...channels].sort((a, b) => b.roi - a.roi)[0];
  return wrap({
    summary: {
      total_revenue: totalRevenue,
      total_spend: totalSpend,
      total_orders: totalOrders,
      overall_roas: parseFloat((totalRevenue / Math.max(1, totalSpend)).toFixed(2)),
      overall_roi: parseFloat(((totalRevenue - totalSpend) / Math.max(1, totalSpend)).toFixed(2)),
      blended_roas: parseFloat((totalRevenue / Math.max(1, totalSpend)).toFixed(2)),
      best_channel: best.channel,
      best_channel_roi: best.roi,
    },
    channels,
  });
}

function buildCampaignCac(params: any) {
  const names = ["Brand Awareness Q3", "Retargeting August", "Monsoon Sale", "New Launch Sep", "Loyalty Drive", "Performance Max"];
  const campaigns = names.map((c, i) => {
    const spend = randInt(c + "sp", 50000, 250000);
    const newCust = randInt(c + "nc", 100, 800);
    const orders = randInt(c + "o", 50, 400);
    const revenue = randInt(c + "r", 100000, 800000);
    return {
      campaign_name: c,
      total_spend: spend,
      new_customers: newCust,
      cac: Math.round(spend / Math.max(1, newCust)),
      total_orders: orders,
      total_revenue: revenue,
      roas: parseFloat((revenue / Math.max(1, spend)).toFixed(2)),
    };
  });
  const totalSpend = campaigns.reduce((s, c) => s + c.total_spend, 0);
  const totalNew = campaigns.reduce((s, c) => s + c.new_customers, 0);
  const totalOrders = campaigns.reduce((s, c) => s + c.total_orders, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.total_revenue, 0);
  const byCac = [...campaigns].sort((a, b) => a.cac - b.cac);
  const best = byCac[0];
  const worst = byCac[byCac.length - 1];
  const trend = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30").map(d => {
    const spend = randInt(d + "csp", 15000, 45000);
    const newC = randInt(d + "cnc", 30, 150);
    const orders = randInt(d + "co", 20, 120);
    const rev = randInt(d + "cr", 40000, 180000);
    return {
      date: d,
      total_spend: spend,
      new_customers: newC,
      total_orders: orders,
      total_revenue: rev,
      cac: Math.round(spend / Math.max(1, newC)),
    };
  });
  return wrap({
    summary: {
      total_spend: totalSpend,
      total_new_customers: totalNew,
      total_orders: totalOrders,
      total_revenue: totalRevenue,
      avg_cac: Math.round(totalSpend / Math.max(1, totalNew)),
      best_campaign: best.campaign_name,
      best_campaign_cac: best.cac,
      worst_campaign: worst.campaign_name,
      worst_campaign_cac: worst.cac,
      total_campaigns: campaigns.length,
    },
    campaigns,
    trend,
    daily: trend,
  });
}

function buildMarketingCost(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  const trend = dates.map(d => {
    const spend = randInt(d + "ms", 15000, 45000);
    const orders = randInt(d + "mo", 50, 200);
    return {
      date: d,
      total_spend: spend,
      total_orders: orders,
      cost_per_order: Math.round(spend / Math.max(1, orders)),
      total_revenue: randInt(d + "mr", 50000, 250000),
    };
  });
  const totalSpend = trend.reduce((s, t) => s + t.total_spend, 0);
  const totalOrders = trend.reduce((s, t) => s + t.total_orders, 0);
  const byCpo = [...trend].sort((a, b) => a.cost_per_order - b.cost_per_order);
  return wrap({
    summary: {
      total_spend: totalSpend,
      total_orders: totalOrders,
      cost_per_order: Math.round(totalSpend / Math.max(1, totalOrders)),
      total_days: trend.length,
      best_day: { date: byCpo[0].date, cost_per_order: byCpo[0].cost_per_order },
      worst_day: { date: byCpo[byCpo.length - 1].date, cost_per_order: byCpo[byCpo.length - 1].cost_per_order },
    },
    trend,
    daily: trend,
  });
}

function buildCreativePerformance(params: any) {
  const creatives = CREATIVE_NAMES.map((name, i) => {
    const spend = randInt(name + "sp", 50000, 200000);
    const impressions = randInt(name + "imp", 50000, 500000);
    const clicks = randInt(name + "cl", 2000, 30000);
    const orders = randInt(name + "o", 20, 300);
    const revenue_actual = randInt(name + "ra", 80000, 600000);
    // Meta-reported revenue tends to be inflated vs actual
    const revenue_meta = Math.round(revenue_actual * randFloat(name + "infl", 1.0, 1.45));
    const revenue_diff = parseFloat((((revenue_meta - revenue_actual) / Math.max(1, revenue_actual)) * 100).toFixed(1));
    return {
      creative_id: `CR-${String(i + 1).padStart(3, "0")}`,
      creative_name: name,
      campaign_name: UTM_CAMPAIGNS[i % UTM_CAMPAIGNS.length],
      spend,
      impressions,
      clicks,
      ctr: parseFloat(((clicks / impressions) * 100).toFixed(2)),
      orders,
      revenue: revenue_meta,
      revenue_actual,
      revenue_diff,
      roas: parseFloat((revenue_actual / Math.max(1, spend)).toFixed(2)),
      cpa: Math.round(spend / Math.max(1, orders)),
      flag: revenue_diff > 20 ? "over_reporting" : "healthy",
    };
  });
  const totalSpend = creatives.reduce((s, c) => s + c.spend, 0);
  const totalActual = creatives.reduce((s, c) => s + c.revenue_actual, 0);
  const totalOrders = creatives.reduce((s, c) => s + c.orders, 0);
  const byRoas = [...creatives].sort((a, b) => b.roas - a.roas);
  const best = byRoas[0];
  const worst = byRoas[byRoas.length - 1];
  const overReporting = creatives.filter((c) => c.flag === "over_reporting").length;
  const trend = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30").map(d => {
    const spend = randInt(d + "crs", 10000, 40000);
    const actual = randInt(d + "cra", 30000, 160000);
    return {
      date: d,
      spend,
      revenue_actual: actual,
      orders: randInt(d + "cro", 15, 120),
      clicks: randInt(d + "crc", 800, 12000),
      impressions: randInt(d + "cri", 20000, 200000),
      roas: parseFloat((actual / Math.max(1, spend)).toFixed(2)),
    };
  });
  return wrap({
    summary: {
      total_spend: totalSpend,
      total_revenue_actual: totalActual,
      avg_roas: parseFloat((totalActual / Math.max(1, totalSpend)).toFixed(2)),
      total_orders: totalOrders,
      best_creative: best.creative_name,
      best_creative_roas: best.roas,
      worst_creative: worst.creative_name,
      worst_creative_roas: worst.roas,
      total_creatives: creatives.length,
      over_reporting_count: overReporting,
    },
    creatives,
    trend,
  });
}

function buildAudienceRoas(params: any) {
  const audiences = ADSET_NAMES.map((name, i) => {
    const spend = randInt(name + "sp", 50000, 250000);
    const revenue = Math.round(spend * randFloat(name + "rr", 1.8, 6.5));
    const conversions = randInt(name + "o", 20, 300);
    return {
      adset_id: `AS-${String(i + 1).padStart(3, "0")}`,
      adset_name: name,
      campaign_name: UTM_CAMPAIGNS[i % UTM_CAMPAIGNS.length],
      spend,
      revenue,
      impressions: randInt(name + "imp", 50000, 500000),
      clicks: randInt(name + "cl", 2000, 30000),
      conversions,
      orders: conversions,
      roas: parseFloat((revenue / Math.max(1, spend)).toFixed(2)),
      cpa: Math.round(spend / Math.max(1, conversions)),
      new_customers: randInt(name + "nc", 10, 200),
    };
  });
  const totalSpend = audiences.reduce((s, a) => s + a.spend, 0);
  const totalRevenue = audiences.reduce((s, a) => s + a.revenue, 0);
  const totalConversions = audiences.reduce((s, a) => s + a.conversions, 0);
  const byRoas = [...audiences].sort((a, b) => b.roas - a.roas);
  const best = byRoas[0];
  const worst = byRoas[byRoas.length - 1];
  const trend = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30").map(d => {
    const spend = randInt(d + "as", 10000, 40000);
    const revenue = randInt(d + "ar", 40000, 180000);
    return {
      date: d,
      spend,
      revenue,
      clicks: randInt(d + "ac", 800, 12000),
      impressions: randInt(d + "ai", 20000, 200000),
      conversions: randInt(d + "aco", 15, 120),
      roas: parseFloat((revenue / Math.max(1, spend)).toFixed(2)),
    };
  });
  return wrap({
    summary: {
      total_spend: totalSpend,
      total_revenue: totalRevenue,
      avg_roas: parseFloat((totalRevenue / Math.max(1, totalSpend)).toFixed(2)),
      total_conversions: totalConversions,
      total_audiences: audiences.length,
      best_audience: best.adset_name,
      best_audience_roas: best.roas,
      worst_audience: worst.adset_name,
      worst_audience_roas: worst.roas,
    },
    audiences,
    trend,
    campaigns: UTM_CAMPAIGNS,
  });
}

function buildInfluencerAttribution(params: any) {
  const influencers = INFLUENCER_NAMES.map((name, i) => {
    const pageViews = randInt(name + "pv", 300, 6000);
    const visitors = Math.round(pageViews * randFloat(name + "vr", 0.4, 0.8));
    const revenue = randInt(name + "r", 50000, 400000);
    return {
      influencer_name: name,
      utm_code: `inf_${name.toLowerCase().replace(/\s/g, "_")}`,
      total_orders: pageViews, // page views (chart labels this "Page Views")
      unique_customers: visitors, // unique visitors
      total_revenue: revenue,
      aov: Math.round(revenue / Math.max(1, randInt(name + "o", 20, 200))),
    };
  }).sort((a, b) => b.total_orders - a.total_orders)
    .map((inf, idx) => ({ ...inf, rank: idx + 1 }));

  const top = influencers[0];
  const worst = influencers[influencers.length - 1];
  const totalRevenue = influencers.reduce((s, x) => s + x.total_revenue, 0);
  const totalOrders = influencers.reduce((s, x) => s + x.total_orders, 0);

  const trend = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30").map(d => {
    const orders = randInt(d + "io", 40, 400);
    const revenue = randInt(d + "ir", 8000, 60000);
    return {
      date: d,
      orders,
      revenue,
      customers: Math.round(orders * randFloat(d + "ic", 0.4, 0.8)),
      aov: Math.round(revenue / Math.max(1, randInt(d + "in", 5, 40))),
    };
  });

  return wrap({
    summary: {
      total_influencers: influencers.length,
      total_orders: totalOrders, // total page views (KPI)
      total_customers: influencers.reduce((s, x) => s + x.unique_customers, 0), // unique visitors (KPI)
      total_revenue: totalRevenue,
      top_influencer: top.influencer_name,
      top_influencer_revenue: top.total_revenue,
      worst_influencer: worst.influencer_name,
      worst_influencer_revenue: worst.total_revenue,
      avg_aov: Math.round(totalRevenue / Math.max(1, totalOrders)),
    },
    influencers,
    trend,
  });
}

function buildPaymentFailure(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  const failedPayments = 420;
  const recoveredOrders = 180;
  const trend = dates.map(d => {
    const total = randInt(d + "pa", 100, 300);
    const failed = randInt(d + "pf", 5, 30);
    return {
      date: d,
      total_attempts: total,
      failed_payments: failed,
      failure_rate: parseFloat(((failed / total) * 100).toFixed(1)),
    };
  });
  const providers = [
    { provider: "Razorpay", payment_mode: "UPI", attempts: 2500, failed: 150 },
    { provider: "Razorpay", payment_mode: "Credit Card", attempts: 1200, failed: 120 },
    { provider: "PayU", payment_mode: "Debit Card", attempts: 800, failed: 80 },
    { provider: "Cashfree", payment_mode: "Net Banking", attempts: 500, failed: 50 },
    { provider: "Paytm", payment_mode: "Wallet", attempts: 200, failed: 20 },
  ].map((r) => ({
    ...r,
    failure_rate: parseFloat(((r.failed / r.attempts) * 100).toFixed(1)),
    lost_gmv: r.failed * randInt(r.provider + r.payment_mode, 1200, 1800),
  }));
  const reasons = [
    { error_code: "INSUFFICIENT_FUNDS", failed: 120 },
    { error_code: "BANK_DECLINED", failed: 95 },
    { error_code: "TXN_FAILED", failed: 80 },
    { error_code: "SESSION_TIMEOUT", failed: 65 },
    { error_code: "OTP_FAILED", failed: 40 },
    { error_code: "GATEWAY_ERROR", failed: 20 },
  ].map((r) => ({ ...r, lost_gmv: r.failed * randInt(r.error_code, 1200, 1800) }));

  return wrap({
    summary: {
      total_attempts: 5200,
      failed_payments: failedPayments,
      failure_rate: 8.1,
      lost_gmv: 630000,
      affected_customers: 385,
      recovered_orders: recoveredOrders,
      recovery_rate: parseFloat(((recoveredOrders / failedPayments) * 100).toFixed(1)),
      recovered_gmv: 270000,
    },
    trend,
    daily: trend,
    by_method: providers,
    by_reason: reasons,
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
    estimated_ltv: 4565,
    ltv_cac_ratio: 15.02,
    cac_payback_months: 2.1,
    rpr_pct: 28.5,
    gross_margin_pct: 42.0,
    contribution_margin: 721169,
    contribution_margin_pct: 16.0,
    runway_days: 210,
    period_days: 30,
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
      loyal_customer_pct: 34.2,
      avg_month1_retention: 28.9,
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
  // Meta Ads creatives
  const top_creatives = CREATIVE_NAMES.map((name, i) => {
    const spend = randInt(name + "msp", 40000, 200000);
    const roas = randFloat(name + "mroas", 1.6, 6.5);
    const revenue = Math.round(spend * roas);
    const orders = randInt(name + "mo", 20, 280);
    return {
      ad_name: name,
      spend,
      revenue,
      roas: parseFloat(roas.toFixed(2)),
      orders,
      ctr: randFloat(name + "mctr", 0.6, 4.5),
    };
  }).sort((a, b) => b.roas - a.roas);
  const metaSpend = top_creatives.reduce((s, c) => s + c.spend, 0);
  const metaOrders = top_creatives.reduce((s, c) => s + c.orders, 0);
  const metaNewCust = Math.round(metaOrders * 0.55);

  // Influencers
  const top_influencers = INFLUENCER_NAMES.map((name, i) => {
    const orders = randInt(name + "mio", 20, 220);
    const revenue = randInt(name + "mir", 60000, 420000);
    return {
      influencer_name: name,
      revenue,
      orders,
      avg_order_value: Math.round(revenue / Math.max(1, orders)),
      active_days: randInt(name + "mad", 5, 30),
    };
  }).sort((a, b) => b.revenue - a.revenue);
  const infRevenue = top_influencers.reduce((s, x) => s + x.revenue, 0);
  const infOrders = top_influencers.reduce((s, x) => s + x.orders, 0);

  return wrap({
    meta_ads: {
      total_spend: metaSpend,
      total_orders_attributed: metaOrders,
      total_orders: metaOrders,
      avg_cac: Math.round(metaSpend / Math.max(1, metaNewCust)),
      new_customers: metaNewCust,
      top_creatives,
    },
    influencers: {
      total_revenue: infRevenue,
      total_orders: infOrders,
      total_influencers: top_influencers.length,
      top_influencers,
    },
    google_ads: null,
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
  const rawSources = UTM_SOURCES.map((src) => {
    const sessions = randInt(src + "as", 800, 8000);
    const orders = randInt(src + "ao", 40, 500);
    const revenue = randInt(src + "ar", 100000, 1200000);
    return { source: src, sessions, orders, revenue, conversion_rate: parseFloat(((orders / sessions) * 100).toFixed(2)) };
  });
  const totalRev = rawSources.reduce((s, x) => s + x.revenue, 0);
  const source_breakdown = rawSources
    .map((s) => ({ ...s, revenue_share_pct: parseFloat(((s.revenue / totalRev) * 100).toFixed(1)) }))
    .sort((a, b) => b.revenue - a.revenue);

  const cohort_retention_by_month = Array.from({ length: 7 }, (_, i) => ({
    month_index: i,
    avg_retention_pct: i === 0 ? 100 : Math.max(6, Math.round(randFloat("acr" + i, 40 - i * 5, 50 - i * 4))),
  }));

  const medium_breakdown = UTM_MEDIUMS.map((medium) => ({
    medium,
    revenue: randInt(medium + "amr", 80000, 900000),
    orders: randInt(medium + "amo", 30, 400),
    sessions: randInt(medium + "ams", 500, 6000),
  })).sort((a, b) => b.revenue - a.revenue);

  return wrap({
    source_breakdown,
    cohort_retention_by_month,
    medium_breakdown,
    summary: {
      new_customers: 1850,
      returning_customers: 1650,
      new_customer_revenue: 2100000,
      returning_customer_revenue: 2400000,
      new_pct: 52.9,
      returning_pct: 47.1,
    },
  });
}

function buildSignupCohorts(params: any) {
  const months = ["2024-07", "2024-08", "2024-09", "2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"];
  const cohorts = months.map((m, mi) => {
    const cohort_size = randInt(m + "cs", 200, 800);
    const nPeriods = Math.min(12, months.length - mi);
    const periods = Array.from({ length: nPeriods }, (_, i) => {
      const retention_pct = i === 0 ? 100 : Math.max(4, Math.round(randFloat(m + i + "rp", 34 - i * 4, 46 - i * 3)));
      return {
        cohort_index: i,
        retention_pct,
        active_customers: Math.round(cohort_size * (retention_pct / 100)),
      };
    });
    return { signup_cohort: m, cohort_size, periods };
  });

  // Average retention across cohorts per month-index
  const maxIndex = Math.max(...cohorts.map((c) => c.periods.length));
  const retention_curve = Array.from({ length: maxIndex }, (_, idx) => {
    const vals = cohorts.map((c) => c.periods.find((p) => p.cohort_index === idx)?.retention_pct).filter((v): v is number => v != null);
    return {
      cohort_index: idx,
      avg_retention_pct: vals.length ? parseFloat((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1)) : 0,
    };
  });

  const m1 = cohorts.map((c) => ({ cohort: c.signup_cohort, m1: c.periods.find((p) => p.cohort_index === 1)?.retention_pct ?? 0 }));
  const best = m1.reduce((b, c) => (c.m1 > b.m1 ? c : b), m1[0]);
  const avgM1 = parseFloat((m1.reduce((s, c) => s + c.m1, 0) / m1.length).toFixed(1));

  return wrap({
    cohorts,
    retention_curve,
    summary: {
      total_cohorts: cohorts.length,
      avg_month1_retention: avgM1,
      best_cohort: best.cohort,
    },
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
  [/^\/inventory\/dead-stock$/, buildInventoryDeadStock],
  [/^\/inventory\/stock-outs$/, buildInventoryStockOuts],
  [/^\/inventory\/aging$/, buildInventoryAging],
  [/^\/inventory\/merchandising-gaps$/, buildInventoryMerchandisingGaps],
  [/^\/inventory\/demand-forecast$/, buildInventoryDemandForecast],

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
