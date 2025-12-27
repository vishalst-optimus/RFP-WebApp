"""
Authentication Service
Handles authentication-related helper functions including subscription checking.
"""
import os
from fastapi import HTTPException, status, Depends
from auth.dependencies import get_current_user
from infrastructure.middlewares.subscription_check_middleware import check_subscription_status
from application.services.logging_service.logging import telemetry_client


async def get_subscribed_user(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """
    FastAPI dependency that checks both authentication and subscription status.
    
    Raises HTTPException with "notSubscribed" if user doesn't have active subscription.
    Returns user info if both auth and subscription are valid.
    
    Usage:
        @app.post("/api/endpoint")
        async def endpoint(user: dict = Depends(get_subscribed_user)):
            # User is both authenticated and subscribed
            user_email = user["email"]
    """
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    
    user_email = current_user.get("email")
    if not user_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User email not found in token"
        )
    
    # Check subscription status
    subscription_status = await check_subscription_status(user_email)
    
    print("Subscription Status:", subscription_status)

    # If user doesn't have active subscription, return specific error
    if not subscription_status.get("hasSubscription", False):
        telemetry_client.track_event("Access_Denied_No_Subscription", {
            "email": user_email,
            "message": subscription_status.get("message", "No subscription found")
        })
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="notSubscribed"
        )
    
    # Check for active subscriptions (extra validation)
    active_subscriptions = subscription_status.get("activeSubscriptions", 0)
    if active_subscriptions == 0:
        telemetry_client.track_event("Access_Denied_No_Active_Subscription", {
            "email": user_email,
            "total_subscriptions": subscription_status.get("totalSubscriptions", 0),
            "active_subscriptions": active_subscriptions
        })
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="notSubscribed"
        )
    
    # User is both authenticated and has active subscription
    telemetry_client.track_event("Access_Granted_Subscribed_User", {
        "email": user_email,
        "active_subscriptions": active_subscriptions,
        "total_subscriptions": subscription_status.get("totalSubscriptions", 0)
    })
    
    # Add subscription info to user context
    current_user["subscription_status"] = subscription_status
    
    return current_user


def extract_user_info(current_user: dict) -> tuple[str, str, str, str]:
    """
    Extract user information from the authenticated token.
    Returns (tenant_id, user_email, user_name, user_id).
    """
    if current_user:
        if current_user.get("tenant_id") == "9188040d-6c67-4c5b-b112-36a304b66dad":
            tenant_id = current_user.get("user_id")
        else:
            tenant_id = current_user.get("tenant_id")
        user_email = current_user.get("email")
        user_name = current_user.get("name")
        user_id = current_user.get("user_id")
    else:
        # Default values when authentication is disabled
        tenant_id = "local-dev"
        user_email = "dev@local.test"
        user_name = "Local Developer"
        user_id = "local-dev-user"
    
    return tenant_id, user_email, user_name, user_id


def get_current_user_if_auth_enabled():
    """
    Returns get_current_user dependency if auth is enabled, otherwise returns None.
    """
    if os.getenv("ENABLE_AUTH", "true").lower() == "true":
        return Depends(get_current_user)
    else:
        return None