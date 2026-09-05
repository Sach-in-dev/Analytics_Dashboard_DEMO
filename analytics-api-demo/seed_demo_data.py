"""
Demo data seeder for the Analytics Dashboard DEMO build.

Populates the demo ANALYTICS_DB (see .env / docker-compose.yml — a separate
database from the real project, never the production one) with fully
fictional, internally-consistent data across ~2.5 years so every dashboard
tab, chart, filter, and comparison mode has something realistic to show.

Safe to re-run: it truncates its own tables first, then regenerates
deterministically (fixed random seed) from scratch.

Usage:
    python seed_demo_data.py
"""

import asyncio
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete, insert, select

sys.path.insert(0, ".")

from app.database import Base, AnalyticsSessionLocal, analytics_engine  # noqa: E402
from app.models.user_model import AnalyticsUser  # noqa: E402
from app.models import analytics as m  # noqa: E402

RNG = random.Random(20260901)


def uid() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    # Naive UTC — every "createdAt"/"updatedAt" column in the schema is
    # TIMESTAMP WITHOUT TIME ZONE, so a tz-aware value would be rejected.
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ────────────────────────────────────────────────────────────────────
# Date range: 2024-01-01 .. yesterday. Full history so YoY/MoM/QoQ
# comparisons and long trend charts all have real data to show.
# ────────────────────────────────────────────────────────────────────
DATE_START = date(2024, 1, 1)
DATE_END = date.today() - timedelta(days=1)
ALL_DATES = [DATE_START + timedelta(days=i) for i in range((DATE_END - DATE_START).days + 1)]


def months_in_range():
    out = []
    y, mo = DATE_START.year, DATE_START.month
    while (y, mo) <= (DATE_END.year, DATE_END.month):
        out.append((y, mo))
        mo += 1
        if mo > 12:
            mo = 1
            y += 1
    return out


ALL_MONTHS = months_in_range()

# ────────────────────────────────────────────────────────────────────
# Fictional catalog / dimension pools — "BeautyBarn", an Indian D2C
# beauty & personal-care brand.
# ────────────────────────────────────────────────────────────────────
PRODUCTS = [
    ("Vitamin C Glow Serum", "Skincare"),
    ("Hyaluronic Acid Moisture Booster", "Skincare"),
    ("Niacinamide 10% Blemish Control", "Skincare"),
    ("Charcoal Detox Face Wash", "Skincare"),
    ("Rice Water Brightening Toner", "Skincare"),
    ("SPF 50 Matte Sunscreen", "Skincare"),
    ("Retinol Night Repair Cream", "Skincare"),
    ("Green Tea Clay Mask", "Skincare"),
    ("Argan Oil Hair Serum", "Haircare"),
    ("Onion Anti-Hairfall Shampoo", "Haircare"),
    ("Keratin Smoothening Conditioner", "Haircare"),
    ("Rosemary Growth Hair Oil", "Haircare"),
    ("Silk Protein Hair Mask", "Haircare"),
    ("Matte Liquid Lipstick - Rosewood", "Makeup"),
    ("Matte Liquid Lipstick - Coral Rush", "Makeup"),
    ("HD Full Coverage Foundation", "Makeup"),
    ("Kohl Kajal - Jet Black", "Makeup"),
    ("Waterproof Eyeliner", "Makeup"),
    ("Compact Powder - Ivory", "Makeup"),
    ("Blush Duo - Peach Glow", "Makeup"),
    ("Eau De Parfum - Citrus Bloom", "Fragrance"),
    ("Eau De Parfum - Oud Noir", "Fragrance"),
    ("Body Mist - Vanilla Musk", "Fragrance"),
    ("Shea Butter Body Lotion", "Bath & Body"),
    ("Coffee Body Scrub", "Bath & Body"),
    ("Rose Bath Bomb Trio", "Bath & Body"),
    ("Aloe Vera Gel", "Bath & Body"),
    ("Lavender Hand Cream", "Bath & Body"),
    ("Biotin Gummies for Hair & Skin", "Wellness"),
    ("Collagen Glow Powder", "Wellness"),
    ("Detox Green Tea Sachets", "Wellness"),
    ("Beard Growth Oil", "Men's Grooming"),
    ("Activated Charcoal Face Wash for Men", "Men's Grooming"),
    ("Cooling After Shave Balm", "Men's Grooming"),
    ("Baby Soft Moisturizing Lotion", "Baby Care"),
    ("Tear-Free Baby Shampoo", "Baby Care"),
    ("Glow Kit - Serum + Moisturizer + Sunscreen", "Skincare"),
    ("Festive Gift Box - Bath & Body", "Bath & Body"),
    ("Travel Size Skincare Kit", "Skincare"),
    ("Lip Care Combo - 3 Shades", "Makeup"),
]

CITY_STATE = [
    ("Mumbai", "Maharashtra"), ("Delhi", "Delhi"), ("Bengaluru", "Karnataka"),
    ("Hyderabad", "Telangana"), ("Chennai", "Tamil Nadu"), ("Kolkata", "West Bengal"),
    ("Pune", "Maharashtra"), ("Ahmedabad", "Gujarat"), ("Jaipur", "Rajasthan"),
    ("Lucknow", "Uttar Pradesh"), ("Surat", "Gujarat"), ("Chandigarh", "Chandigarh"),
    ("Kochi", "Kerala"), ("Indore", "Madhya Pradesh"), ("Nagpur", "Maharashtra"),
    ("Bhopal", "Madhya Pradesh"), ("Patna", "Bihar"), ("Coimbatore", "Tamil Nadu"),
    ("Guwahati", "Assam"), ("Gurugram", "Haryana"), ("Noida", "Uttar Pradesh"),
]

COURIERS = ["Delhivery", "BlueDart", "Ekart", "XpressBees", "DTDC", "Shadowfax", "Ecom Express"]

PAYMENT_PROVIDERS_MODES = [
    ("phonepe", "UPI_QR"), ("phonepe", "PHONEPE"), ("ccavenue", "NET_BANKING"),
    ("ccavenue", "Credit Card"), ("razorpay", "UPI_QR"), ("razorpay", "Debit Card"),
    ("payu", "Wallet"), ("razorpay", "COD"),
]
ERROR_CODES = ["TXN_NOT_COMPLETED", "TXN_CANCELLED", "INSUFFICIENT_FUNDS", "BANK_DECLINED", "TIMEOUT", "UNKNOWN"]

RETURN_REASONS = [
    ("DAMAGED", "Damaged Product"), ("SIZE_ISSUE", "Size Issue"),
    ("WRONG_ITEM", "Wrong Item Delivered"), ("QUALITY_ISSUE", "Quality Issue"),
    ("LATE_DELIVERY", "Late Delivery"), ("CHANGED_MIND", "Customer Changed Mind"),
    ("NOT_AS_DESCRIBED", "Not as Described"),
]

# (source, medium) pairs -> channel bucket, per _classify_channel heuristics
UTM_SOURCES = [
    ("google", "cpc", "paid_search"), ("google", "organic", "organic"),
    ("facebook", "paid_social", "paid_social"), ("instagram", "paid_social", "paid_social"),
    ("direct", "none", "direct"), ("klaviyo", "email", "email"),
    ("newsletter", "email", "email"), ("youtube", "cpc", "paid_search"),
    ("pinterest", "social", "paid_social"), ("affiliate_partner", "referral", "Other"),
    ("influencer_meera_reel", "social", "paid_social"), ("bing", "cpc", "paid_search"),
]
UTM_MEDIUMS = sorted(set(s[1] for s in UTM_SOURCES))
UTM_CAMPAIGNS = [
    "summer_sale_2025", "diwali_dhamaka", "new_year_glow", "monsoon_skincare",
    "brand_awareness_q1", "retargeting_cart", "influencer_collab_q3", "republic_day_sale",
]
UTM_TERMS = ["vitamin c serum", "hair fall shampoo", "sunscreen spf50", "matte lipstick", "none"]
UTM_CONTENTS = ["creative_a", "creative_b", "reel_1", "static_banner", "none"]

COUPONS = [
    ("WELCOME10", "Welcome Discount 10%", "percentage", 10),
    ("FLAT200", "Flat ₹200 Off", "fixed", 200),
    ("GLOW20", "Glow Sale 20%", "percentage", 20),
    ("MONSOON15", "Monsoon Special 15%", "percentage", 15),
    ("BDAY25", "Birthday Special 25%", "percentage", 25),
    ("FESTIVE30", "Festive Season 30%", "percentage", 30),
    ("FREESHIP", "Free Shipping", "fixed", 79),
    ("LOYALTY10", "Loyalty Reward 10%", "percentage", 10),
    ("NEWYEAR20", "New Year 20%", "percentage", 20),
    ("SKIN15", "Skincare Special 15%", "percentage", 15),
]

CAMPAIGNS = [
    ("cmp_1001", "Prospecting - Skincare Broad"), ("cmp_1002", "Retargeting - Cart Abandoners"),
    ("cmp_1003", "Diwali Sale Push"), ("cmp_1004", "Brand Awareness - Video"),
    ("cmp_1005", "Lookalike - Purchasers 1%"),
]
ADSETS = [
    ("as_2001", "18-24 Female Skincare Interest"), ("as_2002", "25-34 Female Makeup Lookalike"),
    ("as_2003", "Lookalike 1% Purchasers"), ("as_2004", "Interest - Korean Skincare"),
    ("as_2005", "Broad - India Tier 1 Cities"),
]
CREATIVES = [
    ("cr_3001", "UGC Reel - Serum Routine"), ("cr_3002", "Carousel - Bestsellers"),
    ("cr_3003", "Static - Diwali Offer"), ("cr_3004", "Video - Before After"),
    ("cr_3005", "Influencer Collab - Glow Kit"),
]
INFLUENCERS = ["GlowWithRiya", "SkincareByMeera", "BeautyDiariesIndia", "TheGlowGuide", "MakeupByAnjali"]

FIRST_NAMES = ["Aisha", "Priya", "Ananya", "Kavya", "Sneha", "Isha", "Riya", "Meera", "Diya", "Neha",
               "Rohan", "Arjun", "Vikram", "Aman", "Karan", "Rahul", "Sanjay", "Aditya", "Nikhil", "Varun"]
LAST_NAMES = ["Sharma", "Verma", "Iyer", "Nair", "Gupta", "Reddy", "Patel", "Singh", "Mehta", "Chopra"]

SEARCH_KEYWORDS = [
    "vitamin c serum", "hair fall shampoo", "sunscreen spf 50", "matte lipstick", "niacinamide serum",
    "retinol cream", "onion oil", "kajal", "body lotion", "face wash", "hyaluronic acid", "beard oil",
    "perfume for women", "biotin gummies", "glow kit", "compact powder", "eyeliner", "hair mask",
    "collagen powder", "acne cream",
]

DEMO_EMAIL_DOMAINS = ["example.com", "demo-mail.com", "sample-inbox.com"]


def demo_email(first: str, last: str, n: int) -> str:
    domain = RNG.choice(DEMO_EMAIL_DOMAINS)
    return f"{first.lower()}.{last.lower()}{n}@{domain}"


# ────────────────────────────────────────────────────────────────────
# Core daily business simulation — every table derives from this so
# numbers stay internally consistent across tabs.
# ────────────────────────────────────────────────────────────────────
SEASONAL_MULT = {1: 0.90, 2: 0.94, 3: 1.00, 4: 0.97, 5: 0.95, 6: 0.90,
                 7: 0.88, 8: 0.92, 9: 1.02, 10: 1.18, 11: 1.45, 12: 1.28}


def spike_mult(d: date) -> float:
    if d.month == 1 and d.day == 1:
        return 1.45
    if d.month == 1 and d.day == 26:
        return 1.25
    if d.month == 11 and 1 <= d.day <= 5:
        return 1.85  # Diwali proxy
    if d.month == 11 and 24 <= d.day <= 27:
        return 1.55  # Black Friday-style push
    if d.month == 7 and 10 <= d.day <= 15:
        return 1.35  # End-of-season sale
    return 1.0


class DayStats:
    __slots__ = ("d", "orders", "revenue", "aov", "discount_total", "shipping_total",
                 "sub_total", "redeemed_points", "new_ratio", "web_ratio",
                 "visitors", "sessions", "pageviews", "searches", "carts_total",
                 "carts_completed")


def build_day_stats():
    days = []
    base_orders = 95.0
    base_aov = 820.0
    for i, d in enumerate(ALL_DATES):
        growth = (1.018) ** (i / 30.0)
        weekday_mult = {0: 1.0, 1: 1.0, 2: 1.0, 3: 1.02, 4: 1.08, 5: 1.22, 6: 1.15}[d.weekday()]
        seasonal = SEASONAL_MULT[d.month]
        spike = spike_mult(d)
        noise = RNG.uniform(0.88, 1.12)

        orders = max(5, round(base_orders * growth * weekday_mult * seasonal * spike * noise))
        aov = round(base_aov * (1 + 0.12 * (i / max(1, len(ALL_DATES)))) * RNG.uniform(0.93, 1.07))
        revenue = orders * aov

        ds = DayStats()
        ds.d = d
        ds.orders = orders
        ds.aov = aov
        ds.revenue = revenue
        ds.discount_total = round(revenue * RNG.uniform(0.06, 0.14))
        ds.shipping_total = round(orders * RNG.uniform(35, 60))
        ds.sub_total = revenue - ds.discount_total
        ds.redeemed_points = round(revenue * RNG.uniform(0.0, 0.02))
        ds.new_ratio = RNG.uniform(0.30, 0.42)
        ds.web_ratio = RNG.uniform(0.58, 0.72)
        ds.searches = round(orders * RNG.uniform(4.5, 7.0))
        ds.visitors = round(orders * RNG.uniform(11, 16))
        ds.sessions = round(ds.visitors * RNG.uniform(1.05, 1.25))
        ds.pageviews = round(ds.sessions * RNG.uniform(3.2, 5.5))
        ds.carts_total = round(orders / RNG.uniform(0.22, 0.32))
        ds.carts_completed = orders
        days.append(ds)
    return days


DAYS = build_day_stats()
DAY_BY_DATE = {ds.d: ds for ds in DAYS}


def days_in_month(y, mo):
    return [ds for ds in DAYS if ds.d.year == y and ds.d.month == mo]


def split_counts(total: int, n: int, min_floor: int = 0) -> list:
    """Split an integer total across n buckets with random-ish weights."""
    if n <= 0 or total <= 0:
        return [0] * max(n, 0)
    weights = [RNG.uniform(0.4, 1.6) for _ in range(n)]
    s = sum(weights)
    raw = [total * w / s for w in weights]
    out = [int(x) for x in raw]
    remainder = total - sum(out)
    for i in RNG.sample(range(n), min(remainder, n)) if remainder > 0 else []:
        out[i] += 1
    return [max(min_floor, x) for x in out]


async def truncate_all(session, models):
    for model in models:
        await session.execute(delete(model))
    await session.commit()


async def bulk_insert(session, model, rows, chunk=2000):
    if not rows:
        return
    table = model.__table__
    for i in range(0, len(rows), chunk):
        await session.execute(insert(table), rows[i:i + chunk])
    await session.commit()


# ════════════════════════════════════════════════════════════════════
# Table generators
# ════════════════════════════════════════════════════════════════════

def gen_order_metrics_row(ds: DayStats, extra: dict) -> dict:
    """Build the ~90-column daily_orders / monthly_orders metric set from
    one DayStats bucket (or a monthly aggregate of several)."""
    orders = ds["orders"] if isinstance(ds, dict) else ds.orders
    revenue = ds["revenue"] if isinstance(ds, dict) else ds.revenue
    discount_total = ds["discount_total"] if isinstance(ds, dict) else ds.discount_total
    shipping_total = ds["shipping_total"] if isinstance(ds, dict) else ds.shipping_total
    sub_total = ds["sub_total"] if isinstance(ds, dict) else ds.sub_total
    redeemed_points = ds["redeemed_points"] if isinstance(ds, dict) else ds.redeemed_points
    new_ratio = ds["new_ratio"] if isinstance(ds, dict) else ds.new_ratio
    web_ratio = ds["web_ratio"] if isinstance(ds, dict) else ds.web_ratio
    aov = round(revenue / orders) if orders else 0

    def platform_slice(p_orders, p_revenue, p_discount, p_shipping, p_sub, p_points, prefix):
        new_orders = round(p_orders * new_ratio)
        ret_orders = p_orders - new_orders
        new_revenue = round(p_revenue * new_ratio)
        ret_revenue = p_revenue - new_revenue
        disc_ratio = RNG.uniform(0.45, 0.65)
        pts_ratio = RNG.uniform(0.15, 0.30)
        out = {
            f"{prefix}orders_count": p_orders,
            f"{prefix}total": p_revenue,
            f"{prefix}aov": round(p_revenue / p_orders) if p_orders else 0,
            f"{prefix}discount_total": p_discount,
            f"{prefix}shipping_total": p_shipping,
            f"{prefix}sub_total": p_sub,
            f"{prefix}redeemed_points": p_points,
            f"{prefix}new_customer_orders_count": new_orders,
            f"{prefix}new_customer_total": new_revenue,
            f"{prefix}new_customer_aov": round(new_revenue / new_orders) if new_orders else 0,
            f"{prefix}new_customer_discount_total": round(p_discount * new_ratio),
            f"{prefix}new_customer_shipping_total": round(p_shipping * new_ratio),
            f"{prefix}new_customer_sub_total": round(p_sub * new_ratio),
            f"{prefix}new_customer_redeemed_points": round(p_points * new_ratio),
            f"{prefix}returning_customer_orders_count": ret_orders,
            f"{prefix}returning_customer_total": ret_revenue,
            f"{prefix}returning_customer_aov": round(ret_revenue / ret_orders) if ret_orders else 0,
            f"{prefix}returning_customer_discount_total": p_discount - round(p_discount * new_ratio),
            f"{prefix}returning_customer_shipping_total": p_shipping - round(p_shipping * new_ratio),
            f"{prefix}returning_customer_sub_total": p_sub - round(p_sub * new_ratio),
            f"{prefix}returning_customer_redeemed_points": p_points - round(p_points * new_ratio),
            f"{prefix}orders_with_discount_count": round(p_orders * disc_ratio),
            f"{prefix}orders_without_discount_count": p_orders - round(p_orders * disc_ratio),
            f"{prefix}new_customer_orders_with_discount_count": round(new_orders * disc_ratio),
            f"{prefix}new_customer_orders_without_discount_count": new_orders - round(new_orders * disc_ratio),
            f"{prefix}returning_customer_orders_with_discount_count": round(ret_orders * disc_ratio),
            f"{prefix}returning_customer_orders_without_discount_count": ret_orders - round(ret_orders * disc_ratio),
            f"{prefix}orders_with_redeemed_points_count": round(p_orders * pts_ratio),
            f"{prefix}orders_without_redeemed_points_count": p_orders - round(p_orders * pts_ratio),
            f"{prefix}new_customer_orders_with_redeemed_points_count": round(new_orders * pts_ratio),
            f"{prefix}new_customer_orders_without_redeemed_points_count": new_orders - round(new_orders * pts_ratio),
            f"{prefix}returning_customer_orders_with_redeemed_points_count": round(ret_orders * pts_ratio),
            f"{prefix}returning_customer_orders_without_redeemed_points_count": ret_orders - round(ret_orders * pts_ratio),
        }
        return out

    web_orders = round(orders * web_ratio)
    app_orders = orders - web_orders
    web_revenue = round(revenue * web_ratio)
    app_revenue = revenue - web_revenue

    row = {
        "id": uid(),
        "total": revenue,
        "discountTotal": discount_total,
        "shippingTotal": shipping_total,
        "subTotal": sub_total,
        "redeemedPoints": redeemed_points,
        "aov": aov,
        "new_customer_orders_count": round(orders * new_ratio),
        "new_customer_total": round(revenue * new_ratio),
        "new_customer_aov": round((revenue * new_ratio) / (orders * new_ratio)) if orders else 0,
        "new_customer_discount_total": round(discount_total * new_ratio),
        "new_customer_shipping_total": round(shipping_total * new_ratio),
        "new_customer_sub_total": round(sub_total * new_ratio),
        "new_customer_redeemed_points": round(redeemed_points * new_ratio),
        "returning_customer_orders_count": orders - round(orders * new_ratio),
        "returning_customer_total": revenue - round(revenue * new_ratio),
        "returning_customer_discount_total": discount_total - round(discount_total * new_ratio),
        "returning_customer_shipping_total": shipping_total - round(shipping_total * new_ratio),
        "returning_customer_sub_total": sub_total - round(sub_total * new_ratio),
        "returning_customer_redeemed_points": redeemed_points - round(redeemed_points * new_ratio),
        "orders_with_discount_count": round(orders * 0.55),
        "orders_without_discount_count": orders - round(orders * 0.55),
        "new_customer_orders_with_discount_count": round(orders * new_ratio * 0.6),
        "new_customer_orders_without_discount_count": round(orders * new_ratio * 0.4),
        "returning_customer_orders_with_discount_count": round(orders * (1 - new_ratio) * 0.5),
        "returning_customer_orders_without_discount_count": round(orders * (1 - new_ratio) * 0.5),
        "orders_with_redeemed_points_count": round(orders * 0.2),
        "orders_without_redeemed_points_count": round(orders * 0.8),
        "new_customer_orders_with_redeemed_points_count": round(orders * new_ratio * 0.15),
        "new_customer_orders_without_redeemed_points_count": round(orders * new_ratio * 0.85),
        "returning_customer_orders_with_redeemed_points_count": round(orders * (1 - new_ratio) * 0.25),
        "returning_customer_orders_without_redeemed_points_count": round(orders * (1 - new_ratio) * 0.75),
        "returning_customer_aov": round((revenue - round(revenue * new_ratio)) / max(1, orders - round(orders * new_ratio))),
    }
    row.update(platform_slice(web_orders, web_revenue, round(discount_total * web_ratio),
                               round(shipping_total * web_ratio), round(sub_total * web_ratio),
                               round(redeemed_points * web_ratio), "web_"))
    row.update(platform_slice(app_orders, app_revenue, discount_total - round(discount_total * web_ratio),
                               shipping_total - round(shipping_total * web_ratio),
                               sub_total - round(sub_total * web_ratio),
                               redeemed_points - round(redeemed_points * web_ratio), "app_"))
    row.update(extra)
    row["createdAt"] = now()
    return row


def gen_daily_orders():
    rows = []
    for ds in DAYS:
        row = gen_order_metrics_row(ds, {
            "date": datetime.combine(ds.d, datetime.min.time()),
            "dailyOrdersCount": ds.orders,
        })
        rows.append(row)
    return rows


def gen_monthly_orders():
    rows = []
    for (y, mo) in ALL_MONTHS:
        month_days = days_in_month(y, mo)
        if not month_days:
            continue
        agg = {
            "orders": sum(d.orders for d in month_days),
            "revenue": sum(d.revenue for d in month_days),
            "discount_total": sum(d.discount_total for d in month_days),
            "shipping_total": sum(d.shipping_total for d in month_days),
            "sub_total": sum(d.sub_total for d in month_days),
            "redeemed_points": sum(d.redeemed_points for d in month_days),
            "new_ratio": sum(d.new_ratio for d in month_days) / len(month_days),
            "web_ratio": sum(d.web_ratio for d in month_days) / len(month_days),
        }
        row = gen_order_metrics_row(agg, {
            "year": y, "month": mo,
            "monthlyOrdersCount": agg["orders"],
        })
        rows.append(row)
    return rows


def gen_utm_daily_monthly():
    """Returns dict of table_name -> rows for the 10 utm_* daily/monthly tables."""
    dims = {
        "source": sorted(set(s[0] for s in UTM_SOURCES)),
        "medium": UTM_MEDIUMS,
        "campaign": UTM_CAMPAIGNS,
        "term": UTM_TERMS,
        "content": UTM_CONTENTS,
    }
    daily = {k: [] for k in dims}
    monthly_acc = {k: {} for k in dims}  # (year, month, key) -> views

    for ds in DAYS:
        for dim, keys in dims.items():
            n = min(len(keys), RNG.randint(4, len(keys)))
            chosen = RNG.sample(keys, n)
            total_views = round(ds.sessions * RNG.uniform(0.9, 1.3))
            splits = split_counts(total_views, n, min_floor=1)
            total = sum(splits) or 1
            for key, views in zip(chosen, splits):
                pct = round(views / total * 100)
                daily[dim].append({
                    "id": uid(), "date": datetime.combine(ds.d, datetime.min.time()),
                    "key": key, "views": views, "percentage": pct, "createdAt": now(),
                })
                mk = (ds.d.year, ds.d.month, key)
                monthly_acc[dim][mk] = monthly_acc[dim].get(mk, 0) + views

    monthly = {k: [] for k in dims}
    for dim, acc in monthly_acc.items():
        totals_by_month = {}
        for (y, mo, key), views in acc.items():
            totals_by_month[(y, mo)] = totals_by_month.get((y, mo), 0) + views
        for (y, mo, key), views in acc.items():
            tot = totals_by_month[(y, mo)] or 1
            monthly[dim].append({
                "id": uid(), "year": y, "month": mo, "key": key,
                "views": views, "percentage": round(views / tot * 100), "createdAt": now(),
            })

    table_map = {
        "source": (m.UtmSourceDaily, m.UtmSourceMonthly),
        "medium": (m.UtmMediumDaily, m.UtmMediumMonthly),
        "campaign": (m.UtmCampaignDaily, m.UtmCampaignMonthly),
        "term": (m.UtmTermDaily, m.UtmTermMonthly),
        "content": (m.UtmContentDaily, m.UtmContentMonthly),
    }
    return daily, monthly, table_map


def gen_coupons():
    daily_rows, monthly_acc = [], {}
    for ds in DAYS:
        n_active = RNG.randint(3, 6)
        chosen = RNG.sample(COUPONS, n_active)
        coupon_orders = split_counts(round(ds.orders * RNG.uniform(0.15, 0.28)), n_active)
        for (code, cname, dtype, dval), usage in zip(chosen, coupon_orders):
            if usage <= 0:
                continue
            unique_customers = round(usage * RNG.uniform(0.85, 1.0))
            avg_ov = ds.aov
            total_revenue = usage * avg_ov
            total_discount = round(total_revenue * (dval / 100 if dtype == "percentage" else 0) or usage * dval)
            new_c = round(usage * RNG.uniform(0.3, 0.5))
            row = {
                "id": uid(), "date": datetime.combine(ds.d, datetime.min.time()),
                "coupon_code": code, "coupon_name": cname, "discount_type": dtype,
                "discount_value": float(dval), "usage_count": usage,
                "unique_customers": unique_customers, "orders_with_this_coupon": usage,
                "total_discount": total_discount, "total_revenue": total_revenue,
                "avg_order_value": float(avg_ov), "new_customer_usage_count": new_c,
                "returning_customer_usage_count": usage - new_c,
                "first_time_customer_count": round(new_c * 0.7),
                "stacked_coupon_orders": round(usage * 0.05), "createdAt": now(),
            }
            daily_rows.append(row)
            mk = (ds.d.year, ds.d.month, code)
            if mk not in monthly_acc:
                monthly_acc[mk] = dict(cname=cname, dtype=dtype, dval=dval, usage=0, uniq=0,
                                        disc=0, rev=0, newc=0, ftc=0, stacked=0)
            a = monthly_acc[mk]
            a["usage"] += usage; a["uniq"] += unique_customers; a["disc"] += total_discount
            a["rev"] += total_revenue; a["newc"] += new_c; a["ftc"] += round(new_c * 0.7)
            a["stacked"] += round(usage * 0.05)

    monthly_rows = []
    for (y, mo, code), a in monthly_acc.items():
        monthly_rows.append({
            "id": uid(), "year": y, "month": mo, "coupon_code": code, "coupon_name": a["cname"],
            "discount_type": a["dtype"], "discount_value": float(a["dval"]), "usage_count": a["usage"],
            "unique_customers": a["uniq"], "orders_with_this_coupon": a["usage"],
            "total_discount": a["disc"], "total_revenue": a["rev"],
            "avg_order_value": round(a["rev"] / a["usage"], 2) if a["usage"] else 0.0,
            "new_customer_usage_count": a["newc"], "returning_customer_usage_count": a["usage"] - a["newc"],
            "first_time_customer_count": a["ftc"], "stacked_coupon_orders": a["stacked"], "createdAt": now(),
        })

    meta_rows = []
    for code, cname, dtype, dval in COUPONS:
        total_usage = sum(r["usage_count"] for r in monthly_rows if r["coupon_code"] == code)
        total_rev = sum(r["total_revenue"] for r in monthly_rows if r["coupon_code"] == code)
        meta_rows.append({
            "id": uid(), "code": code, "name": cname, "type": dtype, "value": float(dval),
            "min_order_amount": 499, "max_discount": 500 if dtype == "percentage" else None,
            "date_start": datetime.combine(DATE_START, datetime.min.time()),
            "date_end": datetime.combine(DATE_END, datetime.min.time()),
            "status": "active", "platform": "web+app",
            "total_usage_count": total_usage, "total_revenue": round(total_rev),
            "createdAt": now(), "updatedAt": now(),
        })
    return daily_rows, monthly_rows, meta_rows


def gen_cart_metrics():
    daily, monthly_acc = [], {}
    for ds in DAYS:
        abandoned = ds.carts_total - ds.carts_completed
        completed_val = ds.revenue
        abandoned_val = round(abandoned * ds.aov * RNG.uniform(0.5, 0.85))
        row = {
            "id": uid(), "date": datetime.combine(ds.d, datetime.min.time()),
            "total_carts": ds.carts_total, "completed_carts": ds.carts_completed,
            "abandoned_carts": abandoned, "total_cart_value": completed_val + abandoned_val,
            "completed_cart_value": completed_val, "abandoned_cart_value": abandoned_val,
            "createdAt": now(),
        }
        daily.append(row)
        mk = (ds.d.year, ds.d.month)
        a = monthly_acc.setdefault(mk, dict(tc=0, cc=0, ac=0, tv=0, cv=0, av=0))
        a["tc"] += ds.carts_total; a["cc"] += ds.carts_completed; a["ac"] += abandoned
        a["tv"] += completed_val + abandoned_val; a["cv"] += completed_val; a["av"] += abandoned_val
    monthly = [{
        "id": uid(), "year": y, "month": mo, "total_carts": a["tc"], "completed_carts": a["cc"],
        "abandoned_carts": a["ac"], "total_cart_value": a["tv"], "completed_cart_value": a["cv"],
        "abandoned_cart_value": a["av"], "createdAt": now(),
    } for (y, mo), a in monthly_acc.items()]
    return daily, monthly


def gen_product_metrics():
    daily, monthly_acc = [], {}
    metric_types = ["order", "revenue", "cart", "search"]
    for ds in DAYS:
        active_products = RNG.sample(PRODUCTS, RNG.randint(8, 16))
        order_shares = split_counts(ds.orders, len(active_products), min_floor=0)
        for (title, cat), units in zip(active_products, order_shares):
            if units <= 0:
                continue
            revenue_val = round(units * ds.aov * RNG.uniform(0.85, 1.15))
            cart_val = round(units * RNG.uniform(1.3, 2.2))
            search_val = round(units * RNG.uniform(2.0, 4.0))
            for mtype, val in (("order", units), ("revenue", revenue_val),
                               ("cart", cart_val), ("search", search_val)):
                daily.append({
                    "id": uid(), "date": datetime.combine(ds.d, datetime.min.time()),
                    "product_title": title, "metric_type": mtype, "value": float(val),
                    "product_category": cat, "createdAt": now(),
                })
                mk = (ds.d.year, ds.d.month, title, mtype)
                monthly_acc[mk] = monthly_acc.get(mk, 0) + val

    monthly = []
    cat_lookup = {t: c for t, c in PRODUCTS}
    for (y, mo, title, mtype), val in monthly_acc.items():
        monthly.append({
            "id": uid(), "year": y, "month": mo, "product_title": title, "metric_type": mtype,
            "value": float(val), "product_category": cat_lookup.get(title), "createdAt": now(),
        })
    return daily, monthly


def gen_search_visitor_engagement():
    search_daily, visitor_daily, engagement_daily = [], [], []
    search_monthly_acc, visitor_monthly_acc = {}, {}
    for ds in DAYS:
        zero = round(ds.searches * RNG.uniform(0.08, 0.16))
        with_res = ds.searches - zero
        unique_searchers = round(ds.searches / RNG.uniform(1.3, 1.9))
        search_daily.append({
            "id": uid(), "date": datetime.combine(ds.d, datetime.min.time()),
            "total_searches": ds.searches, "unique_searchers": unique_searchers,
            "with_results": with_res, "zero_results": zero, "createdAt": now(),
        })
        visitor_daily.append({
            "id": uid(), "date": datetime.combine(ds.d, datetime.min.time()),
            "unique_visitors": ds.visitors, "createdAt": now(),
        })
        sessions = ds.sessions
        bounces = round(sessions * RNG.uniform(0.28, 0.42))
        avg_time = RNG.uniform(90, 220)
        engagement_daily.append({
            "id": uid(), "date": datetime.combine(ds.d, datetime.min.time()),
            "pageviews": ds.pageviews, "sessions": sessions, "visitors": ds.visitors,
            "bounces": bounces, "total_time_seconds": round(sessions * avg_time, 1),
            "createdAt": now(),
        })
        mk = (ds.d.year, ds.d.month)
        sa = search_monthly_acc.setdefault(mk, dict(ts=0, us=0, wr=0, zr=0))
        sa["ts"] += ds.searches; sa["us"] += unique_searchers; sa["wr"] += with_res; sa["zr"] += zero
        visitor_monthly_acc[mk] = visitor_monthly_acc.get(mk, 0) + ds.visitors

    search_monthly = [{
        "id": uid(), "year": y, "month": mo, "total_searches": a["ts"], "unique_searchers": a["us"],
        "with_results": a["wr"], "zero_results": a["zr"], "createdAt": now(),
    } for (y, mo), a in search_monthly_acc.items()]
    visitor_monthly = [{
        "id": uid(), "year": y, "month": mo, "unique_visitors": v, "createdAt": now(),
    } for (y, mo), v in visitor_monthly_acc.items()]
    return search_daily, search_monthly, visitor_daily, visitor_monthly, engagement_daily


def gen_fulfillment():
    rows = []
    for ds in DAYS:
        delivered = round(ds.orders * RNG.uniform(0.82, 0.94))
        avg_days = RNG.uniform(2.2, 4.5)
        total_days_sum = round(delivered * avg_days, 2)
        within_sla = round(delivered * RNG.uniform(0.65, 0.85))
        rto = round(ds.orders * RNG.uniform(0.03, 0.07))
        rows.append({
            "id": uid(), "date": ds.d, "total_delivered_orders": delivered,
            "total_delivery_days_sum": total_days_sum, "orders_within_sla_count": within_sla,
            "rto_orders_count": rto, "createdAt": now(),
        })
    return rows


def gen_inventory():
    total_variants = 420
    stock_outs = round(total_variants * 0.06)
    dead_variants = round(total_variants * 0.09)
    dead_value = round(dead_variants * RNG.uniform(350, 900))
    locked_capital = round(total_variants * RNG.uniform(400, 1100))
    summary = [{
        "id": uid(), "date": datetime.combine(DATE_END, datetime.min.time()),
        "total_tracked_variants": total_variants, "total_stock_outs": stock_outs,
        "dead_stock_variants": dead_variants, "dead_stock_value": float(dead_value),
        "total_locked_capital": float(locked_capital), "createdAt": now(),
    }]
    dead_stock, stock_outs_rows, aging = [], [], []
    for title, cat in RNG.sample(PRODUCTS, min(18, len(PRODUCTS))):
        qty = RNG.randint(5, 60)
        price = RNG.uniform(199, 1499)
        dead_stock.append({
            "id": uid(), "product_title": title, "sku": f"BB-{RNG.randint(1000,9999)}",
            "inventory_quantity": qty, "price": round(price, 2), "total_value": round(qty * price, 2),
            "variant_created_at": datetime.combine(DATE_START, datetime.min.time()) + timedelta(days=RNG.randint(0, 200)),
            "createdAt": now(),
        })
    for title, cat in RNG.sample(PRODUCTS, min(10, len(PRODUCTS))):
        stock_outs_rows.append({
            "id": uid(), "product_title": title, "sku": f"BB-{RNG.randint(1000,9999)}",
            "inventory_quantity": 0,
            "variant_updated_at": datetime.combine(DATE_END, datetime.min.time()) - timedelta(days=RNG.randint(0, 10)),
            "createdAt": now(),
        })
    for title, cat in RNG.sample(PRODUCTS, min(12, len(PRODUCTS))):
        qty = RNG.randint(10, 80)
        price = RNG.uniform(199, 1499)
        aging.append({
            "id": uid(), "product_title": title, "sku": f"BB-{RNG.randint(1000,9999)}",
            "inventory_quantity": qty, "total_value": round(qty * price, 2),
            "variant_created_at": datetime.combine(DATE_START, datetime.min.time()) + timedelta(days=RNG.randint(0, 150)),
            "createdAt": now(),
        })
    return summary, dead_stock, stock_outs_rows, aging


def bounded_randint(lo: int, hi: int) -> int:
    """RNG.randint that tolerates hi < lo (clamps instead of raising)."""
    if hi < lo:
        hi = lo
    return RNG.randint(lo, hi)


def gen_customers(n=420):
    """Fictional customer pool used by RFM / LTV / CLV."""
    customers = []
    for i in range(n):
        first = RNG.choice(FIRST_NAMES)
        last = RNG.choice(LAST_NAMES)
        email = demo_email(first, last, i)
        first_order_offset = RNG.randint(0, max(1, len(ALL_DATES) - 30))
        first_order_date = ALL_DATES[first_order_offset]
        tenure_days = (DATE_END - first_order_date).days
        # Segment-driven behaviour so RFM math lines up with the doc thresholds
        seg_roll = RNG.random()
        if seg_roll < 0.15:
            freq = RNG.randint(5, 14); recency = RNG.randint(1, 30)
        elif seg_roll < 0.40:
            freq = RNG.randint(2, 6); recency = RNG.randint(5, 85)
        elif seg_roll < 0.55:
            freq = 1; recency = RNG.randint(1, 28)
        elif seg_roll < 0.85:
            freq = RNG.randint(1, 4); recency = bounded_randint(91, min(400, tenure_days + 30))
        else:
            freq = 1; recency = bounded_randint(120, min(500, tenure_days + 60))
        recency = min(recency, tenure_days) if tenure_days > 0 else 0
        freq = max(1, min(freq, max(1, tenure_days // 20 + 1)))
        avg_order = RNG.uniform(600, 2200)
        monetary = round(freq * avg_order, 2)
        last_order_date = DATE_END - timedelta(days=recency)
        customers.append({
            "first": first, "last": last, "email": email, "frequency": freq,
            "recency_days": recency, "monetary": monetary,
            "first_order_date": first_order_date, "last_order_date": last_order_date,
            "avg_order": avg_order,
        })
    return customers


def rfm_scores(recency, frequency, monetary):
    r = 3 if recency <= 30 else (2 if recency <= 90 else 1)
    f = 3 if frequency >= 5 else (2 if frequency >= 2 else 1)
    mo = 3 if monetary >= 10000 else (2 if monetary >= 3000 else 1)
    if r == 3 and f == 3:
        seg = "Champions"
    elif r >= 2 and f >= 2:
        seg = "Loyal Customers"
    elif r == 3 and f == 1:
        seg = "Potential Loyalists"
    elif r <= 2 and f >= 2:
        seg = "At Risk"
    elif r == 1 and f == 1:
        seg = "Lost Customers"
    else:
        seg = "At Risk"
    return r, f, mo, seg


def gen_rfm_ltv_clv(customers):
    rfm_rows, clv_rows = [], []
    seg_agg = {}
    for c in customers:
        r, f, mo, seg = rfm_scores(c["recency_days"], c["frequency"], c["monetary"])
        rfm_rows.append({
            "id": uid(), "email": c["email"], "recency_days": c["recency_days"],
            "frequency": c["frequency"], "monetary": c["monetary"], "r_score": r, "f_score": f,
            "m_score": mo, "segment": seg,
            "last_order_date": datetime.combine(c["last_order_date"], datetime.min.time()),
            "createdAt": now(),
        })
        a = seg_agg.setdefault(seg, dict(n=0, rev=0.0))
        a["n"] += 1; a["rev"] += c["monetary"]

        prev_m_orders = RNG.randint(0, max(1, c["frequency"]))
        curr_m_orders = RNG.randint(0, max(1, c["frequency"]))
        mom = round((curr_m_orders - prev_m_orders) / prev_m_orders * 100, 2) if prev_m_orders else None
        clv_rows.append({
            "id": uid(), "customer_id": uid(), "customer_name": f"{c['first']} {c['last']}",
            "email": c["email"], "order_count": c["frequency"], "total_spend": c["monetary"],
            "avg_order_value": round(c["avg_order"], 2),
            "first_purchase_date": c["first_order_date"], "last_purchase_date": c["last_order_date"],
            "prev_month_orders": prev_m_orders, "curr_month_orders": curr_m_orders,
            "mom_growth_pct": mom, "createdAt": now(), "updatedAt": now(),
        })
    ltv_rows = [{
        "id": uid(), "segment": seg, "total_customers": a["n"], "total_revenue": round(a["rev"], 2),
        "avg_ltv": round(a["rev"] / a["n"], 2) if a["n"] else 0.0, "createdAt": now(),
    } for seg, a in seg_agg.items()]
    return rfm_rows, ltv_rows, clv_rows


def gen_rpr(customers):
    total = len(customers)
    repeat = sum(1 for c in customers if c["frequency"] > 1)
    rows = []
    for (y, mo) in ALL_MONTHS:
        drift = RNG.uniform(0.9, 1.08)
        r = min(total, max(0, round(repeat * drift)))
        rows.append({
            "id": uid(), "total_customers": total, "repeat_customers": r,
            "rpr_percentage": round(r / total * 100, 2) if total else 0.0,
            "createdAt": datetime(y, mo, 28),
        })
    return rows


def gen_cohorts(customers):
    """repeat + lifetime cohorts, keyed by first-order month."""
    by_month = {}
    for c in customers:
        key = f"{c['first_order_date'].year:04d}-{c['first_order_date'].month:02d}"
        by_month.setdefault(key, []).append(c)

    repeat_rows, lifetime_rows = [], []
    for cohort_month, custs in by_month.items():
        cohort_size = len(custs)
        y, mo = map(int, cohort_month.split("-"))
        base_idx = (y * 12 + mo)
        max_idx = min(20, (DATE_END.year * 12 + DATE_END.month) - base_idx)
        cum_rev = 0.0
        for idx in range(0, max(1, max_idx) + 1):
            retention_decay = max(0.05, 0.9 - idx * 0.07) * RNG.uniform(0.85, 1.1)
            repeaters = round(cohort_size * min(0.95, retention_decay))
            repeat_rows.append({
                "id": uid(), "cohort_month": cohort_month, "cohort_index": idx,
                "cohort_size": cohort_size, "repeat_customers": repeaters,
                "retention_rate": round(repeaters / cohort_size * 100, 2) if cohort_size else 0.0,
                "createdAt": now(), "updatedAt": now(),
            })
            month_rev = round(cohort_size * RNG.uniform(400, 1600) * max(0.15, retention_decay), 2)
            cum_rev += month_rev
            lifetime_rows.append({
                "id": uid(), "cohort_month": cohort_month, "cohort_index": idx,
                "cohort_size": cohort_size, "total_revenue": month_rev,
                "cumulative_revenue": round(cum_rev, 2),
                "avg_ltv": round(cum_rev / cohort_size, 2) if cohort_size else 0.0,
                "createdAt": now(), "updatedAt": now(),
            })
    return repeat_rows, lifetime_rows


def gen_signup_cohorts(customers):
    """Signup cohorts — last 24 months, index 0..12."""
    cutoff = DATE_END - timedelta(days=730)
    by_month = {}
    for c in customers:
        if c["first_order_date"] < cutoff:
            continue
        key = f"{c['first_order_date'].year:04d}-{c['first_order_date'].month:02d}"
        by_month.setdefault(key, []).append(c)
    rows = []
    for signup_cohort, custs in by_month.items():
        cohort_size = len(custs)
        y, mo = map(int, signup_cohort.split("-"))
        base_idx = y * 12 + mo
        max_idx = min(12, (DATE_END.year * 12 + DATE_END.month) - base_idx)
        for idx in range(0, max(1, max_idx) + 1):
            decay = max(0.05, 0.85 - idx * 0.06) * RNG.uniform(0.85, 1.1)
            active = round(cohort_size * min(0.95, decay))
            orders = round(active * RNG.uniform(1.0, 1.8))
            revenue = round(orders * RNG.uniform(600, 1400), 2)
            rows.append({
                "id": uid(), "signup_cohort": signup_cohort, "cohort_size": cohort_size,
                "cohort_index": idx, "active_customers": active,
                "retention_pct": round(active / cohort_size * 100, 2) if cohort_size else 0.0,
                "orders": orders, "revenue": revenue, "createdAt": now(),
            })
    return rows


def gen_funnel():
    rows = []
    for ds in DAYS:
        total_users = ds.visitors
        open_users = round(total_users * RNG.uniform(0.35, 0.5))
        click_users = round(open_users * RNG.uniform(0.55, 0.75))
        pay_fail_users = round(click_users * RNG.uniform(0.08, 0.18))
        converted = round(click_users * RNG.uniform(0.35, 0.55))
        rows.append({
            "id": uid(), "date": ds.d, "total_users": total_users, "open_users": open_users,
            "click_users": click_users, "payment_failure_users": pay_fail_users,
            "converted_users": converted,
            "open_rate": round(open_users / total_users * 100, 2) if total_users else 0.0,
            "click_rate": round(click_users / open_users * 100, 2) if open_users else 0.0,
            "conversion_rate": round(converted / click_users * 100, 2) if click_users else 0.0,
            "createdAt": now(), "updatedAt": now(),
        })
    return rows


def gen_utm_attribution():
    rows = []
    for ds in DAYS:
        n = RNG.randint(5, 9)
        combos = RNG.sample(UTM_SOURCES, min(n, len(UTM_SOURCES)))
        order_splits = split_counts(ds.orders, len(combos))
        for (source, medium, _channel), orders in zip(combos, order_splits):
            campaign = RNG.choice(UTM_CAMPAIGNS) if medium != "none" else "none"
            term = RNG.choice(UTM_TERMS)
            content = RNG.choice(UTM_CONTENTS)
            sessions = round(orders / RNG.uniform(0.02, 0.06)) if orders else RNG.randint(10, 200)
            users = round(sessions * RNG.uniform(0.75, 0.95))
            revenue = round(orders * ds.aov * RNG.uniform(0.9, 1.1), 2)
            rows.append({
                "id": uid(), "date": ds.d, "utm_source": source, "utm_medium": medium,
                "utm_campaign": campaign, "utm_term": term, "utm_content": content,
                "users": users, "sessions": sessions, "orders": orders, "revenue": revenue,
                "conversion_rate": round(orders / sessions * 100, 2) if sessions else 0.0,
                "aov": round(revenue / orders, 2) if orders else 0.0,
                "createdAt": now(), "updatedAt": now(),
            })
    return rows


FLOW_PATHS = [
    "search -> cart -> checkout -> order",
    "collection -> product -> cart -> checkout -> order",
    "home -> product -> checkout -> order",
    "search -> product -> cart -> order",
    "collection -> cart -> order",
]


def gen_flow_attribution():
    rows = []
    for ds in DAYS:
        splits = split_counts(ds.orders, len(FLOW_PATHS))
        for path, orders in zip(FLOW_PATHS, splits):
            if orders <= 0:
                continue
            users = round(orders / RNG.uniform(0.3, 0.6))
            revenue = round(orders * ds.aov * RNG.uniform(0.9, 1.1), 2)
            rows.append({
                "id": uid(), "date": ds.d, "flow_path": path, "steps_count": path.count("->") + 1,
                "users": users, "orders": orders, "revenue": revenue,
                "conversion_rate": round(orders / users * 100, 2) if users else 0.0,
                "aov": round(revenue / orders, 2) if orders else 0.0,
                "createdAt": now(), "updatedAt": now(),
            })
    return rows


def gen_rto_return_delivery_geo_courier_failure_payment():
    rto_rows, return_rate_rows, return_reason_rows, delivery_rows = [], [], [], []
    failure_zone_rows, geo_rev_rows = [], []
    courier_rows, pay_fail_rows, pay_method_rows, pay_reason_rows = [], [], [], []

    for ds in DAYS:
        # RTO
        rto_orders = round(ds.orders * RNG.uniform(0.03, 0.07))
        rto_rows.append({
            "id": uid(), "date": ds.d, "total_orders": ds.orders, "rto_orders": rto_orders,
            "rto_rate": round(rto_orders / ds.orders * 100, 2) if ds.orders else 0.0,
            "rto_revenue_loss": round(rto_orders * ds.aov, 2), "createdAt": now(), "updatedAt": now(),
        })
        # Return rate
        delivered = round(ds.orders * RNG.uniform(0.82, 0.94))
        returned = round(delivered * RNG.uniform(0.02, 0.05))
        return_rate_rows.append({
            "id": uid(), "date": ds.d, "total_delivered_orders": delivered, "returned_orders": returned,
            "return_rate": round(returned / delivered * 100, 2) if delivered else 0.0,
            "return_revenue_loss": round(returned * ds.aov, 2), "createdAt": now(), "updatedAt": now(),
        })
        # Return reasons
        n_reasons = RNG.randint(3, len(RETURN_REASONS))
        reasons = RNG.sample(RETURN_REASONS, n_reasons)
        splits = split_counts(returned, n_reasons)
        tot_cases = sum(splits) or 1
        for (code, text), cases in zip(reasons, splits):
            if cases <= 0:
                continue
            return_reason_rows.append({
                "id": uid(), "date": ds.d, "reason_code": code, "reason_text": text,
                "total_cases": cases, "total_revenue_loss": round(cases * ds.aov, 2),
                "percentage": round(cases / tot_cases * 100, 2), "createdAt": now(), "updatedAt": now(),
            })
        # Delivery time
        avg_days = RNG.uniform(2.2, 4.8)
        delivery_rows.append({
            "id": uid(), "date": ds.d, "total_orders": ds.orders,
            "avg_delivery_time": round(avg_days, 2), "median_delivery_time": round(avg_days * RNG.uniform(0.85, 1.05), 2),
            "p90_delivery_time": round(avg_days * RNG.uniform(1.4, 1.9), 2),
            "delayed_orders": round(ds.orders * RNG.uniform(0.05, 0.15)),
            "delays_by_carrier": {c: RNG.randint(0, 8) for c in RNG.sample(COURIERS, 3)},
            "delays_by_state": {s: RNG.randint(0, 6) for _, s in RNG.sample(CITY_STATE, 3)},
            "createdAt": now(), "updatedAt": now(),
        })
        # Failure zones + geography revenue (shared city sample)
        n_cities = RNG.randint(4, 7)
        cities = RNG.sample(CITY_STATE, n_cities)
        order_splits = split_counts(ds.orders, n_cities)
        for (city, state), c_orders in zip(cities, order_splits):
            if c_orders <= 0:
                continue
            failed = round(c_orders * RNG.uniform(0.02, 0.06))
            c_rto = round(c_orders * RNG.uniform(0.02, 0.05))
            failure_zone_rows.append({
                "id": uid(), "date": ds.d, "city": city, "state": state, "total_orders": c_orders,
                "failed_orders": failed, "rto_orders": c_rto,
                "failure_rate": round(failed / c_orders * 100, 2), "rto_rate": round(c_rto / c_orders * 100, 2),
                "createdAt": now(), "updatedAt": now(),
            })
            c_revenue = round(c_orders * ds.aov * RNG.uniform(0.9, 1.1), 2)
            geo_rev_rows.append({
                "id": uid(), "date": ds.d, "city": city, "state": state, "total_orders": c_orders,
                "total_revenue": c_revenue, "avg_order_value": round(c_revenue / c_orders, 2),
                "unique_customers": round(c_orders * RNG.uniform(0.8, 0.98)),
                "createdAt": now(), "updatedAt": now(),
            })
        # Courier performance
        n_couriers = RNG.randint(4, len(COURIERS))
        couriers = RNG.sample(COURIERS, n_couriers)
        splits = split_counts(ds.orders, n_couriers)
        for courier, c_orders in zip(couriers, splits):
            if c_orders <= 0:
                continue
            c_delivered = round(c_orders * RNG.uniform(0.82, 0.95))
            c_rto = round(c_orders * RNG.uniform(0.02, 0.06))
            c_failed = round(c_orders * RNG.uniform(0.01, 0.04))
            courier_rows.append({
                "id": uid(), "date": ds.d, "courier_partner": courier, "total_orders": c_orders,
                "delivered_orders": c_delivered, "rto_orders": c_rto, "failed_orders": c_failed,
                "rto_rate": round(c_rto / c_orders * 100, 2), "failure_rate": round(c_failed / c_orders * 100, 2),
                "avg_delivery_time": round(RNG.uniform(2.0, 5.0), 2), "createdAt": now(), "updatedAt": now(),
            })
        # Payment failure
        attempts = round(ds.orders * RNG.uniform(1.15, 1.35))
        failed_p = round(attempts * RNG.uniform(0.08, 0.16))
        affected = round(failed_p * RNG.uniform(0.85, 1.0))
        recovered = round(failed_p * RNG.uniform(0.2, 0.4))
        pay_fail_rows.append({
            "id": uid(), "date": ds.d, "total_attempts": attempts, "failed_payments": failed_p,
            "failure_rate": round(failed_p / attempts * 100, 2) if attempts else 0.0,
            "lost_gmv": round(failed_p * ds.aov, 2), "affected_customers": affected,
            "recovered_orders": recovered, "recovered_gmv": round(recovered * ds.aov, 2),
            "createdAt": now(), "updatedAt": now(),
        })
        n_pm = RNG.randint(3, 5)
        methods = RNG.sample(PAYMENT_PROVIDERS_MODES, n_pm)
        m_splits = split_counts(attempts, n_pm)
        f_splits = split_counts(failed_p, n_pm)
        for (provider, mode), att, fail in zip(methods, m_splits, f_splits):
            pay_method_rows.append({
                "id": uid(), "date": ds.d, "provider": provider, "payment_mode": mode,
                "attempts": att, "failed": fail, "lost_gmv": round(fail * ds.aov, 2),
                "createdAt": now(), "updatedAt": now(),
            })
        n_er = RNG.randint(3, len(ERROR_CODES))
        errs = RNG.sample(ERROR_CODES, n_er)
        e_splits = split_counts(failed_p, n_er)
        for code, fail in zip(errs, e_splits):
            pay_reason_rows.append({
                "id": uid(), "date": ds.d, "error_code": code, "failed": fail,
                "lost_gmv": round(fail * ds.aov, 2), "affected_customers": round(fail * RNG.uniform(0.85, 1.0)),
                "createdAt": now(), "updatedAt": now(),
            })

    return (rto_rows, return_rate_rows, return_reason_rows, delivery_rows, failure_zone_rows,
            geo_rev_rows, courier_rows, pay_fail_rows, pay_method_rows, pay_reason_rows)


def gen_channel_roi_and_spend():
    channels = ["paid_search", "paid_social", "direct", "email", "Other"]
    roi_rows, spend_rows = [], []
    for ds in DAYS:
        splits = split_counts(ds.orders, len(channels))
        for channel, orders in zip(channels, splits):
            revenue = round(orders * ds.aov * RNG.uniform(0.9, 1.1), 2)
            if channel == "direct":
                spend = 0.0
            else:
                spend = round(revenue / RNG.uniform(2.5, 5.5), 2)
            roi = round((revenue - spend) / spend, 3) if spend else 0.0
            roas = round(revenue / spend, 3) if spend else 0.0
            roi_rows.append({
                "id": uid(), "date": ds.d, "channel": channel, "total_revenue": revenue,
                "total_spend": spend, "roi": roi, "roas": roas, "total_orders": orders,
                "unique_users": round(orders * RNG.uniform(1.1, 1.6)), "createdAt": now(), "updatedAt": now(),
            })
            spend_rows.append({
                "id": uid(), "date": ds.d, "channel": channel, "spend": spend,
                "createdAt": now(), "updatedAt": now(),
            })
    return roi_rows, spend_rows


def gen_meta_and_influencer_tables():
    campaign_cac_rows, marketing_cost_rows, creative_rows, audience_rows, influencer_rows = [], [], [], [], []
    for ds in DAYS:
        total_spend_today = round(ds.revenue / RNG.uniform(3.0, 5.0), 2)
        marketing_cost_rows.append({
            "id": uid(), "date": ds.d, "total_spend": total_spend_today, "total_orders": ds.orders,
            "cost_per_order": round(total_spend_today / ds.orders, 2) if ds.orders else 0.0,
            "createdAt": now(), "updatedAt": now(),
        })
        new_customers_today = round(ds.orders * ds.new_ratio)
        camp_splits_spend = split_counts(round(total_spend_today), len(CAMPAIGNS))
        camp_splits_newc = split_counts(new_customers_today, len(CAMPAIGNS))
        for (cid, cname), spend, newc in zip(CAMPAIGNS, camp_splits_spend, camp_splits_newc):
            orders_c = round(newc * RNG.uniform(1.1, 1.6))
            revenue_c = round(orders_c * ds.aov * RNG.uniform(0.9, 1.1), 2)
            campaign_cac_rows.append({
                "id": uid(), "date": ds.d, "campaign_id": cid, "campaign_name": cname,
                "total_spend": float(spend), "new_customers": newc, "total_orders": orders_c,
                "total_revenue": revenue_c, "cac": round(spend / newc, 2) if newc else 0.0,
                "createdAt": now(), "updatedAt": now(),
            })
        creative_spend_splits = split_counts(round(total_spend_today), len(CREATIVES))
        creative_order_splits = split_counts(ds.orders, len(CREATIVES))
        for (crid, crname), spend, orders_c in zip(CREATIVES, creative_spend_splits, creative_order_splits):
            revenue_c = round(orders_c * ds.aov * RNG.uniform(0.9, 1.1), 2)
            impressions = round(spend * RNG.uniform(3, 7)) if spend else RNG.randint(500, 3000)
            clicks = round(impressions * RNG.uniform(0.01, 0.035))
            meta_revenue = round(revenue_c * RNG.uniform(0.8, 1.3), 2)
            diff = round((meta_revenue - revenue_c) / revenue_c * 100, 2) if revenue_c else 0.0
            creative_rows.append({
                "id": uid(), "date": ds.d, "creative_id": crid, "creative_name": crname,
                "campaign_name": RNG.choice(CAMPAIGNS)[1], "orders": orders_c, "revenue_actual": revenue_c,
                "spend": float(spend), "clicks": clicks, "impressions": impressions,
                "roas": round(revenue_c / spend, 2) if spend else 0.0,
                "ctr": round(clicks / impressions * 100, 2) if impressions else 0.0,
                "cpc": round(spend / clicks, 2) if clicks else 0.0,
                "meta_revenue": meta_revenue, "revenue_diff": diff,
                "flag": "Meta Over-reporting" if diff > 20 else None,
                "createdAt": now(), "updatedAt": now(),
            })
        adset_spend_splits = split_counts(round(total_spend_today), len(ADSETS))
        for (asid, asname), spend in zip(ADSETS, adset_spend_splits):
            impressions = round(spend * RNG.uniform(3, 7)) if spend else RNG.randint(500, 3000)
            clicks = round(impressions * RNG.uniform(0.01, 0.035))
            conversions = round(clicks * RNG.uniform(0.03, 0.09))
            revenue_a = round(conversions * ds.aov * RNG.uniform(0.9, 1.2), 2)
            audience_rows.append({
                "id": uid(), "date": ds.d, "adset_id": asid, "adset_name": asname,
                "campaign_name": RNG.choice(CAMPAIGNS)[1], "spend": float(spend), "impressions": impressions,
                "clicks": clicks, "conversions": conversions, "revenue": revenue_a,
                "roas": round(revenue_a / spend, 2) if spend else 0.0,
                "ctr": round(clicks / impressions * 100, 2) if impressions else 0.0,
                "cpc": round(spend / clicks, 2) if clicks else 0.0,
                "conversion_rate": round(conversions / clicks * 100, 2) if clicks else 0.0,
                "createdAt": now(), "updatedAt": now(),
            })
        infl_splits = split_counts(round(ds.orders * 0.06), len(INFLUENCERS))
        for name, orders_i in zip(INFLUENCERS, infl_splits):
            if orders_i <= 0:
                continue
            revenue_i = round(orders_i * ds.aov * RNG.uniform(0.85, 1.15), 2)
            influencer_rows.append({
                "id": uid(), "date": ds.d, "influencer_name": name, "total_orders": orders_i,
                "total_revenue": revenue_i, "unique_customers": round(orders_i * RNG.uniform(0.8, 0.98)),
                "avg_order_value": round(revenue_i / orders_i, 2), "createdAt": now(), "updatedAt": now(),
            })
    return campaign_cac_rows, marketing_cost_rows, creative_rows, audience_rows, influencer_rows


def gen_reviews_correlations_keywords_abandoned():
    reviews = []
    review_texts_pos = ["Love this product, my skin feels amazing!", "Great value for money, will repurchase.",
                         "Fast delivery and the product works well.", "Best serum I've tried so far.",
                         "Smells great and absorbs quickly."]
    review_texts_neg = ["Packaging was damaged on arrival.", "Didn't suit my skin type.",
                         "Expected better results for the price.", "Took too long to deliver."]
    review_texts_neu = ["Decent product, does the job.", "Average experience overall."]
    for i in range(220):
        title, cat = RNG.choice(PRODUCTS)
        rating = RNG.choices([5, 4, 3, 2, 1], weights=[45, 28, 15, 7, 5])[0]
        text = RNG.choice(review_texts_pos) if rating >= 4 else (RNG.choice(review_texts_neu) if rating == 3 else RNG.choice(review_texts_neg))
        first = RNG.choice(FIRST_NAMES)
        created = DATE_START + timedelta(days=RNG.randint(0, (DATE_END - DATE_START).days))
        reviews.append({
            "id": uid(), "product_id": uid(), "product_title": title, "rating": rating,
            "title": f"{'Great!' if rating >= 4 else 'Okay' if rating == 3 else 'Not great'}",
            "comment": text, "first_name": first, "last_name": RNG.choice(LAST_NAMES)[0] + ".",
            "spam": False, "created_at": datetime.combine(created, datetime.min.time()),
            "synced_at": now(),
        })

    pairs, seen = [], set()
    attempts = 0
    while len(pairs) < 30 and attempts < 300:
        attempts += 1
        a, b = RNG.sample(PRODUCTS, 2)
        key = tuple(sorted([a[0], b[0]]))
        if key in seen:
            continue
        seen.add(key)
        pairs.append({
            "id": uid(), "product_a_title": key[0], "product_b_title": key[1],
            "co_occurrences": RNG.randint(15, 400), "period_start": DATE_START, "period_end": DATE_END,
            "createdAt": now(),
        })
    total_active = sum(ds.orders for ds in DAYS)
    multi_item = round(total_active * RNG.uniform(0.28, 0.4))
    corr_summary = [{
        "id": uid(), "total_active_orders": total_active, "multi_item_orders": multi_item,
        "bundling_percentage": round(multi_item / total_active * 100, 2) if total_active else 0.0,
        "period_start": DATE_START, "period_end": DATE_END, "createdAt": now(),
    }]

    # Recent-only: search_top_keywords + cart_abandoned_products (last 90 days)
    recent_days = DAYS[-90:] if len(DAYS) > 90 else DAYS
    keywords_rows, abandoned_rows = [], []
    for ds in recent_days:
        n_kw = RNG.randint(8, 15)
        kws = RNG.sample(SEARCH_KEYWORDS, n_kw)
        for kw in kws:
            keywords_rows.append({
                "id": uid(), "keyword": kw, "count": RNG.randint(3, 90), "date": ds.d, "createdAt": now(),
            })
        n_ab = RNG.randint(10, 20)
        prods = RNG.sample(PRODUCTS, n_ab)
        for title, _cat in prods:
            abandoned_rows.append({
                "id": uid(), "product_title": title, "count": RNG.randint(1, 40), "date": ds.d, "createdAt": now(),
            })
    return reviews, pairs, corr_summary, keywords_rows, abandoned_rows


def gen_ceo_dashboard():
    snapshots = []
    for ds in DAYS:
        avg_delivery = RNG.uniform(2.2, 4.5)
        sla_pct = RNG.uniform(65, 88)
        delivered = round(ds.orders * RNG.uniform(0.82, 0.94))
        within_sla = round(delivered * sla_pct / 100)
        email_rev_share = RNG.uniform(8, 22)
        rto_rate = RNG.uniform(3, 7)
        snapshots.append({
            "id": uid(), "snapshot_date": ds.d, "avg_delivery_days": round(avg_delivery, 2),
            "sla_pct": round(sla_pct, 2), "orders_delivered": delivered, "orders_within_sla": within_sla,
            "hero_sku_sellthrough": round(RNG.uniform(35, 78), 2),
            "inventory_coverage_days": round(RNG.uniform(18, 55), 2),
            "email_revenue_share": round(email_rev_share, 2),
            "email_attributed_revenue": round(ds.revenue * email_rev_share / 100, 2),
            "total_revenue": float(ds.revenue),
            "rto_rate": round(rto_rate, 2), "rto_orders": round(ds.orders * rto_rate / 100),
            "createdAt": now(), "updatedAt": now(),
        })
    targets = [
        {"id": uid(), "metric_key": "gmv", "target_value": 350000.0, "updatedAt": datetime.utcnow()},
        {"id": uid(), "metric_key": "blended_cac", "target_value": 250.0, "updatedAt": datetime.utcnow()},
        {"id": uid(), "metric_key": "conversion_rate", "target_value": 2.5, "updatedAt": datetime.utcnow()},
        {"id": uid(), "metric_key": "aov", "target_value": 950.0, "updatedAt": datetime.utcnow()},
        {"id": uid(), "metric_key": "rpr_60d", "target_value": 32.0, "updatedAt": datetime.utcnow()},
        {"id": uid(), "metric_key": "dead_inventory", "target_value": 8.0, "updatedAt": datetime.utcnow()},
    ]
    return snapshots, targets


def gen_search_analytics_snapshot():
    rows = []
    for ds in DAYS:
        top_kw = [{"keyword": k, "volume": RNG.randint(20, 300), "trend_pct": round(RNG.uniform(-25, 40), 1)}
                  for k in RNG.sample(SEARCH_KEYWORDS, 10)]
        zero = [{"keyword": k, "volume": RNG.randint(3, 40)} for k in RNG.sample(SEARCH_KEYWORDS, 5)]
        low = [{"keyword": k, "avg_results": RNG.randint(1, 2)} for k in RNG.sample(SEARCH_KEYWORDS, 5)]
        high_exit = [{"keyword": k, "exit_rate_pct": round(RNG.uniform(40, 80), 1)} for k in RNG.sample(SEARCH_KEYWORDS, 5)]
        brands = [{"brand": "BeautyBarn", "volume": RNG.randint(100, 600)},
                  {"brand": "Generic", "volume": RNG.randint(50, 300)}]
        categories = [{"category": c, "volume": RNG.randint(40, 500)} for c in
                      sorted(set(cat for _, cat in PRODUCTS))]
        attrs = [{"attribute": a, "count": RNG.randint(10, 200)} for a in
                 ["oily skin", "dry skin", "spf", "cruelty-free", "vegan", "paraben-free"]]
        # Shape matches what /active-users expects: a list of per-user-type
        # rows with brand_searches/concern_searches counts (not just pct).
        new_vs_returning = []
        for user_type, brand_pct in (("new", RNG.uniform(30, 45)), ("returning", RNG.uniform(50, 65))):
            searches_total = RNG.randint(400, 1200)
            brand_searches = round(searches_total * brand_pct / 100)
            concern_searches = searches_total - brand_searches
            new_vs_returning.append({
                "user_type": user_type,
                "brand_searches": brand_searches,
                "brand_search_pct": round(brand_pct, 1),
                "concern_searches": concern_searches,
                "concern_search_pct": round(100 - brand_pct, 1),
            })
        high_intent = [{"keyword": k, "repeat_searchers": RNG.randint(5, 60)} for k in RNG.sample(SEARCH_KEYWORDS, 5)]
        not_purchased = [{"product_title": t, "search_volume": RNG.randint(20, 150)} for t, _c in RNG.sample(PRODUCTS, 5)]
        rows.append({
            "id": uid(), "snapshot_date": ds.d, "top_keywords_data": top_kw, "zero_result_data": zero,
            "low_result_data": low, "high_exit_data": high_exit, "brand_volume_data": brands,
            "category_demand_data": categories, "attributes_frequency_data": attrs,
            "new_vs_returning_data": new_vs_returning, "high_intent_demand_data": high_intent,
            "not_purchased_data": not_purchased, "createdAt": now(),
        })
    return rows


def gen_users():
    admin = AnalyticsUser(
        id=uid(), email="demo@beautybarn.com", name="Demo Admin",
        role="admin", permissions=[], is_active=True,
    )
    admin.set_password("Demo@12345")
    viewer = AnalyticsUser(
        id=uid(), email="viewer@beautybarn.com", name="Marketing Viewer",
        role="user",
        permissions=["orders", "carts", "products", "utm", "channel_roi", "marketing_platforms",
                     "growth", "engagement", "events", "creative_performance", "audience_roas"],
        is_active=True,
    )
    viewer.set_password("Demo@12345")
    return [admin, viewer]


def gen_job_logs():
    actions = ["daily-orders", "utm-daily", "coupon-daily", "cart-daily", "rfm", "rto", "delivery-time"]
    rows = []
    for i in range(25):
        d = DATE_END - timedelta(days=i)
        action = RNG.choice(actions)
        rows.append({
            "id": uid(), "action": action, "job_key": f"{action}-{d.isoformat()}-demo",
            "status": "success", "result_count": RNG.randint(1, 50), "job_metadata": {"demo": True},
            "error": None, "duration": RNG.randint(200, 4000),
            "created_at": datetime.combine(d, datetime.min.time()),
            "updated_at": datetime.combine(d, datetime.min.time()),
        })
    return rows


# ════════════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════════════

async def main():
    print(f"Seeding demo data: {DATE_START} .. {DATE_END} ({len(ALL_DATES)} days)")

    async with analytics_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Schema ready (create_all).")

    all_models = [
        m.DailyOrders, m.MonthlyOrders,
        m.UtmSourceDaily, m.UtmMediumDaily, m.UtmCampaignDaily, m.UtmTermDaily, m.UtmContentDaily,
        m.UtmSourceMonthly, m.UtmMediumMonthly, m.UtmCampaignMonthly, m.UtmTermMonthly, m.UtmContentMonthly,
        m.DailyCouponUsage, m.MonthlyCouponUsage, m.CouponMetadata, m.AnalyticsJobLog,
        m.DailyCartMetrics, m.MonthlyCartMetrics, m.DailyProductMetrics, m.MonthlyProductMetrics,
        m.DailySearchMetrics, m.MonthlySearchMetrics, m.DailyVisitorMetrics, m.MonthlyVisitorMetrics,
        m.DailyEngagementMetrics, m.DailyFulfillmentMetrics,
        m.InventorySummary, m.InventoryDeadStock, m.InventoryStockOuts, m.InventoryAgingStock,
        m.CustomerRfmSegment, m.CustomerLtvBySegment, m.RepeatPurchaseRate,
        m.ProductReviewLocal, m.ProductPairCorrelation, m.CorrelationSummary,
        m.SearchTopKeyword, m.CartAbandonedProduct,
        m.CustomerFunnelMetrics, m.CustomerRepeatCohort, m.CustomerLifetimeCohort,
        m.UtmAttributionMetrics, m.FlowRevenueAttribution,
        m.RtoMetrics, m.DeliveryTimeMetrics, m.CeoDashboardSnapshot, m.CeoDashboardTargets,
        m.FailureZonesMetrics, m.ReturnRateMetrics, m.GeographyRevenueMetrics,
        m.CourierPerformanceMetrics, m.ReturnReasonMetrics,
        m.ChannelRoiMetrics, m.ChannelSpendConfig, m.CampaignCacMetrics, m.MarketingCostPerOrder,
        m.CreativePerformanceMetrics, m.AudienceRoasMetrics, m.InfluencerAttributionMetrics,
        m.PaymentFailureMetrics, m.PaymentFailureByMethod, m.PaymentFailureByReason,
        m.SearchAnalyticsSnapshot, m.CustomerClvSnapshot, m.SignupCohortMetrics,
        AnalyticsUser,
    ]

    async with AnalyticsSessionLocal() as session:
        print("Truncating demo tables...")
        await truncate_all(session, all_models)

        print("Generating in-memory dataset...")
        customers = gen_customers()

        daily_orders = gen_daily_orders()
        monthly_orders = gen_monthly_orders()

        utm_daily, utm_monthly, utm_table_map = gen_utm_daily_monthly()

        coupon_daily, coupon_monthly, coupon_meta = gen_coupons()
        cart_daily, cart_monthly = gen_cart_metrics()
        product_daily, product_monthly = gen_product_metrics()
        (search_daily, search_monthly, visitor_daily, visitor_monthly,
         engagement_daily) = gen_search_visitor_engagement()
        fulfillment_rows = gen_fulfillment()
        inv_summary, inv_dead, inv_stockouts, inv_aging = gen_inventory()
        rfm_rows, ltv_rows, clv_rows = gen_rfm_ltv_clv(customers)
        rpr_rows = gen_rpr(customers)
        repeat_cohort_rows, lifetime_cohort_rows = gen_cohorts(customers)
        signup_cohort_rows = gen_signup_cohorts(customers)
        funnel_rows = gen_funnel()
        utm_attr_rows = gen_utm_attribution()
        flow_rows = gen_flow_attribution()
        (rto_rows, return_rate_rows, return_reason_rows, delivery_rows, failure_zone_rows,
         geo_rev_rows, courier_rows, pay_fail_rows, pay_method_rows,
         pay_reason_rows) = gen_rto_return_delivery_geo_courier_failure_payment()
        channel_roi_rows, channel_spend_rows = gen_channel_roi_and_spend()
        (campaign_cac_rows, marketing_cost_rows, creative_rows, audience_rows,
         influencer_rows) = gen_meta_and_influencer_tables()
        (review_rows, pair_rows, corr_summary_rows, keyword_rows,
         abandoned_rows) = gen_reviews_correlations_keywords_abandoned()
        ceo_snapshots, ceo_targets = gen_ceo_dashboard()
        search_snapshot_rows = gen_search_analytics_snapshot()
        job_log_rows = gen_job_logs()
        users = gen_users()

        print("Inserting...")
        await bulk_insert(session, m.DailyOrders, daily_orders)
        await bulk_insert(session, m.MonthlyOrders, monthly_orders)

        for dim, (daily_model, monthly_model) in utm_table_map.items():
            await bulk_insert(session, daily_model, utm_daily[dim])
            await bulk_insert(session, monthly_model, utm_monthly[dim])

        await bulk_insert(session, m.DailyCouponUsage, coupon_daily)
        await bulk_insert(session, m.MonthlyCouponUsage, coupon_monthly)
        await bulk_insert(session, m.CouponMetadata, coupon_meta)
        await bulk_insert(session, m.DailyCartMetrics, cart_daily)
        await bulk_insert(session, m.MonthlyCartMetrics, cart_monthly)
        await bulk_insert(session, m.DailyProductMetrics, product_daily)
        await bulk_insert(session, m.MonthlyProductMetrics, product_monthly)
        await bulk_insert(session, m.DailySearchMetrics, search_daily)
        await bulk_insert(session, m.MonthlySearchMetrics, search_monthly)
        await bulk_insert(session, m.DailyVisitorMetrics, visitor_daily)
        await bulk_insert(session, m.MonthlyVisitorMetrics, visitor_monthly)
        await bulk_insert(session, m.DailyEngagementMetrics, engagement_daily)
        await bulk_insert(session, m.DailyFulfillmentMetrics, fulfillment_rows)
        await bulk_insert(session, m.InventorySummary, inv_summary)
        await bulk_insert(session, m.InventoryDeadStock, inv_dead)
        await bulk_insert(session, m.InventoryStockOuts, inv_stockouts)
        await bulk_insert(session, m.InventoryAgingStock, inv_aging)
        await bulk_insert(session, m.CustomerRfmSegment, rfm_rows)
        await bulk_insert(session, m.CustomerLtvBySegment, ltv_rows)
        await bulk_insert(session, m.RepeatPurchaseRate, rpr_rows)
        await bulk_insert(session, m.CustomerRepeatCohort, repeat_cohort_rows)
        await bulk_insert(session, m.CustomerLifetimeCohort, lifetime_cohort_rows)
        await bulk_insert(session, m.SignupCohortMetrics, signup_cohort_rows)
        await bulk_insert(session, m.CustomerFunnelMetrics, funnel_rows)
        await bulk_insert(session, m.UtmAttributionMetrics, utm_attr_rows)
        await bulk_insert(session, m.FlowRevenueAttribution, flow_rows)
        await bulk_insert(session, m.RtoMetrics, rto_rows)
        await bulk_insert(session, m.ReturnRateMetrics, return_rate_rows)
        await bulk_insert(session, m.ReturnReasonMetrics, return_reason_rows)
        await bulk_insert(session, m.DeliveryTimeMetrics, delivery_rows)
        await bulk_insert(session, m.FailureZonesMetrics, failure_zone_rows)
        await bulk_insert(session, m.GeographyRevenueMetrics, geo_rev_rows)
        await bulk_insert(session, m.CourierPerformanceMetrics, courier_rows)
        await bulk_insert(session, m.PaymentFailureMetrics, pay_fail_rows)
        await bulk_insert(session, m.PaymentFailureByMethod, pay_method_rows)
        await bulk_insert(session, m.PaymentFailureByReason, pay_reason_rows)
        await bulk_insert(session, m.ChannelRoiMetrics, channel_roi_rows)
        await bulk_insert(session, m.ChannelSpendConfig, channel_spend_rows)
        await bulk_insert(session, m.CampaignCacMetrics, campaign_cac_rows)
        await bulk_insert(session, m.MarketingCostPerOrder, marketing_cost_rows)
        await bulk_insert(session, m.CreativePerformanceMetrics, creative_rows)
        await bulk_insert(session, m.AudienceRoasMetrics, audience_rows)
        await bulk_insert(session, m.InfluencerAttributionMetrics, influencer_rows)
        await bulk_insert(session, m.ProductReviewLocal, review_rows)
        await bulk_insert(session, m.ProductPairCorrelation, pair_rows)
        await bulk_insert(session, m.CorrelationSummary, corr_summary_rows)
        await bulk_insert(session, m.SearchTopKeyword, keyword_rows)
        await bulk_insert(session, m.CartAbandonedProduct, abandoned_rows)
        await bulk_insert(session, m.CeoDashboardSnapshot, ceo_snapshots)
        await bulk_insert(session, m.CeoDashboardTargets, ceo_targets)
        await bulk_insert(session, m.SearchAnalyticsSnapshot, search_snapshot_rows)
        await bulk_insert(session, m.CustomerClvSnapshot, clv_rows)
        await bulk_insert(session, m.AnalyticsJobLog, job_log_rows)

        session.add_all(users)
        await session.commit()

    print("Done. Demo login: demo@beautybarn.com / Demo@12345")
    print("     (also: viewer@beautybarn.com / Demo@12345 — limited permissions)")


if __name__ == "__main__":
    asyncio.run(main())
