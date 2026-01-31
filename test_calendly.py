#!/usr/bin/env python3
"""
Test script for Calendly API connection.

Run with: python test_calendly.py
"""

import os
import sys
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add the project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from execution.clients.calendly_client import CalendlyClient


def test_calendly_connection():
    """Test the Calendly API connection and fetch some events."""

    api_key = os.getenv("CALENDLY_API_KEY")

    if not api_key:
        print("❌ CALENDLY_API_KEY not found in environment")
        return False

    print("=" * 60)
    print("Testing Calendly API Connection")
    print("=" * 60)

    try:
        # Initialize client
        client = CalendlyClient(api_key=api_key)

        # Get current user
        print("\n1. Getting current user...")
        user = client.get_current_user()
        print(f"   ✓ Authenticated as: {user.get('name')} ({user.get('email')})")
        print(f"   Organization: {client.get_organization_uri()}")

        # Fetch recent events
        print("\n2. Fetching events from last 30 days...")
        events = list(client.list_scheduled_events(
            min_start_time=datetime.utcnow() - timedelta(days=30),
            max_start_time=datetime.utcnow() + timedelta(days=7)
        ))
        print(f"   ✓ Found {len(events)} events")

        # Show some sample events
        if events:
            print("\n3. Sample events:")
            for event in events[:5]:
                name = event.get("name", "Unknown")
                start_time = event.get("start_time", "Unknown")
                status = event.get("status", "Unknown")
                print(f"   - {name} ({status}) at {start_time}")

        # Test fetching invitees for first event
        if events:
            print("\n4. Testing invitee fetch for first event...")
            event_uri = events[0].get("uri")
            invitees = client.get_event_invitees(event_uri)
            print(f"   ✓ Found {len(invitees)} invitees")

            for invitee in invitees[:3]:
                email = invitee.get("email", "Unknown")
                name = invitee.get("name", "Unknown")
                print(f"   - {name} ({email})")

        # Test aggregation
        print("\n5. Testing event aggregation...")
        events_with_invitees = list(client.get_all_events_with_invitees(
            days_back=30,
            days_forward=7
        ))

        email_data = client.aggregate_events_by_email(events_with_invitees)
        print(f"   ✓ Aggregated data for {len(email_data)} unique emails")

        # Show top invitees by call count
        if email_data:
            print("\n6. Top invitees by total calls:")
            sorted_invitees = sorted(
                email_data.items(),
                key=lambda x: x[1].get("total_calls_booked", 0),
                reverse=True
            )
            for email, data in sorted_invitees[:5]:
                total = data.get("total_calls_booked", 0)
                completed = data.get("calls_completed", 0)
                show_rate = data.get("show_rate")
                show_rate_str = f"{show_rate:.0f}%" if show_rate else "N/A"
                print(f"   - {email}: {total} calls ({completed} completed, show rate: {show_rate_str})")

        print("\n" + "=" * 60)
        print("✅ Calendly connection test PASSED!")
        print("=" * 60)

        return True

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_calendly_connection()
    sys.exit(0 if success else 1)
