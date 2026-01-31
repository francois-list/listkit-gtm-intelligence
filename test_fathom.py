#!/usr/bin/env python3
"""
Test script for Fathom API connection.

Run with: python test_fathom.py
"""

import os
import sys
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add the project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from execution.clients.fathom_client import FathomClient


def test_fathom_connection():
    """Test the Fathom API connection and fetch some calls."""

    api_key = os.getenv("FATHOM_API_KEY")

    if not api_key:
        print("❌ FATHOM_API_KEY not found in environment")
        return False

    print("=" * 60)
    print("Testing Fathom API Connection")
    print("=" * 60)

    try:
        # Initialize client
        client = FathomClient(api_key=api_key)

        # Fetch recent calls
        print("\n1. Fetching calls from last 30 days...")
        calls = client.list_calls(
            start_date=datetime.utcnow() - timedelta(days=30),
            limit=50
        )
        print(f"   ✓ Found {len(calls)} calls")

        # Show some sample calls
        if calls:
            print("\n2. Sample calls:")
            for call in calls[:5]:
                title = call.get("title", "Unknown")
                date = call.get("date", call.get("created_at", "Unknown"))
                duration = call.get("duration_minutes", 0)
                participants = call.get("participants", [])
                participant_count = len(participants)
                print(f"   - {title} ({duration}min, {participant_count} participants) - {date}")

        # Test call details
        if calls:
            print("\n3. Testing call details fetch...")
            call_id = calls[0].get("id")
            if call_id:
                call_details = client.get_call(call_id)
                if call_details:
                    print(f"   ✓ Got details for call: {call_details.get('title')}")

                    # Try to get summary
                    print("\n4. Testing summary fetch...")
                    summary = client.get_call_summary(call_id)
                    if summary:
                        summary_text = summary.get("summary", summary.get("text", ""))
                        if summary_text:
                            print(f"   ✓ Summary available ({len(summary_text)} chars)")
                            print(f"   Preview: {summary_text[:200]}...")
                        else:
                            print("   ⚠ Summary not available for this call")
                    else:
                        print("   ⚠ Could not fetch summary")

        # Test aggregation
        print("\n5. Testing call aggregation by email...")
        all_calls = list(client.iter_all_calls(days_back=30))
        email_data = client.aggregate_calls_by_email(all_calls)
        print(f"   ✓ Found {len(email_data)} unique participants")

        # Show top participants
        if email_data:
            print("\n6. Top participants by call count:")
            sorted_participants = sorted(
                email_data.items(),
                key=lambda x: x[1].get("total_calls", 0),
                reverse=True
            )
            for email, data in sorted_participants[:5]:
                total = data.get("total_calls", 0)
                duration = data.get("total_duration_minutes", 0)
                print(f"   - {email}: {total} calls, {duration} total minutes")

        print("\n" + "=" * 60)
        print("✅ Fathom connection test PASSED!")
        print("=" * 60)

        return True

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_fathom_connection()
    sys.exit(0 if success else 1)
