# SmartLead Campaign Sync - Runbook

## Overview

This document describes how to sync SmartLead.ai campaign data to customers in the GTM Intelligence Platform.

**Key Concept**: Campaigns are linked to customers via the SmartLead client email. Each SmartLead client has an email, and we match that email to customer emails in our `unified_customers` table.

## Scripts

### 1. Backfill Existing Campaigns

**Script**: `execution/sync/backfill_smartlead_clients.py`

Use this to update existing campaigns in the database with proper SmartLead client linkage:

```bash
# Dry run (preview changes)
python -m execution.sync.backfill_smartlead_clients --dry-run

# Execute backfill
python -m execution.sync.backfill_smartlead_clients

# With custom batch size
python -m execution.sync.backfill_smartlead_clients --batch-size 50
```

**What it does**:
1. Fetches all SmartLead clients (1400+) and builds email lookup
2. Fetches all SmartLead campaigns (5800+) and builds client_id lookup
3. For each campaign in our DB, updates with `smartlead_client_id` and `smartlead_client_email`
4. Matches to customer by email and updates `customer_id`

**Output**:
- Updates campaigns table with client data
- Writes failure reports to `/private/tmp/claude-502/` (JSON and CSV)

### 2. Incremental Sync (New Customers)

**Script**: `execution/sync/sync_smartlead_incremental.py`

Use this to fetch campaigns for customers who don't have any yet:

```bash
# Dry run - check what would happen
python -m execution.sync.sync_smartlead_incremental --limit 100 --dry-run

# Sync next 100 customers
python -m execution.sync.sync_smartlead_incremental --limit 100

# Sync more customers
python -m execution.sync.sync_smartlead_incremental --limit 500
```

**What it does**:
1. Finds customers with no campaigns (ordered by created_at)
2. Matches customer email to SmartLead client email
3. Fetches campaigns for matched SmartLead clients
4. Creates campaign records linked to the customer

**Output**:
- Creates new campaign records in the campaigns table
- Reports unmatched customers (no SmartLead client with that email)

### 3. Original Name-Based Sync (Legacy)

**Script**: `execution/sync/sync_smartlead.py`

The original sync script that matches campaigns to customers by parsing campaign names. **Deprecated** in favor of the email-based matching above.

## Database Schema

### campaigns table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| customer_id | UUID FK | Link to unified_customers |
| smartlead_campaign_id | VARCHAR | SmartLead campaign ID |
| smartlead_client_id | BIGINT | SmartLead client ID (NEW) |
| smartlead_client_email | VARCHAR | SmartLead client email (NEW) |
| campaign_name | VARCHAR | Campaign name |
| status | VARCHAR | active, paused, completed, draft |
| leads_count | INT | Number of leads |
| emails_sent | INT | Emails sent |
| reply_count | INT | Replies received |
| positive_reply_count | INT | Positive replies |
| bounce_count | INT | Bounced emails |
| reply_rate | DECIMAL | Reply rate % |
| positive_reply_rate | DECIMAL | Positive reply rate % |
| bounce_rate | DECIMAL | Bounce rate % |

## Verification Commands

```bash
# Check total campaigns
python -c "
from sqlalchemy import create_engine, text
from execution.config import settings
engine = create_engine(settings.database_url)
with engine.connect() as conn:
    print('Campaigns:', conn.execute(text('SELECT COUNT(*) FROM campaigns')).scalar())
    print('With client ID:', conn.execute(text('SELECT COUNT(*) FROM campaigns WHERE smartlead_client_id IS NOT NULL')).scalar())
    print('Customers with campaigns:', conn.execute(text('SELECT COUNT(DISTINCT customer_id) FROM campaigns WHERE customer_id IS NOT NULL')).scalar())
"

# Check a specific customer's campaigns
python -c "
from sqlalchemy import create_engine, text
from execution.config import settings
engine = create_engine(settings.database_url)
with engine.connect() as conn:
    result = conn.execute(text('''
        SELECT c.campaign_name, c.smartlead_client_email, u.email
        FROM campaigns c
        JOIN unified_customers u ON c.customer_id = u.customer_id
        WHERE u.email = 'some@email.com'
    '''))
    for r in result:
        print(r)
"
```

## Troubleshooting

### "No SmartLead client with email"

The customer's email doesn't exist in SmartLead as a client. This is expected for customers who:
- Don't use SmartLead
- Use a different email in SmartLead
- Haven't been set up as a SmartLead client yet

### "No client_id on campaign"

Some campaigns in SmartLead don't have a client_id assigned. These are typically internal/test campaigns.

### Statement timeout errors

The Supabase database has statement timeouts. For large batch operations:
1. Use smaller batch sizes: `--batch-size 50`
2. Run the operation in smaller chunks
3. Consider running during low-traffic periods

## Scheduled Sync

To run incremental sync on a schedule, add to cron:

```bash
# Every 6 hours, sync next 100 customers
0 */6 * * * cd /path/to/listkit-gtm-intelligence && python -m execution.sync.sync_smartlead_incremental --limit 100 >> /var/log/smartlead_sync.log 2>&1
```
