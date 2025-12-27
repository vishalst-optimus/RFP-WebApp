from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, Body, Request, APIRouter, Header
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import Enum
from starlette.responses import StreamingResponse
from core.models.conversation_api import InputRequest
from application.services.langgraph_services.streaming import Streaming
from application.services.caching_service.caching import Caching
from application.services.logging_service.logging import telemetry_client
from application.services.langgraph_services.workflow_service import WorkflowService
import time
import datetime
from datetime import timezone, timedelta
import os
import requests
import json
from auth.dependencies import get_current_user
from typing import Dict, List, Optional
from docx import Document
from docx.shared import Pt
import asyncio
from bs4 import BeautifulSoup
import markdown
from core.models.schemas import RFPAnalysisResponse, SectionType, RFPRequest
from infrastructure.tools.tool_definations.knowledge_base_tool import KnowledgeBaseSearchTool, CustomAzureSearchRetriever
from openai import AzureOpenAI
from pydantic import BaseModel, Field
from infrastructure.tools.docx_generator import create_docx_from_sections
from application.services.blob_service.azure_blob_service import(
    get_blob_service_client,
    close_blob_service_client,
    get_container_client,
    validate_file_async,
    container_exists_async,
    create_container_async,
    process_single_file_upload_with_path
)
from infrastructure.tools.document_analysis_tool import analyze_document_with_mistral, extract_keywords_from_content
from infrastructure.utility.analyse_rfp import generate_sections_with_llm, create_structured_response_sections_with_toc, format_toc_for_display
import io
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from infrastructure.middlewares.subscription_check_middleware import SubscriptionCheckMiddleware, check_subscription_status

# Environment variables
INDEX_NAME = os.getenv("INDEX_NAME")
CONTAINER_NAME = os.getenv("BLOB_CONTAINER_NAME")

load_dotenv(r"apps\backend\credentials.env")
app = FastAPI()

# Create router for API endpoints
router = APIRouter()

# Azure OpenAI client setup
client_section_data_populate = AzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_KEY"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Add the subscription check middleware
# app.add_middleware(SubscriptionCheckMiddleware)

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

def clean_section_name(section_name: str) -> str:
    """
    Clean section name by removing numbering prefixes, bullets, and formatting artifacts.
    Handles patterns like: 3.2 Demo Section -> Demo Section
    """
    import re
    
    # Remove complex numbering patterns at the beginning - only if followed by space or dot
    cleaned = re.sub(r'^\d+(?:\.\d+)*\.?\s+', '', section_name)  # Remove "3.2 ", "1.1.1 ", etc.
    
    # Remove single letter numbering only if followed by dot and space (like "A. ", "B. ")
    # This prevents removing valid first letters of words
    cleaned = re.sub(r'^[A-Za-z]\.\s+', '', cleaned)  # Remove "A. ", "B. " but not "Cover" or "Table"
    
    # Remove Chapter/Section/Part prefixes
    cleaned = re.sub(r'^(?:Chapter|Section|Part)\s+\d+(?:\.\d+)*:?\s*', '', cleaned, flags=re.IGNORECASE)
    
    # Remove bullet points and list markers at the start
    cleaned = re.sub(r'^\s*[\•\-\*o]\s+', '', cleaned)
    
    # Remove trailing dots and artifacts
    cleaned = re.sub(r'\.+$', '', cleaned)
    cleaned = re.sub(r'\s*\(\d+\s*points?\).*$', '', cleaned)  # Remove point values
    
    # Clean up whitespace
    cleaned = cleaned.strip()
    
    return cleaned

def extract_from_document_index(adi_result_object) -> List[str]:
    """
    Extract sections from the document's own index/table of contents if available.
    Returns list of section names or empty list if no index found.
    """
    print("🔍 Scanning document structure for index/table of contents...")
    
    if not hasattr(adi_result_object, 'paragraphs'):
        print("❌ No paragraphs available in document object")
        return []
    
    sections = []
    in_index_section = False
    index_indicators = [
        'table of contents',
        'contents',
        'index',
        'table of content',
        'section index',
        'document outline'
    ]
    
    # Keywords that indicate we're still in table of contents
    toc_continuation_indicators = [
        'page', 'section', 'chapter', 'part', 'appendix'
    ]
    
    # Track if we've found an index section
    found_index = False
    consecutive_page_numbers = 0
    
    for i, paragraph in enumerate(adi_result_object.paragraphs):
        if not hasattr(paragraph, 'content') or not paragraph.content:
            continue
            
        content = paragraph.content.strip()
        content_lower = content.lower()
        
        # Check if this looks like a table of contents header
        if any(indicator in content_lower for indicator in index_indicators):
            in_index_section = True
            found_index = True
            consecutive_page_numbers = 0
            print(f"📋 Found index section: {content}")
            continue
            
        # If we're in index section, extract section names
        if in_index_section and content:
            import re
            
            # Skip obvious headers and page references
            if (content_lower.startswith(('page', 'section', 'chapter')) and 
                len(content.split()) <= 3):
                continue
                
            # Look for patterns that indicate TOC entries:
            # "Section Name ..................... 15"
            # "1. Section Name .................. 15" 
            # "Chapter 1: Section Name .......... 15"
            
            # Remove page number patterns at the end
            cleaned_content = re.sub(r'\.{3,}\s*\d+\s*$', '', content)  # Remove dots and page numbers
            cleaned_content = re.sub(r'\s+\d+\s*$', '', cleaned_content)  # Remove trailing page numbers
            cleaned_content = re.sub(r'\s*\.\.\.\s*$', '', cleaned_content)  # Remove trailing dots
            cleaned_content = cleaned_content.strip()
            
            # Extract section name from numbered entries - handles complex numbering like 3.2, 1.1.1, etc.
            section_match = re.match(r'^(?:\d+(?:\.\d+)*\.?\s*|[A-Z](?:\.\d+)*\.?\s*|Chapter\s+\d+(?:\.\d+)*:?\s*|Section\s+\d+(?:\.\d+)*:?\s*|Part\s+[IVX]+:?\s*)?(.+)$', 
                                   cleaned_content, re.IGNORECASE)
            
            if section_match:
                section_name = section_match.group(1).strip()
                
                # Use the clean_section_name helper function
                section_name = clean_section_name(section_name)
                
                # Additional filtering to exclude headers and format indicators
                exclude_headers = [
                    'proposal format', 'submission requirements', 'response format',
                    'proposal structure', 'submission guidelines', 'table of contents',
                    'contents', 'index', 'instructions to bidders', 'instructions to proposers',
                    'evaluation criteria', 'proposal evaluation', 'submission format'
                ]
                
                # Filter out obvious non-sections
                if (len(section_name) > 3 and 
                    len(section_name) < 100 and
                    section_name not in sections and
                    not section_name.lower().startswith(('page', 'continued', 'end of', 'table of')) and
                    not any(header in section_name.lower() for header in exclude_headers) and
                    not re.match(r'^\d+$', section_name) and  # Not just a number
                    section_name != content):  # Avoid duplicates
                    
                    sections.append(section_name)
                    print(f"   ✅ Added from index: {section_name}")
                    consecutive_page_numbers = 0
            
            # Check if we're seeing too many page numbers (might have left TOC)
            if re.match(r'^\d+$', content.strip()):
                consecutive_page_numbers += 1
                if consecutive_page_numbers > 3:
                    print("🚪 Exiting index section - too many consecutive page numbers")
                    break
            else:
                consecutive_page_numbers = 0
                
            # Exit conditions for leaving TOC
            if (len(content) > 200 or  # Very long content usually not TOC
                (not any(indicator in content_lower for indicator in toc_continuation_indicators) and 
                 len(content.split()) > 10 and
                 not '.' in content[-20:])):  # No dots or page refs at end
                
                # Check if next few paragraphs look like regular content
                next_paragraphs_content = True
                for j in range(i + 1, min(i + 4, len(adi_result_object.paragraphs))):
                    if hasattr(adi_result_object.paragraphs[j], 'content'):
                        next_content = adi_result_object.paragraphs[j].content.strip()
                        if (len(next_content) > 50 and 
                            not any(ind in next_content.lower() for ind in toc_continuation_indicators)):
                            print("🚪 Exiting index section - reached main content")
                            in_index_section = False
                            break
    
    if found_index and sections:
        print(f"✅ Successfully extracted {len(sections)} sections from document index")
        return sections
    elif found_index and not sections:
        print("⚠️ Found index section but could not extract section names")
        return []
    else:
        print("❌ No table of contents/index found in document")
        return []

async def extract_all_rfp_sections_generic(document_content: str) -> List[str]:
    """
    Generic RFP section extraction that searches for proposal format requirements within document content.
    Does NOT rely on table of contents or index pages - searches actual content.
    """
    try:
        endpoint = os.environ["AZURE_OPENAI_ENDPOINT"]
        key = os.environ["AZURE_OPENAI_KEY"]
        deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4")
        api_version = "2024-10-21"
        
        # Enhanced content-based extraction prompt
        extraction_prompt = f"""You are an expert document analyzer. Your task is to find proposal format requirements within the document content itself, NOT from table of contents or index pages.

DOCUMENT CONTENT TO ANALYZE:
{document_content[:30000]}

SEARCH STRATEGY:
1. Look for sections with headings like:
   - "Proposal Format"
   - "Submission Requirements" 
   - "Response Format"
   - "Proposal Structure"
   - "Submission Guidelines"
   - "Instructions to Bidders/Proposers"
   - "Evaluation Criteria" (often lists what sections will be evaluated)

2. Within those sections, find lists that specify what vendors must include in their proposals

3. IGNORE:
   - Table of contents or index pages with page numbers
   - Document navigation structures
   - Project work breakdown or deliverables
   - Technical specifications or requirements (focus on PROPOSAL ORGANIZATION)

4. EXTRACT section names that describe how to organize the PROPOSAL DOCUMENT, such as:
   ✅ "Cover Letter" 
   ✅ "Company Overview"
   ✅ "Technical Approach"
   ✅ "Project Plan"
   ✅ "Pricing Schedule"
   ✅ "References"

5. Use EXACT wording from the document BUT remove any numbering prefixes (like "3.2", "1.", "A.", etc.)
   ❌ "3.2 Demo Section" should be extracted as "Demo Section"
   ❌ "1.1.1 Technical Approach" should be extracted as "Technical Approach"
   ✅ Return clean section names without numbering

SEARCH PATTERNS TO LOOK FOR:
- "Your proposal must include:"
- "Proposals should contain the following:"
- "The submission must include:"
- "Required proposal sections:"
- "Organize your response as follows:"
- "Proposal format requirements:"
- Lists following phrases like "Submit the following information:"

CRITICAL: Search the CONTENT of the document for these patterns, not just headers or indices.

Return JSON with found sections:
{{
  "found_sections": [
    "Section Name 1",
    "Section Name 2"
  ],
  "source_context": "Brief description of where these were found (e.g., 'Found in Proposal Format section on page X')",
  "search_success": true/false
}}

If no proposal format requirements are found in the content, return:
{{
  "found_sections": [],
  "source_context": "No proposal format requirements found in document content",
  "search_success": false
}}"""

        messages = [{"role": "user", "content": extraction_prompt}]
        
        url = f"{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={api_version}"
        headers = {"api-key": key, "Content-Type": "application/json"}
        payload = {
            "messages": messages,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "max_tokens": 2000
        }
        
        print("🔍 Searching document content for proposal format requirements...")
        response = requests.post(url, json=payload, headers=headers, timeout=60)
        
        if response.status_code == 200:
            result = response.json()
            content = result["choices"][0]["message"]["content"]
            
            try:
                data = json.loads(content)
                sections = data.get('found_sections', [])
                source_context = data.get('source_context', 'Unknown source')
                search_success = data.get('search_success', False)
                
                # Clean section names to remove numbering prefixes
                if sections:
                    cleaned_sections = []
                    for section in sections:
                        cleaned_section = clean_section_name(section)
                        if cleaned_section and cleaned_section not in cleaned_sections:
                            cleaned_sections.append(cleaned_section)
                    sections = cleaned_sections
                
                print(f"📋 Content-based extraction results:")
                print(f"   🎯 Search successful: {search_success}")
                print(f"   📍 Source: {source_context}")
                print(f"   📋 Sections found: {len(sections)}")
                
                if sections:
                    for i, section in enumerate(sections):
                        print(f"      {i+1}. {section}")
                else:
                    print("   ❌ No sections found in document content")
                
                if search_success and sections:
                    return sections
                else:
                    print("🔄 No content-based sections found, trying pattern-based extraction...")
                    return await pattern_based_extraction(document_content)
                
            except json.JSONDecodeError as e:
                print(f"❌ JSON parse error: {e}")
                return await pattern_based_extraction(document_content)
                
        else:
            print(f"❌ API error: {response.status_code}")
            return await pattern_based_extraction(document_content)
            
    except Exception as e:
        print(f"❌ Error in content extraction: {e}")
        return await pattern_based_extraction(document_content)

async def pattern_based_extraction(document_content: str) -> List[str]:
    """
    Fallback extraction using text patterns when LLM content search fails.
    """
    print("🔄 Using pattern-based extraction...")
    
    sections = []
    lines = document_content.split('\n')
    
    # Keywords that indicate we're in a proposal format section
    proposal_format_indicators = [
        'proposal format',
        'submission requirements',
        'response format', 
        'proposal structure',
        'submission guidelines',
        'instructions to bidders',
        'instructions to proposers',
        'evaluation criteria',
        'proposal evaluation',
        'submission format',
        'required proposal',
        'proposal organization'
    ]
    
    # Phrases that indicate section lists
    section_list_indicators = [
        'proposal must include',
        'proposal should contain',
        'submission must include',
        'response must include',
        'your proposal should include',
        'submit the following',
        'provide the following',
        'include the following',
        'organize your response',
        'required sections',
        'proposal sections'
    ]
    
    # Words to exclude (project work, not proposal structure)
    exclude_terms = [
        'design', 'installation', 'testing', 'programming', 'mapping', 
        'removal', 'licensing', 'training', 'implementation', 'deployment',
        'maintenance', 'support', 'monitoring', 'configuration'
    ]
    
    in_proposal_section = False
    in_section_list = False
    proposal_section_depth = 0
    
    for i, line in enumerate(lines):
        line_stripped = line.strip()
        line_lower = line_stripped.lower()
        
        # Check if we're entering a proposal format section
        if any(indicator in line_lower for indicator in proposal_format_indicators):
            in_proposal_section = True
            proposal_section_depth = 0
            print(f"📋 Found proposal format section: {line_stripped}")
            continue
            
        # Check if we're entering a section list within proposal format
        if in_proposal_section and any(indicator in line_lower for indicator in section_list_indicators):
            in_section_list = True
            print(f"📝 Found section list indicator: {line_stripped}")
            continue
            
        # Exit proposal section if we hit a major new section
        if (line_stripped.startswith(('PART ', 'SECTION ', 'CHAPTER ')) or
            (len(line_stripped) > 0 and line_stripped.isupper() and len(line_stripped) < 50)):
            if in_proposal_section:
                proposal_section_depth += 1
                if proposal_section_depth > 2:  # Allow some depth before exiting
                    in_proposal_section = False
                    in_section_list = False
                    print(f"🚪 Exiting proposal section at: {line_stripped}")
            
        # Extract sections if we're in the right context
        if in_section_list and line_stripped:
            import re
            
            # Look for numbered or bulleted items - handles complex numbering like 3.2, 1.1.1, etc.
            patterns = [
                r'^\d+(?:\.\d+)*\.?\s*(.+)$',    # 1. Section Name, 3.2 Section Name, 1.1.1 Section Name
                r'^[a-zA-Z](?:\.\d+)*\.?\s*(.+)$', # a. Section Name, A.1 Section Name
                r'^\•\s*(.+)$',                 # • Section Name
                r'^\-\s*(.+)$',                 # - Section Name
                r'^\*\s*(.+)$',                 # * Section Name
                r'^o\s*(.+)$',                  # o Section Name
            ]
            
            for pattern in patterns:
                match = re.match(pattern, line_stripped)
                if match:
                    section_name = match.group(1).strip()
                    
                    # Use the clean_section_name helper function
                    section_name = clean_section_name(section_name)
                    
                    # Filter out obvious non-sections
                    if (len(section_name) > 3 and 
                        len(section_name) < 100 and
                        section_name not in sections and
                        not section_name.lower().startswith('page') and
                        not any(exclude in section_name.lower() for exclude in exclude_terms) and
                        not re.match(r'^\d+$', section_name)):  # Not just a number
                        
                        sections.append(section_name)
                        print(f"   ✅ Added: {section_name}")
                    break
    
    # If no sections found, try to extract from evaluation criteria
    if not sections:
        print("🔍 Trying evaluation criteria extraction...")
        sections = extract_from_evaluation_sections(lines)
    
    # Final fallback only if absolutely nothing found
    if not sections:
        print("⚠️ Using minimal fallback sections")
        sections = [
            "Cover Letter",
            "Company Overview", 
            "Technical Approach",
            "Pricing Information"
        ]
    
    print(f"📊 Pattern extraction found {len(sections)} sections")
    return sections

def extract_from_evaluation_sections(lines: List[str]) -> List[str]:
    """
    Extract proposal sections from evaluation criteria sections.
    """
    sections = []
    in_evaluation = False
    
    evaluation_indicators = [
        'evaluation criteria',
        'scoring criteria', 
        'proposal evaluation',
        'evaluation factors',
        'selection criteria'
    ]
    
    for line in lines:
        line_lower = line.lower().strip()
        
        # Look for evaluation sections
        if any(indicator in line_lower for indicator in evaluation_indicators):
            in_evaluation = True
            print(f"📊 Found evaluation section: {line.strip()}")
            continue
            
        # Exit if we hit a new major section
        if line.strip().startswith(('PART ', 'SECTION ', 'CHAPTER ')):
            in_evaluation = False
            continue
            
        if in_evaluation and line.strip():
            # Look for sections mentioned in evaluation context
            import re
            
            # Common proposal section terms in evaluation contexts
            section_terms = [
                'cover letter', 'executive summary', 'company overview', 'company profile',
                'technical approach', 'methodology', 'project plan', 'implementation',
                'pricing', 'cost', 'budget', 'schedule', 'timeline', 
                'experience', 'qualifications', 'references', 'past performance',
                'team', 'personnel', 'staffing', 'capabilities'
            ]
            
            for term in section_terms:
                if term in line_lower and term not in [s.lower() for s in sections]:
                    # Convert to proper title case
                    section_name = ' '.join(word.capitalize() for word in term.split())
                    if section_name not in sections:
                        sections.append(section_name)
                        print(f"   ✅ Added from evaluation: {section_name}")
    
    return sections

def is_table_of_contents_section(section_name: str) -> bool:
    """
    Conservative check for TOC sections in populate endpoint.
    Only matches very specific, exact TOC titles to avoid false positives.
    """
    import re
    
    # Remove existing numbers from section title
    pattern = r'^\d+(\.\d+)*\s*\.*\s*'
    clean_title = re.sub(pattern, '', section_name.strip()).lower().strip()
    
    # Only exact matches for very specific TOC titles
    exact_toc_titles = [
        'table of contents',
        'table of content',
        'contents',
        'index'
    ]
    
    # Only skip if it's exactly one of these titles
    return clean_title in exact_toc_titles

# Pacific Time (PST/PDT) - UTC-8 (PST) or UTC-7 (PDT)
def get_pacific_time():
    """Get current time in Pacific Time (PST/PDT)"""
    # Pacific Time: UTC-8 in winter (PST), UTC-7 in summer (PDT)
    # We'll use a simple approximation - typically PDT from March to November
    utc_now = datetime.datetime.utcnow()
    
    # Determine if it's daylight saving time (approximate)
    # PDT typically runs from 2nd Sunday in March to 1st Sunday in November
    year = utc_now.year
    
    # 2nd Sunday in March
    march_dst_start = datetime.datetime(year, 3, 8)
    while march_dst_start.weekday() != 6:  # 6 = Sunday
        march_dst_start += timedelta(days=1)
    
    # 1st Sunday in November  
    nov_dst_end = datetime.datetime(year, 11, 1)
    while nov_dst_end.weekday() != 6:  # 6 = Sunday
        nov_dst_end += timedelta(days=1)
    
    # Check if current date is in PDT period
    if march_dst_start <= utc_now.replace(hour=0, minute=0, second=0, microsecond=0) < nov_dst_end:
        # PDT: UTC-7
        pacific_time = utc_now - timedelta(hours=7)
        timezone_suffix = " PDT"
    else:
        # PST: UTC-8
        pacific_time = utc_now - timedelta(hours=8)
        timezone_suffix = " PST"
    
    return pacific_time, timezone_suffix

# In-memory cache
caching_instance = Caching.initialize_cache()
caching_instance_for_open_api = Caching.initialize_cache_for_open_api()

# Debug endpoint to check token information
@app.get("/api/v1/auth/debug")
async def debug_token(current_user: dict = Depends(get_current_user) if os.getenv("ENABLE_AUTH", "true").lower() == "true" else None):
    """
    Debug endpoint to inspect the authenticated user's token information.
    This helps verify if admin consent is granted and API permissions are correct.
    """
    from auth.config import config
    
    if current_user is None:
        return {"detail": "Authentication is disabled."}
    
    return {
        "message": "✅ Token is valid and authenticated successfully!",
        "user_info": {
            "user_id": current_user.get("user_id"),
            "email": current_user.get("email"),
            "name": current_user.get("name"),
            "tenant_id": current_user.get("tenant_id"),
        },
        "token_permissions": {
            "roles": current_user.get("roles", []),
            "scopes": current_user.get("scopes", []),
        },
        "expected_config": {
            "expected_audience": config.AUDIENCE,
            "expected_client_id": config.CLIENT_ID,
            "tenant_mode": config.TENANT_ID,
        },
        "validation_checks": {
            "has_api_scope": any("access_as_user" in scope.lower() for scope in current_user.get("scopes", [])),
            "has_roles": len(current_user.get("roles", [])) > 0,
            "tenant_identified": current_user.get("tenant_id") is not None,
        }
    }

@router.post("/api/v1/rfp/analyze")
async def analyze_rfp(
    session_id: str = Form(...),
    file: UploadFile = File(...),
    rfp_name: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user) if os.getenv("ENABLE_AUTH", "true").lower() == "true" else None
):
    """
    RFP Analysis Endpoint - Extract content and identify sections that need responses
    
    Flow:
    1. Extract document content using Mistral Document AI (fallback: Azure Document Intelligence)
    2. Determine table of contents
    3. Identify valid sections that need RFP responses
    4. Populate those sections with existing content
    5. Return structured data to frontend
    """

    print("RFP_NAME: ------------------", rfp_name)

    # Extract user info from validated token (or use defaults if auth disabled)
    if current_user:
        tenant_id = current_user.get("tenant_id")
        user_email = current_user.get("email")
        user_name = current_user.get("name")
    else:
        # Default values when authentication is disabled
        tenant_id = "local-dev"
        user_email = "dev@local.test"
        user_name = "Local Developer"
    
    print(f"🔐 Authenticated user: {user_name} <{user_email}> (Tenant: {tenant_id})")

    # Log authentication info
    org_info = f"Organization: {tenant_id}" if tenant_id else "Personal Account"
    print(f"User: {user_name} <{user_email}>, {org_info}")

    start_time = time.time()

    try:
        # --- Step 0: Read uploaded file ---
        file_content = await file.read()
        file_name = file.filename
        telemetry_client.track_trace(f"Starting RFP analysis for: {file_name}", severity=1)

        # --- Step 1: Extract document content ---
        try:
            print("Extracting document content using Mistral Document AI...")
            adi_result_object = await analyze_document_with_mistral(file_content, file_name)
        except Exception as mistral_err:
            print(f"Mistral Document AI failed: {mistral_err}, falling back to Azure Document Intelligence...")
            from infrastructure.tools.tool_definations.rfp_analyzer_tool import RfpAnalyzerTool
            analyzer = RfpAnalyzerTool(
                azure_docint_endpoint=os.environ["AZURE_DOCINT_ENDPOINT"],
                azure_docint_key=os.environ["AZURE_DOCINT_KEY"],
                azure_openai_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
                azure_openai_key=os.environ["AZURE_OPENAI_KEY"],
                telemetry_client=telemetry_client
            )
            adi_result_object = await analyzer.analyze_document_full(file_content)

        if hasattr(adi_result_object, 'error') and adi_result_object.error:
            raise HTTPException(status_code=500, detail=adi_result_object.error)

        full_document_content = adi_result_object.content

        # --- Step 2: Extract sections (prioritize document index, then content search) ---
        print("🔍 STEP 1: Looking for document index/table of contents...")
        
        # Try to extract from document's own index/TOC first
        document_index_sections = extract_from_document_index(adi_result_object)
        
        if document_index_sections:
            print("✅ DOCUMENT INDEX FOUND!")
            extracted_sections = document_index_sections
            print(f"📋 INDEX SECTIONS ({len(extracted_sections)}):")
            for i, section in enumerate(extracted_sections):
                print(f"  {i+1}. {section}")
                
            # Convert to TOC format
            required_proponent_toc = json.dumps({
                "items": extracted_sections,
                "raw": "Extracted from document index/table of contents"
            })
        else:
            print("🔄 STEP 2: No document index found, searching content for proposal format...")
            extracted_sections = await extract_all_rfp_sections_generic(full_document_content)
            
            print(f"📋 CONTENT SEARCH RESULTS:")
            print(f"Found {len(extracted_sections)} sections:")
            for i, section in enumerate(extracted_sections):
                print(f"  {i+1}. {section}")
            
            # Convert to TOC format for consistency
            required_proponent_toc = json.dumps({
                "items": extracted_sections,
                "raw": "Content-based extraction (no document index found)"
            })
        
        # Set submission_requirements for compatibility
        submission_requirements = {
            "client_required_structure": {
                "has_explicit_structure": True,
                "required_sections": []
            }
        }

        formatted_toc = format_toc_for_display(required_proponent_toc)
        print("Formatted TOC:", formatted_toc)

        # --- Step 3: Create structured sections based on parsed requirements ---
        print("DEBUG - About to create sections with TOC:")
        print(f"TOC content: {required_proponent_toc}")
        
        structured_sections = create_structured_response_sections_with_toc(
            full_document_content,
            required_proponent_toc
        )
        
        print(f"DEBUG - Created {len(structured_sections)} structured sections:")
        for i, section in enumerate(structured_sections):
            section_name = section.get("section_name", "Unknown")
            print(f"  {i+1}. {section_name}")

        # --- Step 4: Format sections for frontend ---
        print("Formatting sections for frontend response...")
        sections_response = []
        for section in structured_sections:
            formatted_section = {
                "name": section.get("section_name", "Unknown Section"),
                "type": section.get("source", "structured"),
                "content": "",
                "word_count": 0,
                "completion_status": "needs_content",
                "needs_response": True,
                "content_gaps": [],
                "response_priority": section.get("criticality", "medium").lower(),
                "section_order": section.get("section_order", 0),
                "sort_key": section.get("sort_key", f"999.{section.get('section_order', 0):03d}.000.000.000"),
                "section_purpose": section.get("section_purpose", ""),
                "estimated_length": section.get("estimated_length", "2-3 pages"),
                "knowledge_base_queries": section.get("knowledge_base_queries", []),
                "source": section.get("source", "structured"),
                "client_description": section.get("client_description", ""),
                "weight_percentage": section.get("weight_percentage", "")
            }
            sections_response.append(formatted_section)

        # Sort sections by section_order AND sort_key before sending to frontend
        sections_response.sort(key=lambda x: (x["section_order"], x["sort_key"]))

        # DEBUG: Print the order being sent to frontend
        print("DEBUG: Sections being sent to frontend (after sorting):")
        for i, section in enumerate(sections_response):
            print(f"  {i+1}. {section['name']} (Order: {section['section_order']}, Sort Key: {section['sort_key']})")

        # --- Step 5: Build final response ---
        processing_time = time.time() - start_time
        telemetry_client.track_trace(
            f"RFP analysis completed in {processing_time:.2f}s",
            severity=1
        )

        return {
            "session_id": session_id,
            "file_name": file_name,
            "status": "analyzed",
            "processing_time": round(processing_time, 2),
            "rfp_structure": "structure_first_approach",
            "table_of_contents": formatted_toc,
            "total_sections": len(structured_sections),
            "sections_needing_response": len(structured_sections),
            "sections": sections_response,
            "submission_requirements": submission_requirements
        }

    except Exception as ex:
        error_msg = str(ex)
        print(f"Error in analyze_rfp: {error_msg}")
        telemetry_client.track_exception(ex)

        raise HTTPException(
            status_code=500,
            detail=f"RFP analysis failed: {error_msg}"
        )

@router.post("/api/v1/rfp/populate")
async def populate_sections(
    prompt: str = Form(...),
    session_id: str = Form(...),
    prompt_id: str = Form(...),
    user_id: str = Form(...),
    action: str = Form(default="generate"),
    section_name: str = Form(...),
    section_type: str = Form(default="rfp_questions_responses"),
    question_number: str = Form(default=""),
    total_questions: str = Form(default=""),
    tenant_id: str = Form(default=""),
    current_user: dict = Depends(get_current_user) if os.getenv("ENABLE_AUTH", "false").lower() == "true" else None
):
    """Populate RFP sections with content from knowledge base indexes using proper tenant and user context"""
    
    # Skip Table of Contents, Index, and similar navigation sections - they will be auto-generated during document creation
    if is_table_of_contents_section(section_name):
        print(f"⏭️ Skipping '{section_name}' section - Navigation/TOC sections are auto-generated during document creation")
        
        # Return a simple response indicating the section was skipped
        async def stream_skipped_message():
            yield f"'{section_name}' section is auto-generated during document creation and doesn't need manual population."
        
        return StreamingResponse(
            stream_skipped_message(),
            media_type="text/plain",
            headers={
                "version": "1.0",
                "action": action,
                "section-name": section_name,
                "section-type": section_type,
                "content-source": "auto_generated",
                "skipped": "true",
                "skip-reason": "Navigation/TOC section is auto-generated"
            }
        )
    
    print(f"🔍 Starting populate_sections for section '{section_name}' (Type: {section_type}) with action '{action}' and question '{question_number} and prompt '{prompt}...'")

    # Extract user info from validated token (or use defaults if auth disabled)
    if current_user:
        if current_user.get("tenant_id") == "9188040d-6c67-4c5b-b112-36a304b66dad":
            auth_tenant_id = current_user.get("user_id")
        else:
            auth_tenant_id = current_user.get("tenant_id")
        user_email = current_user.get("email")
        user_name = current_user.get("name")
    else:
        # Default values when authentication is disabled
        auth_tenant_id = "local-dev"
        user_email = "dev@local.test"
        user_name = "Local Developer"
    
    # Use tenant_id from auth context, fallback to form parameter if needed
    effective_tenant_id = auth_tenant_id
    
    # Log authentication info
    org_info = f"Organization: {effective_tenant_id}" if effective_tenant_id else "Personal Account"
    print(f"User: {user_name} <{user_email}>, {org_info}")
    
    start_time = time.time()
    
    try:
        # Determine if this is individual question answering
        is_individual_question = bool(question_number and question_number != "")
        
        # Log the action for better tracking with user info
        if is_individual_question:
            telemetry_client.track_trace(f"Individual question populate from indexer - Action: {action}, Section: {section_name}, Question: {question_number}/{total_questions}", severity=1)
            print(f"🔍 Processing individual question {question_number} of {total_questions} in section '{section_name}' from knowledge base")
        else:
            telemetry_client.track_trace(f"Section populate request from indexer - Action: {action}, Section: {section_name}", severity=1)
            print(f"🔍 Processing section populate for '{section_name}' from knowledge base")
        
        # Search knowledge base for relevant content
        index_name = INDEX_NAME
        raw_content = ""
        
        try:
            telemetry_client.track_trace(f'Searching knowledge base for section: {section_name}, tenant: {effective_tenant_id}', severity=1)
            
            retriever = CustomAzureSearchRetriever(
                indexes=[index_name],
                topK=3,
                reranker_threshold=1,
                sas_token="",
                telemetry_client=telemetry_client,
                callback_manager=None,
                tenant_id=effective_tenant_id
            )

            # Use the prompt as the query for knowledge base search
            docs = retriever._get_relevant_documents(prompt, run_manager=None)
            print(f"🔍 Retrieved {len(docs)} documents from knowledge base for section '{section_name}' using query: '{prompt[:100]}...'")
            for d in docs:
                raw_content += d.page_content + "\n"
            print(f"📄 Total raw content length: {len(raw_content)} characters")

        except Exception as e:
            telemetry_client.track_exception(e)
            telemetry_client.track_trace(f"Knowledge base search error for section: {section_name}, tenant: {effective_tenant_id}, user: {user_email}", severity=3)
            raw_content = f"Error retrieving content from knowledge base: {str(e)}"

        # Enhance content with OpenAI for better formatting
        enhanced_content = ""
        print(f"🔍 Debug: raw_content length: {len(raw_content.strip())}, starts with 'Error': {raw_content.startswith('Error')}")
        if raw_content.strip() and not raw_content.startswith("Error"):
            try:
                # Create a specific prompt for RFP question answering using knowledge base content
                question_context = ""
                if question_number and total_questions:
                    question_context = f" This is question {question_number} of {total_questions} in the {section_name} section."
                
                system_message = f"You are an assistant that summarizes raw proposal data into polished RFP response text."
                user_message = f"Summarize and structure the following content for the '{section_name}' section of an RFP:\n\n{raw_content}"
                
                completion = client_section_data_populate.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": system_message},
                        {"role": "user", "content": user_message}
                    ],
                    temperature=0.3,
                    max_tokens=800
                )
                enhanced_content = completion.choices[0].message.content.strip()
                print(f"✅ Enhanced knowledge base content for section '{section_name}' using OpenAI: ", enhanced_content)
            except Exception as e:
                telemetry_client.track_exception(e)
                telemetry_client.track_trace(f"OpenAI enhancement error for section: {section_name}, tenant: {effective_tenant_id}, user: {user_email}", severity=3)
                print(f"❌ Error enhancing knowledge base content for section '{section_name}': {str(e)}")
                # Use raw content if enhancement fails
                enhanced_content = raw_content.strip()
        else:
            enhanced_content = raw_content
            print(f"⚠️ No valid content retrieved from knowledge base for section '{section_name}'")

        # Build response headers (same as draft endpoint)
        response_headers = {
            "version": "1.0",
            "action": action,
            "section-name": section_name,
            "section-type": section_type,
            "content-source": "knowledge_base_indexer"
        }
        
        # Add question-specific headers
        if is_individual_question:
            response_headers.update({
                "is-individual-question": "true",
                "question-number": question_number,
                "total-questions": total_questions,
                "question-context": f"Question {question_number} of {total_questions}"
            })
            print(f"✅ Retrieved knowledge base content for individual question {question_number}/{total_questions}")
        else:
            response_headers["is-individual-question"] = "false"

        # Create a simple streaming generator for the content
        async def stream_knowledge_base_content():
            try:
                import re  # Import re module locally
                content = enhanced_content
                
                if not content.strip():
                    yield f"No relevant content found for section '{section_name}'"
                    return
                
                # Stream the content in logical chunks for better user experience
                # Break content into sentences for natural reading flow
                sentences = []
                
                # Split by common sentence endings, preserving the punctuation
                sentence_pattern = r'([.!?]+\s*)'
                parts = re.split(sentence_pattern, content)
                
                current_sentence = ""
                for i, part in enumerate(parts):
                    if re.match(sentence_pattern, part):  # This is punctuation
                        current_sentence += part.strip()
                        if current_sentence.strip():
                            sentences.append(current_sentence.strip())
                        current_sentence = ""
                    else:  # This is text content
                        current_sentence += part
                
                # Add any remaining content
                if current_sentence.strip():
                    sentences.append(current_sentence.strip())
                
                # If no sentences were found, fallback to word chunking
                if not sentences:
                    words = content.split()
                    chunk_size = 15  # words per chunk
                    for i in range(0, len(words), chunk_size):
                        chunk = ' '.join(words[i:i + chunk_size])
                        if chunk.strip():
                            sentences.append(chunk)
                
                # Stream each sentence/chunk
                for sentence in sentences:
                    if sentence.strip():
                        # Send content directly, FastAPI handles SSE formatting
                        yield f"{sentence}"
                        await asyncio.sleep(0.1)  # Small delay for readability
                
                # Log completion
                processing_time = time.time() - start_time
                telemetry_client.track_trace(
                    f"Knowledge base populate completed in {processing_time:.2f}s for user: {user_name}, tenant: {effective_tenant_id}",
                    severity=1,
                    properties={
                        "processing_time_ms": round(processing_time * 1000, 2),
                        "tenant_id": effective_tenant_id,
                        "user_email": user_email,
                        "content_source": "knowledge_base",
                        "content_length": len(content)
                    }
                )
                
            except Exception as e:
                telemetry_client.track_exception(e)
                yield f"Error streaming content: {str(e)}"

        return StreamingResponse(
            stream_knowledge_base_content(),
            headers=response_headers,
            media_type="text/event-stream",
        )
        
    except Exception as ex:
        print(f"Error in populate_sections: {str(ex)}")
        telemetry_client.track_exception(ex)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(ex))

@router.post("/api/v1/rfp/upload-multiple")
async def upload_multiple_files_to_azure(
        tenant_id: str = Form(...),
        files: List[UploadFile] = File(...),
        current_user: dict = Depends(get_current_user) if os.getenv("ENABLE_AUTH", "false").lower() == "true" else None
):
    """Upload multiple files to Azure Blob Storage asynchronously"""
    if len(files) > 10:  # Limit number of files
        raise HTTPException(status_code=400, detail="Too many files. Maximum 10 files allowed.")
    
    if current_user:
        if current_user.get("tenant_id") == "9188040d-6c67-4c5b-b112-36a304b66dad":
            tenant_id = current_user.get("user_id")
        else:
            tenant_id = current_user.get("tenant_id")
        user_email = current_user.get("email")
        user_name = current_user.get("name")
    else:
        # Default values when authentication is disabled
        tenant_id = "local-dev"
        user_email = "dev@local.test"
        user_name = "Local Developer"
    
    print(f"🔐 Authenticated user: {user_name} <{user_email}> (Tenant: {tenant_id})")

    # Ensure container exists
    if not await container_exists_async(CONTAINER_NAME):
        await create_container_async(CONTAINER_NAME)
    
    # Process all files concurrently with tenant folder structure
    upload_tasks = []
    for file in files:
        task = asyncio.create_task(
            process_single_file_upload_with_path(file, CONTAINER_NAME, tenant_id)
        )
        upload_tasks.append(task)
    
    # Wait for all uploads to complete
    results = await asyncio.gather(*upload_tasks, return_exceptions=True)
    
    await close_blob_service_client()

    uploaded_files = []
    failed_files = []
    
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            failed_files.append({
                "filename": files[i].filename,
                "error": str(result)
            })
        else:
            uploaded_files.append(result)
    
    return JSONResponse(
        status_code=201 if uploaded_files else 400,
        content={
            "success": len(uploaded_files) > 0,
            "tenant_id": tenant_id,
            "container_name": CONTAINER_NAME,
            "uploaded_files": uploaded_files,
            "failed_files": failed_files,
            "total_uploaded": len(uploaded_files),
            "total_failed": len(failed_files)
        }
    )

@router.post("/api/v1/rfp/generate-document")
async def generate_rfp_document(rfp_data: RFPRequest):

    for(key, section) in rfp_data.sections.items():
        print(f"Section Key: {key}, Content Length: {len(section.content)}")

    """
    Generate a professional Word document from RFP analysis data.
    
    Expects rfp_data with structure:
    {
        "metadata": {
            "document_type": "RFP Response",
            "analysis_date": "2024-01-01",
            "total_sections": 5,
            "file_name": "original_rfp.pdf"
        },
        "sections": {
            "section_key": {
                "content": "Section content..."
            }
        }
    }
    """
    try:
        start_time = time.time()

        telemetry_client.track_event("Document_Generation_Request", {
            "sections_count": len(rfp_data.sections),
            "total_content_length": sum(len(s.content) for s in rfp_data.sections.values())
        })
        
        # Validate input data
        if not rfp_data.sections:
            raise HTTPException(status_code=400, detail="No sections provided for document generation")
        
        # Check for large documents and warn
        total_content_length = sum(len(section.content) for section in rfp_data.sections.values())
        formatting_deployment = os.environ.get("AZURE_OPENAI_FORMATTING_DEPLOYMENT_NAME", "gpt-4o-mini")
        
        if total_content_length > 50000:  # 50KB of content
            print(f"Large document detected: {total_content_length} characters. Using chunk-wise processing with {formatting_deployment}.")
            telemetry_client.track_event("Large_Document_Processing", {
                "content_length": total_content_length,
                "sections_count": len(rfp_data.sections),
                "formatting_model": formatting_deployment
            })
        else:
            print(f"Processing document with {formatting_deployment} formatting model.")
            telemetry_client.track_event("Document_Processing", {
                "content_length": total_content_length,
                "sections_count": len(rfp_data.sections),
                "formatting_model": formatting_deployment
            })
        
        # Generate the document using create_docx_from_sections
        print("Starting document generation...")
        doc_buffer = create_docx_from_sections(rfp_data.model_dump())
        
        # Calculate processing time
        processing_time = time.time() - start_time
        
        # Return as file download with enhanced filename
        source_name = rfp_data.metadata.file_name.replace('.pdf', '').replace('.docx', '').replace('.doc', '')
        pacific_time, _ = get_pacific_time()
        timestamp = pacific_time.strftime('%Y%m%d_%H%M%S')
        filename = f"RFP_Response_{source_name}_{timestamp}.docx"
        
        telemetry_client.track_event("Document_Generation_Completed", {
            "processing_time": processing_time,
            "document_size": len(doc_buffer.getvalue()),
            "filename": filename
        })
        
        print(f"Document generation completed in {processing_time:.2f} seconds. File: {filename}")
        
        return StreamingResponse(
            io.BytesIO(doc_buffer.getvalue()),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "X-Processing-Time": f"{processing_time:.2f}",
                "X-Document-Size": str(len(doc_buffer.getvalue())),
                "X-Sections-Processed": str(len(rfp_data.sections))
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        telemetry_client.track_event("Document_Generation_Endpoint_Error", {"error": str(e)})
        print(f"Error in document generation endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate document: {str(e)}")

@router.post("/api/v1/rfp/regenerate")
async def regenerate_section(
    prompt: str = Form(...),
    session_id: str = Form(...),
    prompt_id: str = Form(...),
    user_id: str = Form(...),
    action: str = Form(default="regenerate"),
    section_name: str = Form(...),
    section_type: str = Form(default="rfp_questions_responses"),
    question_number: str = Form(default=""),
    total_questions: str = Form(default=""),
    tenant_id: str = Form(default=""),
    current_user: dict = Depends(get_current_user) if os.getenv("ENABLE_AUTH", "false").lower() == "true" else None
):
    """Regenerate RFP section content using the same format as populate endpoint"""
    
    print(f"🔍 Starting regenerate_section for section '{section_name}' (Type: {section_type}) with action '{action}' and prompt '{prompt}...'")

    # Extract user info from validated token (or use defaults if auth disabled)
    if current_user:
        if current_user.get("tenant_id") == "9188040d-6c67-4c5b-b112-36a304b66dad":
            auth_tenant_id = current_user.get("user_id")
        else:
            auth_tenant_id = current_user.get("tenant_id")
        user_email = current_user.get("email")
        user_name = current_user.get("name")
    else:
        # Default values when authentication is disabled
        auth_tenant_id = "local-dev"
        user_email = "dev@local.test"
        user_name = "Local Developer"
    
    # Use tenant_id from auth context, fallback to form parameter if needed
    effective_tenant_id = auth_tenant_id
    
    # Log authentication info
    org_info = f"Organization: {effective_tenant_id}" if effective_tenant_id else "Personal Account"
    print(f"User: {user_name} <{user_email}>, {org_info}")
    
    start_time = time.time()
    
    try:
        # Determine if this is individual question answering
        is_individual_question = bool(question_number and question_number != "")
        
        # Log the action for better tracking with user info
        if is_individual_question:
            telemetry_client.track_trace(f"Individual question regenerate - Action: {action}, Section: {section_name}, Question: {question_number}/{total_questions}", severity=1)
            print(f"🔍 Regenerating individual question {question_number} of {total_questions} in section '{section_name}'")
        else:
            telemetry_client.track_trace(f"Section regenerate request - Action: {action}, Section: {section_name}", severity=1)
            print(f"🔍 Regenerating section '{section_name}'")
        
        # Extract section content from the prompt (assuming it contains current content + user request)
        if not prompt.strip():
            telemetry_client.track_trace("Section regeneration failed: prompt is empty", severity=3)
            raise HTTPException(status_code=400, detail="Unable to regenerate content: prompt is empty")

        print(f"🔍 Regenerating content for section '{section_name}' with prompt length {len(prompt)} characters and prompt: {prompt} --------------------------------------------")

        ai_prompt = f"""
        You are a helpful AI assistant that specializes in generating and refining RFP responses.
        Do not add explanations, commentary, introductions, or closing statements. 
        Regenerate content based on the following user request:

        {prompt}
        """

        # Generate regenerated content
        regenerated_content = ""
        try:
            response = client_section_data_populate.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": ai_prompt}],
                temperature=0.7,
                max_tokens=800
            )
            regenerated_content = response.choices[0].message.content.strip()
            print(f"✅ Regenerated content for section '{section_name}' using OpenAI")
        except Exception as e:
            telemetry_client.track_exception(e)
            telemetry_client.track_trace(f"OpenAI regeneration error for section: {section_name}, tenant: {effective_tenant_id}, user: {user_email}", severity=3)
            print(f"❌ Error regenerating content for section '{section_name}': {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to regenerate content: {str(e)}")

        # Build response headers (same as populate endpoint)
        response_headers = {
            "version": "1.0",
            "action": action,
            "section-name": section_name,
            "section-type": section_type,
            "content-source": "regenerated"
        }
        
        # Add question-specific headers
        if is_individual_question:
            response_headers.update({
                "is-individual-question": "true",
                "question-number": question_number,
                "total-questions": total_questions,
                "question-context": f"Question {question_number} of {total_questions}"
            })
            print(f"✅ Regenerated content for individual question {question_number}/{total_questions}")
        else:
            response_headers["is-individual-question"] = "false"

        # Create a simple streaming generator for the content
        async def stream_regenerated_content():
            try:
                import re  # Import re module locally
                content = regenerated_content
                
                if not content.strip():
                    yield f"No regenerated content available for section '{section_name}'"
                    return
                
                # Stream the content in logical chunks for better user experience
                # Break content into sentences for natural reading flow
                sentences = []
                
                # Split by common sentence endings, preserving the punctuation
                sentence_pattern = r'([.!?]+\s*)'
                parts = re.split(sentence_pattern, content)
                
                current_sentence = ""
                for i, part in enumerate(parts):
                    if re.match(sentence_pattern, part):  # This is punctuation
                        current_sentence += part.strip()
                        if current_sentence.strip():
                            sentences.append(current_sentence.strip())
                        current_sentence = ""
                    else:  # This is text content
                        current_sentence += part
                
                # Add any remaining content
                if current_sentence.strip():
                    sentences.append(current_sentence.strip())
                
                # If no sentences were found, fallback to word chunking
                if not sentences:
                    words = content.split()
                    chunk_size = 15  # words per chunk
                    for i in range(0, len(words), chunk_size):
                        chunk = ' '.join(words[i:i + chunk_size])
                        if chunk.strip():
                            sentences.append(chunk)
                
                # Stream each sentence/chunk
                for sentence in sentences:
                    if sentence.strip():
                        # Send content directly, FastAPI handles SSE formatting
                        yield f"{sentence}"
                        await asyncio.sleep(0.1)  # Small delay for readability
                
                # Log completion
                processing_time = time.time() - start_time
                telemetry_client.track_trace(
                    f"Section regeneration completed in {processing_time:.2f}s for user: {user_name}, tenant: {effective_tenant_id}",
                    severity=1,
                    properties={
                        "processing_time_ms": round(processing_time * 1000, 2),
                        "tenant_id": effective_tenant_id,
                        "user_email": user_email,
                        "content_source": "regenerated",
                        "content_length": len(content)
                    }
                )
                
            except Exception as e:
                telemetry_client.track_exception(e)
                yield f"Error streaming content: {str(e)}"

        return StreamingResponse(
            stream_regenerated_content(),
            headers=response_headers,
            media_type="text/event-stream",
        )
        
    except HTTPException:
        raise
    except Exception as ex:
        print(f"Error in regenerate_section: {str(ex)}")
        telemetry_client.track_exception(ex)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(ex))

# Include the router in the FastAPI app
app.include_router(router)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "message": "RFP Web App Backend is running",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "features": {
            "authentication": os.getenv("ENABLE_AUTH", "false").lower() == "true",
            "azure_openai_configured": bool(os.getenv("AZURE_OPENAI_ENDPOINT")),
            "search_index_configured": bool(os.getenv("AZURE_SEARCH_INDEX_NAME_RFP"))
        }
    }

#################### Run the server ######################
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)

