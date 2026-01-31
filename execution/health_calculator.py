"""
Health score calculator for unified customers.

Implements the health score algorithm defined in directives/health-score-calculator.md
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from decimal import Decimal
from loguru import logger

from execution.database.models import UnifiedCustomer


def calculate_health_score(customer: UnifiedCustomer) -> None:
    """
    Calculate and update health score for a customer.

    Updates the customer object in-place with:
    - health_score (0-100)
    - health_status (healthy/at_risk/high_risk/critical)
    - churn_risk (0-100)
    - risk_signals (array of risk indicators)
    - health_score_components (breakdown)
    - recommended_action

    Args:
        customer: UnifiedCustomer instance
    """
    logger.debug(f"Calculating health score for {customer.email}")

    # Calculate component scores
    activity_score = _calculate_activity_score(customer.days_since_seen)
    support_score = _calculate_support_score(
        customer.csat_score,
        customer.support_sentiment,
        customer.intercom_convos_30d
    )
    payment_score = _calculate_payment_score(
        customer.subscription_status,
        customer.is_delinquent,
        customer.payment_failures_90d
    )
    engagement_score = _calculate_engagement_score(
        customer.login_count_30d,
        customer.onboarding_complete,
        customer.feature_usage
    )
    tenure_score = _calculate_tenure_score(customer.signup_date)
    mrr_weight = _calculate_mrr_weight(customer.mrr)

    # Weighted composite score
    base_score = (
        activity_score * 0.25 +
        support_score * 0.20 +
        payment_score * 0.20 +
        engagement_score * 0.15 +
        tenure_score * 0.10 +
        mrr_weight * 0.10
    )

    # Apply risk penalties
    risk_penalties = _calculate_risk_penalties(customer)
    final_score = max(0, min(100, base_score - risk_penalties))

    # Store components for transparency
    customer.health_score_components = {
        "activity_score": float(activity_score),
        "support_score": float(support_score),
        "payment_score": float(payment_score),
        "engagement_score": float(engagement_score),
        "tenure_score": float(tenure_score),
        "mrr_weight": float(mrr_weight),
        "base_score": float(base_score),
        "risk_penalties": float(risk_penalties),
        "final_score": float(final_score)
    }

    # Update customer
    customer.health_score = Decimal(str(round(final_score, 2)))
    customer.health_status = _classify_health_status(final_score)
    customer.churn_risk = Decimal(str(round(_calculate_churn_risk(final_score, customer), 2)))
    customer.risk_signals = _identify_risk_signals(customer)
    customer.recommended_action = _recommend_action(customer)
    customer.health_calculated_at = datetime.utcnow()

    logger.debug(f"Health score for {customer.email}: {customer.health_score} ({customer.health_status})")


def _calculate_activity_score(days_since_seen: Optional[int]) -> float:
    """Calculate activity score based on recency (0-100)."""
    if days_since_seen is None:
        return 50.0  # Neutral if no data

    if days_since_seen <= 1:
        return 100.0
    elif days_since_seen <= 3:
        return 90.0
    elif days_since_seen <= 7:
        return 80.0
    elif days_since_seen <= 14:
        return 65.0
    elif days_since_seen <= 30:
        return 40.0
    elif days_since_seen <= 60:
        return 20.0
    else:
        return 0.0


def _calculate_support_score(
    csat_score: Optional[Decimal],
    support_sentiment: Optional[str],
    convos_30d: Optional[int]
) -> float:
    """Calculate support score based on CSAT and sentiment (0-100)."""
    # Base score from CSAT
    if csat_score:
        base_score = (float(csat_score) / 5.0) * 100
    else:
        base_score = 70.0  # Neutral if no CSAT

    # Adjust for sentiment
    sentiment_adjustment = {
        "positive": 10,
        "neutral": 0,
        "negative": -20,
        None: 0
    }
    base_score += sentiment_adjustment.get(support_sentiment, 0)

    # Penalize high support volume (potential issues)
    if convos_30d and convos_30d > 10:
        base_score -= min(convos_30d - 10, 20)

    return max(0, min(100, base_score))


def _calculate_payment_score(
    subscription_status: Optional[str],
    is_delinquent: bool,
    payment_failures_90d: Optional[int]
) -> float:
    """Calculate payment health score (0-100)."""
    if subscription_status == "active" and not is_delinquent:
        base_score = 100.0
    elif subscription_status == "trialing":
        base_score = 80.0
    elif subscription_status == "past_due":
        base_score = 40.0
    elif subscription_status == "canceled":
        base_score = 0.0
    elif subscription_status == "unpaid":
        base_score = 20.0
    else:
        base_score = 70.0  # Unknown status

    # Delinquency penalty
    if is_delinquent:
        base_score = min(base_score, 30.0)

    # Payment failure history
    if payment_failures_90d:
        base_score -= min(payment_failures_90d * 10, 30)

    return max(0, base_score)


def _calculate_engagement_score(
    login_count_30d: Optional[int],
    onboarding_complete: bool,
    feature_usage: Optional[Dict[str, Any]]
) -> float:
    """Calculate engagement score based on product usage (0-100)."""
    # Login frequency (0-50 points)
    if login_count_30d:
        login_score = min((login_count_30d / 20) * 50, 50)
    else:
        login_score = 0

    # Onboarding completion (0-30 points)
    onboarding_score = 30 if onboarding_complete else 0

    # Feature adoption (0-20 points)
    if feature_usage:
        feature_count = len([k for k, v in feature_usage.items() if v > 0])
        feature_score = min(feature_count * 4, 20)
    else:
        feature_score = 0

    return login_score + onboarding_score + feature_score


def _calculate_tenure_score(signup_date: Optional[datetime]) -> float:
    """Calculate tenure score based on customer lifetime (0-100)."""
    if not signup_date:
        return 50.0

    days_as_customer = (datetime.utcnow() - signup_date).days

    if days_as_customer < 30:
        return 40.0  # New customer risk
    elif days_as_customer < 90:
        return 60.0
    elif days_as_customer < 180:
        return 75.0
    elif days_as_customer < 365:
        return 85.0
    else:
        return 100.0  # Long-term stability


def _calculate_mrr_weight(mrr: Optional[Decimal]) -> float:
    """Calculate MRR importance weight (0-100)."""
    if mrr is None or mrr <= 0:
        return 50.0

    mrr_val = float(mrr)

    if mrr_val < 50:
        return 60.0
    elif mrr_val < 100:
        return 70.0
    elif mrr_val < 250:
        return 80.0
    elif mrr_val < 500:
        return 90.0
    else:
        return 100.0  # High-value customer


def _calculate_risk_penalties(customer: UnifiedCustomer) -> float:
    """Calculate total risk penalties to subtract from base score."""
    penalties = 0.0

    # Cancel mention override
    if customer.mentioned_cancel:
        penalties += 30

    # Payment delinquency
    if customer.is_delinquent:
        penalties += 25

    # Long inactivity
    if customer.days_since_seen and customer.days_since_seen > 30:
        penalties += 20

    # Open critical tickets
    if customer.open_tickets and customer.open_tickets > 0:
        penalties += min(customer.open_tickets * 5, 15)

    # Low show rate on calls
    if customer.show_rate and customer.show_rate < 50 and customer.total_calls_booked and customer.total_calls_booked >= 3:
        penalties += 10

    # No upcoming calls (high-value customer)
    if customer.mrr and customer.mrr > 200 and not customer.next_call_date:
        penalties += 10

    return penalties


def _calculate_churn_risk(health_score: float, customer: UnifiedCustomer) -> float:
    """Calculate churn risk probability (0-100)."""
    # Base risk is inverse of health
    base_risk = 100 - health_score

    # Amplify based on specific risk signals
    multiplier = 1.0

    if customer.mentioned_cancel:
        multiplier *= 1.5

    if customer.is_delinquent:
        multiplier *= 1.4

    if customer.days_since_seen and customer.days_since_seen > 30:
        multiplier *= 1.3

    if customer.engagement_score and customer.engagement_score < 30:
        multiplier *= 1.2

    if not customer.next_call_date and customer.mrr and customer.mrr > 200:
        multiplier *= 1.1

    churn_risk = min(base_risk * multiplier, 100)

    return churn_risk


def _classify_health_status(health_score: float) -> str:
    """Classify health status based on score."""
    if health_score >= 70:
        return "healthy"
    elif health_score >= 50:
        return "at_risk"
    elif health_score >= 30:
        return "high_risk"
    else:
        return "critical"


def _identify_risk_signals(customer: UnifiedCustomer) -> List[Dict[str, str]]:
    """Identify specific risk signals for customer."""
    signals = []

    if customer.mentioned_cancel:
        signals.append({
            "type": "cancel_mention",
            "severity": "critical",
            "message": "Customer mentioned canceling in support"
        })

    if customer.is_delinquent:
        signals.append({
            "type": "payment_delinquent",
            "severity": "critical",
            "message": "Payment is delinquent"
        })

    if customer.days_since_seen and customer.days_since_seen > 30:
        signals.append({
            "type": "inactive",
            "severity": "high",
            "message": f"No activity in {customer.days_since_seen} days"
        })

    if customer.csat_score and customer.csat_score <= 2:
        signals.append({
            "type": "low_satisfaction",
            "severity": "high",
            "message": f"CSAT score: {customer.csat_score}/5"
        })

    if customer.show_rate and customer.show_rate < 50 and customer.total_calls_booked and customer.total_calls_booked >= 3:
        signals.append({
            "type": "low_show_rate",
            "severity": "medium",
            "message": f"Show rate: {customer.show_rate}%"
        })

    if customer.open_tickets and customer.open_tickets > 3:
        signals.append({
            "type": "support_volume",
            "severity": "medium",
            "message": f"{customer.open_tickets} open tickets"
        })

    if not customer.onboarding_complete and customer.signup_date:
        days_as_customer = (datetime.utcnow() - customer.signup_date).days
        if days_as_customer > 60:
            signals.append({
                "type": "onboarding_incomplete",
                "severity": "medium",
                "message": "Onboarding not completed"
            })

    return signals


def _recommend_action(customer: UnifiedCustomer) -> str:
    """Recommend action based on health status and risk signals."""
    if customer.health_status == "critical":
        if customer.mentioned_cancel:
            return "Urgent: Contact immediately - cancel risk"
        elif customer.is_delinquent:
            return "Urgent: Resolve payment issue"
        else:
            return "Urgent: Schedule retention call"

    elif customer.health_status == "high_risk":
        if customer.days_since_seen and customer.days_since_seen > 30:
            return "Re-engagement campaign needed"
        elif not customer.next_call_date:
            return "Schedule check-in call"
        else:
            return "Monitor closely and provide proactive support"

    elif customer.health_status == "at_risk":
        return "Proactive outreach to improve engagement"

    else:  # healthy
        if customer.mrr and customer.mrr > 500:
            return "Explore expansion opportunities"
        else:
            return "Maintain current engagement"
