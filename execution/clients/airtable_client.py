"""
Airtable API client for AM assignments and customer data.

Airtable is the primary source for AM assignments at ListKit.
"""

from typing import Optional, Dict, Any, List, Generator
from loguru import logger
from .base_client import BaseClient


class AirtableClient(BaseClient):
    """
    Client for Airtable API.

    Handles:
    - AM assignment data
    - Customer segmentation data
    - Custom fields sync
    """

    def __init__(self, api_key: str, base_id: str):
        """
        Initialize Airtable client.

        Args:
            api_key: Airtable personal access token
            base_id: Airtable base ID (starts with 'app')
        """
        super().__init__(
            api_key=api_key,
            base_url=f"https://api.airtable.com/v0/{base_id}",
            rate_limit=5  # Airtable: 5 requests/second
        )
        self.base_id = base_id
        logger.info(f"Airtable client initialized for base {base_id}")

    def _get_headers(self) -> Dict[str, str]:
        """Override to add Airtable-specific headers."""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def list_records(
        self,
        table_name: str,
        view: Optional[str] = None,
        fields: Optional[List[str]] = None,
        filter_formula: Optional[str] = None,
        max_records: Optional[int] = None
    ) -> Generator[Dict[str, Any], None, None]:
        """
        List records from an Airtable table with pagination.

        Args:
            table_name: Name of the table (URL-encoded if spaces)
            view: Optional view name to filter by
            fields: List of field names to return
            filter_formula: Airtable formula to filter records
            max_records: Maximum number of records to return

        Yields:
            Record dictionaries with 'id', 'fields', 'createdTime'
        """
        params = {}

        if view:
            params["view"] = view
        if fields:
            params["fields[]"] = fields
        if filter_formula:
            params["filterByFormula"] = filter_formula
        if max_records:
            params["maxRecords"] = max_records

        offset = None
        total = 0

        while True:
            if offset:
                params["offset"] = offset

            response = self._request("GET", f"/{table_name}", params=params)

            records = response.get("records", [])
            total += len(records)
            logger.debug(f"Retrieved {len(records)} records from {table_name} (total: {total})")

            for record in records:
                yield record

            # Check for pagination
            offset = response.get("offset")
            if not offset:
                break

        logger.info(f"Retrieved all {total} records from {table_name}")

    def get_record(self, table_name: str, record_id: str) -> Dict[str, Any]:
        """
        Get a single record by ID.

        Args:
            table_name: Name of the table
            record_id: Airtable record ID (starts with 'rec')

        Returns:
            Record dictionary
        """
        return self._request("GET", f"/{table_name}/{record_id}")

    def find_record_by_field(
        self,
        table_name: str,
        field_name: str,
        field_value: str
    ) -> Optional[Dict[str, Any]]:
        """
        Find a single record by field value.

        Args:
            table_name: Name of the table
            field_name: Field to search
            field_value: Value to match

        Returns:
            First matching record or None
        """
        formula = f"{{{field_name}}} = '{field_value}'"

        for record in self.list_records(table_name, filter_formula=formula, max_records=1):
            return record

        return None

    def get_am_assignments(
        self,
        table_name: str = "Customers",
        email_field: str = "Email",
        am_field: str = "Account Manager",
        am_email_field: str = "AM Email"
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Get AM assignments from customer table.

        Args:
            table_name: Name of the customers table
            email_field: Field containing customer email
            am_field: Field containing AM name
            am_email_field: Field containing AM email

        Yields:
            Dictionaries with email, assigned_am, assigned_am_email
        """
        fields = [email_field, am_field, am_email_field]

        for record in self.list_records(table_name, fields=fields):
            fields_data = record.get("fields", {})
            email = fields_data.get(email_field)

            if not email:
                continue

            yield {
                "airtable_record_id": record["id"],
                "email": email.lower().strip(),
                "assigned_am": fields_data.get(am_field),
                "assigned_am_email": fields_data.get(am_email_field, "").lower().strip() if fields_data.get(am_email_field) else None
            }

    def get_customer_segmentation(
        self,
        table_name: str = "Customers",
        field_mapping: Optional[Dict[str, str]] = None
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Get customer segmentation data.

        Args:
            table_name: Name of the customers table
            field_mapping: Map of our field names to Airtable field names
                          e.g., {"traffic_source": "Traffic Source", "industry": "Industry"}

        Yields:
            Dictionaries with segmentation data
        """
        if field_mapping is None:
            field_mapping = {
                "email": "Email",
                "traffic_source": "Traffic Source",
                "acquisition_type": "Acquisition Type",
                "industry": "Industry",
                "company_size": "Company Size",
                "tags": "Tags"
            }

        fields = list(field_mapping.values())

        for record in self.list_records(table_name, fields=fields):
            fields_data = record.get("fields", {})

            email = fields_data.get(field_mapping.get("email", "Email"))
            if not email:
                continue

            result = {
                "airtable_record_id": record["id"],
                "email": email.lower().strip()
            }

            for our_field, airtable_field in field_mapping.items():
                if our_field != "email":
                    value = fields_data.get(airtable_field)
                    # Handle linked records (arrays)
                    if isinstance(value, list) and len(value) > 0:
                        value = value[0] if len(value) == 1 else value
                    result[our_field] = value

            yield result

    def get_account_managers(
        self,
        table_name: str = "Account Managers"
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Get list of account managers.

        Args:
            table_name: Name of the AM table

        Yields:
            AM dictionaries with name, email, team
        """
        for record in self.list_records(table_name):
            fields = record.get("fields", {})

            name = fields.get("Name")
            email = fields.get("Email")

            if not email:
                continue

            yield {
                "airtable_record_id": record["id"],
                "name": name,
                "email": email.lower().strip(),
                "team": fields.get("Team"),
                "is_active": fields.get("Active", True),
                "slack_user_id": fields.get("Slack ID"),
                "calendly_user_uri": fields.get("Calendly URI")
            }


# Example usage and configuration notes:
"""
AIRTABLE SETUP GUIDE
====================

1. Get your Personal Access Token:
   - Go to https://airtable.com/create/tokens
   - Create a token with these scopes:
     - data.records:read
     - schema.bases:read
   - Add your base to the token's access

2. Get your Base ID:
   - Open your base in Airtable
   - Go to Help → API documentation
   - Base ID is in the URL: airtable.com/appXXXXXXXXXXXXXX/api

3. Configure your tables:

   CUSTOMERS TABLE should have these fields:
   - Email (primary key)
   - Account Manager (linked to AM table or text)
   - AM Email (rollup or formula)
   - Traffic Source (single select)
   - Acquisition Type (single select: PLG, SLG, Hybrid)
   - Industry (single select)
   - Company Size (single select)
   - Tags (multiple select)

   ACCOUNT MANAGERS TABLE should have:
   - Name
   - Email
   - Team (single select)
   - Active (checkbox)
   - Slack ID (text)
   - Calendly URI (URL)

4. Add to .env:
   AIRTABLE_API_KEY=pat...
   AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
   AIRTABLE_CUSTOMERS_TABLE=Customers
   AIRTABLE_AM_TABLE=Account Managers

5. Field mapping can be customized if your field names differ:

   client.get_customer_segmentation(
       field_mapping={
           "email": "Customer Email",  # Your actual field name
           "traffic_source": "Lead Source",
           "industry": "Vertical"
       }
   )
"""
