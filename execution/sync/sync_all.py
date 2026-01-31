"""
Orchestrator script to run all data source syncs.

Executes syncs in sequence and handles errors gracefully.
One source failing should not block others.
"""

from datetime import datetime
from typing import Dict, Any, List
from loguru import logger

from execution.sync.sync_intercom import sync_intercom
from execution.sync.sync_hubspot import sync_hubspot
from execution.sync.sync_calendly import sync_calendly
from execution.sync.sync_fathom import sync_fathom


def sync_all(incremental: bool = True) -> Dict[str, Any]:
    """
    Run all data source syncs in sequence.

    Args:
        incremental: If True, use incremental sync where supported

    Returns:
        Combined metrics from all syncs
    """
    logger.info("=" * 60)
    logger.info("Starting full sync of all data sources")
    logger.info("=" * 60)

    start_time = datetime.utcnow()

    results = {
        "started_at": start_time.isoformat(),
        "syncs": [],
        "total_duration_seconds": 0,
        "success_count": 0,
        "failure_count": 0
    }

    # Define sync pipeline
    syncs = [
        {
            "name": "Intercom",
            "function": sync_intercom,
            "enabled": True,
            "phase": 1
        },
        {
            "name": "HubSpot",
            "function": sync_hubspot,
            "enabled": False,  # Phase 2
            "phase": 2
        },
        {
            "name": "Calendly",
            "function": sync_calendly,
            "enabled": True,  # Now active
            "phase": 2
        },
        {
            "name": "Fathom",
            "function": sync_fathom,
            "enabled": True,  # Now active
            "phase": 3
        }
    ]

    # Execute each sync
    for sync_config in syncs:
        if not sync_config["enabled"]:
            logger.info(f"⊘ Skipping {sync_config['name']} (Phase {sync_config['phase']})")
            continue

        sync_name = sync_config["name"]
        sync_func = sync_config["function"]

        logger.info("")
        logger.info("-" * 60)
        logger.info(f"Starting {sync_name} sync...")
        logger.info("-" * 60)

        sync_start = datetime.utcnow()
        sync_result = {
            "name": sync_name,
            "status": "unknown",
            "metrics": {},
            "error": None,
            "duration_seconds": 0
        }

        try:
            # Run sync
            metrics = sync_func(incremental=incremental)

            # Record success
            sync_result["status"] = "completed"
            sync_result["metrics"] = metrics
            results["success_count"] += 1

            logger.info(f"✓ {sync_name} sync completed successfully")
            logger.info(f"  Metrics: {metrics}")

        except Exception as e:
            # Record failure but continue
            sync_result["status"] = "failed"
            sync_result["error"] = str(e)
            results["failure_count"] += 1

            logger.error(f"✗ {sync_name} sync failed: {e}")
            logger.exception(e)

        finally:
            # Record duration
            sync_duration = (datetime.utcnow() - sync_start).total_seconds()
            sync_result["duration_seconds"] = sync_duration

            results["syncs"].append(sync_result)

            logger.info(f"  Duration: {sync_duration:.2f}s")

    # Calculate total duration
    total_duration = (datetime.utcnow() - start_time).total_seconds()
    results["total_duration_seconds"] = total_duration
    results["completed_at"] = datetime.utcnow().isoformat()

    # Log summary
    logger.info("")
    logger.info("=" * 60)
    logger.info("SYNC SUMMARY")
    logger.info("=" * 60)
    logger.info(f"Total Duration: {total_duration:.2f}s")
    logger.info(f"Successful: {results['success_count']}")
    logger.info(f"Failed: {results['failure_count']}")
    logger.info("")

    for sync_result in results["syncs"]:
        status_icon = "✓" if sync_result["status"] == "completed" else "✗"
        logger.info(f"{status_icon} {sync_result['name']}: {sync_result['status']} ({sync_result['duration_seconds']:.2f}s)")

    logger.info("=" * 60)

    return results


if __name__ == "__main__":
    """
    Run all syncs from command line.

    Usage:
        python -m execution.sync.sync_all           # Incremental sync
        python -m execution.sync.sync_all --full    # Full sync
    """
    import sys

    incremental = "--full" not in sys.argv

    sync_type = "incremental" if incremental else "full"
    logger.info(f"Running {sync_type} sync...")

    try:
        results = sync_all(incremental=incremental)

        # Exit with error code if any syncs failed
        if results["failure_count"] > 0:
            logger.error(f"Some syncs failed ({results['failure_count']})")
            sys.exit(1)
        else:
            logger.info("All syncs completed successfully")
            sys.exit(0)

    except Exception as e:
        logger.error(f"Sync orchestration failed: {e}")
        logger.exception(e)
        sys.exit(1)
