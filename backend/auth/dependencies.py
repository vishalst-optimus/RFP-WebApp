from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Dict
from .token_validator import validate_token, extract_user_info

# HTTP Bearer token scheme
security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict:
    """
    FastAPI dependency to validate token and extract user information
    
    Usage:
        @app.post("/api/endpoint")
        async def endpoint(current_user: dict = Depends(get_current_user)):
            user_email = current_user["email"]
            tenant_id = current_user["tenant_id"]  # None for personal accounts
            
    Returns:
        Dictionary with user information:
        - user_id: Unique user identifier (oid)
        - email: User email address
        - name: User display name
        - tenant_id: Organization/tenant ID (None for personal Microsoft accounts)
        - roles: List of assigned roles
        - scopes: List of granted scopes
    """
    try:
        # Extract token from Authorization header
        token = credentials.credentials
        
        # Validate token and get claims
        decoded_token = validate_token(token)
        
        # Extract user information
        user_info = extract_user_info(decoded_token)
        
        print("User Info Extracted:", user_info)

        return user_info
        
    except ValueError as e:
        print(f"❌ Token validation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        print(f"❌ Authentication error: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
