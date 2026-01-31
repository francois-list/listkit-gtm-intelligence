# Health Score Calculator Directive

## Purpose

Calculate a composite health score (0-100) for each customer based on multiple factors. The health score predicts likelihood of retention and identifies at-risk customers.

## Health Score Formula

The health score is a weighted composite of 6 factors:

```
health_score = (
  activity_score * 0.25 +        # 25%
  support_score * 0.20 +         # 20%
  payment_score * 0.20 +         # 20%
  engagement_score * 0.15 +      # 15%
  tenure_score * 0.10 +          # 10%
  mrr_weight * 0.10              # 10%
) - risk_penalties

Final score clamped to 0-100
```

## Factor Calculations

### 1. Activity Score (25%)

Based on recency of last activity (from Userflow or Intercom):

```python
def calculate_activity_score(days_since_seen):
    if days_since_seen is None:
        return 50  # Neutral if no data

    if days_since_seen <= 1:
        return 100
    elif days_since_seen <= 3:
        return 90
    elif days_since_seen <= 7:
        return 80
    elif days_since_seen <= 14:
        return 65
    elif days_since_seen <= 30:
        return 40
    elif days_since_seen <= 60:
        return 20
    else:
        return 0  # Inactive >60 days
```

**Weight:** 25% of total score

### 2. Support Score (20%)

Based on CSAT and conversation sentiment:

```python
def calculate_support_score(csat_score, support_sentiment, convos_30d):
    # Base score from CSAT (1-5 scale)
    if csat_score:
        base_score = (csat_score / 5) * 100
    else:
        base_score = 70  # Neutral if no CSAT

    # Adjust for sentiment
    sentiment_adjustment = {
        "positive": +10,
        "neutral": 0,
        "negative": -20,
        None: 0
    }
    base_score += sentiment_adjustment.get(support_sentiment, 0)

    # Penalize high support volume (potential issues)
    if convos_30d > 10:
        base_score -= min(convos_30d - 10, 20)  # Max -20 for high volume

    return max(0, min(100, base_score))
```

**Weight:** 20% of total score

### 3. Payment Score (20%)

Based on subscription status and payment health:

```python
def calculate_payment_score(subscription_status, is_delinquent, payment_failures_90d):
    if subscription_status == "active" and not is_delinquent:
        base_score = 100
    elif subscription_status == "trialing":
        base_score = 80
    elif subscription_status == "past_due":
        base_score = 40
    elif subscription_status == "canceled":
        base_score = 0
    elif subscription_status == "unpaid":
        base_score = 20
    else:
        base_score = 70  # Unknown status

    # Delinquency penalty
    if is_delinquent:
        base_score = min(base_score, 30)  # Cap at 30 if delinquent

    # Payment failure history
    if payment_failures_90d:
        base_score -= min(payment_failures_90d * 10, 30)  # -10 per failure, max -30

    return max(0, base_score)
```

**Weight:** 20% of total score

### 4. Engagement Score (15%)

Based on product usage (from Userflow):

```python
def calculate_engagement_score(login_count_30d, onboarding_complete, feature_adoption_count):
    # Login frequency (0-50 points)
    login_score = min((login_count_30d / 20) * 50, 50)  # 20+ logins = max points

    # Onboarding completion (0-30 points)
    onboarding_score = 30 if onboarding_complete else 0

    # Feature adoption (0-20 points)
    feature_score = min(feature_adoption_count * 4, 20)  # 5+ features = max points

    return login_score + onboarding_score + feature_score
```

**Weight:** 15% of total score

### 5. Tenure Score (10%)

Based on customer lifetime:

```python
def calculate_tenure_score(signup_date):
    if not signup_date:
        return 50

    days_as_customer = (NOW - signup_date) / 86400

    if days_as_customer < 30:
        return 40  # New customer risk
    elif days_as_customer < 90:
        return 60
    elif days_as_customer < 180:
        return 75
    elif days_as_customer < 365:
        return 85
    else:
        return 100  # Long-term customer stability
```

**Weight:** 10% of total score

### 6. MRR Weight (10%)

Revenue importance factor (higher MRR = higher weight in overall health):

```python
def calculate_mrr_weight(mrr):
    if mrr is None or mrr <= 0:
        return 50

    # Logarithmic scaling
    if mrr < 50:
        return 60
    elif mrr < 100:
        return 70
    elif mrr < 250:
        return 80
    elif mrr < 500:
        return 90
    else:
        return 100  # High-value customer
```

**Weight:** 10% of total score

## Risk Signal Penalties

Certain signals automatically reduce health score:

```python
risk_penalties = 0

# Cancel mention override
if mentioned_cancel:
    risk_penalties += 30

# Payment delinquency
if is_delinquent:
    risk_penalties += 25

# Long inactivity
if days_since_seen > 30:
    risk_penalties += 20

# Open critical tickets
if open_tickets > 0:
    risk_penalties += min(open_tickets * 5, 15)  # Max -15

# Low show rate on calls
if show_rate < 50 and total_calls_booked >= 3:
    risk_penalties += 10

# No upcoming calls (high-value customer)
if mrr > 200 and next_call_date is None:
    risk_penalties += 10
```

**Total penalties applied after weighted score calculation.**

## Churn Risk Calculation

Separate score predicting churn likelihood (0-100):

```python
def calculate_churn_risk(health_score, risk_signals):
    # Base risk is inverse of health
    base_risk = 100 - health_score

    # Amplify based on specific risk signals
    signal_multipliers = {
        "mentioned_cancel": 1.5,
        "is_delinquent": 1.4,
        "inactive_30d": 1.3,
        "low_engagement": 1.2,
        "no_calls_scheduled": 1.1
    }

    multiplier = 1.0
    for signal, mult in signal_multipliers.items():
        if risk_signals.get(signal):
            multiplier *= mult

    churn_risk = min(base_risk * multiplier, 100)

    return round(churn_risk, 1)
```

## Health Status Classification

```python
def classify_health_status(health_score):
    if health_score >= 70:
        return "healthy"
    elif health_score >= 50:
        return "at_risk"
    elif health_score >= 30:
        return "high_risk"
    else:
        return "critical"
```

**Thresholds:**
- **Healthy:** 70-100 (green)
- **At Risk:** 50-69 (yellow)
- **High Risk:** 30-49 (orange)
- **Critical:** 0-29 (red)

## Risk Signals Array

Store specific risk indicators as JSONB:

```python
def identify_risk_signals(customer_data):
    signals = []

    if customer_data.mentioned_cancel:
        signals.append({
            "type": "cancel_mention",
            "severity": "critical",
            "message": "Customer mentioned canceling in support"
        })

    if customer_data.is_delinquent:
        signals.append({
            "type": "payment_delinquent",
            "severity": "critical",
            "message": "Payment is delinquent"
        })

    if customer_data.days_since_seen > 30:
        signals.append({
            "type": "inactive",
            "severity": "high",
            "message": f"No activity in {customer_data.days_since_seen} days"
        })

    if customer_data.csat_score and customer_data.csat_score <= 2:
        signals.append({
            "type": "low_satisfaction",
            "severity": "high",
            "message": f"CSAT score: {customer_data.csat_score}/5"
        })

    if customer_data.show_rate and customer_data.show_rate < 50:
        signals.append({
            "type": "low_show_rate",
            "severity": "medium",
            "message": f"Show rate: {customer_data.show_rate}%"
        })

    if customer_data.open_tickets > 3:
        signals.append({
            "type": "support_volume",
            "severity": "medium",
            "message": f"{customer_data.open_tickets} open tickets"
        })

    if not customer_data.onboarding_complete and customer_data.days_as_customer > 60:
        signals.append({
            "type": "onboarding_incomplete",
            "severity": "medium",
            "message": "Onboarding not completed"
        })

    return signals
```

## Recommended Actions

Based on health status and risk signals, suggest actions:

```python
def recommend_action(health_status, risk_signals, customer_data):
    if health_status == "critical":
        if any(s["type"] == "cancel_mention" for s in risk_signals):
            return "Urgent: Contact immediately - cancel risk"
        elif any(s["type"] == "payment_delinquent" for s in risk_signals):
            return "Urgent: Resolve payment issue"
        else:
            return "Urgent: Schedule retention call"

    elif health_status == "high_risk":
        if customer_data.days_since_seen > 30:
            return "Re-engagement campaign needed"
        elif not customer_data.next_call_date:
            return "Schedule check-in call"
        else:
            return "Monitor closely and provide proactive support"

    elif health_status == "at_risk":
        return "Proactive outreach to improve engagement"

    else:  # healthy
        if customer_data.mrr > 500:
            return "Explore expansion opportunities"
        else:
            return "Maintain current engagement"
```

## Execution

### Calculation Trigger
Recalculate health score:
1. **After each data sync** - Any source update triggers recalc
2. **Daily batch job** - Recalc all customers at 3 AM UTC
3. **On-demand** - API endpoint to manually recalc

### Storage
Store calculated values in `unified_customers` table:
```sql
UPDATE unified_customers
SET
  health_score = calculated_score,
  health_status = calculated_status,
  churn_risk = calculated_churn_risk,
  risk_signals = calculated_signals_json,
  recommended_action = calculated_action,
  health_calculated_at = NOW
WHERE customer_id = {id}
```

## Validation

### Score Range Checks
- All component scores must be 0-100
- Final health score must be 0-100
- Churn risk must be 0-100

### Data Completeness
Track which factors have data:
```python
data_completeness = {
  "has_activity_data": days_since_seen is not None,
  "has_support_data": csat_score is not None,
  "has_payment_data": subscription_status is not None,
  "has_engagement_data": login_count_30d is not None,
  "has_tenure_data": signup_date is not None,
  "has_revenue_data": mrr is not None
}

completeness_score = (sum(data_completeness.values()) / 6) * 100
```

If completeness < 50%, flag health score as "low confidence".

## Testing

### Test Cases
1. **Perfect customer** - All factors at 100 → health_score = 100
2. **At-risk customer** - Low activity, moderate support → health_score ≈ 55
3. **Critical customer** - Cancel mention + delinquent → health_score < 30
4. **New customer** - Limited data → health_score ≈ 60-70 (neutral)
5. **Inactive churned** - No activity 90 days → health_score < 20

## Output

### Health Summary Object
```json
{
  "customer_id": "uuid",
  "email": "customer@example.com",
  "health_score": 67.5,
  "health_status": "at_risk",
  "churn_risk": 45.2,
  "risk_signals": [
    {
      "type": "inactive",
      "severity": "high",
      "message": "No activity in 45 days"
    }
  ],
  "recommended_action": "Re-engagement campaign needed",
  "score_components": {
    "activity_score": 40,
    "support_score": 80,
    "payment_score": 100,
    "engagement_score": 55,
    "tenure_score": 85,
    "mrr_weight": 70
  },
  "data_completeness": 83.3,
  "calculated_at": "2024-01-15T10:30:00Z"
}
```

## Dependencies

- All sync scripts populate data used in calculation
- Database models with all required fields
- Math utilities for weighted averages

## Notes

- Health score is a predictive model, not absolute truth
- Weights can be tuned based on churn analysis
- Consider adding ML model in Phase 4 for advanced prediction
- Risk signals are actionable - drive alert and workflow automation
- Health scores enable prioritization of AM outreach efforts
