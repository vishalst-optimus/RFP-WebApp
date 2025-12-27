import os
import requests
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from application.services.logging_service.logging import telemetry_client

class SubscriptionCheckMiddleware(BaseHTTPMiddleware):
    """
    Global middleware to check subscription status for all API endpoints.
    """
    
    def __init__(self, app):
        super().__init__(app)
        # Endpoints that don't require subscription check
        self.exempt_paths = [
            "/api/v1/auth/debug",
            "/api/v1/auth/subscription-status",
            "/docs",
            "/redoc",
            "/openapi.json",
            "/favicon.ico"
        ]
        # Exact match paths for root
        self.exact_exempt_paths = ["/"]
        # Endpoints that should be checked for subscription
        self.protected_paths = [
            "/api/v1/rfp/",
        ]
    
    async def dispatch(self, request, call_next):
        print(f"🔍 MIDDLEWARE DEBUG: Processing {request.method} {request.url.path}")
        
        # Always allow OPTIONS requests (CORS preflight)
        if request.method == "OPTIONS":
            print(f"✅ MIDDLEWARE DEBUG: Allowing OPTIONS request (CORS preflight): {request.url.path}")
            return await call_next(request)
        
        # Check if path is exempt (using startswith)
        is_exempt = any(request.url.path.startswith(path) for path in self.exempt_paths)
        # Check if path is exactly root
        is_exact_exempt = request.url.path in self.exact_exempt_paths
        
        print(f"🔍 MIDDLEWARE DEBUG: Is exempt? {is_exempt or is_exact_exempt}")
        
        # Skip subscription check for exempt paths FIRST
        if is_exempt or is_exact_exempt:
            print(f"✅ MIDDLEWARE DEBUG: Allowing exempt path: {request.url.path}")
            return await call_next(request)
        
        # Check if this is a protected API path that requires subscription
        is_protected = any(request.url.path.startswith(path) for path in self.protected_paths)
        print(f"🔍 MIDDLEWARE DEBUG: Is protected? {is_protected}")
        
        if not is_protected:
            print(f"✅ MIDDLEWARE DEBUG: Allowing non-protected path: {request.url.path}")
            return await call_next(request)
        
        # Skip if authentication is disabled
        auth_enabled = os.getenv("ENABLE_AUTH", "false").lower()
        print(f"🔍 MIDDLEWARE DEBUG: ENABLE_AUTH = '{auth_enabled}'")
        if auth_enabled != "true":
            print(f"✅ MIDDLEWARE DEBUG: Auth disabled, allowing: {request.url.path}")
            return await call_next(request)
        
        print(f"🔒 MIDDLEWARE DEBUG: Starting subscription check for: {request.url.path}")
        
        try:
            # Extract user email from Authorization header
            auth_header = request.headers.get("Authorization")
            if not auth_header or not auth_header.startswith("Bearer "):
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Authentication required"}
                )
            
            # Validate token and extract user info
            from auth.token_validator import validate_token, extract_user_info
            token = auth_header.split(" ")[1]
            
            try:
                decoded_token = validate_token(token)
                user_info = extract_user_info(decoded_token)
                
                user_email = user_info.get("email")
                if not user_email:
                    return JSONResponse(
                        status_code=400,
                        content={"detail": "User email not found in token"}
                    )
                
                print(f"👤 MIDDLEWARE DEBUG: Validated user email: {user_email}")
                
            except Exception as e:
                return JSONResponse(
                    status_code=401,
                    content={"detail": f"Token validation failed: {str(e)}"}
                )
            
            # Check subscription status
            print(f"💳 MIDDLEWARE DEBUG: Checking subscription status for {user_email}")
            subscription_status = await check_subscription_status(user_email)
            print(f"📊 MIDDLEWARE DEBUG: Subscription API response: {subscription_status}")
            
            # Block access if no active subscription
            if not subscription_status.get("hasSubscription", False):
                print(f"❌ MIDDLEWARE DEBUG: No subscription found for {user_email}")
                telemetry_client.track_event("Middleware_Access_Denied_No_Subscription", {
                    "email": user_email,
                    "path": request.url.path,
                    "method": request.method
                })
                
                return JSONResponse(
                    status_code=403,
                    content={"detail": "notSubscribed"}
                )
            
            # Check for active subscriptions
            active_subscriptions = subscription_status.get("activeSubscriptions", 0)
            print(f"🔍 MIDDLEWARE DEBUG: Active subscriptions: {active_subscriptions}")
            if active_subscriptions == 0:
                print(f"❌ MIDDLEWARE DEBUG: No active subscriptions for {user_email}")
                telemetry_client.track_event("Middleware_Access_Denied_No_Active_Subscription", {
                    "email": user_email,
                    "path": request.url.path,
                    "method": request.method,
                    "total_subscriptions": subscription_status.get("totalSubscriptions", 0)
                })
                
                return JSONResponse(
                    status_code=403,
                    content={"detail": "notSubscribed"}
                )
            
            # User has valid subscription - proceed with request
            print(f"✅ MIDDLEWARE DEBUG: Access granted for {user_email} ({active_subscriptions} active subscriptions)")
            telemetry_client.track_event("Middleware_Access_Granted", {
                "email": user_email,
                "path": request.url.path,
                "method": request.method,
                "active_subscriptions": active_subscriptions
            })
            
            # Add subscription info to request state for use in endpoints
            request.state.subscription_status = subscription_status
            request.state.user_email = user_email
            
        except Exception as e:
            # Log error and block access for security
            telemetry_client.track_event("Middleware_Error", {
                "error": str(e),
                "path": request.url.path,
                "method": request.method
            })
            # Fail closed - block access when there's an error
            return JSONResponse(
                status_code=403,
                content={"detail": "Subscription verification failed"}
            )
        
        # Proceed to the actual endpoint
        return await call_next(request)

async def check_subscription_status(email: str) -> dict:
    """
    Check if user has an active subscription by calling the subscription API.
    
    Args:
        email: User's email address
    
    Returns:
        dict: Subscription status response
    """
    try:
        base_subscription_url = os.getenv("SUBSCRIPTION_API_URL")
        subscription_api_url = f"{base_subscription_url}?email={email}"
        
        print(f"🔍 MIDDLEWARE DEBUG: Calling subscription API: {subscription_api_url}")
        response = requests.get(subscription_api_url, timeout=30)
        print(f"📡 MIDDLEWARE DEBUG: API Response Status: {response.status_code}")
        response.raise_for_status()
        
        subscription_data = response.json()
        print(f"📊 MIDDLEWARE DEBUG: Raw API Response: {subscription_data}")
        
        # Log subscription check for telemetry
        telemetry_client.track_event("Subscription_Check", {
            "email": email,
            "has_subscription": subscription_data.get("hasSubscription", False),
            "active_subscriptions": subscription_data.get("activeSubscriptions", 0),
            "total_subscriptions": subscription_data.get("totalSubscriptions", 0)
        })
        
        return subscription_data
        
    except requests.exceptions.RequestException as e:
        # Log the error and fail closed for security
        telemetry_client.track_exception(e)
        telemetry_client.track_event("Subscription_Check_Failed", {
            "email": email,
            "error": str(e)
        })
        
        # Fail closed - block access when subscription API is unavailable
        return {
            "hasSubscription": False,
            "email": email,
            "error": "Subscription service unavailable - access denied"
        }
    except Exception as e:
        # Handle any other unexpected errors
        telemetry_client.track_exception(e)
        
        # Fail closed for security
        return {
            "hasSubscription": False,
            "email": email,
            "error": "Subscription check error - access denied"
        }