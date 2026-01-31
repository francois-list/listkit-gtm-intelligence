"""Intercom API client - uses list endpoint."""
import time
from typing import Generator, Optional, Dict, Any, List
from datetime import datetime
from loguru import logger
from execution.clients.base_client import BaseClient
from execution.config import settings

class IntercomClient(BaseClient):
    def __init__(self):
        super().__init__(
            api_key=settings.intercom_api_key,
            base_url="https://api.intercom.io",
            rate_limit=10
        )
    
    def _get_headers(self) -> Dict[str, str]:
        """Override to add Intercom-specific headers."""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Intercom-Version": "2.10"
        }
    
    def list_contacts(self, per_page: int = 50, starting_after: Optional[str] = None) -> Dict[str, Any]:
        params = {"per_page": per_page}
        if starting_after:
            params["starting_after"] = starting_after
        return self._request("GET", "/contacts", params=params)
    
    def iter_all_contacts(self, per_page: int = 50) -> Generator[Dict[str, Any], None, None]:
        page = 1
        starting_after = None
        while True:
            logger.info(f"Fetching contacts page {page}...")
            response = self.list_contacts(per_page=per_page, starting_after=starting_after)
            contacts = response.get("data", [])
            if not contacts:
                break
            for contact in contacts:
                yield contact
            pages = response.get("pages", {})
            next_page = pages.get("next", {})
            starting_after = next_page.get("starting_after")
            if not starting_after:
                break
            page += 1
            time.sleep(0.1)
    
    def get_contact(self, contact_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/contacts/{contact_id}")
    
    def get_contact_conversations(self, contact_id: str, per_page: int = 20) -> List[Dict[str, Any]]:
        try:
            response = self._request("GET", f"/contacts/{contact_id}/conversations", params={"per_page": per_page})
            return response.get("conversations", [])
        except Exception as e:
            logger.warning(f"Failed to fetch conversations for {contact_id}: {e}")
            return []
    
    def extract_stripe_data(self, contact: Dict[str, Any]) -> Dict[str, Any]:
        custom = contact.get("custom_attributes", {})
        mrr = 0.0
        subscription_count = 0
        subscriptions = custom.get("Stripe Subscriptions", []) or []
        if isinstance(subscriptions, list):
            for sub in subscriptions:
                if isinstance(sub, dict) and sub.get("status") == "active":
                    subscription_count += 1
                    price = sub.get("price", 0) or 0
                    interval = sub.get("interval", "month")
                    if interval == "year":
                        mrr += price / 12
                    elif interval == "month":
                        mrr += price
        ltv = 0.0
        payments = custom.get("Stripe Payments", []) or []
        if isinstance(payments, list):
            for payment in payments:
                if isinstance(payment, dict) and payment.get("status") == "succeeded":
                    ltv += (payment.get("amount", 0) or 0) / 100
        return {
            "stripe_customer_id": custom.get("stripe_id"),
            "plan_name": custom.get("stripe_plan"),
            "plan_price": custom.get("stripe_plan_price"),
            "subscription_status": custom.get("stripe_subscription_status"),
            "is_delinquent": custom.get("stripe_delinquent", False),
            "last_payment_amount": custom.get("stripe_last_charge_amount"),
            "last_payment_date": None,
            "mrr": round(mrr, 2),
            "arr": round(mrr * 12, 2),
            "ltv": round(ltv, 2),
            "subscription_count": subscription_count
        }
