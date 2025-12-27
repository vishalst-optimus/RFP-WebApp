import jwt
import requests
from typing import Dict, Optional
from datetime import datetime, timedelta
from jwt import PyJWKClient
from .config import config

# Cache for public keys
_jwks_client: Optional[PyJWKClient] = None
_cache_timestamp: Optional[datetime] = None

def get_jwks_client() -> PyJWKClient:
    """Get or create JWKS client with caching"""
    global _jwks_client, _cache_timestamp
    
    current_time = datetime.now()
    
    # Refresh cache if expired or not initialized
    if (_jwks_client is None or _cache_timestamp is None or 
        (current_time - _cache_timestamp).total_seconds() > config.CACHE_TIMEOUT):
        _jwks_client = PyJWKClient(config.JWKS_URI)
        _cache_timestamp = current_time
    
    return _jwks_client

def validate_token(token: str) -> Dict:
    """
    Validate JWT token from Azure AD (multi-tenant support)
    
    Args:
        token: JWT access token from Authorization header
        
    Returns:
        Decoded token claims including user info and tenant ID
        
    Raises:
        jwt.InvalidTokenError: If token is invalid
        jwt.ExpiredSignatureError: If token is expired
    """
    try:
        # First decode without verification to get tenant ID from issuer
        unverified = jwt.decode(token, options={"verify_signature": False})
        token_issuer = unverified.get("iss", "")
        token_tenant_id = unverified.get("tid", "")
        token_audience = unverified.get("aud", "")
        token_app_id = unverified.get("appid", "")
        token_roles = unverified.get("roles", [])
        
        print(f"🔍 Token issuer: {token_issuer}")
        print(f"🔍 Token tenant: {token_tenant_id}")
        print(f"🎯 Token audience: {token_audience}")
        print(f"🆔 Token appid: {token_app_id}")
        print(f"👥 Token roles from claims: {token_roles}")
        print(f"📋 Expected audience: {config.AUDIENCE}")
        
        # Determine token version from issuer
        is_v1_token = "sts.windows.net" in token_issuer
        is_v2_token = "login.microsoftonline.com" in token_issuer and "/v2.0" in token_issuer
        
        print(f"🏷️  Token version: {'v1.0' if is_v1_token else 'v2.0' if is_v2_token else 'unknown'}")
        
        # Always use the token's actual tenant ID for JWKS (supports both org and personal accounts)
        # Use v1.0 endpoint for v1.0 tokens, v2.0 for v2.0 tokens
        if is_v1_token:
            jwks_uri = f"https://login.microsoftonline.com/{token_tenant_id}/discovery/keys"
        else:
            jwks_uri = f"https://login.microsoftonline.com/{token_tenant_id}/discovery/v2.0/keys"
        
        print(f"🔑 Using JWKS URI: {jwks_uri}")
        jwks_client = PyJWKClient(jwks_uri)
        
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        
        # Azure AD v2.0 tokens may have audience as just client_id instead of api://client_id
        # Use the VALID_AUDIENCES from config which handles all formats
        valid_audiences = config.VALID_AUDIENCES
        
        print(f"✅ Accepted audiences: {valid_audiences}")
        
        # Decode and validate token - we'll manually check audience
        decoded = jwt.decode(
            token,
            signing_key.key,
            algorithms=config.ALGORITHMS,
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": False,  # We'll verify manually
                "verify_iss": False,  # We'll verify manually
            }
        )
        
        # Manually verify audience (accept either format)
        token_aud = decoded.get("aud")
        if token_aud not in valid_audiences:
            raise ValueError(f"Invalid token audience: {token_aud}. Expected one of: {valid_audiences}")
        
        # Manually verify issuer matches expected pattern (accept both v1 and v2)
        valid_issuer_patterns = [
            "https://login.microsoftonline.com/",
            "https://sts.windows.net/"
        ]
        if not any(token_issuer.startswith(pattern) for pattern in valid_issuer_patterns):
            raise ValueError(f"Invalid issuer: {token_issuer}")
        
        print(f"✅ Token validated for tenant: {token_tenant_id}")
        return decoded
        
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.InvalidAudienceError:
        raise ValueError("Invalid token audience")
    except jwt.InvalidIssuerError:
        raise ValueError("Invalid token issuer")
    except jwt.InvalidTokenError as e:
        raise ValueError(f"Invalid token: {str(e)}")
    except Exception as e:
        raise ValueError(f"Token validation failed: {str(e)}")

def extract_user_info(decoded_token: Dict) -> Dict:
    """
    Extract user information from decoded token
    
    Args:
        decoded_token: Decoded JWT claims
        
    Returns:
        Dictionary with user information including tenant ID and permissions
    """
    tenant_id = decoded_token.get("tid")
    
    # App-specific roles assigned in your app registration
    app_roles = decoded_token.get("roles", [])
    
    # Azure AD directory roles (wids = Well-known IDs for built-in directory roles)
    # These are the roles users have in THEIR OWN organization
    wids = decoded_token.get("wids", [])
    
    # Well-known Azure AD admin role IDs
    ADMIN_ROLE_IDS = {
        "62e90394-69f5-4237-9190-012177145e10": "Global Administrator",
        "194ae4cb-b126-40b2-bd5b-6091b380977d": "Security Administrator",
        "729827e3-9c14-49f7-bb1b-9608f156bbb8": "Helpdesk Administrator",
        "f28a1f50-f6e7-4571-818b-6a12f2af6b6c": "SharePoint Administrator",
        "fe930be7-5e62-47db-91af-98c3a49a38b1": "User Administrator",
    }
    
    # Print all relevant claims for debugging
    print(f"📋 All token claims: {list(decoded_token.keys())}")
    print(f"👤 App roles from 'roles' claim: {app_roles}")
    print(f"🆔 Directory role IDs from 'wids' claim: {wids}")
    print(f"🏢 Tenant ID: {tenant_id}")
    print(f"🔑 Token type (typ): {decoded_token.get('typ')}")
    print(f"🎫 Token version (ver): {decoded_token.get('ver')}")
    
    # Personal Microsoft account tenant ID
    PERSONAL_ACCOUNT_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad"
    
    # Detect personal account
    is_personal_account = tenant_id == PERSONAL_ACCOUNT_TENANT
    
    # Check if user has admin role in THEIR organization (via wids)
    # Global Administrator is the most common admin role
    is_tenant_admin = "62e90394-69f5-4237-9190-012177145e10" in wids  # Global Admin
    
    # Also check app-specific roles if configured
    is_app_admin = any(role.lower() == "admin" for role in app_roles)
    
    # User is admin if they're either a tenant admin OR have app-specific admin role
    is_admin = is_tenant_admin or is_app_admin
    
    # Log admin detection
    if wids:
        detected_roles = [ADMIN_ROLE_IDS.get(wid, wid) for wid in wids]
        print(f"👔 Detected directory roles: {detected_roles}")
    
    # Knowledge Base access: personal accounts OR admin users
    can_access_knowledge_base = is_personal_account or is_admin
    
    print(f"🔐 Is personal account: {is_personal_account}")
    print(f"👔 Is tenant admin (via wids): {is_tenant_admin}")
    print(f"📱 Is app admin (via roles): {is_app_admin}")
    print(f"⭐ Is admin (combined): {is_admin}")
    print(f"🎯 Can access Knowledge Base: {can_access_knowledge_base}")
    
    return {
        "user_id": decoded_token.get("oid"),  # Object ID (unique user ID)
        "email": decoded_token.get("preferred_username") or decoded_token.get("email"),
        "name": decoded_token.get("name"),
        "tenant_id": tenant_id,  # Tenant ID (organization ID)
        "roles": app_roles,  # App-specific roles
        "directory_roles": wids,  # Azure AD directory role IDs
        "scopes": decoded_token.get("scp", "").split() if decoded_token.get("scp") else [],
        "is_personal_account": is_personal_account,
        "is_admin": is_admin,
        "can_access_knowledge_base": can_access_knowledge_base
    }
