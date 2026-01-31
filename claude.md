# ListKit GTM Intelligence Platform - DOE Framework

## Framework Overview

The **DOE Framework** (Directive-Orchestration-Execution) is a three-layer architecture for building AI-powered systems:

### 1. Directive Layer - The "What"
**Location:** `directives/` folder

SOPs and knowledge written in markdown that define:
- Business objectives and requirements
- Data source specifications
- Calculation methodologies
- Alert conditions and workflows
- Quality standards and validation rules

These are human-readable, version-controlled, and can be read by AI agents to understand the system.

### 2. Orchestration Layer - The "How"
**Location:** This file (claude.md) and `execution/sync/sync_all.py`

Combines directives to create workflows:
- How data sources feed into unified customer records
- How health scores are calculated from combined data
- How alerts are triggered based on conditions
- How data quality is maintained across sources

### 3. Execution Layer - The "Do"
**Location:** `execution/` and `api/` folders

Python scripts and APIs that implement the directives:
- API clients for each data source
- Sync scripts that transform and load data
- Health score calculation engine
- Alert notification system
- REST API for accessing unified data

## System Architecture

```
Data Sources → Sync Scripts → Unified Database → Health Calculator → Outputs
                     ↓              ↓                    ↓             ↓
                 Intercom    unified_customers      health_score   Dashboard
                 HubSpot          table                             API
                 Calendly                                          Alerts
                 Userflow                                          Reports
```

## Adding New Data Sources

To add a new data source:

1. **Create Directive** (`directives/data-sources/[source]-sync.md`):
   - What data to extract
   - How to match to unified customers (usually email)
   - What fields to populate in unified_customers table

2. **Create Client** (`execution/clients/[source]_client.py`):
   - Extend `BaseClient`
   - Implement API authentication and pagination
   - Handle rate limiting and errors

3. **Create Sync Script** (`execution/sync/sync_[source].py`):
   - Fetch data using client
   - Transform to unified schema
   - Upsert to database (match on email)
   - Update last_[source]_sync timestamp

4. **Add to Orchestrator** (`execution/sync/sync_all.py`):
   - Import new sync script
   - Add to sync sequence

5. **Update Schema** (if needed):
   - Add source-specific fields to unified_customers table
   - Add last_[source]_sync timestamp

## Key Principles

- **Email is the match key** - All sources match customers by email
- **Upsert, don't overwrite** - Each sync updates only its own fields
- **Timestamp everything** - Track when each source last synced
- **Fail gracefully** - One source failing doesn't break others
- **Multi-source enrichment** - Health scores use data from all available sources

## Phase Rollout

**Phase 1 (Current):** Intercom only
- Basic customer profiles
- Stripe revenue data from Intercom
- Support activity and sentiment
- Health scores from limited data

**Phase 2:** Add HubSpot + Calendly
- CRM data and lifecycle stages
- AM assignment
- Call booking and show rates
- Enhanced health scores

**Phase 3:** Add Userflow + Fathom + ListKit Admin
- Product usage and engagement
- Call transcripts and insights
- Platform-specific metrics

**Phase 4:** Add ChartMogul + Stripe Direct
- Advanced revenue analytics
- Cohort analysis
- Deep financial metrics

## AI Agent Usage

AI agents can:
1. Read directives to understand business rules
2. Modify execution scripts to implement changes
3. Add new data sources by following the pattern
4. Generate reports by querying the unified database
5. Answer questions about customer health and metrics

The DOE framework makes the system self-documenting and AI-maintainable.
