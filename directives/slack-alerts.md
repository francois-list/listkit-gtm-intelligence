# Slack Alerts Directive

## Purpose

Send automated alerts to Slack when critical events or conditions are detected. Alerts enable proactive intervention and keep the team informed of customer health changes.

## Alert Categories

### 1. Cancel Mention Alerts (Critical)

**Trigger:** Customer mentioned "cancel" or related terms in Intercom conversation

**Condition:**
```python
if mentioned_cancel == True and alert_sent_cancel == False:
    send_alert()
```

**Message Template:**
```
🚨 *CANCEL RISK DETECTED*

*Customer:* {name} ({email})
*Company:* {company_name}
*MRR:* ${mrr}
*Assigned AM:* {assigned_am}

*Risk Signal:* Customer mentioned canceling in recent support conversation

*Conversation Link:* https://app.intercom.com/a/inbox/.../conversation/{convo_id}

*Health Score:* {health_score} ({health_status})
*Churn Risk:* {churn_risk}%

*Recommended Action:* {recommended_action}

---
<View in Dashboard | {dashboard_url}/customers/{customer_id}>
```

**Channel:** `#customer-alerts` or `#critical-alerts`

**Urgency:** Critical - requires immediate action

---

### 2. Payment Delinquent Alerts (Critical)

**Trigger:** Stripe subscription becomes delinquent

**Condition:**
```python
if is_delinquent == True and (
    previous_is_delinquent == False or
    alert_sent_delinquent == False
):
    send_alert()
```

**Message Template:**
```
💳 *PAYMENT ISSUE DETECTED*

*Customer:* {name} ({email})
*Company:* {company_name}
*MRR:* ${mrr}
*Plan:* {plan_name}
*Assigned AM:* {assigned_am}

*Issue:* Payment is delinquent
*Last Payment:* {last_payment_date} (${last_payment_amount})

*Stripe Customer:* https://dashboard.stripe.com/customers/{stripe_customer_id}

*Health Score:* {health_score} ({health_status})

*Recommended Action:* Contact customer to update payment method

---
<View in Dashboard | {dashboard_url}/customers/{customer_id}>
```

**Channel:** `#customer-alerts`

**Urgency:** Critical - revenue at risk

---

### 3. Health Score Drop Alerts (High Priority)

**Trigger:** Health score drops by >= 20 points in single sync cycle

**Condition:**
```python
if (previous_health_score - current_health_score) >= 20:
    send_alert()
```

**Message Template:**
```
📉 *HEALTH SCORE DROP*

*Customer:* {name} ({email})
*Company:* {company_name}
*MRR:* ${mrr}
*Assigned AM:* {assigned_am}

*Health Score:* {previous_health_score} → {current_health_score} (⬇️ {drop_amount})
*Status:* {previous_status} → {current_status}

*Contributing Factors:*
{list_of_changed_factors}

*Recent Risk Signals:*
{risk_signals_list}

*Recommended Action:* {recommended_action}

---
<View in Dashboard | {dashboard_url}/customers/{customer_id}>
```

**Channel:** `#customer-health`

**Urgency:** High - investigate cause

---

### 4. New At-Risk Customer Alerts (Medium Priority)

**Trigger:** Customer health_status changes to "high_risk" or "critical"

**Condition:**
```python
if health_status in ["high_risk", "critical"] and (
    previous_health_status not in ["high_risk", "critical"]
):
    send_alert()
```

**Message Template:**
```
⚠️ *CUSTOMER NOW AT RISK*

*Customer:* {name} ({email})
*Company:* {company_name}
*MRR:* ${mrr}
*Assigned AM:* {assigned_am}

*New Status:* {health_status}
*Health Score:* {health_score}
*Churn Risk:* {churn_risk}%

*Risk Signals:*
{formatted_risk_signals}

*Last Activity:* {days_since_seen} days ago
*Last Call:* {last_call_date or "Never"}

*Recommended Action:* {recommended_action}

---
<View in Dashboard | {dashboard_url}/customers/{customer_id}>
```

**Channel:** `#customer-health`

**Urgency:** Medium - plan intervention

---

### 5. Engagement Drop Alerts (Medium Priority)

**Trigger:** No activity in 30 days (was previously active)

**Condition:**
```python
if days_since_seen >= 30 and previous_days_since_seen < 14:
    send_alert()
```

**Message Template:**
```
😴 *CUSTOMER GONE QUIET*

*Customer:* {name} ({email})
*Company:* {company_name}
*MRR:* ${mrr}
*Assigned AM:* {assigned_am}

*Issue:* No activity in {days_since_seen} days
*Previously:* Active within last {previous_days_since_seen} days

*Last Seen:* {last_seen_at}
*Login Frequency:* {login_count_30d} logins in last 30 days

*Recommended Action:* Re-engagement campaign or check-in call

---
<View in Dashboard | {dashboard_url}/customers/{customer_id}>
```

**Channel:** `#customer-engagement`

**Urgency:** Medium - proactive outreach

---

### 6. High-Value Customer Without Calls (Medium Priority)

**Trigger:** High MRR customer with no upcoming call scheduled

**Condition:**
```python
if mrr >= 300 and next_call_date is None and last_call_date < (NOW - 45 days):
    send_alert()
```

**Message Template:**
```
📞 *HIGH-VALUE CUSTOMER NEEDS CALL*

*Customer:* {name} ({email})
*Company:* {company_name}
*MRR:* ${mrr}
*Assigned AM:* {assigned_am}

*Issue:* No upcoming call scheduled
*Last Call:* {last_call_date or "Never"}
*Show Rate:* {show_rate}%

*Health Score:* {health_score} ({health_status})

*Recommended Action:* Schedule check-in call

---
<View in Dashboard | {dashboard_url}/customers/{customer_id}>
```

**Channel:** `#am-reminders`

**Urgency:** Medium - relationship maintenance

---

### 7. Daily Summary (Low Priority)

**Trigger:** Scheduled daily at 9 AM UTC

**Message Template:**
```
📊 *DAILY CUSTOMER HEALTH SUMMARY*
{date}

*Overall Health:*
  • Healthy: {healthy_count} customers (${healthy_mrr})
  • At Risk: {at_risk_count} customers (${at_risk_mrr})
  • High Risk: {high_risk_count} customers (${high_risk_mrr})
  • Critical: {critical_count} customers (${critical_mrr})

*Total MRR:* ${total_mrr} ({mrr_change_24h} vs yesterday)

*Alerts Today:*
  • 🚨 Cancel mentions: {cancel_alerts}
  • 💳 Payment issues: {payment_alerts}
  • 📉 Health drops: {health_drop_alerts}

*Action Items:*
  • {critical_count} customers need urgent attention
  • {high_value_no_calls} high-value customers without scheduled calls
  • {inactive_30d} customers inactive 30+ days

---
<View Dashboard | {dashboard_url}>
```

**Channel:** `#daily-summaries`

**Urgency:** Low - informational

---

### 8. Weekly Summary (Low Priority)

**Trigger:** Scheduled weekly on Monday at 9 AM UTC

**Message Template:**
```
📈 *WEEKLY CUSTOMER HEALTH REPORT*
Week of {week_start_date}

*Customer Count:* {total_customers} ({new_customers_week} new this week)
*Total MRR:* ${total_mrr} ({mrr_growth_percentage} vs last week)
*Avg Health Score:* {avg_health_score}

*Churn This Week:*
  • Churned: {churned_count} customers (-${churned_mrr})
  • Churn Rate: {churn_rate}%
  • Top Churn Reason: {top_churn_reason}

*Expansion This Week:*
  • Upgrades: {upgrade_count} (+${upgrade_mrr})
  • Downgrades: {downgrade_count} (-${downgrade_mrr})

*Risk Trends:*
  • New at-risk: {new_at_risk_count}
  • Improved: {improved_count}
  • Deteriorated: {deteriorated_count}

*AM Performance:*
{am_leaderboard}

*Action Items for Next Week:*
  • {action_items_list}

---
<View Full Report | {dashboard_url}/reports/weekly>
```

**Channel:** `#weekly-reports`

**Urgency:** Low - strategic review

---

## Alert Routing

### Channel Mapping
```python
ALERT_CHANNELS = {
    "cancel_mention": "#customer-alerts",
    "payment_delinquent": "#customer-alerts",
    "health_drop": "#customer-health",
    "new_at_risk": "#customer-health",
    "engagement_drop": "#customer-engagement",
    "no_upcoming_call": "#am-reminders",
    "daily_summary": "#daily-summaries",
    "weekly_summary": "#weekly-reports"
}
```

### Mentions/Tagging
Tag relevant people based on customer:
```python
if assigned_am_slack_id:
    mention = f"<@{assigned_am_slack_id}>"
elif customer_segment == "enterprise":
    mention = "@enterprise-team"
else:
    mention = "@customer-success"
```

## Alert Throttling

Prevent alert fatigue:

### Per-Customer Throttling
```python
ALERT_COOLDOWNS = {
    "cancel_mention": 7 * 24 * 3600,      # 7 days
    "payment_delinquent": 3 * 24 * 3600,  # 3 days
    "health_drop": 2 * 24 * 3600,         # 2 days
    "engagement_drop": 14 * 24 * 3600,    # 14 days
}

# Don't send same alert type for same customer within cooldown period
if (NOW - last_alert_sent) < ALERT_COOLDOWNS[alert_type]:
    skip_alert()
```

### Global Rate Limiting
```
MAX_ALERTS_PER_HOUR = 20  # Prevent spam

if alerts_sent_this_hour >= MAX_ALERTS_PER_HOUR:
    queue_alert_for_next_hour()
```

## Alert Storage

Track sent alerts in database:
```sql
CREATE TABLE alert_history (
    id UUID PRIMARY KEY,
    customer_id UUID,
    alert_type VARCHAR,
    severity VARCHAR,
    message TEXT,
    slack_channel VARCHAR,
    slack_message_ts VARCHAR,  -- For threading
    sent_at TIMESTAMP,
    acknowledged_at TIMESTAMP,
    acknowledged_by VARCHAR
);
```

## Alert Acknowledgement

Use Slack interactive buttons:
```
[Acknowledge] [View Customer] [Snooze 24h]
```

When clicked:
```python
UPDATE alert_history
SET acknowledged_at = NOW,
    acknowledged_by = {slack_user_id}
WHERE id = {alert_id}
```

## Configuration

### Environment Variables
```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_BOT_TOKEN=xoxb-...

# Channel IDs
SLACK_CHANNEL_ALERTS=#customer-alerts
SLACK_CHANNEL_HEALTH=#customer-health
SLACK_CHANNEL_ENGAGEMENT=#customer-engagement
SLACK_CHANNEL_SUMMARIES=#daily-summaries

# Thresholds
ALERT_HEALTH_DROP_THRESHOLD=20
ALERT_CHURN_RISK_THRESHOLD=70
ALERT_HIGH_VALUE_MRR=300
ALERT_INACTIVE_DAYS=30
```

## Testing

### Test Mode
```
ALERT_TEST_MODE=true
ALERT_TEST_CHANNEL=#test-alerts

# In test mode, prefix all messages with [TEST] and send to test channel
```

### Test Cases
1. **Cancel mention** - Trigger alert with test customer
2. **Payment delinquent** - Mock Stripe webhook
3. **Health drop** - Manually adjust health score
4. **Throttling** - Send duplicate alerts, verify cooldown
5. **Daily summary** - Manually trigger cron job

## Dependencies

- Slack SDK (`slack_sdk`)
- Database for alert history
- Customer data from unified_customers table
- Configured Slack workspace and channels

## Execution

### Real-Time Alerts
Triggered during sync scripts:
```python
from execution.slack_notifier import SlackNotifier

# After updating customer
if customer.mentioned_cancel and not customer.alert_sent_cancel:
    SlackNotifier.send_cancel_mention_alert(customer)
    customer.alert_sent_cancel = True
```

### Scheduled Summaries
Cron jobs:
```
# Daily summary at 9 AM UTC
0 9 * * * python execution/slack_notifier.py send-daily-summary

# Weekly summary on Monday 9 AM UTC
0 9 * * 1 python execution/slack_notifier.py send-weekly-summary
```

## Notes

- Use Slack Block Kit for rich formatting
- Include deep links to dashboard for easy access
- Alert fatigue is real - tune thresholds carefully
- Consider digest emails for less urgent alerts
- Track alert → action → outcome for effectiveness measurement
