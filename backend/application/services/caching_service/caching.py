import os
import time
from cachetools import TTLCache
from azure.identity import ChainedTokenCredential, ManagedIdentityCredential, AzureCliCredential
from applicationinsights import TelemetryClient

from common.constants import Constants

from dotenv import load_dotenv
load_dotenv(r"apps\backend\credentials.env")


# In-Memory Cache
class Caching:
    token_cache = []
    token_cache_for_open_api = []

    def initialize_cache():
        if Caching.token_cache is None or len(Caching.token_cache) == 0:
            Caching.token_cache = TTLCache(maxsize=int(os.environ.get("CACHE_MAXSIZE", 1000)), ttl = Constants.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
        return Caching.token_cache
    def initialize_cache_for_open_api():
        if Caching.token_cache_for_open_api is None or len(Caching.token_cache_for_open_api) == 0:
            Caching.token_cache_for_open_api = TTLCache(maxsize=int(os.environ.get("CACHE_MAXSIZE", 1000)), ttl = Constants.OPEN_AI_TOKEN_EXPIRE_MINUTES * 60)
        return Caching.token_cache_for_open_api

    # Function to store token in cache
    def store_token_in_cache(user_id: str, token: str, caching_instance, telemetry_client, expires_on: int = None):
        if expires_on is not None:
            expiration_time = expires_on
        else:
            expiration_time = time.time() + (Constants.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
        
        caching_instance[user_id] = {"token": token, "expires": str(expiration_time)}
        telemetry_client.track_trace(f"Token stored in cache for user_id: {user_id}, expiry time: {expiration_time}", severity=1)

    # Function to retrieve and verify token from cache
    def verify_token_from_cache(user_id: str, telemetry_client: TelemetryClient, caching_instance):
        token_data = caching_instance.get(user_id)
        if token_data is not None:
            telemetry_client.track_trace(f"Token found in cache for user_id: {user_id}, expiry time: {token_data['expires'] }", severity=1)
        
        if not token_data or float(token_data["expires"]) < time.time():
            telemetry_client.track_trace(f"Token not found in cache or expired for user_id: {user_id}, expiry time: { token_data['expires'] if token_data else None }", severity=1)
            return None
        return token_data["token"]
    
    def handle_refresh_token_for_open_ai(user_id: str, telemetry_client: TelemetryClient, caching_instance_for_open_ai):
        token = Caching.verify_token_from_cache(user_id, telemetry_client, caching_instance_for_open_ai)
        if token is None:
            token = Caching.refresh_managed_identity(telemetry_client, caching_instance_for_open_ai)
        return token

    def refresh_managed_identity(telemetry_client: TelemetryClient, caching_instance_for_open_ai):
        managed_identity = int(os.environ.get("IS_MANAGED_IDENTITY_ENABLED"))
        
        if managed_identity == 1:
            ## Set up for AAD token access for OPEN AI Service
            credential = ChainedTokenCredential(
                ManagedIdentityCredential(),
                AzureCliCredential()
            )
            # Set the API type to `azure_ad`
            os.environ["OPENAI_API_TYPE"] = "azure_ad"
            # Set the API_KEY to the token from the Azure credential
            api_call = credential.get_token(os.environ["COGNITIVE_SERVICE_ENDPOINT"])
            Caching.store_token_in_cache("OPEN_AI_TOKEN", api_call.token, caching_instance_for_open_ai, telemetry_client, int(api_call.expires_on))
            telemetry_client.track_trace(f"Token refreshed for OPEN_AI_TOKEN, expires_on: {api_call.expires_on}", severity=1)

            return api_call.token
        else:
            # Set the API type to `openai`
            os.environ["OPENAI_API_TYPE"] = "openai"
            telemetry_client.track_trace("Managed Identity is not enabled, using default token", severity=1)
            return os.environ["AZURE_OPENAI_KEY"]