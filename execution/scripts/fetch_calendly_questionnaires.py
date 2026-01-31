"""
Fetch Calendly questionnaire data (questions and answers) for recent bookings.
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add execution to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from execution.config import settings
from execution.clients.calendly_client import CalendlyClient
from loguru import logger


def fetch_questionnaires(limit: int = 100, days_back: int = 365):
    """
    Fetch questionnaire data from Calendly invitees.

    Args:
        limit: Max number of unique customers to fetch
        days_back: Days to look back for events
    """
    if not settings.calendly_api_key:
        print("ERROR: CALENDLY_API_KEY not configured")
        return

    client = CalendlyClient(api_key=settings.calendly_api_key)

    # Get current user
    user = client.get_current_user()
    print(f"Authenticated as: {user.get('name')} ({user.get('email')})")
    print(f"\nFetching events from last {days_back} days...\n")

    # Internal domains to skip
    internal_domains = ["listkit.io", "listkit.com", "knowledgex.us"]

    # Track unique customers
    seen_emails = set()
    questionnaire_data = []

    # Fetch events with invitees
    for event in client.get_all_events_with_invitees(
        days_back=days_back,
        days_forward=0,
        include_canceled=False
    ):
        if len(questionnaire_data) >= limit:
            break

        event_name = event.get("name", "Unknown Event")
        start_time = event.get("start_time", "")
        organizer = event.get("organizer", {})
        organizer_name = organizer.get("name", "Unknown")

        for invitee in event.get("invitees", []):
            if len(questionnaire_data) >= limit:
                break

            email = (invitee.get("email") or "").lower().strip()
            if not email:
                continue

            # Skip internal emails
            domain = email.split("@")[-1] if "@" in email else ""
            if domain in internal_domains:
                continue

            # Skip if already seen
            if email in seen_emails:
                continue

            seen_emails.add(email)

            # Get questions and answers
            questions_answers = invitee.get("questions_and_answers", [])

            if questions_answers:
                customer_data = {
                    "email": email,
                    "name": invitee.get("name"),
                    "event_name": event_name,
                    "event_date": start_time,
                    "host": organizer_name,
                    "questions_and_answers": questions_answers
                }
                questionnaire_data.append(customer_data)

                print(f"--- {email} ---")
                print(f"  Event: {event_name}")
                print(f"  Date: {start_time}")
                print(f"  Host: {organizer_name}")
                print(f"  Questions & Answers:")
                for qa in questions_answers:
                    question = qa.get("question", "Unknown question")
                    answer = qa.get("answer", "No answer")
                    print(f"    Q: {question}")
                    print(f"    A: {answer}")
                print()

    print(f"\n{'='*60}")
    print(f"Total customers with questionnaire data: {len(questionnaire_data)}")
    print(f"{'='*60}")

    # Save to JSON file
    output_file = Path(__file__).parent / "calendly_questionnaires.json"
    with open(output_file, "w") as f:
        json.dump(questionnaire_data, f, indent=2, default=str)
    print(f"\nData saved to: {output_file}")

    # Also print unique questions found
    all_questions = set()
    for data in questionnaire_data:
        for qa in data.get("questions_and_answers", []):
            all_questions.add(qa.get("question", ""))

    if all_questions:
        print(f"\n{'='*60}")
        print("UNIQUE QUESTIONS FOUND:")
        print(f"{'='*60}")
        for q in sorted(all_questions):
            if q:
                print(f"  - {q}")

    return questionnaire_data


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Fetch Calendly questionnaire data")
    parser.add_argument("--limit", type=int, default=100, help="Max customers to fetch")
    parser.add_argument("--days", type=int, default=365, help="Days to look back")

    args = parser.parse_args()

    fetch_questionnaires(limit=args.limit, days_back=args.days)
