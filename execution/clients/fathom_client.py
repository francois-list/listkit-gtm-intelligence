"""
Fathom API client for call recordings and transcripts.

Syncs call recordings, AI summaries, and meeting insights.
"""

from typing import Optional, Dict, Any, List, Generator
from datetime import datetime, timedelta
from loguru import logger
from .base_client import BaseClient


class FathomClient(BaseClient):
    """
    Client for Fathom API.

    Handles:
    - Call recordings
    - Transcripts
    - AI summaries
    - Meeting participants
    """

    def __init__(self, api_key: str):
        """
        Initialize Fathom client.

        Args:
            api_key: Fathom API key
        """
        super().__init__(
            api_key=api_key,
            base_url="https://api.fathom.ai/external/v1",
            rate_limit=1  # Fathom limit: 60 calls per minute
        )
        logger.info("Fathom client initialized")

    def _get_headers(self) -> Dict[str, str]:
        """Get headers for Fathom API requests."""
        return {
            "X-Api-Key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    def list_calls(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
        include_transcript: bool = False
    ) -> Dict[str, Any]:
        """
        List all calls/recordings.

        Args:
            start_date: Filter calls after this date (created_after)
            end_date: Filter calls before this date (created_before)
            limit: Max results per page
            cursor: Pagination cursor from previous response
            include_transcript: Whether to include transcript in response

        Returns:
            Dict with 'items' list and optional 'next_cursor'
        """
        params = {"limit": limit}

        if cursor:
            params["cursor"] = cursor

        if start_date:
            params["created_after"] = start_date.strftime("%Y-%m-%dT%H:%M:%SZ")

        if end_date:
            params["created_before"] = end_date.strftime("%Y-%m-%dT%H:%M:%SZ")

        if include_transcript:
            params["include_transcript"] = "true"

        try:
            response = self.get("/meetings", params=params)
            return {
                "items": response.get("items", []),
                "next_cursor": response.get("next_cursor")
            }
        except Exception as e:
            logger.error(f"Error listing Fathom calls: {e}")
            return {"items": [], "next_cursor": None}

    def get_call(self, call_id: str) -> Dict[str, Any]:
        """
        Get detailed information about a specific call.

        Args:
            call_id: Fathom call ID

        Returns:
            Call details including transcript and summary
        """
        try:
            response = self.get(f"/meetings/{call_id}")
            return response.get("call", response)
        except Exception as e:
            logger.error(f"Error fetching call {call_id}: {e}")
            return {}

    def get_call_transcript(self, call_id: str) -> Dict[str, Any]:
        """
        Get transcript for a specific call.

        Args:
            call_id: Fathom call ID

        Returns:
            Transcript data
        """
        try:
            response = self.get(f"/meetings/{call_id}/transcript")
            return response
        except Exception as e:
            logger.error(f"Error fetching transcript for {call_id}: {e}")
            return {}

    def get_call_summary(self, call_id: str) -> Dict[str, Any]:
        """
        Get AI-generated summary for a specific call.

        Args:
            call_id: Fathom call ID

        Returns:
            Summary data including key points and action items
        """
        try:
            response = self.get(f"/meetings/{call_id}/summary")
            return response
        except Exception as e:
            logger.error(f"Error fetching summary for {call_id}: {e}")
            return {}

    def iter_all_calls(
        self,
        days_back: int = 90,
        include_transcript: bool = False
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Iterate through all calls with cursor-based pagination.

        Args:
            days_back: Number of days to look back
            include_transcript: Whether to include transcripts

        Yields:
            Call objects
        """
        start_date = datetime.utcnow() - timedelta(days=days_back)
        cursor = None
        total_fetched = 0

        while True:
            result = self.list_calls(
                start_date=start_date,
                cursor=cursor,
                include_transcript=include_transcript
            )

            items = result.get("items", [])
            if not items:
                break

            for call in items:
                yield call
                total_fetched += 1

            cursor = result.get("next_cursor")
            if not cursor:
                break

            logger.debug(f"Fetched {total_fetched} calls...")

    def get_calls_by_participant_email(
        self,
        email: str,
        days_back: int = 90
    ) -> List[Dict[str, Any]]:
        """
        Get all calls that include a specific participant email.

        Args:
            email: Participant email to search for
            days_back: Number of days to look back

        Returns:
            List of matching calls
        """
        email = email.lower().strip()
        matching_calls = []

        for call in self.iter_all_calls(days_back=days_back):
            # API uses calendar_invitees for participants
            participants = call.get("calendar_invitees", [])

            for participant in participants:
                participant_email = (participant.get("email") or "").lower().strip()
                if participant_email == email:
                    matching_calls.append(call)
                    break

        return matching_calls

    def aggregate_calls_by_email(
        self,
        calls: List[Dict[str, Any]]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Group calls by participant email.

        Args:
            calls: List of call objects from Fathom API

        Returns:
            Dictionary keyed by email with aggregated call data
        """
        email_data: Dict[str, Dict[str, Any]] = {}

        # Internal domains to always skip (hosts)
        internal_domains = ["listkit.io", "listkit.com", "knowledgex.us"]

        for call in calls:
            call_id = call.get("recording_id") or call.get("id")
            call_title = call.get("title") or call.get("meeting_title", "Unknown Meeting")
            call_date = call.get("created_at") or call.get("recording_start_time")

            # Get the host/recorder email to exclude them
            recorded_by = call.get("recorded_by", {})
            host_email = (recorded_by.get("email") or "").lower().strip()

            # Calculate duration from recording times if available
            duration = 0
            start_time = call.get("recording_start_time")
            end_time = call.get("recording_end_time")
            if start_time and end_time:
                try:
                    start_dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
                    end_dt = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
                    duration = int((end_dt - start_dt).total_seconds() / 60)
                except:
                    pass

            # API uses calendar_invitees for participants
            participants = call.get("calendar_invitees", [])

            for participant in participants:
                email = (participant.get("email") or "").lower().strip()
                if not email:
                    continue

                # Skip internal/host emails - only sync to external guests (customers)
                if participant.get("is_external") is False:
                    continue

                # Skip the person who recorded the call (host)
                if email == host_email:
                    continue

                # Skip internal domain emails
                domain = email.split("@")[-1] if "@" in email else ""
                if domain in internal_domains:
                    continue

                if email not in email_data:
                    email_data[email] = {
                        "email": email,
                        "name": participant.get("name"),
                        "total_calls": 0,
                        "total_duration_minutes": 0,
                        "calls": [],
                        "last_call_date": None,
                        "last_call_title": None,
                        "recorded_by": None
                    }

                data = email_data[email]
                data["total_calls"] += 1
                data["total_duration_minutes"] += duration

                # Parse call date
                call_datetime = None
                if call_date:
                    if isinstance(call_date, str):
                        try:
                            call_datetime = datetime.fromisoformat(call_date.replace("Z", "+00:00"))
                            call_datetime = call_datetime.replace(tzinfo=None)
                        except:
                            pass
                    else:
                        call_datetime = call_date

                # Track most recent call
                if call_datetime:
                    if data["last_call_date"] is None or call_datetime > data["last_call_date"]:
                        data["last_call_date"] = call_datetime
                        data["last_call_title"] = call_title
                        # Track who recorded the most recent call
                        recorded_by = call.get("recorded_by", {})
                        data["recorded_by"] = recorded_by.get("name") or recorded_by.get("email")

                # Get the host info for this specific call
                call_recorded_by = call.get("recorded_by", {})
                host_name = call_recorded_by.get("name") or call_recorded_by.get("email")

                # Store call reference
                data["calls"].append({
                    "call_id": call_id,
                    "title": call_title,
                    "date": call_datetime,
                    "duration_minutes": duration,
                    "url": call.get("url"),
                    "share_url": call.get("share_url"),
                    "recorded_by": host_name
                })

        return email_data

    def extract_call_insights(self, call: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract key insights from a call including summary and sentiment.

        Args:
            call: Call object with full details from Fathom API

        Returns:
            Dictionary with extracted insights
        """
        call_id = call.get("recording_id") or call.get("id")

        # Calculate duration from recording times
        duration = 0
        start_time = call.get("recording_start_time")
        end_time = call.get("recording_end_time")
        if start_time and end_time:
            try:
                start_dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
                end_dt = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
                duration = int((end_dt - start_dt).total_seconds() / 60)
            except:
                pass

        # Get summary from default_summary field or fetch it
        summary_text = call.get("default_summary")
        action_items = call.get("action_items") or []

        insights = {
            "title": call.get("title") or call.get("meeting_title"),
            "duration_minutes": duration,
            "summary_text": summary_text,
            "key_points": [],  # Not directly available in API
            "action_items": action_items,
            "sentiment": None,  # Not directly available in API
            "topics": [],  # Not directly available in API
            "url": call.get("url"),
            "share_url": call.get("share_url"),
            "recorded_by": call.get("recorded_by", {}).get("name")
        }

        # Check for churn/cancel mentions in summary or transcript
        cancel_keywords = [
            "cancel", "cancellation", "churn", "leaving",
            "switching", "not renewing", "end subscription"
        ]

        text_to_check = (summary_text or "").lower()
        transcript = call.get("transcript") or ""
        text_to_check += " " + transcript.lower()

        insights["mentioned_cancel"] = any(
            keyword in text_to_check for keyword in cancel_keywords
        )

        return insights


# Fathom API Notes:
"""
The Fathom API provides access to:
1. /meetings - List all call recordings
2. /meetings/{id} - Get specific call details
3. /meetings/{id}/transcript - Get call transcript
4. /meetings/{id}/summary - Get AI summary

Call object structure:
{
    "id": "call_xxx",
    "title": "Meeting Title",
    "date": "2024-01-15T10:00:00Z",
    "duration_minutes": 45,
    "participants": [
        {"email": "user@example.com", "name": "John Doe"}
    ],
    "recording_url": "https://...",
    "transcript_status": "completed",
    "summary_status": "completed"
}

Summary object:
{
    "summary": "Meeting summary text...",
    "key_points": ["Point 1", "Point 2"],
    "action_items": [
        {"text": "Follow up on X", "assignee": "John"}
    ],
    "sentiment": "positive",
    "topics": ["onboarding", "pricing"]
}

Authentication:
- Use Bearer token in Authorization header
- API key from Fathom dashboard

Rate limits:
- Conservative: ~2 requests per second
- Use pagination for large result sets

Matching to Calendly:
- Match by participant email
- Match by meeting time window (within 15 min of scheduled time)
- Match by meeting title similarity
"""
