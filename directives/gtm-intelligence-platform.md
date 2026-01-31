# GTM Intelligence Platform - Master Directive

## Vision

The ListKit GTM Intelligence Platform is the **single source of truth** for all customer data, health tracking, and revenue metrics. It unifies data from multiple sources into one comprehensive view of each customer, enabling:

- Proactive churn prevention
- Expansion opportunity identification
- Data-driven account management
- Revenue forecasting and analysis
- Automated alerting and workflows

## Architecture Principles

### Multi-Source Data Unification

The platform ingests data from multiple sources and combines them into a unified customer record:

**Phase 1 Sources:**
- **Intercom** - Support conversations, activity, Stripe revenue data

**Phase 2 Sources:**
- **HubSpot** - CRM data, deals, lifecycle stages, AM assignment
- **Calendly** - Call bookings, show rates, AM assignment

**Phase 3 Sources:**
- **Userflow** - Product activity, logins, onboarding progress
- **Fathom** - Call recordings and insights
- **ListKit Admin Dashboard** - Credits, usage, exports

**Phase 4 Sources:**
- **ChartMogul** - NRR, cohorts, revenue analytics
- **Stripe Direct** - Deep revenue data (if needed beyond Intercom sync)

### Unified Schema

All data sources feed into a single `unified_customers` table with these domains:

1. **Identifiers** - IDs from each source system
2. **Profile** - Name, company, location, AM assignment
3. **Revenue** - MRR, ARR, LTV, plan, subscription status
4. **Activity** - Last seen, login frequency, engagement
5. **Support** - Conversation volume, CSAT, sentiment
6. **Calls** - Booking rate, show rate, call outcomes
7. **Pipeline** - Deal stage, lifecycle, opportunity value
8. **Health** - Calculated scores, risk signals, recommendations

### Email as Primary Match Key

All sources match customers by **email address**. This is the universal identifier across all systems.

## Key Metrics

### Revenue Metrics
- **MRR (Monthly Recurring Revenue)** - Calculated from active Stripe subscriptions
- **ARR (Annual Recurring Revenue)** - MRR × 12
- **LTV (Lifetime Value)** - Sum of all Stripe payments
- **Plan Tier** - Current subscription plan and price

### Health Metrics
- **Health Score (0-100)** - Composite score from multiple factors
- **Churn Risk (0-100)** - Probability of churning in next 90 days
- **Health Status** - Categorical: Healthy / At Risk / High Risk / Critical
- **Risk Signals** - Array of specific risk indicators

### Activity Metrics
- **Days Since Seen** - Recency of last activity
- **Login Frequency** - Logins in last 7/30 days
- **Engagement Score** - Product usage intensity
- **Support Activity** - Conversation frequency and sentiment

### Relationship Metrics
- **Assigned AM** - Account manager owner
- **Call Show Rate** - Attendance at scheduled calls
- **CSAT Score** - Customer satisfaction rating
- **Lifecycle Stage** - Customer journey position

## Health Score Calculation

The health score (0-100) is calculated using a weighted formula:

**Formula Components:**
1. **Activity Recency (25%)** - Days since last seen
2. **Support Sentiment (20%)** - CSAT and conversation tone
3. **Payment Health (20%)** - Subscription status, delinquency
4. **Engagement (15%)** - Product usage and logins
5. **Tenure (10%)** - Customer lifetime and stability
6. **MRR Weighting (10%)** - Revenue importance factor

**Risk Signal Overrides:**
Certain signals automatically lower health score:
- "Cancel" mentioned in support → -30 points
- Payment delinquent → -25 points
- No activity in 30+ days → -20 points
- Open critical tickets → -15 points

**Health Status Thresholds:**
- **Healthy:** 70-100
- **At Risk:** 50-69
- **High Risk:** 30-49
- **Critical:** 0-29

See [health-score-calculator.md](health-score-calculator.md) for detailed methodology.

## Outputs

### Dashboard
Real-time visualization showing:
- Total customer count and MRR
- Health distribution (healthy/at-risk/critical)
- MRR breakdown by plan tier
- At-risk customer list with recommended actions
- Trending metrics (MRR growth, churn rate)

### Alerts
Automated Slack notifications for:
- **Cancel Mentions** - Customer mentioned canceling in support
- **Payment Issues** - Delinquent or failed payments
- **Health Drops** - Significant health score decreases
- **Engagement Drops** - Sudden activity decreases
- **Daily/Weekly Summaries** - Aggregate health reports

See [slack-alerts.md](slack-alerts.md) for alert specifications.

### API
REST API endpoints for:
- Customer listing and filtering
- Individual customer detail views
- At-risk customer queries
- Dashboard summary statistics
- Manual sync triggers

### Reports
Scheduled reports delivered to stakeholders:
- Weekly health summary
- Monthly MRR analysis
- Quarterly churn risk report
- AM performance scorecard

## Data Quality

The platform maintains data quality through:

1. **Source Validation** - Verify data integrity from each source
2. **Match Confidence** - Track confidence in email-based matching
3. **Completeness Score** - Measure % of fields populated
4. **Freshness Tracking** - Monitor last sync time for each source
5. **Anomaly Detection** - Flag unusual changes in metrics

Each customer has a `data_quality_score` (0-100) indicating record completeness and reliability.

## Sync Strategy

### Sync Frequency
- **Intercom** - Every 6 hours (capture support activity quickly)
- **HubSpot** - Every 12 hours (CRM data changes slowly)
- **Calendly** - Every 4 hours (near real-time booking data)
- **Userflow** - Daily (activity aggregations)
- **Stripe/ChartMogul** - Daily (revenue data is stable)

### Sync Process
1. **Extract** - Fetch data from source API with pagination
2. **Transform** - Map source fields to unified schema
3. **Validate** - Check data quality and format
4. **Upsert** - Insert or update based on email match
5. **Timestamp** - Update `last_[source]_sync` field
6. **Alert** - Notify on sync failures or anomalies

### Incremental vs Full Sync
- **Incremental** - Only sync records changed since last sync (default)
- **Full** - Sync all records (run weekly for data integrity)

## Extensibility

The platform is designed for easy addition of new data sources:

1. **Directive** - Create markdown file defining source mapping
2. **Client** - Build API client extending BaseClient
3. **Sync Script** - Implement ETL following standard pattern
4. **Schema Update** - Add source-specific fields to unified table
5. **Health Algorithm** - Optionally incorporate new data into health score

The modular architecture ensures each source is independent and failures are isolated.

## Security & Privacy

- **API Keys** - Stored in environment variables, never in code
- **Database Access** - Restricted to application service account
- **PII Handling** - Customer data encrypted at rest
- **Access Logs** - Audit trail of all data access
- **GDPR Compliance** - Support for data deletion requests

## Success Metrics

Platform success measured by:
- **Churn Reduction** - Decrease in customer churn rate
- **Early Warning** - Days of advance notice before churn
- **Expansion Revenue** - Revenue from identified opportunities
- **AM Efficiency** - Time saved through automation
- **Data Coverage** - % of customers with complete profiles

## Future Enhancements

- **Predictive ML Models** - Advanced churn prediction
- **Chat Interface** - Natural language customer queries
- **Automated Actions** - Trigger workflows based on signals
- **Revenue Forecasting** - Predict future MRR/ARR
- **Cohort Analysis** - Segment customers by behavior patterns
