"""
Configuration management for ListKit GTM Intelligence Platform.

Loads environment variables and provides configuration settings.
"""

import os
from typing import Optional
from dotenv import load_dotenv
from pydantic_settings import BaseSettings


# Load environment variables from .env file
load_dotenv()


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str

    # Phase 1 - Active Now
    intercom_api_key: str

    # Airtable (AM Assignments)
    airtable_api_key: Optional[str] = None
    airtable_base_id: Optional[str] = None
    airtable_customers_table: str = "Customers"
    airtable_am_table: str = "Account Managers"

    # Phase 2 - CRM & Scheduling
    hubspot_api_key: Optional[str] = None
    calendly_api_key: Optional[str] = None

    # Phase 3 - Product Analytics
    userflow_api_key: Optional[str] = None
    fathom_api_key: Optional[str] = None
    listkit_db_url: Optional[str] = None

    # Phase 4 - Advanced Revenue Analytics
    chartmogul_api_key: Optional[str] = None
    stripe_api_key: Optional[str] = None

    # SmartLead.ai (Email Campaigns)
    smartlead_api_key: Optional[str] = None

    # Notifications
    slack_webhook_url: Optional[str] = None
    slack_bot_token: Optional[str] = None

    # AI
    anthropic_api_key: Optional[str] = None

    # Application Settings
    environment: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Sync Schedules (cron expressions)
    sync_schedule_intercom: str = "0 */6 * * *"  # Every 6 hours
    sync_schedule_hubspot: str = "0 */12 * * *"  # Every 12 hours
    sync_schedule_calendly: str = "0 */4 * * *"  # Every 4 hours

    # Alert Thresholds
    alert_churn_risk_threshold: int = 70
    alert_health_drop_threshold: int = 20

    # Data Quality
    min_data_quality_score: int = 60

    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()


def get_database_url() -> str:
    """Get the database connection URL."""
    return settings.database_url


def is_production() -> bool:
    """Check if running in production environment."""
    return settings.environment.lower() == "production"


def is_development() -> bool:
    """Check if running in development environment."""
    return settings.environment.lower() == "development"
