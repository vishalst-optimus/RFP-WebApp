import os
from fastapi.security.api_key import APIKeyHeader

from dotenv import load_dotenv
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env_path = os.path.join(root_dir, 'backend\credentials.env')
load_dotenv(r"apps\backend\credentials.env")

class Constants:
    
    ## Token Expiration Related for Caching ##
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES"))
    OPEN_AI_TOKEN_EXPIRE_MINUTES = int(os.environ.get("OPEN_AI_TOKEN_EXPIRE_MINUTES"))
    
    ## Streaming Related ##
    CHAT_HISTORY_FILTERING_LIMIT = int(os.environ.get("CHAT_HISTORY_FILTERING_LIMIT"))
    
    ## Cosmos DB Related ##
    COSMOS_DB_NAME = os.environ["AZURE_COSMOSDB_NAME"]
    COSMOS_DB_CHECKPOINTER_CONTAINER = os.environ["AZURE_COSMOSDB_CHECKPOINTER_CONTAINER"]
    
    ## Storage Container Related ##
    BLOB_SAS_TOKEN = os.environ.get('BLOB_SAS_TOKEN')
    
    ## RFP Section Types ##
    SECTION_TYPES = [
        "client_information",       # NEW - Auto-generated client section
        "executive_summary", 
        "rfp_questions_responses", 
        "technical_approach", 
        "company_overview", 
        "project_team", 
        "past_experience", 
        "timeline", 
        "pricing", 
        "technical_requirements",
        "submission_requirements", 
        "contract_terms",
        "compliance_requirements",
        "project_scope_details",
        "other"
    ]
    