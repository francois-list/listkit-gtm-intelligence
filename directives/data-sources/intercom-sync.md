# Intercom Sync Directive

## Purpose

Sync customer data from Intercom into the unified_customers table. Intercom is our primary source for:
- Support conversation activity
- Customer profile information
- Stripe revenue data (synced via Intercom's Stripe integration)

## Key Discovery

Intercom contacts have Stripe data in `custom_attributes`:
- `stripe_id`, `stripe_plan`, `stripe_plan_price`, `stripe_subscription_status`
- `stripe_delinquent`, `stripe_last_charge_amount`, `stripe_last_charge_at`
- Nested arrays: `Stripe Subscriptions` and `Stripe Payments`

This means we can get full revenue data (MRR, LTV) from Intercom alone in Phase 1.

## API Endpoint

**Search Contacts:**
```
POST https://api.intercom.io/contacts/search
```

**Authentication:**
```
Authorization: Bearer {INTERCOM_API_KEY}
```

## Data Extraction

### Contact Profile Fields
```
email → email (match key)
name → name
external_id → intercom_contact_id
created_at → signup_date
last_seen_at → last_seen_at
location.country → location_country
location.city → location_city
```

### Stripe Revenue Data (from custom_attributes)

**Basic Stripe Fields:**
```
stripe_id → stripe_customer_id
stripe_plan → plan_name
stripe_plan_price → plan_price
stripe_subscription_status → subscription_status
stripe_delinquent → is_delinquent
stripe_last_charge_amount → last_payment_amount
stripe_last_charge_at → last_payment_date
```

**Stripe Subscriptions Array:**
```json
{
  "Stripe Subscriptions": [
    {
      "id": "sub_xxx",
      "status": "active",
      "plan": {
        "amount": 29900,  // in cents
        "interval": "month",
        "nickname": "Pro Plan"
      },
      "quantity": 1,
      "current_period_start": 1234567890,
      "current_period_end": 1234567890
    }
  ]
}
```

**MRR Calculation:**
- Sum `plan.amount` for all subscriptions with `status = "active"`
- Normalize to monthly (if interval = "year", divide by 12)
- Convert from cents to dollars (divide by 100)
- Formula: `MRR = SUM(active_subscriptions.plan.amount / 100 / interval_months)`

**ARR Calculation:**
- `ARR = MRR × 12`

**Subscription Count:**
- `subscription_count = COUNT(active_subscriptions)`

**Stripe Payments Array:**
```json
{
  "Stripe Payments": [
    {
      "amount": 29900,  // in cents
      "created": 1234567890,
      "status": "succeeded"
    }
  ]
}
```

**LTV Calculation:**
- Sum `amount` for all payments with `status = "succeeded"`
- Convert from cents to dollars
- Formula: `LTV = SUM(succeeded_payments.amount / 100)`

### Support Activity Data

**Conversation Metrics:**
Use Intercom's conversation search to get per-contact stats:
```
total_conversations → intercom_convos_total
conversations_last_30_days → intercom_convos_30d
open_conversations → open_tickets
```

**Cancel Mention Detection:**
Search conversation bodies for keywords:
- "cancel", "cancellation", "cancelling"
- "churn", "leaving", "switching"
- "not renewing", "won't renew"

If found in recent conversations (last 30 days):
```
mentioned_cancel = true
```

**Support Sentiment:**
Extract from conversation ratings/CSAT if available:
```
conversation.rating → csat_score (1-5 scale)
```

## Activity Metrics

**Days Since Seen:**
```
days_since_seen = (NOW - last_seen_at) / 86400
```

## Data Transformation

### Matching Logic
- **Primary:** Match by `email` (case-insensitive)
- **Fallback:** If email not found, create new record
- **Conflict:** If multiple contacts have same email, use most recently updated

### Field Mapping
```python
{
    # Identifiers
    "email": contact.email,
    "intercom_contact_id": contact.id,
    "stripe_customer_id": custom_attributes.stripe_id,

    # Profile
    "name": contact.name,
    "location_country": contact.location.country,
    "location_city": contact.location.city,
    "signup_date": contact.created_at,

    # Revenue (calculated)
    "mrr": calculate_mrr(custom_attributes.stripe_subscriptions),
    "arr": mrr * 12,
    "ltv": calculate_ltv(custom_attributes.stripe_payments),
    "plan_name": custom_attributes.stripe_plan,
    "plan_price": custom_attributes.stripe_plan_price,
    "subscription_status": custom_attributes.stripe_subscription_status,
    "subscription_count": count_active_subscriptions(),
    "is_delinquent": custom_attributes.stripe_delinquent,
    "last_payment_amount": custom_attributes.stripe_last_charge_amount / 100,
    "last_payment_date": custom_attributes.stripe_last_charge_at,

    # Activity
    "last_seen_at": contact.last_seen_at,
    "days_since_seen": calculate_days_since_seen(),

    # Support
    "intercom_convos_total": conversation_count_total,
    "intercom_convos_30d": conversation_count_30d,
    "open_tickets": open_conversation_count,
    "mentioned_cancel": detect_cancel_mentions(),
    "csat_score": average_conversation_rating,

    # Metadata
    "last_intercom_sync": NOW
}
```

## Sync Process

### 1. Pagination
Intercom search API uses cursor-based pagination:
```json
{
  "query": {},
  "pagination": {
    "per_page": 150
  }
}
```

Continue fetching until `pages.next` is null.

### 2. Rate Limiting
Intercom has rate limits:
- **Search API:** 10 requests/second
- Implement exponential backoff on 429 responses

### 3. Error Handling
- **Network errors:** Retry up to 3 times with backoff
- **Invalid data:** Log warning, skip record, continue sync
- **Missing email:** Skip record (can't match)
- **API errors:** Log error, alert via Slack, continue sync

### 4. Incremental Sync
For efficiency, only sync contacts updated since last sync:
```json
{
  "query": {
    "field": "updated_at",
    "operator": ">",
    "value": last_sync_timestamp
  }
}
```

Full sync weekly for data integrity.

## Validation Rules

### Required Fields
- `email` - Must be present and valid format
- `name` - If missing, use email prefix

### Data Quality Checks
- **Email validation:** RFC 5322 format
- **Date validation:** Timestamps must be positive integers
- **Revenue validation:** MRR/LTV must be >= 0
- **Status validation:** subscription_status in allowed values

### Quality Score Factors
```
+20 points: Has Stripe customer ID
+20 points: Has active subscription
+15 points: Has payment history (LTV > 0)
+15 points: Recent activity (seen in last 7 days)
+10 points: Has location data
+10 points: Has conversation history
+10 points: Has CSAT score
```

## Alert Triggers

Generate alerts during sync for:
- **New high-value customer:** MRR > $500
- **Cancel mention detected:** mentioned_cancel = true
- **Payment delinquent:** stripe_delinquent = true
- **Large MRR change:** MRR change > 50% from previous value

## Output

### Success Metrics
```
{
  "contacts_synced": 1234,
  "new_contacts": 56,
  "updated_contacts": 1178,
  "skipped_contacts": 3,
  "errors": 0,
  "sync_duration_seconds": 45.2,
  "avg_quality_score": 78.5
}
```

### Log Entry
```
[2024-01-15 10:30:45] Intercom sync completed
- Synced: 1234 contacts
- New: 56, Updated: 1178, Skipped: 3
- Duration: 45.2s
- Quality: 78.5 avg
- Alerts: 12 generated
```

## Testing

### Test Cases
1. **New contact with Stripe data** - Creates customer with MRR/LTV
2. **Existing contact update** - Updates fields without overwriting other sources
3. **Multiple subscriptions** - Correctly sums MRR
4. **Annual subscription** - Normalizes to monthly MRR
5. **No Stripe data** - Creates customer with null revenue fields
6. **Cancel mention** - Sets mentioned_cancel flag
7. **Delinquent payment** - Sets is_delinquent flag

## Dependencies

- Intercom API client (`execution/clients/intercom_client.py`)
- Database models (`execution/database/models.py`)
- Revenue calculator utilities
- Slack notifier for alerts

## Frequency

**Default:** Every 6 hours
**Full sync:** Weekly (Sundays at 2 AM UTC)

## Notes

- Intercom's Stripe integration must be active for revenue data
- Custom attributes may vary by Intercom workspace configuration
- Some contacts may not have Stripe data (free users, leads)
- Conversation search has separate rate limits from contact search
