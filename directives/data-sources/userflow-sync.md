# Userflow Sync Directive

## Purpose

Sync product usage and engagement data from Userflow into the unified_customers table. Userflow provides:
- User login activity and frequency
- Onboarding flow completion
- Feature usage and adoption
- In-app engagement metrics

**Status:** Phase 3 - Not yet implemented

## API Endpoints

**List Users:**
```
GET https://api.userflow.com/users
```

**Get User Events:**
```
GET https://api.userflow.com/users/{userId}/events
```

**Authentication:**
```
Authorization: Bearer {USERFLOW_API_KEY}
```

## Data Extraction

### User Fields
```
email → email (match key)
id → userflow_user_id
created_at → userflow_created_at
last_seen_at → last_seen_at
attributes.name → name
attributes.plan → plan_name
```

### Activity Metrics

**Login Frequency:**
Track `user.login` events:
```
login_count_7d = COUNT(login_events WHERE timestamp > NOW - 7 days)
login_count_30d = COUNT(login_events WHERE timestamp > NOW - 30 days)
```

**Last Seen:**
```
last_seen_at = MAX(event.timestamp) across all events
days_since_seen = (NOW - last_seen_at) / 86400
```

### Onboarding Progress

**Flow Completion:**
Track completion of onboarding flows:
```
onboarding_complete = HAS_COMPLETED("onboarding_flow")
activation_score = (completed_steps / total_steps) * 100
```

Key onboarding events:
- `flow.started`
- `flow.step_completed`
- `flow.completed`
- `flow.dismissed`

### Feature Adoption

Track usage of key features:
```
feature_usage = {
  "exports": COUNT(feature.export.used),
  "filters": COUNT(feature.filter.used),
  "integrations": COUNT(feature.integration.connected),
  "api_usage": COUNT(feature.api.called)
}
```

## Engagement Score Calculation

```
engagement_score = weighted_average([
  (login_count_7d / 7) * 30,           # Daily login rate (30%)
  activation_score * 0.25,             # Onboarding (25%)
  feature_adoption_rate * 0.25,        # Feature usage (25%)
  (session_duration_avg / 3600) * 20   # Time spent (20%)
])

engagement_score clamped to 0-100
```

## Data Transformation

### Field Mapping
```python
{
    # Identifiers
    "email": user.email,
    "userflow_user_id": user.id,

    # Activity
    "last_seen_at": max_event_timestamp,
    "days_since_seen": calculate_days_since_seen(),
    "login_count_7d": count_logins_7d,
    "login_count_30d": count_logins_30d,

    # Onboarding
    "onboarding_complete": is_flow_completed("onboarding"),
    "activation_score": calculate_activation_score(),

    # Engagement
    "engagement_score": calculate_engagement_score(),
    "feature_usage_json": feature_usage_dict,  # Store as JSONB

    # Metadata
    "last_userflow_sync": NOW
}
```

## Sync Process

### 1. User List
Fetch all users with pagination:
```
?page=1&per_page=100
```

### 2. Event Aggregation
For each user, fetch recent events (last 90 days):
```
GET /users/{userId}/events?from={90_days_ago}&to={now}
```

### 3. Metric Calculation
Aggregate events into metrics per user.

### 4. Incremental Sync
Only process users with activity since last sync:
```
?updated_since={last_sync_timestamp}
```

## Validation Rules

### Required Fields
- `email` - Must be present
- `id` - Must be valid Userflow user ID

### Data Quality Checks
- Login counts must be >= 0
- Activation score must be 0-100
- Timestamps must be valid

### Quality Score Factors
```
+20 points: Onboarding complete
+15 points: Active in last 7 days
+15 points: Login frequency > 3x/week
+10 points: High feature adoption (>5 features used)
+10 points: Engagement score > 70
```

## Alert Triggers

- **Engagement drop:** Engagement score drops > 30 points
- **Inactive user:** No logins in 14 days (was previously active)
- **Onboarding abandoned:** Started but not completed in 30 days
- **Feature disengagement:** Key feature not used in 30 days (was previously used)

## Health Score Impact

Userflow data strongly impacts health score:

**Activity Recency (25% of health score):**
```
if days_since_seen <= 1: +25 points
elif days_since_seen <= 7: +20 points
elif days_since_seen <= 14: +15 points
elif days_since_seen <= 30: +10 points
else: 0 points
```

**Engagement (15% of health score):**
```
engagement_contribution = (engagement_score / 100) * 15
```

**Negative Signals:**
- No login in 30+ days: -20 points
- Onboarding not complete after 60 days: -10 points
- Zero feature usage in 30 days: -15 points

## Output

Log metrics:
```
{
  "users_processed": 456,
  "active_users_7d": 234,
  "active_users_30d": 389,
  "avg_engagement_score": 67.8,
  "onboarding_completion_rate": 82.5
}
```

## Frequency

**Default:** Daily (aggregate events from previous day)
**Event window:** Last 90 days

## Dependencies

- Userflow API client (`execution/clients/userflow_client.py`)
- Event aggregation utilities
- Engagement score calculator

## Notes

- Userflow events can be very high volume - aggregate server-side
- User ID in Userflow should match email for easy matching
- Custom events may be defined per workspace - configure mapping
- Session duration calculation requires pairing session start/end events
- Feature usage tracking requires predefined feature event names
