"""
Slack notification system for customer alerts.

Implements alert logic defined in directives/slack-alerts.md
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from loguru import logger

try:
    from slack_sdk import WebClient
    from slack_sdk.errors import SlackApiError
    SLACK_SDK_AVAILABLE = True
except ImportError:
    SLACK_SDK_AVAILABLE = False
    logger.warning("slack_sdk not installed - Slack notifications disabled")

from execution.config import settings
from execution.database.models import UnifiedCustomer


class SlackNotifier:
    """
    Send alerts to Slack based on customer events and conditions.

    Handles:
    - Cancel mention alerts
    - Payment delinquent alerts
    - Health score drop alerts
    - At-risk customer alerts
    - Engagement drop alerts
    - Daily/weekly summaries
    """

    def __init__(self):
        """Initialize Slack notifier."""
        self.webhook_url = settings.slack_webhook_url
        self.bot_token = settings.slack_bot_token

        if SLACK_SDK_AVAILABLE and self.bot_token:
            self.client = WebClient(token=self.bot_token)
            self.enabled = True
        elif self.webhook_url:
            self.client = None
            self.enabled = True
        else:
            self.client = None
            self.enabled = False
            logger.warning("Slack credentials not configured - notifications disabled")

    def send_cancel_mention_alert(self, customer: UnifiedCustomer) -> bool:
        """
        Send critical alert when customer mentions canceling.

        Args:
            customer: UnifiedCustomer instance

        Returns:
            True if sent successfully
        """
        if not self._should_send_alert(customer, "cancel_mention", cooldown_hours=168):  # 7 days
            return False

        message = f"""
🚨 *CANCEL RISK DETECTED*

*Customer:* {customer.name} ({customer.email})
*Company:* {customer.company_name or 'N/A'}
*MRR:* ${customer.mrr or 0}
*Assigned AM:* {customer.assigned_am or 'Unassigned'}

*Risk Signal:* Customer mentioned canceling in recent support conversation

*Health Score:* {customer.health_score or 'N/A'} ({customer.health_status or 'unknown'})
*Churn Risk:* {customer.churn_risk or 'N/A'}%

*Recommended Action:* {customer.recommended_action or 'Contact immediately'}
        """.strip()

        return self._send_message(
            channel="#customer-alerts",
            message=message,
            severity="critical"
        )

    def send_payment_delinquent_alert(self, customer: UnifiedCustomer) -> bool:
        """
        Send critical alert when payment becomes delinquent.

        Args:
            customer: UnifiedCustomer instance

        Returns:
            True if sent successfully
        """
        if not self._should_send_alert(customer, "payment_delinquent", cooldown_hours=72):  # 3 days
            return False

        message = f"""
💳 *PAYMENT ISSUE DETECTED*

*Customer:* {customer.name} ({customer.email})
*Company:* {customer.company_name or 'N/A'}
*MRR:* ${customer.mrr or 0}
*Plan:* {customer.plan_name or 'N/A'}
*Assigned AM:* {customer.assigned_am or 'Unassigned'}

*Issue:* Payment is delinquent
*Last Payment:* {customer.last_payment_date or 'Unknown'} (${customer.last_payment_amount or 0})

*Health Score:* {customer.health_score or 'N/A'} ({customer.health_status or 'unknown'})

*Recommended Action:* Contact customer to update payment method
        """.strip()

        return self._send_message(
            channel="#customer-alerts",
            message=message,
            severity="critical"
        )

    def send_health_drop_alert(self, customer: UnifiedCustomer, drop_amount: float) -> bool:
        """
        Send alert when health score drops significantly.

        Args:
            customer: UnifiedCustomer instance
            drop_amount: Points dropped

        Returns:
            True if sent successfully
        """
        if not self._should_send_alert(customer, "health_drop", cooldown_hours=48):  # 2 days
            return False

        message = f"""
📉 *HEALTH SCORE DROP*

*Customer:* {customer.name} ({customer.email})
*Company:* {customer.company_name or 'N/A'}
*MRR:* ${customer.mrr or 0}
*Assigned AM:* {customer.assigned_am or 'Unassigned'}

*Health Score Drop:* ⬇️ {drop_amount:.1f} points
*Current Score:* {customer.health_score or 'N/A'} ({customer.health_status or 'unknown'})

*Risk Signals:*
{self._format_risk_signals(customer.risk_signals)}

*Recommended Action:* {customer.recommended_action or 'Investigate cause'}
        """.strip()

        return self._send_message(
            channel="#customer-health",
            message=message,
            severity="high"
        )

    def send_at_risk_alert(self, customer: UnifiedCustomer) -> bool:
        """
        Send alert when customer becomes at-risk.

        Args:
            customer: UnifiedCustomer instance

        Returns:
            True if sent successfully
        """
        message = f"""
⚠️ *CUSTOMER NOW AT RISK*

*Customer:* {customer.name} ({customer.email})
*Company:* {customer.company_name or 'N/A'}
*MRR:* ${customer.mrr or 0}
*Assigned AM:* {customer.assigned_am or 'Unassigned'}

*Status:* {customer.health_status or 'unknown'}
*Health Score:* {customer.health_score or 'N/A'}
*Churn Risk:* {customer.churn_risk or 'N/A'}%

*Risk Signals:*
{self._format_risk_signals(customer.risk_signals)}

*Last Activity:* {customer.days_since_seen or 'Unknown'} days ago
*Last Call:* {customer.last_call_date or 'Never'}

*Recommended Action:* {customer.recommended_action or 'Plan intervention'}
        """.strip()

        return self._send_message(
            channel="#customer-health",
            message=message,
            severity="medium"
        )

    def send_engagement_drop_alert(self, customer: UnifiedCustomer) -> bool:
        """
        Send alert when customer goes inactive.

        Args:
            customer: UnifiedCustomer instance

        Returns:
            True if sent successfully
        """
        if not self._should_send_alert(customer, "engagement_drop", cooldown_hours=336):  # 14 days
            return False

        message = f"""
😴 *CUSTOMER GONE QUIET*

*Customer:* {customer.name} ({customer.email})
*Company:* {customer.company_name or 'N/A'}
*MRR:* ${customer.mrr or 0}
*Assigned AM:* {customer.assigned_am or 'Unassigned'}

*Issue:* No activity in {customer.days_since_seen or 'Unknown'} days

*Last Seen:* {customer.last_seen_at or 'Unknown'}
*Login Frequency:* {customer.login_count_30d or 0} logins in last 30 days

*Recommended Action:* Re-engagement campaign or check-in call
        """.strip()

        return self._send_message(
            channel="#customer-engagement",
            message=message,
            severity="medium"
        )

    def _should_send_alert(
        self,
        customer: UnifiedCustomer,
        alert_type: str,
        cooldown_hours: int
    ) -> bool:
        """
        Check if alert should be sent based on cooldown.

        Args:
            customer: UnifiedCustomer instance
            alert_type: Type of alert
            cooldown_hours: Hours to wait between alerts

        Returns:
            True if alert should be sent
        """
        if not self.enabled:
            return False

        # Check last alert timestamp
        if customer.last_alert_sent_at:
            time_since_last = datetime.utcnow() - customer.last_alert_sent_at
            if time_since_last < timedelta(hours=cooldown_hours):
                logger.debug(f"Skipping {alert_type} alert for {customer.email} - in cooldown")
                return False

        return True

    def _format_risk_signals(self, risk_signals: Optional[list]) -> str:
        """Format risk signals for display."""
        if not risk_signals:
            return "• No specific risk signals"

        formatted = []
        for signal in risk_signals:
            severity_icon = {
                "critical": "🔴",
                "high": "🟠",
                "medium": "🟡",
                "low": "🟢"
            }.get(signal.get("severity", "medium"), "🔵")

            formatted.append(f"{severity_icon} {signal.get('message', 'Unknown')}")

        return "\n".join(formatted)

    def _send_message(
        self,
        channel: str,
        message: str,
        severity: str = "medium"
    ) -> bool:
        """
        Send message to Slack channel.

        Args:
            channel: Slack channel name (e.g., "#customer-alerts")
            message: Message text
            severity: Alert severity (critical/high/medium/low)

        Returns:
            True if sent successfully
        """
        if not self.enabled:
            logger.debug(f"Slack disabled - would send to {channel}: {message[:100]}...")
            return False

        try:
            # In development, log instead of sending
            if settings.environment == "development":
                logger.info(f"[SLACK {channel}] {message}")
                return True

            # Use bot client if available
            if self.client:
                response = self.client.chat_postMessage(
                    channel=channel,
                    text=message
                )
                logger.info(f"Sent Slack message to {channel}")
                return True

            # Fall back to webhook
            elif self.webhook_url:
                import httpx
                httpx.post(self.webhook_url, json={"text": message})
                logger.info(f"Sent Slack webhook message")
                return True

            return False

        except Exception as e:
            logger.error(f"Failed to send Slack message: {e}")
            return False

    def send_daily_summary(self, summary_data: Dict[str, Any]) -> bool:
        """
        Send daily summary to Slack.

        Args:
            summary_data: Dictionary with summary metrics

        Returns:
            True if sent successfully
        """
        message = f"""
📊 *DAILY CUSTOMER HEALTH SUMMARY*
{datetime.utcnow().strftime('%Y-%m-%d')}

*Overall Health:*
  • Healthy: {summary_data.get('healthy_count', 0)} customers (${summary_data.get('healthy_mrr', 0)})
  • At Risk: {summary_data.get('at_risk_count', 0)} customers (${summary_data.get('at_risk_mrr', 0)})
  • High Risk: {summary_data.get('high_risk_count', 0)} customers (${summary_data.get('high_risk_mrr', 0)})
  • Critical: {summary_data.get('critical_count', 0)} customers (${summary_data.get('critical_mrr', 0)})

*Total MRR:* ${summary_data.get('total_mrr', 0)}

*Action Items:*
  • {summary_data.get('critical_count', 0)} customers need urgent attention
  • {summary_data.get('inactive_30d', 0)} customers inactive 30+ days
        """.strip()

        return self._send_message(
            channel="#daily-summaries",
            message=message,
            severity="low"
        )
