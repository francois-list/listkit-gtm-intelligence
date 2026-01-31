"""
Base API client with common functionality for all data source clients.
"""

import time
from typing import Optional, Dict, Any, List
import httpx
from loguru import logger


class BaseClient:
    """
    Base class for all API clients.

    Provides common functionality:
    - HTTP request handling with retries
    - Rate limiting
    - Error handling
    - Pagination helpers
    """

    def __init__(self, api_key: str, base_url: str, rate_limit: int = 10):
        """
        Initialize base client.

        Args:
            api_key: API authentication key
            base_url: Base URL for API endpoints
            rate_limit: Maximum requests per second (default: 10)
        """
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.rate_limit = rate_limit
        self.last_request_time = 0.0

        # HTTP client with timeout
        self.client = httpx.Client(timeout=30.0)

    def _wait_for_rate_limit(self):
        """Implement rate limiting by waiting between requests."""
        if self.rate_limit <= 0:
            return

        min_interval = 1.0 / self.rate_limit
        elapsed = time.time() - self.last_request_time

        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)

        self.last_request_time = time.time()

    def _get_headers(self) -> Dict[str, str]:
        """
        Get headers for API requests.

        Override in subclass for custom authentication.
        """
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    def _request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """
        Make HTTP request with retry logic.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            params: Query parameters
            json_data: JSON request body
            max_retries: Maximum number of retry attempts

        Returns:
            JSON response data

        Raises:
            httpx.HTTPError: On request failure after retries
        """
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        headers = self._get_headers()

        for attempt in range(max_retries):
            try:
                self._wait_for_rate_limit()

                logger.debug(f"{method} {url}")

                response = self.client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    params=params,
                    json=json_data
                )

                # Handle rate limiting (429)
                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 60))
                    logger.warning(f"Rate limited. Waiting {retry_after}s before retry.")
                    time.sleep(retry_after)
                    continue

                response.raise_for_status()
                return response.json()

            except httpx.HTTPStatusError as e:
                logger.error(f"HTTP error on attempt {attempt + 1}/{max_retries}: {e}")

                if attempt == max_retries - 1:
                    raise

                # Exponential backoff
                wait_time = 2 ** attempt
                logger.info(f"Retrying in {wait_time}s...")
                time.sleep(wait_time)

            except httpx.RequestError as e:
                logger.error(f"Request error on attempt {attempt + 1}/{max_retries}: {e}")

                if attempt == max_retries - 1:
                    raise

                wait_time = 2 ** attempt
                logger.info(f"Retrying in {wait_time}s...")
                time.sleep(wait_time)

        raise Exception(f"Failed to {method} {url} after {max_retries} attempts")

    def get(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Make GET request."""
        return self._request("GET", endpoint, params=params)

    def post(
        self,
        endpoint: str,
        json_data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Make POST request."""
        return self._request("POST", endpoint, params=params, json_data=json_data)

    def put(
        self,
        endpoint: str,
        json_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Make PUT request."""
        return self._request("PUT", endpoint, json_data=json_data)

    def delete(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Make DELETE request."""
        return self._request("DELETE", endpoint, params=params)

    def close(self):
        """Close HTTP client."""
        self.client.close()

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
