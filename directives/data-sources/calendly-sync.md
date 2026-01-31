# Calendly Sync Directive

## Purpose

Sync call booking and attendance data from Calendly into the unified_customers table. Calendly provides:
- Scheduled call events
- Show rate and no-show tracking
- Event organizer (Account Manager) assignment
- Meeting outcomes

**Status:** Phase 2 - Not yet implemented

## API Endpoints

**List Scheduled Events:**
```
GET https://api.calendly.com/scheduled_events
```

**Get Event Invitees:**
```
GET https://api.calendly.com/scheduled_events/{uuid}/invitees
```

**Authentication:**
```
Authorization: Bearer {CALENDLY_API_KEY}
```

## Data Extraction

### Event Fields
```
uri → calendly_event_id
name → event_type
start_time → event_start_time
end_time → event_end_time
status → event_status (active, canceled)
created_at → booking_created_at
updated_at → event_updated_at
```

### Invitee Fields
```
email → email (match key)
name → invitee_name
canceled → is_canceled
no_show → is_no_show
rescheduled → is_rescheduled
```

### Event Owner (Organizer)
```
event_memberships[0].user → assigned_am
event_memberships[0].user_email → assigned_am_email
```

## Aggregation Logic

For each customer (grouped by email):

### Call Count Metrics
```
total_calls_booked = COUNT(all_events)
calls_completed = COUNT(events WHERE status = active AND no_show = false)
calls_no_show = COUNT(events WHERE no_show = true)
calls_canceled = COUNT(events WHERE status = canceled)
calls_rescheduled = COUNT(events WHERE rescheduled = true)
```

### Show Rate Calculation
```
show_rate = (calls_completed / total_calls_booked) * 100

If total_calls_booked = 0, show_rate = NULL
```

### Date Tracking
```
last_call_date = MAX(start_time WHERE status = active AND no_show = false)
next_call_date = MIN(start_time WHERE start_time > NOW AND status = active)
```

### AM Assignment
Use most recent event organizer:
```
assigned_am = event_memberships[0].user FROM most_recent_event
assigned_am_email = event_memberships[0].user_email FROM most_recent_event
```

## Data Transformation

### Field Mapping
```python
{
    # Identifiers
    "email": invitee.email,
    "calendly_user_id": invitee.uri,

    # Profile (if not already set)
    "assigned_am": most_recent_organizer.name,
    "assigned_am_email": most_recent_organizer.email,

    # Calls
    "total_calls_booked": aggregated_metrics.total_calls,
    "calls_completed": aggregated_metrics.completed,
    "calls_no_show": aggregated_metrics.no_shows,
    "show_rate": aggregated_metrics.show_rate,
    "last_call_date": aggregated_metrics.last_call,
    "next_call_date": aggregated_metrics.next_call,

    # Metadata
    "last_calendly_sync": NOW
}
```

## Sync Process

### 1. Date Range Query
Query events from last 90 days:
```
?min_start_time=2024-01-01T00:00:00Z&max_start_time=2024-03-31T23:59:59Z
```

### 2. Pagination
Calendly uses `page_token`:
```
?count=100&page_token={token}
```

### 3. Invitee Expansion
For each event, fetch invitees to get email addresses:
```
GET /scheduled_events/{event_uuid}/invitees
```

### 4. Aggregation
Group events by invitee email and calculate metrics.

## Validation Rules

### Required Fields
- `email` - Must be present on invitee
- `start_time` - Must be valid datetime

### Data Quality Checks
- Event status must be valid Calendly value
- Show rate must be 0-100%
- Next call date must be in future

### Quality Score Factors
```
+15 points: Has booked at least 1 call
+10 points: Show rate > 80%
+10 points: Has upcoming call scheduled
+5 points: Last call within 30 days
```

## Alert Triggers

- **Low show rate:** show_rate < 50% with >= 3 bookings
- **No-show streak:** 3+ consecutive no-shows
- **No upcoming calls:** High-value customer with no next_call_date
- **AM change:** Organizer different from HubSpot owner

## Health Score Impact

Call metrics impact health score:
- **Positive signals:**
  - Upcoming call scheduled: +5 points
  - High show rate (>80%): +5 points
  - Recent call (last 14 days): +5 points

- **Negative signals:**
  - Low show rate (<50%): -10 points
  - No-show streak (3+): -15 points
  - No calls in 90 days: -10 points

## Output

Log metrics:
```
{
  "events_processed": 234,
  "customers_updated": 156,
  "no_shows_detected": 12,
  "upcoming_calls": 67,
  "avg_show_rate": 82.5
}
```

## Frequency

**Default:** Every 4 hours (capture bookings quickly)
**Lookback:** 90 days

## Dependencies

- Calendly API client (`execution/clients/calendly_client.py`)
- Database models
- Date/time utilities for aggregation

## Notes

- Calendly event types may vary (1-on-1, team, round-robin)
- Rescheduled events create duplicate entries - use updated_at to dedupe
- Event organizer may differ from HubSpot owner - flag discrepancies
- No-show tracking requires manual marking in Calendly
- Group events (multiple invitees) - count per invitee
