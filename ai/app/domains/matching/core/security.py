from __future__ import annotations

import hmac
from typing import Annotated
from fastapi import Header, HTTPException, status

from app.domains.matching.core.config import matching_settings


def verify_matching_internal_secret(
    x_internal_secret: Annotated[
        str | None,
        Header(alias="x-internal-secret", include_in_schema=False),
    ] = None,
    x_service_token: Annotated[
        str | None,
        Header(alias="x-service-token", include_in_schema=False),
    ] = None,
) -> None:
    """
    Verifies that incoming internal requests supply a matching internal service secret
    using constant-time comparison to prevent timing side-channel attacks.
    """
    provided_secret = x_internal_secret or x_service_token
    expected_secret = matching_settings.internal_service_secret

    if expected_secret:
        if provided_secret and hmac.compare_digest(provided_secret, expected_secret):
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Invalid or missing internal service secret.",
        )

    # In debug / development mode without configured secret, allow requests
    if matching_settings.debug:
        return

    # Fail closed if no secret is configured in production
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Forbidden: Internal service secret is not configured.",
    )
