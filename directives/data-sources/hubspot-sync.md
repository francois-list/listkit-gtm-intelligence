# HubSpot Sync Directive

## Purpose

Sync CRM data from HubSpot into the unified_customers table. HubSpot provides:
- Contact and company information
- Deal pipeline and lifecycle stages
- Account manager (owner) assignment
- Custom properties and tags

**Status:** Phase 2 - Not yet implemented

## API Endpoints

**Search Contacts:**
```
POST https://api.hubapi.com/crm/v3/objects/contacts/search
```

**Get Companies:**
```
GET https://api.hubapi.com/crm/v3/objects/companies/{companyId}
```

**Authentication:**
```
Authorization: Bearer {HUBSPOT_API_KEY}
```

## Data Extraction

### Contact Fields
```
email → email (match key)
firstname, lastname → name
company → company_name
lifecyclestage → lifecycle_stage
hs_lead_status → lead_status
createdate → hubspot_created_at
```

### Company Association
```
associated_company.id → hubspot_company_id
associated_company.name → company_name
associated_company.industry → company_industry
associated_company.numberofemployees → company_size
```

### Owner (Account Manager) Assignment
```
hubspot_owner_id → assigned_am_id
hubspot_owner.email → assigned_am_email
hubspot_owner.firstName + lastName → assigned_am
```

### Deal Information
```
deals.amount → deal_value
deals.dealstage → deal_stage
deals.pipeline → deal_pipeline
deals.closedate → deal_expected_close
```

### Lifecycle Stage Mapping
HubSpot lifecycle stages → our customer_type:
- `subscriber` → lead
- `lead` → lead
- `marketingqualifiedlead` → qualified_lead
- `salesqualifiedlead` → qualified_lead
- `opportunity` → prospect
- `customer` → customer
- `evangelist` → advocate
- `other` → other

## Data Transformation

### Field Mapping
```python
{
    # Identifiers
    "email": contact.email,
    "hubspot_contact_id": contact.id,
    "hubspot_company_id": contact.associated_company.id,

    # Profile
    "name": f"{contact.firstname} {contact.lastname}",
    "company_name": contact.company or contact.associated_company.name,
    "assigned_am": owner.full_name,
    "assigned_am_email": owner.email,
    "customer_type": map_lifecycle_stage(contact.lifecyclestage),

    # Pipeline
    "deal_stage": contact.deals[0].dealstage if contact.deals else None,
    "deal_value": contact.deals[0].amount if contact.deals else None,
    "lifecycle_stage": contact.lifecyclestage,

    # Metadata
    "last_hubspot_sync": NOW
}
```

## Sync Process

### 1. Pagination
HubSpot uses `after` cursor for pagination:
```json
{
  "limit": 100,
  "after": "cursor_token"
}
```

### 2. Incremental Sync
Filter by last modified date:
```json
{
  "filterGroups": [{
    "filters": [{
      "propertyName": "hs_lastmodifieddate",
      "operator": "GT",
      "value": last_sync_timestamp
    }]
  }]
}
```

### 3. Owner Enrichment
For each unique owner ID, fetch owner details:
```
GET /crm/v3/owners/{ownerId}
```

Cache owner data to minimize API calls.

## Validation Rules

### Required Fields
- `email` - Must be present
- `lifecyclestage` - Must be valid HubSpot value

### Data Quality Checks
- Owner must exist in HubSpot
- Deal amounts must be positive numbers
- Lifecycle stage must progress forward (alert on regression)

### Quality Score Factors
```
+15 points: Has assigned owner (AM)
+15 points: Has company association
+10 points: Has active deal
+10 points: Deal value > $1000
+10 points: Lifecycle stage = customer
```

## Alert Triggers

- **Unassigned high-value lead:** No owner + deal value > $5000
- **Deal stage regression:** Deal moved backward in pipeline
- **Owner change:** AM reassignment

## Output

Log metrics:
```
{
  "contacts_synced": 567,
  "new_am_assignments": 12,
  "deal_updates": 34,
  "lifecycle_progressions": 8
}
```

## Frequency

**Default:** Every 12 hours
**Full sync:** Weekly

## Dependencies

- HubSpot API client (`execution/clients/hubspot_client.py`)
- Database models
- Owner cache/lookup table

## Notes

- HubSpot contact may not have company association
- Multiple deals per contact - use highest value or most recent
- Lifecycle stages may be customized per HubSpot portal
- Owner assignments critical for AM accountability
