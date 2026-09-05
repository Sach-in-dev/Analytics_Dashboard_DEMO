import re

with open('src/data/mock-responses.ts', 'r', encoding='utf-8') as f:
    content = f.read()

marketing_replacement = """function buildMarketingPlatforms(params: any) {
  const platforms = ["Meta Ads", "Google Ads", "Email Marketing", "SMS", "Affiliate", "Organic Social"];
  return wrap({
    summary: {
      total_spend: 1168831,
      total_revenue: 4500000,
      blended_roas: 3.85,
      total_orders: 3500,
    },
    meta_ads: {
      total_spend: 1168831,
      total_orders_attributed: 3500,
      avg_cac: 333,
      new_customers: 2100,
      top_creatives: [
        { ad_name: "Summer Sale Video", spend: 450000, revenue: 1800000, roas: 4.0, orders: 1200, ctr: 2.5 },
        { ad_name: "Retargeting Carousel", spend: 200000, revenue: 900000, roas: 4.5, orders: 800, ctr: 3.1 },
        { ad_name: "UGC Influencer #1", spend: 150000, revenue: 450000, roas: 3.0, orders: 400, ctr: 1.8 }
      ]
    },
    influencers: {
      total_revenue: 1250000,
      total_influencers: 45,
      total_orders: 850,
      top_influencers: [
        { influencer_name: "Beauty Guru", revenue: 450000, orders: 300, avg_order_value: 1500, active_days: 28 },
        { influencer_name: "Makeup Addict", revenue: 200000, orders: 150, avg_order_value: 1333, active_days: 15 },
        { influencer_name: "Skincare Daily", revenue: 150000, orders: 100, avg_order_value: 1500, active_days: 12 }
      ]
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
}"""

utm_replacement = """function buildUtmAttribution(params: any) {
  const dates = dateRange(params.start_date || "2025-08-01", params.end_date || "2025-08-30");
  return wrap({
    summary: {
      total_sessions: 25000,
      total_revenue: 4500000,
      total_orders: 1200,
      attributed_revenue: 3200000,
      avg_conversion: 5.8
    },
    data: UTM_SOURCES.map((src, i) => ({
      utm_source: src,
      utm_medium: "cpc",
      utm_campaign: "Summer Sale " + i,
      users: randInt("u"+i, 1000, 5000),
      sessions: randInt("s"+i, 1200, 6000),
      orders: randInt("o"+i, 50, 400),
      revenue: randInt("r"+i, 100000, 800000),
      conversion_rate: randFloat("cr"+i, 1.5, 6.5),
      aov: randInt("aov"+i, 800, 2500)
    })),
    by_campaign: UTM_SOURCES.map((src, i) => ({
      campaign: "Campaign " + i,
      revenue: randInt("crv"+i, 50000, 400000)
    })),
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
}"""

creative_replacement = """function buildCreativePerformance(params: any) {
  return wrap({
    summary: {
      total_creatives: 6,
      total_spend: 650000,
      total_revenue: 2800000,
      avg_roas: 4.31,
      best_creative: "Summer Sale Video",
      best_creative_roas: 5.2,
      worst_creative: "Static Image Ad",
      worst_creative_roas: 0.8,
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
    data: CREATIVE_NAMES.map((name, i) => ({
        ad_name: name,
        spend: randInt(name + "sp", 50000, 200000),
        revenue: randInt(name + "r", 80000, 600000),
        roas: randFloat(name + "roas", 1.5, 8.0),
        orders: randInt(name + "o", 20, 300),
        ctr: randFloat(name + "ctr", 0.5, 5.0),
        cpc: randInt(name + "cpa", 150, 600),
        impressions: randInt(name + "imp", 50000, 500000),
        clicks: randInt(name + "cl", 2000, 30000),
    }))
  });
}"""

content = re.sub(r'function buildMarketingPlatforms\(params: any\) \{.*?return wrap\(\{.*?\n\}\);\n\}', marketing_replacement, content, flags=re.DOTALL)
content = re.sub(r'function buildUtmAttribution\(params: any\) \{.*?return wrap\(\{.*?\n\}\);\n\}', utm_replacement, content, flags=re.DOTALL)
content = re.sub(r'function buildCreativePerformance\(params: any\) \{.*?return wrap\(\{.*?\n\}\);\n\}', creative_replacement, content, flags=re.DOTALL)

with open('src/data/mock-responses.ts', 'w', encoding='utf-8') as f:
    f.write(content)
