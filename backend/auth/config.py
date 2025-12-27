import os
from pathlib import Path
from dotenv import load_dotenv

# Load credentials.env from the backend directory
backend_dir = Path(__file__).parent.parent
env_path = backend_dir / "credentials.env"
load_dotenv(env_path)

class AzureADConfig:
    """Configuration for Azure AD authentication"""
    
    TENANT_ID = os.getenv("AZURE_AD_TENANT_ID", "common")
    CLIENT_ID = os.getenv("AZURE_AD_CLIENT_ID", "")
    
    # Build AUDIENCE with fallback
    _audience_env = os.getenv("AZURE_AD_AUDIENCE", "")
    if _audience_env:
        AUDIENCE = _audience_env
    elif CLIENT_ID:
        AUDIENCE = f"api://{CLIENT_ID}"
    else:
        AUDIENCE = "api://"
    
    # Accept multiple audience formats for validation
    VALID_AUDIENCES = [
        AUDIENCE,  # api://d0f18278-e40b-4547-8da0-7992d2b22b70
        CLIENT_ID,  # d0f18278-e40b-4547-8da0-7992d2b22b70 (direct client ID)
    ]
    if CLIENT_ID and not AUDIENCE.startswith("api://"):
        VALID_AUDIENCES.append(f"api://{CLIENT_ID}")  # Ensure api:// version is included
    
    # Remove empty strings
    VALID_AUDIENCES = [aud for aud in VALID_AUDIENCES if aud and aud != "api://"]
    
    # Azure AD endpoints
    AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
    JWKS_URI = f"{AUTHORITY}/discovery/v2.0/keys"
    ISSUER = f"https://login.microsoftonline.com/{TENANT_ID}/v2.0"
    
    # Token validation settings
    ALGORITHMS = ["RS256"]
    CACHE_TIMEOUT = 86400  # 24 hours for public keys cache

config = AzureADConfig()

# Log configuration on startup
print("=" * 60)
print("🔐 Azure AD Authentication Configuration")
print("=" * 60)
print(f"📂 Env file: {env_path}")
print(f"📂 Env file exists: {env_path.exists()}")
print(f"🔑 CLIENT_ID: {config.CLIENT_ID[:20]}..." if config.CLIENT_ID else "🔑 CLIENT_ID: NOT SET")
print(f"🏢 TENANT_ID: {config.TENANT_ID}")
print(f"🎯 AUDIENCE: {config.AUDIENCE}")
print(f"✅ VALID_AUDIENCES: {config.VALID_AUDIENCES}")
print(f"🔗 JWKS_URI: {config.JWKS_URI}")
print(f"✅ ISSUER: {config.ISSUER}")
print("=" * 60)
