# ListKit GTM Intelligence Platform

The **single source of truth** for all customer data, health tracking, and revenue metrics at ListKit.

This platform unifies customer data from multiple sources (Intercom, HubSpot, Calendly, Userflow, etc.) into a comprehensive intelligence system with health scores, churn risk prediction, and actionable insights.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Phase Roadmap](#phase-roadmap)
- [Quick Start](#quick-start)
- [Setup Instructions](#setup-instructions)
- [Running Syncs](#running-syncs)
- [API Usage](#api-usage)
- [Adding New Data Sources](#adding-new-data-sources)
- [Health Score Calculation](#health-score-calculation)
- [Deployment](#deployment)

## Architecture Overview

The platform uses the **DOE Framework** (Directive-Orchestration-Execution):

### 1. Directive Layer (`directives/`)
SOPs and knowledge in markdown defining business rules, data mappings, and calculations.

### 2. Orchestration Layer (`claude.md`, `sync_all.py`)
Workflows that combine directives to create the complete system.

### 3. Execution Layer (`execution/`, `api/`)
Python implementation with API clients, sync scripts, health calculations, and REST API.

### Data Flow

```
Data Sources → Sync Scripts → Unified Database → Health Calculator → Outputs
     ↓              ↓              ↓                    ↓              ↓
 Intercom    sync_intercom   unified_customers    health_score    Dashboard
 HubSpot     sync_hubspot         ↓                    ↓            API
 Calendly    sync_calendly    (email match)       risk_signals    Alerts
 Userflow    sync_userflow                                        Reports
```

## Phase Roadmap

### Phase 1 - Active Now ✅
**Data Source:** Intercom (with Stripe data synced)

**Capabilities:**
- Customer profile information
- Revenue metrics (MRR, ARR, LTV) from Stripe subscriptions/payments
- Support conversation activity and sentiment
- Cancel mention detection
- Basic health scores
- Slack alerts

### Phase 2 - Next
**Data Sources:** HubSpot + Calendly

**New Capabilities:**
- CRM data and lifecycle stages
- Account manager assignment
- Call booking and show rates
- Enhanced health scores with more data points
- Deal pipeline tracking

### Phase 3 - Later
**Data Sources:** Userflow + Fathom + ListKit Admin Dashboard

**New Capabilities:**
- Product usage and engagement metrics
- Login frequency and onboarding completion
- Call transcripts and insights
- Platform-specific usage (credits, exports)

### Phase 4 - Future
**Data Sources:** ChartMogul + Stripe Direct

**New Capabilities:**
- Advanced revenue analytics (NRR, cohorts)
- Deeper financial metrics
- Predictive ML models

## Quick Start

### Prerequisites

- Python 3.9+
- PostgreSQL database (Supabase recommended)
- Intercom API key (Phase 1)

### Install Dependencies

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install requirements
pip install -r requirements.txt
```

### Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your credentials
nano .env
```

**Required for Phase 1:**
```
DATABASE_URL=postgresql://user:password@host:port/database
INTERCOM_API_KEY=your_intercom_api_key
```

### Set Up Database

```bash
# Connect to your PostgreSQL database
psql $DATABASE_URL

# Run schema creation
\i execution/database/schema.sql
```

Or use Supabase SQL Editor to run `execution/database/schema.sql`.

### Run First Sync

```bash
# Run Intercom sync
python -m execution.sync.sync_intercom
```

### Start API Server

```bash
# Start FastAPI server
uvicorn api.main:app --reload --port 8000
```

Visit [http://localhost:8000/docs](http://localhost:8000/docs) for interactive API documentation.

## Setup Instructions

### 1. Set Up Supabase Database

1. **Create Supabase Project:**
   - Go to [supabase.com](https://supabase.com)
   - Create new project
   - Note your database connection string

2. **Run Schema:**
   - Open SQL Editor in Supabase dashboard
   - Copy contents of `execution/database/schema.sql`
   - Execute SQL

3. **Verify Tables:**
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public';
   ```

   You should see:
   - `unified_customers`
   - `alert_history`
   - `sync_log`
   - `health_score_history`

### 2. Get API Keys

#### Phase 1: Intercom

1. Go to Intercom Settings → Developers → Developer Hub
2. Create new app or use existing
3. Generate Access Token
4. Add to `.env` as `INTERCOM_API_KEY`

**Required Permissions:**
- Read contacts
- Read conversations
- Read custom attributes

#### Phase 2: HubSpot (coming soon)

1. Create HubSpot Private App
2. Grant scopes: `crm.objects.contacts.read`, `crm.objects.companies.read`, `crm.objects.deals.read`
3. Copy access token to `HUBSPOT_API_KEY`

#### Phase 2: Calendly (coming soon)

1. Go to Calendly Integrations
2. Generate Personal Access Token
3. Copy to `CALENDLY_API_KEY`

### 3. Configure Slack Notifications (Optional)

1. Create Slack app or use incoming webhooks
2. Add webhook URL to `SLACK_WEBHOOK_URL`
3. Create channels: `#customer-alerts`, `#customer-health`, `#daily-summaries`

### 4. Test Installation

```bash
# Test database connection
python -c "from execution.config import settings; print('DB URL:', settings.database_url[:30])"

# Test Intercom connection
python -c "from execution.clients import IntercomClient; from execution.config import settings; client = IntercomClient(settings.intercom_api_key); print('Intercom connected')"

# Run health check
curl http://localhost:8000/health
```

## Running Syncs

### Manual Sync Commands

**Intercom (Phase 1):**
```bash
# Incremental sync (default)
python -m execution.sync.sync_intercom

# Full sync (all contacts)
python -m execution.sync.sync_intercom --full
```

**All Sources:**
```bash
# Sync all enabled sources
python -m execution.sync.sync_all

# Full sync all
python -m execution.sync.sync_all --full
```

### Scheduled Syncs

Use cron to schedule automatic syncs:

```bash
# Edit crontab
crontab -e

# Add sync schedules
# Intercom every 6 hours
0 */6 * * * cd /path/to/listkit-gtm-intelligence && /path/to/venv/bin/python -m execution.sync.sync_intercom

# All sources daily at 2 AM
0 2 * * * cd /path/to/listkit-gtm-intelligence && /path/to/venv/bin/python -m execution.sync.sync_all
```

### Via API

Trigger syncs via API endpoints:

```bash
# Trigger Intercom sync
curl -X POST http://localhost:8000/sync/intercom

# Trigger all syncs
curl -X POST http://localhost:8000/sync/all

# Check sync status
curl http://localhost:8000/sync/status
```

## API Usage

### API Documentation

Interactive docs available at:
- **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

### Key Endpoints

**Get Dashboard Summary:**
```bash
curl http://localhost:8000/dashboard/summary
```

Response:
```json
{
  "total_customers": 1234,
  "total_mrr": 45678.90,
  "total_arr": 548146.80,
  "avg_health_score": 72.5,
  "health_distribution": {
    "healthy": {"count": 800, "mrr": 30000},
    "at_risk": {"count": 300, "mrr": 12000},
    "high_risk": {"count": 100, "mrr": 3000},
    "critical": {"count": 34, "mrr": 678.90}
  },
  "at_risk_count": 400,
  "critical_count": 34
}
```

**List At-Risk Customers:**
```bash
curl http://localhost:8000/customers/at-risk
```

**Get Customer by Email:**
```bash
curl http://localhost:8000/customers/by-email/customer@example.com
```

**Filter Customers:**
```bash
# High MRR customers
curl "http://localhost:8000/customers?min_mrr=500"

# Critical health status
curl "http://localhost:8000/customers?health_status=critical"

# By account manager
curl "http://localhost:8000/customers?assigned_am=John"
```

## Adding New Data Sources

The platform is designed for easy extensibility. To add a new data source:

### 1. Create Directive

Create `directives/data-sources/[source]-sync.md`:

- What data to extract
- How to match to customers (usually email)
- What fields to populate
- Calculation logic

### 2. Create Client

Create `execution/clients/[source]_client.py`:

```python
from execution.clients.base_client import BaseClient

class NewSourceClient(BaseClient):
    def __init__(self, api_key: str):
        super().__init__(
            api_key=api_key,
            base_url="https://api.newsource.com",
            rate_limit=10
        )

    def fetch_data(self):
        # Implementation
        pass
```

### 3. Create Sync Script

Create `execution/sync/sync_[source].py`:

```python
def sync_newsource(incremental: bool = True):
    # 1. Initialize client
    # 2. Fetch data
    # 3. For each record:
    #    - Match by email
    #    - Update fields
    #    - Recalculate health score
    # 4. Log metrics
    pass
```

### 4. Update Schema (if needed)

Add source-specific fields to `unified_customers` table:

```sql
ALTER TABLE unified_customers
ADD COLUMN newsource_user_id VARCHAR(255),
ADD COLUMN last_newsource_sync TIMESTAMP;
```

### 5. Add to Orchestrator

Update `execution/sync/sync_all.py` to include new source.

## Health Score Calculation

Health scores (0-100) are calculated using a weighted formula:

**Components:**
1. **Activity Recency (25%)** - Days since last seen
2. **Support Sentiment (20%)** - CSAT and conversation tone
3. **Payment Health (20%)** - Subscription status, delinquency
4. **Engagement (15%)** - Product usage, logins
5. **Tenure (10%)** - Customer lifetime
6. **MRR Weight (10%)** - Revenue importance

**Risk Penalties:**
- Cancel mention: -30 points
- Payment delinquent: -25 points
- No activity 30+ days: -20 points
- Open critical tickets: -15 points

**Health Status:**
- **Healthy:** 70-100
- **At Risk:** 50-69
- **High Risk:** 30-49
- **Critical:** 0-29

See `directives/health-score-calculator.md` for detailed methodology.

## Deployment

### Production Checklist

- [ ] Set `ENVIRONMENT=production` in `.env`
- [ ] Use strong PostgreSQL password
- [ ] Configure allowed CORS origins in `api/main.py`
- [ ] Set up SSL/TLS for API
- [ ] Configure log aggregation (Sentry, Loguru file output)
- [ ] Set up monitoring and alerts
- [ ] Schedule automatic backups of database
- [ ] Configure Slack notifications
- [ ] Set up cron jobs for syncs
- [ ] Review and tune rate limits

### Docker Deployment (Optional)

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Environment Variables for Production

```bash
DATABASE_URL=postgresql://...
INTERCOM_API_KEY=...
SLACK_WEBHOOK_URL=...
ENVIRONMENT=production
API_HOST=0.0.0.0
API_PORT=8000
```

## Troubleshooting

### Sync Failures

**Check sync logs:**
```sql
SELECT * FROM sync_log
WHERE status = 'failed'
ORDER BY started_at DESC
LIMIT 10;
```

**Common issues:**
- Invalid API key: Check credentials in `.env`
- Rate limiting: Increase delays in client
- Database connection: Verify `DATABASE_URL`

### Health Score Issues

**Recalculate all scores:**
```python
from execution.database.models import UnifiedCustomer
from execution.health_calculator import calculate_health_score
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine(settings.database_url)
Session = sessionmaker(bind=engine)
db = Session()

for customer in db.query(UnifiedCustomer).all():
    calculate_health_score(customer)

db.commit()
```

### API Connection Issues

**Test database:**
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM unified_customers;"
```

**Check logs:**
```bash
tail -f api/logs/app.log
```

## Contributing

This is an internal ListKit platform. To modify:

1. Update relevant directive in `directives/`
2. Implement changes in `execution/` or `api/`
3. Test thoroughly
4. Update this README if needed

## Support

For questions or issues:
- Check directive documentation in `directives/`
- Review `claude.md` for DOE framework details
- Check sync logs in database
- Review application logs

## License

Internal use only - ListKit GTM Intelligence Platform
