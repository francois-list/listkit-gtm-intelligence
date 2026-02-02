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

    def search_contact_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """
        Search for a contact by email address and return full contact data.

        Args:
            email: Email address to search for

        Returns:
            Full contact object (with custom_attributes) if found, None otherwise
        """
        try:
            payload = {
                "query": {
                    "field": "email",
                    "operator": "=",
                    "value": email.lower().strip()
                }
            }
            response = self._request("POST", "/contacts/search", json_data=payload)
            contacts = response.get("data", [])
            if not contacts:
                return None

            # Search API may not return full custom_attributes
            # Fetch the full contact to get all data including Stripe attributes
            contact_id = contacts[0].get("id")
            if contact_id:
                return self.get_contact(contact_id)
            return contacts[0]
        except Exception as e:
            logger.warning(f"Failed to search contact by email {email}: {e}")
            return None
    
    def get_contact_conversations(self, contact_id: str, per_page: int = 50) -> List[Dict[str, Any]]:
        """
        Get all conversations for a contact using the Search API.

        Args:
            contact_id: Intercom contact ID
            per_page: Results per page (max 150)

        Returns:
            List of conversation objects
        """
        all_conversations = []
        starting_after = None

        try:
            while True:
                # Use Search Conversations API with contact_ids filter
                payload = {
                    "query": {
                        "field": "contact_ids",
                        "operator": "=",
                        "value": contact_id
                    },
                    "pagination": {
                        "per_page": min(per_page, 150)
                    }
                }

                if starting_after:
                    payload["pagination"]["starting_after"] = starting_after

                response = self._request("POST", "/conversations/search", json_data=payload)
                conversations = response.get("conversations", [])

                if not conversations:
                    break

                all_conversations.extend(conversations)

                # Check for next page
                pages = response.get("pages", {})
                next_page = pages.get("next", {})
                starting_after = next_page.get("starting_after")

                if not starting_after:
                    break

                time.sleep(0.1)  # Rate limiting

            return all_conversations
        except Exception as e:
            logger.warning(f"Failed to fetch conversations for {contact_id}: {e}")
            return []

    def get_conversation(self, conversation_id: str) -> Dict[str, Any]:
        """
        Get full details for a specific conversation.

        Args:
            conversation_id: Intercom conversation ID

        Returns:
            Conversation object with full details
        """
        try:
            return self._request("GET", f"/conversations/{conversation_id}")
        except Exception as e:
            logger.warning(f"Failed to fetch conversation {conversation_id}: {e}")
            return {}

    def format_conversations_for_storage(
        self,
        conversations: List[Dict[str, Any]],
        max_conversations: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Format conversations for storage in customer custom_attributes.

        Args:
            conversations: List of conversation objects from Intercom
            max_conversations: Maximum number of conversations to store

        Returns:
            List of formatted conversation dictionaries
        """
        formatted = []

        # Sort by created_at descending (most recent first)
        sorted_convos = sorted(
            conversations,
            key=lambda x: x.get("created_at", 0),
            reverse=True
        )

        for convo in sorted_convos[:max_conversations]:
            source = convo.get("source", {})
            author = source.get("author", {})

            # Get subject/title
            subject = source.get("subject") or convo.get("title") or "No Subject"
            # Strip HTML tags from subject
            if "<" in subject:
                import re
                subject = re.sub(r'<[^>]+>', '', subject).strip()

            # Get preview of body (first 200 chars)
            body = source.get("body") or ""
            if "<" in body:
                import re
                body = re.sub(r'<[^>]+>', ' ', body).strip()
            body = ' '.join(body.split())  # Normalize whitespace
            preview = body[:200] + "..." if len(body) > 200 else body

            # Determine source type
            source_type = source.get("type", "unknown")
            delivered_as = source.get("delivered_as", "")

            # Build Intercom URL
            conversation_id = convo.get("id")
            intercom_url = f"https://app.intercom.com/a/inbox/_/inbox/conversation/{conversation_id}"

            formatted.append({
                "conversation_id": conversation_id,
                "subject": subject,
                "preview": preview,
                "source_type": source_type,
                "delivered_as": delivered_as,
                "state": convo.get("state", "unknown"),
                "priority": convo.get("priority"),
                "created_at": convo.get("created_at"),
                "updated_at": convo.get("updated_at"),
                "waiting_since": convo.get("waiting_since"),
                "read": convo.get("read", False),
                "author_name": author.get("name"),
                "author_email": author.get("email"),
                "author_type": author.get("type"),
                "intercom_url": intercom_url,
                "tags": [t.get("name") for t in convo.get("tags", {}).get("tags", [])],
                "parts_count": convo.get("statistics", {}).get("count_conversation_parts", 0)
            })

        return formatted
    
    def extract_stripe_data(self, contact: Dict[str, Any]) -> Dict[str, Any]:
        custom = contact.get("custom_attributes", {})
        mrr = 0.0
        subscription_count = 0

        # Try to get MRR from Stripe Subscriptions array first
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

        # If no MRR from subscriptions array, try direct stripe_plan_price field
        # Only use if customer has active subscription
        subscription_status = custom.get("stripe_subscription_status")
        if mrr == 0 and subscription_status == "active":
            plan_price = custom.get("stripe_plan_price")
            if plan_price:
                try:
                    # Price could be in cents or dollars, handle both
                    price_val = float(plan_price)
                    # If price > 1000, assume it's in cents
                    if price_val > 1000:
                        mrr = price_val / 100
                    else:
                        mrr = price_val
                    subscription_count = 1
                except (ValueError, TypeError):
                    pass

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
            "subscription_status": subscription_status,
            "is_delinquent": custom.get("stripe_delinquent", False),
            "last_payment_amount": custom.get("stripe_last_charge_amount"),
            "last_payment_date": None,
            "mrr": round(mrr, 2),
            "arr": round(mrr * 12, 2),
            "ltv": round(ltv, 2),
            "subscription_count": subscription_count
        }
