"""
Calendly API client for call booking and attendance data.

Syncs scheduled events, invitees, and call metrics.
"""

from typing import Optional, Dict, Any, List, Generator
from datetime import datetime, timedelta
from loguru import logger
from .base_client import BaseClient


class CalendlyClient(BaseClient):
    """
    Client for Calendly API.

    Handles:
    - Scheduled events
    - Invitee information
    - Event organizer (AM) data
    - No-show tracking
    """

    def __init__(self, api_key: str):
        """
        Initialize Calendly client.

        Args:
            api_key: Calendly personal access token
        """
        super().__init__(
            api_key=api_key,
            base_url="https://api.calendly.com",
            rate_limit=3  # Calendly: ~3 req/sec is safe for most plans
        )
        self._user_uri: Optional[str] = None
        self._organization_uri: Optional[str] = None
        self._user_cache: Dict[str, Dict[str, Any]] = {}
        logger.info("Calendly client initialized")

    def get_current_user(self) -> Dict[str, Any]:
        """
        Get current authenticated user info.

        Returns:
            User data including URI and organization
        """
        response = self.get("/users/me")
        user = response.get("resource", {})

        self._user_uri = user.get("uri")
        self._organization_uri = user.get("current_organization")

        logger.info(f"Calendly user: {user.get('name')} ({user.get('email')})")
        logger.info(f"Organization: {self._organization_uri}")

        return user

    def get_organization_uri(self) -> str:
        """
        Get organization URI, fetching user info if needed.

        Returns:
            Organization URI string
        """
        if not self._organization_uri:
            self.get_current_user()
        return self._organization_uri

    def get_user_uri(self) -> str:
        """
        Get current user URI, fetching if needed.

        Returns:
            User URI string
        """
        if not self._user_uri:
            self.get_current_user()
        return self._user_uri

    def list_scheduled_events(
        self,
        organization_uri: Optional[str] = None,
        user_uri: Optional[str] = None,
        min_start_time: Optional[datetime] = None,
        max_start_time: Optional[datetime] = None,
        status: Optional[str] = None,
        count: int = 100
    ) -> Generator[Dict[str, Any], None, None]:
        """
        List scheduled events for organization.

        Args:
            organization_uri: Calendly organization URI (defaults to current)
            user_uri: Filter by specific user
            min_start_time: Filter events after this time
            max_start_time: Filter events before this time
            status: Filter by status (active, canceled)
            count: Results per page (max 100)

        Yields:
            Event dictionaries
        """
        org_uri = organization_uri or self.get_organization_uri()

        params = {
            "organization": org_uri,
            "count": min(count, 100),
            "sort": "start_time:desc"
        }

        if user_uri:
            params["user"] = user_uri

        if min_start_time:
            params["min_start_time"] = min_start_time.isoformat() + "Z"

        if max_start_time:
            params["max_start_time"] = max_start_time.isoformat() + "Z"

        if status:
            params["status"] = status

        page_token = None
        total_fetched = 0

        while True:
            if page_token:
                params["page_token"] = page_token

            try:
                response = self.get("/scheduled_events", params=params)
            except Exception as e:
                logger.error(f"Error fetching events: {e}")
                break

            events = response.get("collection", [])

            for event in events:
                total_fetched += 1
                yield event

            # Check for next page
            pagination = response.get("pagination", {})
            page_token = pagination.get("next_page_token")

            if not page_token:
                break

            logger.debug(f"Fetched {total_fetched} events, getting next page...")

        logger.info(f"Total events fetched: {total_fetched}")

    def get_event_invitees(
        self,
        event_uri: str,
        count: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get invitees for a specific event.

        Args:
            event_uri: Calendly event URI
            count: Results per page

        Returns:
            List of invitee objects
        """
        # Extract event UUID from URI
        event_uuid = event_uri.split("/")[-1]

        params = {
            "count": min(count, 100)
        }

        all_invitees = []
        page_token = None

        while True:
            if page_token:
                params["page_token"] = page_token

            try:
                response = self.get(f"/scheduled_events/{event_uuid}/invitees", params=params)
            except Exception as e:
                logger.error(f"Error fetching invitees for {event_uuid}: {e}")
                break

            invitees = response.get("collection", [])
            all_invitees.extend(invitees)

            # Check for next page
            pagination = response.get("pagination", {})
            page_token = pagination.get("next_page_token")

            if not page_token:
                break

        return all_invitees

    def get_user(self, user_uri: str) -> Dict[str, Any]:
        """
        Get user (organizer) information.

        Args:
            user_uri: Calendly user URI

        Returns:
            User data including name and email
        """
        # Check cache first
        if user_uri in self._user_cache:
            return self._user_cache[user_uri]

        # Extract user UUID from URI
        user_uuid = user_uri.split("/")[-1]

        try:
            response = self.get(f"/users/{user_uuid}")
            user = response.get("resource", {})
            self._user_cache[user_uri] = user
            return user
        except Exception as e:
            logger.error(f"Error fetching user {user_uuid}: {e}")
            return {}

    def get_event_type(self, event_type_uri: str) -> Dict[str, Any]:
        """
        Get event type details.

        Args:
            event_type_uri: Calendly event type URI

        Returns:
            Event type data
        """
        event_type_uuid = event_type_uri.split("/")[-1]

        try:
            response = self.get(f"/event_types/{event_type_uuid}")
            return response.get("resource", {})
        except Exception as e:
            logger.error(f"Error fetching event type {event_type_uuid}: {e}")
            return {}

    def get_all_events_with_invitees(
        self,
        days_back: int = 90,
        days_forward: int = 30,
        include_canceled: bool = True
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Get all events with their invitee data enriched.

        Args:
            days_back: Number of days to look back
            days_forward: Number of days to look forward
            include_canceled: Include canceled events

        Yields:
            Event dictionaries with invitees attached
        """
        now = datetime.utcnow()
        min_time = now - timedelta(days=days_back)
        max_time = now + timedelta(days=days_forward)

        logger.info(f"Fetching events from {min_time.date()} to {max_time.date()}")

        # Get active events
        for event in self.list_scheduled_events(
            min_start_time=min_time,
            max_start_time=max_time,
            status="active"
        ):
            # Fetch invitees for this event
            invitees = self.get_event_invitees(event.get("uri", ""))
            event["invitees"] = invitees

            # Fetch organizer info
            event_memberships = event.get("event_memberships", [])
            if event_memberships:
                user_uri = event_memberships[0].get("user")
                if user_uri:
                    organizer = self.get_user(user_uri)
                    event["organizer"] = organizer

            yield event

        # Get canceled events if requested
        if include_canceled:
            for event in self.list_scheduled_events(
                min_start_time=min_time,
                max_start_time=max_time,
                status="canceled"
            ):
                invitees = self.get_event_invitees(event.get("uri", ""))
                event["invitees"] = invitees

                event_memberships = event.get("event_memberships", [])
                if event_memberships:
                    user_uri = event_memberships[0].get("user")
                    if user_uri:
                        organizer = self.get_user(user_uri)
                        event["organizer"] = organizer

                yield event

    def aggregate_events_by_email_filtered(
        self,
        events: Generator[Dict[str, Any], None, None],
        target_emails: set
    ) -> Dict[str, Dict[str, Any]]:
        """
        Stream events and aggregate only invitees matching target emails.

        This is an optimized version that filters during aggregation,
        skipping all non-matching invitees to reduce memory and processing.

        Args:
            events: Generator of event dictionaries with invitees
            target_emails: Set of lowercase email addresses to match

        Returns:
            Dictionary keyed by email with aggregated metrics (only matching emails)
        """
        email_data: Dict[str, Dict[str, Any]] = {}
        now = datetime.utcnow()
        events_processed = 0
        invitees_matched = 0
        invitees_skipped = 0

        # Internal domains to exclude (hosts/staff)
        internal_domains = ["listkit.io", "listkit.com", "knowledgex.us"]

        # Normalize target emails
        target_emails_lower = {e.lower().strip() for e in target_emails if e}

        for event in events:
            events_processed += 1
            if events_processed % 100 == 0:
                logger.info(f"Processed {events_processed} events, matched {invitees_matched} invitees...")

            event_status = event.get("status", "active")
            start_time_str = event.get("start_time", "")

            if start_time_str:
                start_time = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
                start_time = start_time.replace(tzinfo=None)
                is_past = start_time < now
            else:
                start_time = None
                is_past = True

            organizer = event.get("organizer", {})
            organizer_name = organizer.get("name", "Unknown")
            organizer_email = (organizer.get("email") or "").lower().strip()
            event_name = event.get("name", "Unknown Event")

            for invitee in event.get("invitees", []):
                email = (invitee.get("email") or "").lower().strip()
                if not email:
                    continue

                # Skip internal/host emails
                domain = email.split("@")[-1] if "@" in email else ""
                if domain in internal_domains:
                    continue

                # Skip if invitee is the organizer/host
                if email == organizer_email:
                    continue

                # OPTIMIZATION: Skip if not in target emails
                if email not in target_emails_lower:
                    invitees_skipped += 1
                    continue

                invitees_matched += 1

                if email not in email_data:
                    email_data[email] = {
                        "email": email,
                        "name": invitee.get("name"),
                        "total_calls_booked": 0,
                        "calls_completed": 0,
                        "calls_no_show": 0,
                        "calls_canceled": 0,
                        "calls_rescheduled": 0,
                        "last_call_date": None,
                        "next_call_date": None,
                        "last_organizer": None,
                        "last_organizer_email": None,
                        "events": [],
                        "questionnaire_responses": []
                    }

                data = email_data[email]
                data["total_calls_booked"] += 1

                # Get questionnaire responses
                questions_answers = invitee.get("questions_and_answers", [])

                # Track event details
                event_record = {
                    "event_uri": event.get("uri"),
                    "event_name": event_name,
                    "start_time": start_time,
                    "status": event_status,
                    "organizer": organizer_name,
                    "invitee_status": invitee.get("status"),
                    "no_show": invitee.get("no_show", False),
                    "rescheduled": invitee.get("rescheduled", False),
                    "canceled": invitee.get("canceled", False),
                    "questions_and_answers": questions_answers
                }
                data["events"].append(event_record)

                # Aggregate questionnaire responses
                if questions_answers:
                    for qa in questions_answers:
                        question = qa.get("question", "")
                        answer = qa.get("answer", "")
                        if question and answer:
                            data["questionnaire_responses"].append({
                                "question": question,
                                "answer": answer,
                                "event_name": event_name,
                                "event_date": start_time.isoformat() if start_time else None
                            })

                # Count by status
                if event_status == "canceled" or invitee.get("canceled"):
                    data["calls_canceled"] += 1
                elif invitee.get("rescheduled"):
                    data["calls_rescheduled"] += 1
                elif invitee.get("no_show"):
                    data["calls_no_show"] += 1
                elif is_past:
                    data["calls_completed"] += 1
                    if start_time:
                        if data["last_call_date"] is None or start_time > data["last_call_date"]:
                            data["last_call_date"] = start_time
                            data["last_organizer"] = organizer_name
                            data["last_organizer_email"] = organizer_email
                else:
                    if start_time:
                        if data["next_call_date"] is None or start_time < data["next_call_date"]:
                            data["next_call_date"] = start_time

        logger.info(f"Aggregation complete: {events_processed} events, {invitees_matched} matched, {invitees_skipped} skipped")

        # Calculate show rates
        for email, data in email_data.items():
            attended = data["calls_completed"]
            no_shows = data["calls_no_show"]
            total_past = attended + no_shows

            if total_past > 0:
                data["show_rate"] = (attended / total_past) * 100
            else:
                data["show_rate"] = None

        return email_data

    def aggregate_events_by_email(
        self,
        events: List[Dict[str, Any]]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Group events by invitee email and calculate metrics.

        Only includes external invitees (customers), excludes hosts and internal staff.

        Args:
            events: List of event dictionaries with invitees

        Returns:
            Dictionary keyed by email with aggregated metrics
        """
        email_data: Dict[str, Dict[str, Any]] = {}
        now = datetime.utcnow()

        # Internal domains to exclude (hosts/staff)
        internal_domains = ["listkit.io", "listkit.com", "knowledgex.us"]

        for event in events:
            event_status = event.get("status", "active")
            start_time_str = event.get("start_time", "")

            if start_time_str:
                # Parse ISO format datetime
                start_time = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
                # Convert to naive datetime for comparison
                start_time = start_time.replace(tzinfo=None)
                is_past = start_time < now
            else:
                start_time = None
                is_past = True

            organizer = event.get("organizer", {})
            organizer_name = organizer.get("name", "Unknown")
            organizer_email = (organizer.get("email") or "").lower().strip()

            event_name = event.get("name", "Unknown Event")

            for invitee in event.get("invitees", []):
                email = (invitee.get("email") or "").lower().strip()
                if not email:
                    continue

                # Skip internal/host emails - only sync to external guests (customers)
                domain = email.split("@")[-1] if "@" in email else ""
                if domain in internal_domains:
                    continue

                # Skip if invitee is the organizer/host
                if email == organizer_email:
                    continue

                if email not in email_data:
                    email_data[email] = {
                        "email": email,
                        "name": invitee.get("name"),
                        "total_calls_booked": 0,
                        "calls_completed": 0,
                        "calls_no_show": 0,
                        "calls_canceled": 0,
                        "calls_rescheduled": 0,
                        "last_call_date": None,
                        "next_call_date": None,
                        "last_organizer": None,
                        "last_organizer_email": None,
                        "events": [],
                        "questionnaire_responses": []  # All Q&A from bookings
                    }

                data = email_data[email]
                data["total_calls_booked"] += 1

                # Get questionnaire responses
                questions_answers = invitee.get("questions_and_answers", [])

                # Track event details
                event_record = {
                    "event_uri": event.get("uri"),
                    "event_name": event_name,
                    "start_time": start_time,
                    "status": event_status,
                    "organizer": organizer_name,
                    "invitee_status": invitee.get("status"),
                    "no_show": invitee.get("no_show", False),
                    "rescheduled": invitee.get("rescheduled", False),
                    "canceled": invitee.get("canceled", False),
                    "questions_and_answers": questions_answers
                }
                data["events"].append(event_record)

                # Aggregate questionnaire responses (keep most recent answer per question)
                if questions_answers:
                    for qa in questions_answers:
                        question = qa.get("question", "")
                        answer = qa.get("answer", "")
                        if question and answer:
                            # Add to responses list with event context
                            data["questionnaire_responses"].append({
                                "question": question,
                                "answer": answer,
                                "event_name": event_name,
                                "event_date": start_time.isoformat() if start_time else None
                            })

                # Count by status
                if event_status == "canceled" or invitee.get("canceled"):
                    data["calls_canceled"] += 1
                elif invitee.get("rescheduled"):
                    data["calls_rescheduled"] += 1
                elif invitee.get("no_show"):
                    data["calls_no_show"] += 1
                elif is_past:
                    data["calls_completed"] += 1
                    if start_time:
                        if data["last_call_date"] is None or start_time > data["last_call_date"]:
                            data["last_call_date"] = start_time
                            data["last_organizer"] = organizer_name
                            data["last_organizer_email"] = organizer_email
                else:
                    # Future event
                    if start_time:
                        if data["next_call_date"] is None or start_time < data["next_call_date"]:
                            data["next_call_date"] = start_time

        # Calculate show rates
        for email, data in email_data.items():
            attended = data["calls_completed"]
            no_shows = data["calls_no_show"]
            total_past = attended + no_shows

            if total_past > 0:
                data["show_rate"] = (attended / total_past) * 100
            else:
                data["show_rate"] = None

        return email_data

    def calculate_call_metrics(
        self,
        events: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Calculate aggregate call metrics from events.

        Args:
            events: List of event dictionaries with invitee data

        Returns:
            Dictionary with overall call metrics
        """
        now = datetime.utcnow()

        metrics = {
            "total_events": len(events),
            "total_invitees": 0,
            "unique_invitees": set(),
            "completed_calls": 0,
            "no_shows": 0,
            "canceled": 0,
            "upcoming": 0
        }

        for event in events:
            event_status = event.get("status", "active")
            start_time_str = event.get("start_time", "")

            if start_time_str:
                start_time = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
                start_time = start_time.replace(tzinfo=None)
                is_past = start_time < now
            else:
                is_past = True

            for invitee in event.get("invitees", []):
                email = (invitee.get("email") or "").lower().strip()
                if email:
                    metrics["total_invitees"] += 1
                    metrics["unique_invitees"].add(email)

                    if event_status == "canceled" or invitee.get("canceled"):
                        metrics["canceled"] += 1
                    elif invitee.get("no_show"):
                        metrics["no_shows"] += 1
                    elif is_past:
                        metrics["completed_calls"] += 1
                    else:
                        metrics["upcoming"] += 1

        metrics["unique_invitees"] = len(metrics["unique_invitees"])

        return metrics
