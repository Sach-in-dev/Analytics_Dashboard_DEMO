import os
import re

base_dir = "/Users/sachinyadav/Documents/Beauty_barm_latest/Archive (1)/analytics-ui/src/app"

descriptions = {
    "channel-roi": "Track your return on investment across different marketing channels to optimize your ad spend. Identify the most profitable avenues and double down on high-performing campaigns to maximize revenue.",
    "active-users/daily": "Monitor your daily active users to understand short-term engagement and platform adoption. Keep track of daily fluctuations to identify immediate trends and the impact of recent feature releases.",
    "active-users/monthly": "Analyze your monthly active users to gauge long-term retention and overall platform growth. Uncover macro-level usage patterns and seasonal trends that drive your core business metrics.",
    "active-users": "Get a comprehensive view of your active user base to track engagement over time. Understand user behavior and retention patterns to ensure sustainable growth and product success.",
    "rto-rate": "Track Return to Origin (RTO) rates to identify delivery bottlenecks and reduce logistics costs. Pinpoint the root causes of undelivered packages and optimize your fulfillment process for better customer satisfaction.",
    "payment-failure": "Monitor payment failure rates to improve checkout success and recover lost revenue. Identify common error codes, payment gateway issues, and friction points in the transaction process.",
    "searches/daily": "Analyze daily search behavior and trends to understand what your customers are looking for right now. Quickly adapt your inventory and marketing strategies based on real-time search demand.",
    "searches/monthly": "Review monthly search volume to discover long-term query patterns and seasonal interests. Use this data to plan your content strategy and optimize your product catalog for the most popular terms.",
    "searches": "Analyze overall search behavior, including top keywords and zero-result queries, to improve discovery. Uncover conversion patterns from search results to connect users with the products they want faster.",
    "rfm-segments": "Segment your customers using Recency, Frequency, and Monetary value to identify your most valuable buyers. Tailor your marketing campaigns to specific segments to boost engagement and maximize customer lifetime value.",
    "courier-performance": "Evaluate the performance of different courier partners to ensure timely and reliable deliveries. Compare delivery times, success rates, and customer feedback to choose the best logistics providers.",
    "influencer-attribution": "Track the impact of influencer campaigns on your sales and brand awareness. Attribute conversions accurately to individual influencers and measure the true ROI of your partnerships.",
    "utm-attribution": "Analyze UTM parameters to attribute traffic and conversions accurately across all your marketing efforts. Understand which campaigns, sources, and mediums are driving the most valuable visitors.",
    "utm-daily-report": "Get daily insights into your UTM campaign performance to make real-time adjustments. Monitor daily traffic spikes and conversion rates to optimize your active marketing initiatives.",
    "products/daily": "Track daily product performance and sales velocity to identify fast-moving inventory. Make informed restocking decisions and capitalize on sudden spikes in product popularity.",
    "products/monthly": "Analyze monthly product trends and revenue contributions to guide your long-term inventory planning. Identify seasonal bestsellers and underperforming items to optimize your product mix.",
    "products": "Monitor overall product performance and identify your best sellers across all categories. Use these insights to refine your pricing strategy, promotional efforts, and inventory management.",
    "campaign-cac": "Calculate Customer Acquisition Cost (CAC) for your marketing campaigns to ensure profitable growth. Compare acquisition costs across different channels to allocate your marketing budget more efficiently.",
    "delivery-time": "Analyze delivery times to ensure timely order fulfillment and maintain high customer satisfaction. Identify delays in your logistics network and proactively address issues before they impact buyers.",
    "flow-attribution": "Track user flow attribution to understand the exact conversion paths your customers take. Identify the most effective touchpoints in the customer journey and optimize the overall experience.",
    "audience-roas": "Measure Return on Ad Spend (ROAS) across different audience segments to refine your targeting. Identify which demographics and interest groups yield the highest return on your marketing investments.",
    "order-metrics": "Get a detailed breakdown of your order volume, average order value, and revenue trends. Track essential sales metrics to monitor the overall health and growth of your e-commerce business.",
    "repeat-purchase-rate": "Track your repeat purchase rate to understand customer loyalty and the effectiveness of your retention strategies. Identify patterns in repeat buying behavior to cultivate a devoted customer base.",
    "failure-zones": "Identify geographical areas with high delivery failure rates to optimize your logistics strategy. Implement targeted solutions for problematic regions to reduce costs and improve the delivery experience.",
    "repeat-cohorts": "Analyze repeat purchase cohorts to understand customer retention over specific time periods. Track how different groups of customers behave over time to evaluate the long-term impact of your marketing.",
    "ltv-by-segment": "Calculate Customer Lifetime Value (LTV) across different user segments to identify your most profitable demographics. Use this data to justify acquisition costs and tailor your retention programs.",
    "dashboard": "Your central hub for all key metrics and business performance indicators. Get a high-level overview of your sales, traffic, and marketing efforts to make data-driven decisions at a glance.",
    "lifetime-cohorts": "Analyze customer lifetime cohorts to predict long-term revenue and customer behavior. Understand how early adoption trends translate into sustained value over the customer lifecycle.",
    "carts/daily": "Monitor daily cart abandonment rates to quickly identify and resolve checkout friction. Implement targeted recovery campaigns to capture lost daily revenue and improve the overall conversion rate.",
    "carts/monthly": "Review monthly cart trends to optimize your conversion funnel and pricing strategies. Analyze long-term abandonment patterns to refine your checkout experience and maximize completed sales.",
    "carts": "Analyze overall cart behavior and recover lost revenue from abandoned carts. Understand user intent and streamline the checkout process to turn more prospective buyers into successful customers.",
    "marketing-cost": "Track your total marketing spend across various channels and campaigns to ensure budget compliance. Evaluate the efficiency of your expenditures and align your marketing budget with revenue goals.",
    "coupons/daily": "Monitor daily coupon usage and its immediate impact on sales volume and average order value. Adjust your promotional strategies on the fly based on real-time discount redemption rates.",
    "coupons/monthly": "Analyze monthly coupon performance and overall discount effectiveness to evaluate your promotional calendar. Understand how long-term discount strategies impact your profitability and customer acquisition.",
    "coupons": "Track overall coupon usage to optimize your promotional strategies and maximize revenue. Identify which types of discounts drive the most conversions and attract the most valuable customers.",
    "return-reasons": "Analyze the most common reasons for product returns to identify quality issues and misleading descriptions. Use these insights to improve your product offerings and reduce the overall return rate.",
    "inventory": "Monitor your inventory levels to prevent stockouts and minimize overstocking. Streamline your supply chain operations and ensure you always have the right products available to meet customer demand.",
    "users": "Manage user roles, permissions, and platform access configurations from a single interface. Ensure your team has the right level of access to perform their duties securely and efficiently.",
    "return-rate": "Track your overall product return rate to identify underlying quality issues and logistical challenges. Implement proactive measures to reduce returns and improve customer satisfaction with their purchases.",
    "even-stats": "Review event statistics and user interactions across your platform to understand engagement levels. Analyze key actions to optimize the user journey and drive higher conversion rates.",
    "geography-revenue": "Analyze revenue distribution across different geographical regions to identify high-performing markets. Tailor your marketing and expansion strategies based on regional sales data and customer preferences.",
    "events": "Monitor key events and user interactions to optimize your conversion funnel and product features. Understand how users navigate your platform to deliver a more intuitive and engaging experience.",
    "utm-monthly-reports": "Get monthly insights into your UTM campaign performance to evaluate long-term marketing strategies. Track the sustained impact of your campaigns and refine your attribution models for future planning.",
    "funnel-metrics": "Analyze your conversion funnel to identify drop-off points and areas for improvement. Optimize each step of the user journey to increase the overall percentage of successful conversions.",
    "creative-performance": "Evaluate the performance of different ad creatives to understand what resonates with your audience. Identify top-performing visuals and copy to guide your future marketing content creation.",
    "reviews": "Monitor customer reviews and ratings to improve product quality and brand reputation. Leverage direct customer feedback to address concerns promptly and highlight your most praised offerings.",
    "utm": "Track standard UTM parameters to understand your primary traffic sources and marketing effectiveness. Gain clear visibility into which external links and campaigns are driving the most engaged visitors.",
    "correlations": "Discover correlations between different metrics to uncover hidden insights and business opportunities. Understand how various factors interact with each other to drive revenue and customer growth.",
    "unauthorized": "Access denied. You do not have the required permissions to view this page. Please contact your administrator if you believe this is an error.",
    "login": "Sign in to access your analytics dashboard and manage your account. Securely log in to view real-time data, generate reports, and configure your platform settings.",
    "page": "Welcome to the Superlabs Analytics platform. Navigate through your dashboards to uncover deep insights and drive your business forward."
}

def get_fallback(name):
    clean_name = name.replace('-', ' ').title()
    return f"Welcome to the {clean_name} page. Analyze your data to uncover hidden insights and trends. Use this information to drive your business forward and make informed decisions daily."

pattern = re.compile(r'(description\s*:\s*)(["\'])(.*?)\2', re.DOTALL)

updated_count = 0

for root, _, files in os.walk(base_dir):
    for file in files:
        if file == "page.tsx":
            path = os.path.join(root, file)
            
            # extract relative path like '(dashboard)/channel-roi' -> 'channel-roi'
            rel_path = os.path.relpath(path, base_dir)
            parts = rel_path.split('/')
            
            # figure out a key for the dict
            key_parts = []
            for p in parts[:-1]: # exclude 'page.tsx'
                if not p.startswith('('):
                    key_parts.append(p)
            
            key = '/'.join(key_parts)
            if not key:
                key = "page"
                
            new_desc = descriptions.get(key)
            if not new_desc:
                new_desc = get_fallback(key)
                
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            if 'export const metadata' in content:
                # Replace the description
                def replacer(match):
                    return f'{match.group(1)}"{new_desc}"'
                
                new_content, count = pattern.subn(replacer, content)
                if count > 0:
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    updated_count += 1
                    print(f"Updated {key}")
                    
print(f"Finished updating {updated_count} files.")
