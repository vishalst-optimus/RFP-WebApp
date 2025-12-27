from pydantic import BaseModel, Field
from application.services.media_insertion_service import MediaInsertionService
import httpx
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, Body, Request, APIRouter, Header
import io
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import Enum
from starlette.responses import StreamingResponse
from core.models.conversation_api import InputRequest
from application.services.langgraph_services.streaming import Streaming
from application.services.caching_service.caching import Caching
from application.services.logging_service.logging import telemetry_client
from application.services.langgraph_services.workflow_service import WorkflowService
from core.models.schemas import InsertToBlobRequest, InsertToBlobResponse, UploadFileFromUrlRequest
import time
import datetime
import uuid
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
from core.models.schemas import RFPAnalysisResponse, SectionType, RFPRequest, UpdateSectionContentRequest, DocumentGenerationRequest, ImportSectionsRequest
from core.models.media_schemas import InsertMediaRequest, InsertMediaResponse
from infrastructure.tools.tool_definations.knowledge_base_tool import KnowledgeBaseSearchTool, CustomAzureSearchRetriever
from openai import AzureOpenAI
from pydantic import BaseModel, Field
from typing import Dict, List, Optional

# Pydantic models - moved to service files
from application.services.pricing_generation_service import (
    PricingTableItem, 
    PricingTableRequest, 
    generate_pricing_table_with_llm
)
from application.services.table_generation_service import (
    FileTableRequest,
    generate_file_table_with_llm
)

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

# Import from new service files
from application.services.rfp_analysis_service import (
    clean_section_name,
    extract_from_document_index, 
    extract_all_rfp_sections_generic,
    pattern_based_extraction,
    extract_from_evaluation_sections,
    is_table_of_contents_section
)
from application.services.rfp_section_service import RFPSectionService
from application.services.document_service import get_pacific_time, generate_document_filename
from application.services.auth_service import get_subscribed_user, extract_user_info, get_current_user_if_auth_enabled
from application.services.cosmos_service.rfp_data_service import RFPDataService
from application.services.media_insertion_service import MediaInsertionService

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

# In-memory cache
caching_instance = Caching.initialize_cache()
caching_instance_for_open_api = Caching.initialize_cache_for_open_api()

# Initialize RFP Section Service
rfp_section_service = RFPSectionService()

# Debug endpoint to check token information
@app.get("/api/v1/auth/debug")
async def debug_token(current_user: dict = get_current_user_if_auth_enabled()):
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
    rfp_file_name: str = Form(...),
    rfp_name: Optional[str] = Form(None),
    current_user: dict = get_current_user_if_auth_enabled()
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

    print("RFP_NAME IS:---------------", rfp_name)
    # Extract user info from validated token (or use defaults if auth disabled)
    tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
    
    print(f"🔐 Authenticated user: {user_name} <{user_email}> (Tenant: {tenant_id}, User ID: {user_id})")

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

        # --- Store RFP analysis data in Cosmos DB ---
        try:
            print("Storing RFP analysis data in Cosmos DB...")
            rfp_data_service = RFPDataService()
            
            # Calculate overall confidence score (average of section confidence scores if available)
            overall_confidence = 75.0  # Default confidence score
            if sections_response:
                confidence_scores = [
                    section.get("confidence", 0.75) * 100 
                    for section in sections_response 
                    if section.get("confidence") is not None
                ]
                if confidence_scores:
                    overall_confidence = sum(confidence_scores) / len(confidence_scores)
            
            # Store the analysis data
            document_id = await rfp_data_service.store_rfp_analysis_data(
                tenant_id=tenant_id,
                user_id=user_id,  # Using proper user_id
                rfp_name=rfp_name or file_name,
                file_name=rfp_file_name,
                sections_data=sections_response,
                confidence_score=overall_confidence,
                session_id=session_id
            )
            
            print(f"✅ RFP analysis data stored successfully with document ID: {document_id}")
            telemetry_client.track_trace(
                f"RFP analysis data stored in Cosmos DB for user {user_email}, RFP: {rfp_name or file_name}",
                severity=1
            )
            
        except Exception as cosmos_ex:
            # Log the error but don't fail the entire endpoint
            print(f"⚠️ Failed to store RFP data in Cosmos DB: {str(cosmos_ex)}")
            telemetry_client.track_exception(cosmos_ex)
            # Continue with the response even if storage fails

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
    rfp_name: str = Form(default=None),
    action: str = Form(default="generate"),
    section_name: str = Form(...),
    section_type: str = Form(default="rfp_questions_responses"),
    question_number: str = Form(default=""),
    total_questions: str = Form(default=""),
    tenant_id: str = Form(default=""),
    current_user: dict = get_current_user_if_auth_enabled()
):
    """Populate RFP sections with content from knowledge base indexes using proper tenant and user context"""
    
    print("RFP_NAME IS:---------------", rfp_name)
    # Skip Table of Contents, Index, and similar navigation sections - they will be auto-generated during document creation
    if is_table_of_contents_section(section_name):
        print(f"⏭️ Skipping '{section_name}' section - Navigation/TOC sections are auto-generated during document creation")
        
        return StreamingResponse(
            rfp_section_service.stream_skipped_message(section_name),
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
    effective_tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
    
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
        
        # Get knowledge base content
        raw_content = await rfp_section_service.get_knowledge_base_content(
            prompt, section_name, effective_tenant_id, user_email
        )
        
        # Enhance content with OpenAI
        enhanced_content = await rfp_section_service.enhance_content_with_openai(
            raw_content, section_name, effective_tenant_id, user_email
        )

        # Build response headers
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

        return StreamingResponse(
            rfp_section_service.stream_content(
                enhanced_content, section_name, user_name, effective_tenant_id, 
                user_email, start_time, "knowledge_base"
            ),
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
        current_user: dict = get_current_user_if_auth_enabled()
):
    """Upload multiple files to Azure Blob Storage asynchronously"""
    if len(files) > 10:  # Limit number of files
        raise HTTPException(status_code=400, detail="Too many files. Maximum 10 files allowed.")
    
    tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
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
async def generate_rfp_document(request_data: DocumentGenerationRequest, current_user = get_current_user_if_auth_enabled()):
    """
    Generate a professional Word document from RFP analysis data stored in Cosmos DB.
    
    Retrieves section data from Cosmos DB using rfp_name and user_id, then generates the document.
    """
    try:
        start_time = time.time()
        print("RFP NAME: -----------------------", request_data.rfp_name)
        # Extract user info from validated token
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
        print(f"🔐 Document generation for user: {user_name} <{user_email}> (User ID: {user_id})")
        print(f"📄 Generating document for RFP: {request_data.rfp_name}")
        
        # Initialize RFP Data Service to retrieve section data from Cosmos DB
        rfp_data_service = RFPDataService()
        
        # Retrieve RFP data from Cosmos DB
        rfp_data_from_cosmos = await rfp_data_service.get_rfp_by_name(
            tenant_id=tenant_id,
            user_id=user_id,
            rfp_name=request_data.rfp_name
        )
        
        if not rfp_data_from_cosmos:
            raise HTTPException(
                status_code=404, 
                detail=f"RFP '{request_data.rfp_name}' not found for user {user_id}"
            )
        
        # Convert Cosmos DB data to the expected format for document generation
        sections_dict = {}
        appendix_sections = {}  # Separate dict for appendix sections
        cosmos_sections = rfp_data_from_cosmos.get("sections", [])
        
        for section in cosmos_sections:
            section_name = section.get("SectionName", "")
            section_content = section.get("Content", "")
            section_images = section.get("Image", [])
            
            # Include sections that have either content or images
            if section_name and (section_content or section_images):
                section_data = {
                    "content": section_content,
                    "Image": section_images  # Include images in the new format
                }
                
                # Check if this is an appendix section (case-insensitive)
                if "appendix" in section_name.lower():
                    appendix_sections[section_name] = section_data
                else:
                    sections_dict[section_name] = section_data
        
        # Add appendix sections at the end
        if appendix_sections:
            print(f"📎 Moving {len(appendix_sections)} appendix section(s) to end of document")
            sections_dict.update(appendix_sections)
        
        if not sections_dict:
            raise HTTPException(
                status_code=400, 
                detail=f"No sections with content or images found in RFP '{request_data.rfp_name}'"
            )
        
        # Get file_name from Cosmos DB data
        cosmos_file_name = rfp_data_from_cosmos.get("file_name", request_data.rfp_name)
        
        # Create metadata (use provided metadata or create default)
        if request_data.metadata:
            # Convert Pydantic model to dictionary and update total_sections with actual count
            metadata = request_data.metadata.dict()
            metadata["total_sections"] = len(sections_dict)  # Update with actual count from Cosmos DB
            metadata["file_name"] = cosmos_file_name  # Use file_name from Cosmos DB
        else:
            metadata = {
                "document_type": "RFP Response",
                "analysis_date": datetime.now().strftime("%Y-%m-%d"),
                "total_sections": len(sections_dict),
                "file_name": cosmos_file_name  # Use file_name from Cosmos DB
            }
        
        # Create the RFP data structure expected by document generator
        rfp_data = {
            "metadata": metadata,
            "sections": sections_dict,
            "rfp_name": request_data.rfp_name
        }
        
        print(f"📊 Retrieved {len(sections_dict)} sections from Cosmos DB:")
        for key, section in sections_dict.items():
            print(f"  - {key}: {len(section['content'])} characters")
        
        telemetry_client.track_event("Document_Generation_Request", {
            "rfp_name": request_data.rfp_name,
            "sections_count": len(sections_dict),
            "total_content_length": sum(len(s["content"]) for s in sections_dict.values()),
            "user_id": user_id
        })
        
        # Check for large documents and warn
        total_content_length = sum(len(section["content"]) for section in sections_dict.values())
        formatting_deployment = os.environ.get("AZURE_OPENAI_FORMATTING_DEPLOYMENT_NAME", "gpt-4o-mini")
        
        if total_content_length > 50000:  # 50KB of content
            print(f"Large document detected: {total_content_length} characters. Using chunk-wise processing with {formatting_deployment}.")
            telemetry_client.track_event("Large_Document_Processing", {
                "content_length": total_content_length,
                "sections_count": len(sections_dict),
                "formatting_model": formatting_deployment,
                "rfp_name": request_data.rfp_name
            })
        else:
            print(f"Processing document with {formatting_deployment} formatting model.")
            telemetry_client.track_event("Document_Processing", {
                "content_length": total_content_length,
                "sections_count": len(sections_dict),
                "formatting_model": formatting_deployment,
                "rfp_name": request_data.rfp_name
            })
        
        # Generate the document using create_docx_from_sections
        print("Starting document generation...")
        doc_buffer = create_docx_from_sections(rfp_data)
        
        # Calculate processing time
        processing_time = time.time() - start_time
        
        # Return as file download with enhanced filename
        filename = generate_document_filename(request_data.rfp_name)
        
        telemetry_client.track_event("Document_Generation_Completed", {
            "processing_time": processing_time,
            "document_size": len(doc_buffer.getvalue()),
            "filename": filename,
            "rfp_name": request_data.rfp_name,
            "user_id": user_id
        })
        
        print(f"Document generation completed in {processing_time:.2f} seconds. File: {filename}")
        
        # Mark RFP as exported after successful document generation
        try:
            export_success = await rfp_data_service.mark_rfp_as_exported(
                tenant_id=tenant_id,
                user_id=user_id,
                rfp_name=request_data.rfp_name
            )
            if export_success:
                print(f"✅ Successfully marked RFP '{request_data.rfp_name}' as exported for user {user_id}")
                telemetry_client.track_trace(
                    f"RFP '{request_data.rfp_name}' marked as exported after document generation (user: {user_id})",
                    severity=1
                )
            else:
                print(f"⚠️ Failed to mark RFP '{request_data.rfp_name}' as exported - RFP not found")
                telemetry_client.track_trace(
                    f"Failed to mark RFP '{request_data.rfp_name}' as exported - RFP not found (user: {user_id})",
                    severity=2
                )
        except Exception as export_ex:
            # Log the error but don't fail the document generation
            print(f"⚠️ Error marking RFP as exported: {str(export_ex)}")
            telemetry_client.track_exception(export_ex)
        
        return StreamingResponse(
            io.BytesIO(doc_buffer.getvalue()),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "X-Processing-Time": f"{processing_time:.2f}",
                "X-Document-Size": str(len(doc_buffer.getvalue())),
                "X-Sections-Processed": str(len(sections_dict))
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
    rfp_name: str = Form(default=None),
    action: str = Form(default="regenerate"),
    section_name: str = Form(...),
    section_type: str = Form(default="rfp_questions_responses"),
    question_number: str = Form(default=""),
    total_questions: str = Form(default=""),
    tenant_id: str = Form(default=""),
    current_user: dict = get_current_user_if_auth_enabled()
):
    """Regenerate RFP section content using the same format as populate endpoint"""
    
    print(f"🔍 Starting regenerate_section for section '{section_name}' (Type: {section_type}) with action '{action}' and prompt '{prompt}...'")
    print("RFP_NAME IS:---------------", rfp_name)
    # Extract user info from validated token (or use defaults if auth disabled)
    effective_tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
    
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

        # Generate regenerated content
        regenerated_content = await rfp_section_service.regenerate_content_with_openai(
            prompt, section_name, effective_tenant_id, user_email
        )

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

        return StreamingResponse(
            rfp_section_service.stream_content(
                regenerated_content, section_name, user_name, effective_tenant_id,
                user_email, start_time, "regenerated"
            ),
            headers=response_headers,
            media_type="text/event-stream",
        )
        
    except HTTPException:
        raise
    except Exception as ex:
        print(f"Error in regenerate_section: {str(ex)}")
        telemetry_client.track_exception(ex)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(ex))

@router.post("/api/v1/rfp/updateSectionContentToCosmos")
async def update_section_content_to_cosmos(
    request: UpdateSectionContentRequest,
    current_user: dict = get_current_user_if_auth_enabled()
):
    """
    Update multiple section contents for a specific RFP in Cosmos DB
    """
    try:
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
        
        rfp_data_service = RFPDataService()
        sections_updated = 0
        failed_sections = []
        
        # Process each section
        for section in request.sections:
            try:
                success = await rfp_data_service.update_section_content(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    rfp_name=request.rfp_name,
                    section_name=section.section_title,  # Changed from section_title to section_name
                    new_content=section.section_content  # Changed from section_content to new_content
                )
                
                if success:
                    sections_updated += 1
                    print(f"✅ Updated section '{section.section_title}' for RFP '{request.rfp_name}'")
                else:
                    failed_sections.append(section.section_title)
                    print(f"❌ Failed to update section '{section.section_title}' - RFP not found")
                    
            except Exception as section_ex:
                failed_sections.append(section.section_title)
                print(f"❌ Error updating section '{section.section_title}': {str(section_ex)}")
        
        # Determine response based on results
        if sections_updated > 0:
            message = f"Successfully updated {sections_updated} out of {len(request.sections)} sections"
            if failed_sections:
                message += f". Failed sections: {', '.join(failed_sections)}"
            
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": message,
                    "rfp_name": request.rfp_name,
                    "sections_updated": sections_updated,
                    "total_sections": len(request.sections),
                    "failed_sections": failed_sections
                }
            )
        else:
            return JSONResponse(
                status_code=404,
                content={
                    "success": False,
                    "message": f"Failed to update any sections. RFP '{request.rfp_name}' not found or all updates failed",
                    "sections_updated": 0,
                    "total_sections": len(request.sections),
                    "failed_sections": failed_sections
                }
            )
            
    except Exception as ex:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update section content: {str(ex)}"
        )

@router.get("/api/v1/rfp/getPastRFPs")
async def get_past_rfps(
    current_user: dict = get_current_user_if_auth_enabled()
):
    """
    Get all past RFPs (exported RFPs) for the authenticated user
    
    Returns:
        {
          "rfps": [
            {
              "id": "rfp_001",
              "name": "RFP Name",
              "sections": 8,
              "date": "2024-10-25"
            }
          ],
          "success": true,
          "message": "Past RFPs retrieved successfully"
        }
    """
    try:
        # Extract user info from validated token (or use defaults if auth disabled)
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
        
        print(f"🔐 Retrieving past RFPs for user: {user_name} <{user_email}> (User ID: {user_id})")
        
        # Initialize RFP Data Service
        rfp_data_service = RFPDataService()
        
        # Get past RFPs (exported RFPs only)
        past_rfps = await rfp_data_service.get_past_rfps(
            tenant_id=tenant_id,
            user_id=user_id
        )
        
        telemetry_client.track_trace(
            f"Successfully retrieved {len(past_rfps)} past RFPs for user {user_id}",
            severity=1
        )
        
        return {
            "rfps": past_rfps,
            "success": True,
            "message": "Past RFPs retrieved successfully"
        }
        
    except Exception as ex:
        print(f"Error retrieving past RFPs: {str(ex)}")
        telemetry_client.track_exception(ex)
        
        return {
            "rfps": [],
            "success": False,
            "message": f"Failed to retrieve past RFPs: {str(ex)}"
        }

@router.get("/api/v1/rfp/getRFPSections")
async def get_rfp_sections(
    rfpId: str,
    current_user: dict = get_current_user_if_auth_enabled()
):
    """
    Get all sections for a specific RFP by its ID
    
    Query Parameters:
        rfpId: The RFP ID in format "rfp_001", "rfp_002", etc.
        
    Returns:
        {
          "sections": [
            {
              "id": "section_001",
              "name": "Executive Summary",
              "content": "Our company provides comprehensive security solutions..."
            }
          ],
          "success": true,
          "rfpId": "rfp_001",
          "rfpName": "Downtown Office Complex Security",
          "message": "RFP sections retrieved successfully"
        }
    """
    try:
        # Extract user info from validated token (or use defaults if auth disabled)
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
        
        print(f"🔐 Retrieving sections for RFP ID '{rfpId}' for user: {user_name} <{user_email}> (User ID: {user_id})")
        
        # Initialize RFP Data Service
        rfp_data_service = RFPDataService()
        
        # Get RFP sections by ID
        rfp_data = await rfp_data_service.get_rfp_sections_by_id(
            tenant_id=tenant_id,
            user_id=user_id,
            rfp_id=rfpId
        )
        
        if rfp_data is None:
            return {
                "sections": [],
                "success": False,
                "rfpId": rfpId,
                "rfpName": "",
                "message": f"RFP with ID '{rfpId}' not found or not exported"
            }
        
        telemetry_client.track_trace(
            f"Successfully retrieved {len(rfp_data['sections'])} sections for RFP ID '{rfpId}' (user: {user_id})",
            severity=1
        )
        
        return {
            "sections": rfp_data["sections"],
            "success": True,
            "rfpId": rfpId,
            "rfpName": rfp_data["rfp_name"],
            "message": "RFP sections retrieved successfully"
        }
        
    except Exception as ex:
        print(f"Error retrieving RFP sections for ID '{rfpId}': {str(ex)}")
        telemetry_client.track_exception(ex)
        
        return {
            "sections": [],
            "success": False,
            "rfpId": rfpId,
            "rfpName": "",
            "message": f"Failed to retrieve RFP sections: {str(ex)}"
        }

@router.post("/api/v1/rfp/matchStructure")
async def match_structure(
    request_data: dict = Body(...),
    current_user: dict = get_current_user_if_auth_enabled()
):
    """
    Match structure and tone from a past RFP to apply to a new RFP
    
    Request Body:
        {
          "rfpId": "rfp_001",
          "sessionId": "session123", 
          "rfpName": "Source RFP Name",
          "currentRfpName": "Target RFP Name to create sections for"
        }
        
    Returns:
        {
          "success": boolean,
          "message": string,
          "matchedStructure": {
            "sections": [...],
            "tone": string,
            "style": string
          },
          "createdSections": [
            {
              "name": string,
              "content": string,
              "type": string,
              "order": number
            }
          ]
        }
    """
    try:
        # Extract request parameters
        rfp_id = request_data.get("rfpId")
        session_id = request_data.get("sessionId")
        rfp_name = request_data.get("rfpName")
        current_rfp_name = request_data.get("currentRfpName")
        
        if not rfp_id:
            return {
                "success": False,
                "message": "rfpId is required"
            }
            
        if not current_rfp_name:
            return {
                "success": False,
                "message": "currentRfpName is required to create new sections"
            }
        
        # Extract user info from validated token (or use defaults if auth disabled)
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
        
        print(f"🔐 Matching structure for RFP ID '{rfp_id}' for user: {user_name} <{user_email}> (User ID: {user_id})")
        
        # Initialize RFP Data Service
        rfp_data_service = RFPDataService()
        
        # Get RFP sections by ID (reuse existing logic from getRFPSections)
        rfp_data = await rfp_data_service.get_rfp_sections_by_id(
            tenant_id=tenant_id,
            user_id=user_id,
            rfp_id=rfp_id
        )
        
        if rfp_data is None:
            return {
                "success": False,
                "message": f"RFP with ID '{rfp_id}' not found or not exported"
            }
        
        sections = rfp_data.get("sections", [])
        if not sections:
            return {
                "success": False,
                "message": f"No sections found in RFP '{rfp_id}'"
            }
        
        # Extract structure information from sections using AI classification
        structure_sections = []
        content_samples = []
        
        # Prepare section data for AI analysis
        sections_for_analysis = []
        for i, section in enumerate(sections):
            section_name = section.get("name", "")
            section_content = section.get("content", "")
            
            sections_for_analysis.append({
                "name": section_name,
                "content": section_content[:300] if section_content else "",  # First 300 chars for type analysis
                "order": i + 1
            })
            
            # Collect content samples for tone/style analysis (first 500 chars per section)
            if section_content and len(section_content.strip()) > 50:
                content_samples.append(section_content[:500])
        
        # Use AI to classify section types
        try:
            sections_text = "\n".join([
                f"Section {s['order']}: {s['name']}\nContent preview: {s['content'][:200]}..."
                for s in sections_for_analysis[:10]  # Limit to first 10 sections for token efficiency
            ])
            
            classification_prompt = f"""
            Analyze these RFP sections and classify each section type. Return ONLY a JSON array with this exact format:
            [
              {{"order": 1, "name": "Section Name", "type": "executive_summary"}},
              {{"order": 2, "name": "Section Name", "type": "technical"}}
            ]
            
            Available types: executive_summary, technical, pricing, qualifications, timeline, compliance, general
            
            Sections to analyze:
            {sections_text}
            """
            
            response = client_section_data_populate.chat.completions.create(
                model=os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o-mini"),
                messages=[
                    {"role": "system", "content": "You are an expert at analyzing RFP document structures. Return only valid JSON."},
                    {"role": "user", "content": classification_prompt}
                ],
                max_tokens=1000,
                temperature=0.1
            )
            
            classification_result = response.choices[0].message.content.strip()
            
            # Clean up the response to ensure it's valid JSON
            if classification_result.startswith("```json"):
                classification_result = classification_result.replace("```json", "").replace("```", "")
            
            try:
                ai_classifications = json.loads(classification_result)
                
                # Build structure_sections with AI classifications
                for section_data in sections_for_analysis:
                    section_type = "general"  # Default fallback
                    
                    # Find matching AI classification
                    for ai_class in ai_classifications:
                        if ai_class.get("order") == section_data["order"]:
                            section_type = ai_class.get("type", "general")
                            break
                    
                    structure_sections.append({
                        "name": section_data["name"],
                        "type": section_type,
                        "order": section_data["order"]
                    })
                    
            except json.JSONDecodeError:
                print(f"⚠️ Failed to parse AI classification response, using fallback")
                # Fallback: use general type for all sections
                for section_data in sections_for_analysis:
                    structure_sections.append({
                        "name": section_data["name"],
                        "type": "general",
                        "order": section_data["order"]
                    })
                    
        except Exception as classification_ex:
            print(f"⚠️ Error in AI section classification: {str(classification_ex)}")
            # Fallback: use general type for all sections
            for section_data in sections_for_analysis:
                structure_sections.append({
                    "name": section_data["name"],
                    "type": "general", 
                    "order": section_data["order"]
                })
        
        # Analyze tone and style using OpenAI
        tone = "professional"
        style = "business"
        
        if content_samples:
            try:
                # Combine content samples for analysis
                combined_content = "\n\n".join(content_samples[:5])  # Analyze first 5 sections max
                
                analysis_prompt = f"""
                Analyze the writing tone and style of this RFP response content. Provide a brief analysis in this exact format:
                
                Tone: [one word: professional/formal/conversational/technical/persuasive]
                Style: [one word: business/technical/academic/creative/consultative]
                
                Content to analyze:
                {combined_content}
                """
                
                response = client_section_data_populate.chat.completions.create(
                    model=os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o-mini"),
                    messages=[
                        {"role": "system", "content": "You are an expert in analyzing writing tone and style for business documents."},
                        {"role": "user", "content": analysis_prompt}
                    ],
                    max_tokens=200,
                    temperature=0.3
                )
                
                analysis_result = response.choices[0].message.content.strip()
                
                # Parse the response to extract tone and style
                lines = analysis_result.split('\n')
                for line in lines:
                    if line.startswith('Tone:'):
                        extracted_tone = line.split(':', 1)[1].strip().lower()
                        if extracted_tone in ['professional', 'formal', 'conversational', 'technical', 'persuasive']:
                            tone = extracted_tone
                    elif line.startswith('Style:'):
                        extracted_style = line.split(':', 1)[1].strip().lower()
                        if extracted_style in ['business', 'technical', 'academic', 'creative', 'consultative']:
                            style = extracted_style
                
            except Exception as analysis_ex:
                print(f"⚠️ Error analyzing tone/style: {str(analysis_ex)}")
                # Keep default values
        
        telemetry_client.track_trace(
            f"Structure matched for RFP ID '{rfp_id}' with {len(structure_sections)} sections (session: {session_id}, user: {user_id})",
            severity=1
        )
        
        print("--------------------")
        print(structure_sections)
        print("--------------------")

        # Generate content for each section based on matched tone and style
        created_sections = []
        sections_data_for_cosmos = []
        
        print(f"🔄 Generating content for {len(structure_sections)} sections with {tone} tone and {style} style...")
        
        # First, get the existing RFP data to see what sections already exist
        existing_rfp_data = await rfp_data_service.get_rfp_by_name(
            tenant_id=tenant_id,
            user_id=user_id,
            rfp_name=current_rfp_name
        )
        
        existing_sections = {}
        if existing_rfp_data and "sections" in existing_rfp_data:
            for section in existing_rfp_data["sections"]:
                section_name = section.get("SectionName", "")
                existing_sections[section_name] = section
        
        print(f"📋 Found {len(existing_sections)} existing sections in '{current_rfp_name}'")
        
        for section_structure in structure_sections:
            try:
                # Create content generation prompt based on matched tone and style
                content_prompt = f"""
                Create content for the RFP section "{section_structure['name']}" with the following characteristics:
                
                Section Type: {section_structure['type']}
                Writing Tone: {tone}
                Writing Style: {style}
                
                Requirements:
                - Write in a {tone} tone with a {style} style
                - Create substantial content (300-500 words minimum)
                - Focus on the specific requirements of a {section_structure['type']} section
                - Use professional language appropriate for RFP responses
                - Include specific details and examples where relevant
                - Structure content with clear headings and bullet points where appropriate
                
                Generate comprehensive content for this section:
                """
                
                # Generate content using OpenAI
                response = client_section_data_populate.chat.completions.create(
                    model=os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o-mini"),
                    messages=[
                        {"role": "system", "content": f"You are an expert RFP writer who creates high-quality content in a {tone} tone with a {style} style."},
                        {"role": "user", "content": content_prompt}
                    ],
                    max_tokens=1500,
                    temperature=0.7
                )
                
                generated_content = response.choices[0].message.content.strip()
                
                # Determine if this is a new section or replacing existing one
                is_new_section = section_structure["name"] not in existing_sections
                operation_type = "added" if is_new_section else "updated"
                
                # Create section data for response
                created_section = {
                    "name": section_structure["name"],
                    "content": generated_content,
                    "type": section_structure["type"],
                    "order": section_structure["order"],
                    "tone": tone,
                    "style": style,
                    "operation": operation_type
                }
                created_sections.append(created_section)
                
                print(f"✅ {operation_type.capitalize()} content for '{section_structure['name']}' ({len(generated_content)} chars)")
                
            except Exception as section_ex:
                print(f"⚠️ Error generating content for section '{section_structure['name']}': {str(section_ex)}")
                # Add empty section as fallback
                created_sections.append({
                    "name": section_structure["name"],
                    "content": f"[Content placeholder for {section_structure['name']} section]",
                    "type": section_structure["type"],
                    "order": section_structure["order"],
                    "tone": tone,
                    "style": style,
                    "error": str(section_ex),
                    "operation": "error"
                })
        
        # Now update/create sections in Cosmos DB
        try:
            print(f"💾 Updating RFP '{current_rfp_name}' with {len(created_sections)} sections...")
            
            sections_updated = 0
            sections_added = 0
            failed_sections = []
            
            for created_section in created_sections:
                try:
                    section_name = created_section["name"]
                    section_content = created_section["content"]
                    
                    if created_section["operation"] == "updated":
                        # Update existing section content
                        success = await rfp_data_service.update_section_content(
                            tenant_id=tenant_id,
                            user_id=user_id,
                            rfp_name=current_rfp_name,
                            section_name=section_name,
                            new_content=section_content,
                            image_data=existing_sections[section_name].get("Image", [])  # Preserve existing images
                        )
                        if success:
                            sections_updated += 1
                        else:
                            failed_sections.append(section_name)
                    else:
                        # Add new section
                        new_section_data = {
                            "SectionName": section_name,
                            "Content": section_content,
                            "Image": [],
                            "Confidence": 85
                        }
                        success = await rfp_data_service.add_new_section(
                            tenant_id=tenant_id,
                            user_id=user_id,
                            rfp_name=current_rfp_name,
                            section_data=new_section_data
                        )
                        if success:
                            sections_added += 1
                        else:
                            failed_sections.append(section_name)
                            
                except Exception as update_ex:
                    print(f"⚠️ Error updating section '{created_section['name']}': {str(update_ex)}")
                    failed_sections.append(created_section['name'])
            
            operation_summary = f"Updated {sections_updated} sections, added {sections_added} new sections"
            if failed_sections:
                operation_summary += f", failed: {len(failed_sections)} sections"
            
            print(f"✅ {operation_summary}")
            telemetry_client.track_trace(
                f"Matched structure applied to '{current_rfp_name}': {operation_summary} (source: {rfp_data['rfp_name']}, user: {user_id})",
                severity=1
            )
            
        except Exception as storage_ex:
            print(f"⚠️ Error updating sections in Cosmos DB: {str(storage_ex)}")
            telemetry_client.track_exception(storage_ex)

        return {
            "success": True,
            "message": f"Successfully matched structure from '{rfp_data['rfp_name']}' and applied to '{current_rfp_name}': {sections_updated} updated, {sections_added} added",
            "matchedStructure": {
                "sections": structure_sections,
                "tone": tone,
                "style": style
            },
            "createdSections": created_sections,
            "currentRfpName": current_rfp_name,
            "sectionsUpdated": sections_updated,
            "sectionsAdded": sections_added,
            "failedSections": failed_sections
        }
        
    except Exception as ex:
        print(f"Error in match_structure: {str(ex)}")
        telemetry_client.track_exception(ex)
        
        return {
            "success": False,
            "message": f"Failed to match structure: {str(ex)}"
        }

@router.post("/api/v1/rfp/importSelectedSections")
async def import_selected_sections(
    request: ImportSectionsRequest,
    current_user: dict = get_current_user_if_auth_enabled()
):
    """
    Import selected sections from past RFPs into the current RFP
    
    Request Body:
        {
          "sessionId": "session123",
          "rfpName": "Source RFP Name",
          "currentRfpName": "Target RFP Name", 
          "selectedSections": [
            {
              "id": "section_001",
              "name": "Executive Summary"
            }
          ]
        }
        
    Returns:
        {
          "message": "Sections imported successfully",
          "success": true,
          "updatedSections": [...],
          "operation": "mixed"
        }
    """
    try:
        # Extract user info from validated token (or use defaults if auth disabled)
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
        
        print(f"🔐 Importing {len(request.selectedSections)} sections from RFP '{request.rfpName}' into RFP '{request.currentRfpName}' for user: {user_name} <{user_email}>")
        
        print("Current RFP Name: ----------------", request.currentRfpName)
        # Initialize RFP Data Service
        rfp_data_service = RFPDataService()
        
        # Convert Pydantic models to dictionaries
        sections_to_import = [
            {"id": section.id, "name": section.name}
            for section in request.selectedSections
        ]
        
        # Import sections from source RFP to current RFP
        import_result = await rfp_data_service.import_sections_between_rfps(
            tenant_id=tenant_id,
            user_id=user_id,
            source_rfp_name=request.rfpName,
            current_rfp_name=request.currentRfpName,
            sections_to_import=sections_to_import
        )
        
        sections_imported = import_result["sections_imported"]
        sections_processed = import_result["sections_processed"]
        
        if sections_imported > 0:
            message = f"Successfully imported {sections_imported} out of {sections_processed} sections"
            if sections_imported < sections_processed:
                message += f". {sections_processed - sections_imported} sections could not be imported."
        else:
            message = "No sections were imported. Please check if the sections exist and have content."
        
        telemetry_client.track_trace(
            f"Imported {sections_imported}/{sections_processed} sections from '{request.rfpName}' into '{request.currentRfpName}' (session: {request.sessionId}, user: {user_id})",
            severity=1
        )
        
        return {
            "message": message,
            "success": sections_imported > 0,
            "updatedSections": import_result["updated_sections"],
            "operation": import_result["operation"]
        }
        
    except Exception as ex:
        print(f"Error importing sections from '{request.rfpName}' into '{request.currentRfpName}': {str(ex)}")
        telemetry_client.track_exception(ex)
        
        return {
            "message": f"Failed to import sections: {str(ex)}",
            "success": False,
            "updatedSections": [],
            "operation": "error"
        }

@router.get("/api/v1/rfp/getPricingSections")
async def get_pricing_sections(
    sessionId: str,
    rfpName: str,
    current_user: dict = get_current_user_if_auth_enabled()
):
    """
    Get all sections for a specific RFP with pricing/cost classification
    
    Query Parameters:
        sessionId: Session ID for the request
        rfpName: Name of the RFP to get sections for
        
    Returns:
        {
          sections: [
            {
              id: string,
              name: string,
              isPricingRelated: boolean
            }
          ],
          success: boolean
        }
    """
    try:
        # Extract user info from validated token (or use defaults if auth disabled)
        from application.services.auth_service import extract_user_info
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
        
        # Initialize RFP Data Service
        rfp_data_service = RFPDataService()
        
        # Get sections with pricing classification
        sections = await rfp_data_service.get_pricing_sections(
            tenant_id=tenant_id,
            user_id=user_id,
            rfp_name=rfpName
        )
        
        telemetry_client.track_trace(
            f"Retrieved {len(sections)} sections for RFP '{rfpName}' (session: {sessionId}, user: {user_id})",
            severity=1
        )
        
        return {
            "sections": sections,
            "success": True
        }
        
    except Exception as ex:
        telemetry_client.track_exception(ex)
        return {
            "sections": [],
            "success": False
        }

@router.post("/api/v1/rfp/pricingTable")
async def create_pricing_table(
    request: PricingTableRequest,
    current_user: dict = get_current_user_if_auth_enabled()
):
    """
    Create a professional pricing table and insert it into specified sections or create a new section
    
    Request Body:
        PricingTableRequest with rfpName, sessionId, selectedSections, currency, items, totals, etc.
        
    Returns:
        {
          "message": string,
          "success": boolean,
          "updatedSections": Array<{
            "id": string,
            "name": string,
            "type": string,
            "content": string,
            "completion_status": "empty" | "partial" | "complete",
            "confidence_score": number,
            "word_count": number,
            "completion_notes"?: string,
            "needs_response"?: boolean,
            "section_order"?: number,
            "isNewSection": boolean
          }>,
          "operation": "sections_updated" | "new_section_created" | "mixed"
        }
    """
    try:
        # Extract user info from validated token (or use defaults if auth disabled)
        from application.services.auth_service import extract_user_info
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
        
        # Initialize services
        rfp_data_service = RFPDataService()
        
        # Generate professional pricing table using LLM
        pricing_table_content = await generate_pricing_table_with_llm(request)
        
        updated_sections = []
        operations_performed = []
        message_parts = []
        
        # Handle existing sections if provided
        if request.selectedSections and len(request.selectedSections) > 0:
            # Append to existing sections
            updated_section_data = await rfp_data_service.append_content_to_sections_with_details(
                tenant_id=tenant_id,
                user_id=user_id,
                rfp_name=request.rfpName,
                section_ids=request.selectedSections,
                content_to_append=pricing_table_content
            )
            
            if not updated_section_data:
                raise Exception("Failed to append pricing table to selected sections")
            
            # Format updated sections for response
            for section_data in updated_section_data:
                word_count = len(section_data['content'].split()) if section_data['content'] else 0
                updated_sections.append({
                    "id": section_data['id'],
                    "name": section_data['name'],
                    "type": "pricing" if "pricing" in section_data['name'].lower() or "cost" in section_data['name'].lower() else "financial",
                    "content": section_data['content'],
                    "completion_status": "complete" if word_count > 50 else "partial" if word_count > 0 else "empty",
                    "confidence_score": 85,  # High confidence for generated pricing tables
                    "word_count": word_count,
                    "completion_notes": "Updated with pricing table content",
                    "needs_response": False,
                    "section_order": section_data.get('section_order', 0),
                    "isNewSection": False
                })
            
            operations_performed.append("sections_updated")
            message_parts.append(f"Pricing table added to {len(request.selectedSections)} existing section(s)")
        
        # Handle new section creation if sectionName is provided
        if request.sectionName and request.sectionName.strip():
            # Create new section with custom name
            section_name = request.sectionName.strip()
            
            new_section_data = await rfp_data_service.add_new_section_with_details(
                tenant_id=tenant_id,
                user_id=user_id,
                rfp_name=request.rfpName,
                section_name=section_name,
                section_content=pricing_table_content
            )
            
            # Format new section for response
            word_count = len(pricing_table_content.split()) if pricing_table_content else 0
            updated_sections.append({
                "id": new_section_data['id'],
                "name": new_section_data['name'],
                "type": "pricing",
                "content": new_section_data['content'],
                "completion_status": "complete" if word_count > 50 else "partial",
                "confidence_score": 90,  # Very high confidence for new generated section
                "word_count": word_count,
                "completion_notes": "New section created with pricing table",
                "needs_response": False,
                "section_order": new_section_data.get('section_order', 999),
                "isNewSection": True
            })
            
            operations_performed.append("new_section_created")
            message_parts.append(f"New '{section_name}' section created with pricing table")
        
        # Handle case where neither selectedSections nor sectionName is provided
        if not request.selectedSections and (not request.sectionName or not request.sectionName.strip()):
            # Create default new section
            section_name = "Pricing Table"
            
            new_section_data = await rfp_data_service.add_new_section_with_details(
                tenant_id=tenant_id,
                user_id=user_id,
                rfp_name=request.rfpName,
                section_name=section_name,
                section_content=pricing_table_content
            )
            
            # Format new section for response
            word_count = len(pricing_table_content.split()) if pricing_table_content else 0
            updated_sections.append({
                "id": new_section_data['id'],
                "name": new_section_data['name'],
                "type": "pricing",
                "content": new_section_data['content'],
                "completion_status": "complete" if word_count > 50 else "partial",
                "confidence_score": 90,  # Very high confidence for new generated section
                "word_count": word_count,
                "completion_notes": "New section created with pricing table",
                "needs_response": False,
                "section_order": new_section_data.get('section_order', 999),
                "isNewSection": True
            })
            
            operations_performed.append("new_section_created")
            message_parts.append(f"New '{section_name}' section created with pricing table")
        
        # Determine operation type and message
        if len(operations_performed) > 1:
            operation = "mixed"
            message = " and ".join(message_parts)
        elif len(operations_performed) == 1:
            operation = operations_performed[0]
            message = message_parts[0]
        else:
            raise Exception("No valid operations could be performed")
        
        telemetry_client.track_trace(
            f"Pricing table created for RFP '{request.rfpName}' (session: {request.sessionId}, user: {user_id})",
            severity=1
        )
        
        return {
            "message": message,
            "success": True,
            "updatedSections": updated_sections,
            "operation": operation
        }
        
    except Exception as ex:
        telemetry_client.track_exception(ex)
        return {
            "message": f"Failed to create pricing table: {str(ex)}",
            "success": False,
            "updatedSections": [],
            "operation": "error"
        }

@router.post("/api/v1/rfp/fileTable")
async def create_file_table(
    request: FileTableRequest,
    current_user: dict = get_current_user_if_auth_enabled()
):
    """
    Create a professional table from uploaded file data and insert it into specified sections or create a new section
    
    Request Body:
        FileTableRequest with rfpName, sessionId, selectedSections, tableData, etc.
        
    Returns:
        {
          "success": boolean,
          "message": string,
          "updatedSections": Array<{
            "id": string,
            "name": string,
            "type": string,
            "content": string,
            "completion_status": "empty" | "partial" | "complete",
            "confidence_score": number,
            "word_count": number,
            "completion_notes"?: string,
            "needs_response"?: boolean,
            "section_order"?: number,
            "isNewSection": boolean,
            "lastModified": string
          }>,
          "data": {
            "tableId": string,
            "rowsProcessed": number,
            "columnsDetected": number
          }
        }
    """
    try:
        # Extract user info from validated token (or use defaults if auth disabled)
        from application.services.auth_service import extract_user_info
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
        
        # Validate table data
        if not request.tableData or len(request.tableData) == 0:
            raise HTTPException(status_code=400, detail="Table data is required and cannot be empty")
        
        # Initialize services
        rfp_data_service = RFPDataService()
        
        # Generate professional table using LLM
        file_table_content = await generate_file_table_with_llm(request)
        
        updated_sections = []
        operations_performed = []
        message_parts = []
        
        # Handle existing sections if provided
        if request.selectedSections and len(request.selectedSections) > 0:
            # Append to existing sections
            updated_section_data = await rfp_data_service.append_content_to_sections_with_details(
                tenant_id=tenant_id,
                user_id=user_id,
                rfp_name=request.rfpName,
                section_ids=request.selectedSections,
                content_to_append=file_table_content
            )
            
            if not updated_section_data:
                raise Exception("Failed to append file table to selected sections")
            
            # Format updated sections for response
            for section_data in updated_section_data:
                word_count = len(section_data['content'].split()) if section_data['content'] else 0
                updated_sections.append({
                    "id": section_data['id'],
                    "name": section_data['name'],
                    "type": "data" if "data" in section_data['name'].lower() else "financial" if any(term in section_data['name'].lower() for term in ["cost", "price", "budget"]) else "general",
                    "content": section_data['content'],
                    "completion_status": "complete" if word_count > 50 else "partial" if word_count > 0 else "empty",
                    "confidence_score": 88,  # High confidence for generated file tables
                    "word_count": word_count,
                    "completion_notes": "Updated with file table content",
                    "needs_response": False,
                    "section_order": section_data.get('section_order', 0),
                    "isNewSection": False,
                    "lastModified": datetime.datetime.now(datetime.timezone.utc).isoformat()
                })
            
            operations_performed.append("sections_updated")
            message_parts.append(f"File table added to {len(request.selectedSections)} existing section(s)")
        
        # Handle new section creation if sectionName is provided
        if request.sectionName and request.sectionName.strip():
            # Create new section with custom name
            section_name = request.sectionName.strip()
            
            new_section_data = await rfp_data_service.add_new_section_with_details(
                tenant_id=tenant_id,
                user_id=user_id,
                rfp_name=request.rfpName,
                section_name=section_name,
                section_content=file_table_content
            )
            
            # Format new section for response
            word_count = len(file_table_content.split()) if file_table_content else 0
            updated_sections.append({
                "id": new_section_data['id'],
                "name": new_section_data['name'],
                "type": "data",
                "content": new_section_data['content'],
                "completion_status": "complete" if word_count > 50 else "partial",
                "confidence_score": 92,  # Very high confidence for new generated section
                "word_count": word_count,
                "completion_notes": "New section created with file table",
                "needs_response": False,
                "section_order": new_section_data.get('section_order', 999),
                "isNewSection": True,
                "lastModified": datetime.datetime.now(datetime.timezone.utc).isoformat()
            })
            
            operations_performed.append("new_section_created")
            message_parts.append(f"New '{section_name}' section created with file table")
        
        # Handle case where neither selectedSections nor sectionName is provided
        if not request.selectedSections and (not request.sectionName or not request.sectionName.strip()):
            # Create default new section with file name or generic name
            section_name = f"Data from {request.fileName}" if request.fileName else "File Data Table"
            
            new_section_data = await rfp_data_service.add_new_section_with_details(
                tenant_id=tenant_id,
                user_id=user_id,
                rfp_name=request.rfpName,
                section_name=section_name,
                section_content=file_table_content
            )
            
            # Format new section for response
            word_count = len(file_table_content.split()) if file_table_content else 0
            updated_sections.append({
                "id": new_section_data['id'],
                "name": new_section_data['name'],
                "type": "data",
                "content": new_section_data['content'],
                "completion_status": "complete" if word_count > 50 else "partial",
                "confidence_score": 90,  # High confidence for new generated section
                "word_count": word_count,
                "completion_notes": "New section created with file table",
                "needs_response": False,
                "section_order": new_section_data.get('section_order', 999),
                "isNewSection": True,
                "lastModified": datetime.datetime.now(datetime.timezone.utc).isoformat()
            })
            
            operations_performed.append("new_section_created")
            message_parts.append(f"New '{section_name}' section created with file table")
        
        # Determine operation type and message
        if len(operations_performed) > 1:
            operation = "mixed"
            message = " and ".join(message_parts)
        elif len(operations_performed) == 1:
            operation = operations_performed[0]
            message = message_parts[0]
        else:
            raise Exception("No valid operations could be performed")
        
        # Generate table metadata
        rows_processed = len(request.tableData)
        columns_detected = len(request.tableData[0].keys()) if request.tableData else 0
        table_id = f"table_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        telemetry_client.track_trace(
            f"File table created for RFP '{request.rfpName}' (session: {request.sessionId}, user: {user_id}, rows: {rows_processed}, cols: {columns_detected})",
            severity=1
        )
        
        return {
            "success": True,
            "message": f"File table successfully processed and {message.lower()}",
            "updatedSections": updated_sections,
            "data": {
                "tableId": table_id,
                "rowsProcessed": rows_processed,
                "columnsDetected": columns_detected
            }
        }
        
    except HTTPException:
        raise
    except Exception as ex:
        telemetry_client.track_exception(ex)
        return {
            "success": False,
            "message": f"Failed to create file table: {str(ex)}",
            "updatedSections": [],
            "data": {
                "tableId": "",
                "rowsProcessed": 0,
                "columnsDetected": 0
            }
        }

@app.get("/api/v1/rfps/user")
async def get_user_rfps(current_user: dict = get_current_user_if_auth_enabled()):
    """
    Get all RFPs for the authenticated user from the nested RFP_Data array
    """
    try:
        # Extract user info from validated token (or use defaults if auth disabled)
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
        
        # Initialize RFP Data Service
        rfp_data_service = RFPDataService()
        
        # Get user's RFP data
        user_data = await rfp_data_service.get_user_rfp_data(tenant_id, user_id)
        
        if not user_data or "RFP_Data" not in user_data:
            return {"success": True, "rfps": []}
        
        rfp_data_array = user_data.get("RFP_Data", [])
        
        # Transform the nested RFP data
        transformed_rfps = []
        for rfp in rfp_data_array:
            transformed_rfps.append({
                "RFP_Name": rfp.get("RFP_Name"),
                "sessionId": rfp.get("sessionId"),
                "createdAt": rfp.get("createdAt"),
                "updatedAt": rfp.get("updatedAt"),
                "exportedAt": rfp.get("exportedAt"),
                "sectionsCount": len(rfp.get("sections", [])),
                "isExported": rfp.get("isExported", False),
                "confidenceScore": rfp.get("confidenceScore", 0)
            })
        
        # Sort by updatedAt descending (newest first)
        transformed_rfps.sort(key=lambda x: x.get("updatedAt", ""), reverse=True)
        
        return {
            "success": True,
            "rfps": transformed_rfps
        }
        
    except Exception as e:
        telemetry_client.track_exception(e)
        return {"success": False, "message": str(e)}

@app.get("/api/v1/rfps/{session_id}")
async def load_rfp(session_id: str, current_user: dict = get_current_user_if_auth_enabled()):
    """
    Load a specific RFP by session ID from the nested RFP_Data array
    """
    try:
        # Extract user info from validated token (or use defaults if auth disabled)
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
        
        # Initialize RFP Data Service
        rfp_data_service = RFPDataService()
        
        # Get user's RFP data
        user_data = await rfp_data_service.get_user_rfp_data(tenant_id, user_id)
        
        if not user_data or "RFP_Data" not in user_data:
            return {"success": False, "message": "User not found"}
        
        rfp_data_array = user_data.get("RFP_Data", [])
        
        # Find the specific RFP by sessionId
        target_rfp = None
        for rfp in rfp_data_array:
            if rfp.get("sessionId") == session_id:
                target_rfp = rfp
                break
        
        if not target_rfp:
            return {"success": False, "message": "RFP not found"}
        
        # Transform sections back to the expected frontend format
        transformed_sections = {}
        for section in target_rfp.get("sections", []):
            section_name = section.get("SectionName")
            transformed_sections[section_name] = {
                "content": section.get("Content", ""),
                "original_section": {
                    "name": section_name,
                    "content": section.get("Content", ""),
                    "confidence_score": section.get("Confidence", 0),
                    "type": "standard",  # You might want to add this field to your schema
                    "completion_status": "complete" if section.get("Content") else "empty"
                },
                "last_edited": 0,  # You might want to add this field to your schema
                "edit_history": [],
                "isEdited": bool(section.get("Content")),
                "isGenerating": False,
                "wordCount": len(section.get("Content", "").split()) if section.get("Content") else 0
            }
        
        return {
            "success": True,
            "data": {
                "rfpName": target_rfp.get("RFP_Name"),
                "sessionId": target_rfp.get("sessionId"),
                "sections": transformed_sections,
                "analysisData": None,  # You might want to store this separately
                "status": "exported" if target_rfp.get("isExported") else "draft",
                "createdAt": target_rfp.get("createdAt"),
                "updatedAt": target_rfp.get("updatedAt"),
                "exportedAt": target_rfp.get("exportedAt")
            }
        }
        
    except Exception as e:
        telemetry_client.track_exception(e)
        return {"success": False, "message": str(e)}

@router.post("/api/v1/rfp/{rfp_name}/media/insert", response_model=InsertMediaResponse)
async def insert_media_into_rfp(
    rfp_name: str,
    request: InsertMediaRequest,
    authorization: str = Header(None),
    current_user: dict = get_current_user_if_auth_enabled()
):
    """
    Insert media (image/document) into RFP at specified location
    
    Path Parameters:
        rfp_name: Name of the RFP to insert media into
        
    Request Body:
        InsertMediaRequest with mediaItem and insertionOptions
        
    Returns:
        InsertMediaResponse with success status and insertion details
    """
    try:
        # Extract user info from validated token (or use defaults if auth disabled)
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)

        print("--------------------")
        print(request)
        print("--------------------")

        #Certificate will be treated as image for insertion purpose
        if(request.mediaItem.type == "certificate"):
            request.mediaItem.type = "image"

        # Extract access token from Authorization header for Graph API calls
        access_token = None
        if authorization and authorization.startswith("Bearer "):
            access_token = authorization.replace("Bearer ", "")
            print(f"🔑 Access token extracted for Graph API authentication")
        
        # Initialize Media Insertion Service
        media_service = MediaInsertionService()
        
        # Insert media into RFP
        result = await media_service.insert_media_into_rfp(
            rfp_name=rfp_name,
            request=request,
            tenant_id=tenant_id,
            user_id=user_id,
            access_token=access_token
        )
        
        # Log the operation
        if result.success:
            telemetry_client.track_event("Media_Inserted", {
                "rfp_name": rfp_name,
                "media_type": request.mediaItem.type,
                "media_name": request.mediaItem.name,
                "location_type": request.insertionOptions.location.type,
                "display_type": request.insertionOptions.displayOptions.type,
                "user_id": user_id,
                "tenant_id": tenant_id
            })
            print(f"✅ Media '{request.mediaItem.name}' successfully inserted into RFP '{rfp_name}'")
        else:
            telemetry_client.track_event("Media_Insertion_Failed", {
                "rfp_name": rfp_name,
                "media_type": request.mediaItem.type,
                "error_code": result.error.code if result.error else "unknown",
                "user_id": user_id
            })
            print(f"❌ Failed to insert media '{request.mediaItem.name}' into RFP '{rfp_name}': {result.error.message if result.error else 'Unknown error'}")
        
        return result
        
    except Exception as ex:
        print(f"Error in insert_media_into_rfp endpoint: {str(ex)}")
        telemetry_client.track_exception(ex)
        
        return InsertMediaResponse(
            success=False,
            error={
                "code": "ENDPOINT_ERROR",
                "message": f"Media insertion failed: {str(ex)}"
            }
        )

@router.post("/api/v1/rfp/{rfp_name}/insert-to-blob", response_model=InsertToBlobResponse)
async def insert_to_blob(
    rfp_name: str,
    request: InsertToBlobRequest,
    current_user: dict = get_current_user_if_auth_enabled()
):
    """
    Insert media items (documents) into Azure Blob Storage for a given RFP using _download_and_save_to_blob.
    """
    try:
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
        media_service = MediaInsertionService()
        uploaded = 0
        failed = 0
        for item in request.mediaItems:
            try:
                # Use downloadUrl if present, else fallback to url
                media_url = item.downloadUrl or item.url
                # Use googleDriveAccessToken if present
                access_token = item.googleDriveAccessToken
                # Use item.type for media_type, item.source for source
                isExtracted = False
                if item.type == "document":
                    isExtracted = True

                await media_service._download_and_save_to_blob(
                    media_url=media_url,
                    media_name=item.name,
                    tenant_id=tenant_id,
                    user_id=user_id,
                    rfp_name=rfp_name,
                    extract_content=isExtracted,
                    access_token=access_token,
                    source=item.source,
                    media_type=item.type
                )
                uploaded += 1
            except Exception as e:
                print(f"Failed to upload {item.name}: {e}")
                failed += 1
        if uploaded == len(request.mediaItems):
            return InsertToBlobResponse(success=True, message="Files saved successfully")
        elif uploaded > 0:
            return InsertToBlobResponse(success=True, message=f"{uploaded} files saved, {failed} failed")
        else:
            return InsertToBlobResponse(success=False, message="Failed to save files")
    except Exception as ex:
        print(f"Error in insert_to_blob: {str(ex)}")
        telemetry_client.track_exception(ex)
        return InsertToBlobResponse(success=False, message=f"Failed to save files: {str(ex)}")

@router.post("/api/v1/rfp/uploadFilesToBlob")
async def upload_files_to_blob(
    rfp_name: str = Form(...),
    mediaType: str = Form(...),
    files: List[UploadFile] = File(...),
    current_user: dict = get_current_user_if_auth_enabled()
):
    """
    Upload files directly to Azure Blob Storage for a given RFP
    
    Form Data:
        rfp_name: RFP identifier
        mediaType: Type of media - 'image', 'document', or 'certificate'
        files: Array of files to upload
        
    Returns:
        {
          rfpName: string,
          totalCount: number,
          images: Array<{name, blobUrl, size, source}>,
          documents: Array<{name, blobUrl, size, source}>,
          certificates: Array<{name, blobUrl, size, source}>
        }
    """
    try:
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
        
        print(f"📤 Uploading {len(files)} file(s) to blob for RFP '{rfp_name}' (Type: {mediaType}, Tenant: {tenant_id}, User: {user_id})")
        
        # Validate mediaType
        if mediaType not in ['image', 'document', 'certificate']:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid mediaType '{mediaType}'. Must be 'image', 'document', or 'certificate'."
            )
        
        # Get blob service client
        blob_service_client = await get_blob_service_client()
        container_client = blob_service_client.get_container_client("sharepoint-files")
        
        # Ensure container exists
        try:
            await container_client.get_container_properties()
        except:
            await container_client.create_container()
            print(f"📦 Created container 'sharepoint-files'")
        
        uploaded_files = []
        
        # Determine folder name based on media type (pluralized)
        media_folder = f"{mediaType}s" if not mediaType.endswith('s') else mediaType
        
        for file in files:
            try:
                # Read file content
                file_content = await file.read()
                file_size_bytes = len(file_content)
                
                # Format size
                if file_size_bytes < 1024:
                    size_str = f"{file_size_bytes} B"
                elif file_size_bytes < 1024 * 1024:
                    size_str = f"{file_size_bytes / 1024:.2f} KB"
                else:
                    size_str = f"{file_size_bytes / (1024 * 1024):.2f} MB"
                
                # Create blob path: tenant_id/user_id/rfp_name/manual/media_type/filename
                blob_name = f"{tenant_id}/{user_id}/{rfp_name}/manual/{media_folder}/{file.filename}"
                
                print(f"📁 Uploading '{file.filename}' to blob path: {blob_name}")
                
                # Get blob client and upload
                blob_client = container_client.get_blob_client(blob_name)
                await blob_client.upload_blob(file_content, overwrite=True)
                
                # Get blob URL
                blob_url = blob_client.url
                
                uploaded_files.append({
                    "name": file.filename,
                    "blobUrl": blob_url,
                    "size": size_str,
                    "source": "manual"
                })
                
                print(f"✅ Successfully uploaded '{file.filename}' ({size_str})")
                
            except Exception as file_ex:
                print(f"❌ Failed to upload '{file.filename}': {str(file_ex)}")
                telemetry_client.track_exception(file_ex)
        
        await close_blob_service_client()
        
        # Categorize uploaded files by type
        images = []
        documents = []
        certificates = []
        
        if mediaType == 'image':
            images = uploaded_files
        elif mediaType == 'document':
            documents = uploaded_files
        elif mediaType == 'certificate':
            certificates = uploaded_files
        
        total_count = len(uploaded_files)
        
        print(f"✅ Upload complete: {total_count} file(s) uploaded for RFP '{rfp_name}'")
        
        telemetry_client.track_event("Files_Uploaded_To_Blob", {
            "rfp_name": rfp_name,
            "media_type": mediaType,
            "files_count": total_count,
            "user_id": user_id,
            "tenant_id": tenant_id
        })
        
        return {
            "rfpName": rfp_name,
            "totalCount": total_count,
            "images": images,
            "documents": documents,
            "certificates": certificates
        }
        
    except HTTPException:
        raise
    except Exception as ex:
        print(f"Error uploading files to blob for RFP '{rfp_name}': {str(ex)}")
        telemetry_client.track_exception(ex)
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload files: {str(ex)}"
        )

@router.post("/api/v1/rfp/uploadFileFromUrl")
async def upload_file_from_url(
    request: UploadFileFromUrlRequest,
    current_user: dict = get_current_user_if_auth_enabled()
):
    """
    Download a file from URL and upload it to Azure Blob Storage for a given RFP
    
    Request Body:
        rfp_name: RFP identifier
        url: URL of the file to download
        mediaType: Type of media - 'image', 'document', or 'certificate'
        source: Source of the file (always 'manual' for this endpoint)
        
    Returns:
        {
          images: Array<{name, blobUrl, size}>,
          documents: Array<{name, blobUrl, size}>,
          certificates: Array<{name, blobUrl, size}>
        }
    """
    try:
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
        
        print(f"📤 Downloading file from URL for RFP '{request.rfp_name}' (Type: {request.mediaType}, Tenant: {tenant_id}, User: {user_id})")
        print(f"🔗 URL: {request.url}")
        
        # Validate mediaType
        if request.mediaType not in ['image', 'document', 'certificate']:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid mediaType '{request.mediaType}'. Must be 'image', 'document', or 'certificate'."
            )
        
        # Download file from URL
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(request.url)
                response.raise_for_status()
                file_content = response.content
                
                # Extract filename from URL or Content-Disposition header
                filename = None
                if 'content-disposition' in response.headers:
                    content_disposition = response.headers['content-disposition']
                    if 'filename=' in content_disposition:
                        filename = content_disposition.split('filename=')[1].strip('"')
                
                if not filename:
                    # Extract from URL
                    from urllib.parse import urlparse, unquote
                    parsed_url = urlparse(request.url)
                    filename = unquote(os.path.basename(parsed_url.path))
                    
                    # If still no filename, generate one
                    if not filename or filename == '':
                        # Try to get extension from content-type
                        content_type = response.headers.get('content-type', '')
                        extension = ''
                        if 'pdf' in content_type:
                            extension = '.pdf'
                        elif 'image' in content_type:
                            if 'jpeg' in content_type or 'jpg' in content_type:
                                extension = '.jpg'
                            elif 'png' in content_type:
                                extension = '.png'
                        elif 'word' in content_type or 'document' in content_type:
                            extension = '.docx'
                        
                        filename = f"downloaded_file_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}{extension}"
                
                print(f"📥 Downloaded file: {filename} ({len(file_content)} bytes)")
                
                # Validate file type matches mediaType
                content_type = response.headers.get('content-type', '').lower()
                file_extension = os.path.splitext(filename)[1].lower()
                
                # Define allowed types for each mediaType
                if request.mediaType == 'image':
                    # For images, reject PDFs and documents
                    if 'pdf' in content_type or file_extension == '.pdf':
                        raise HTTPException(
                            status_code=400,
                            detail=f"Cannot upload PDF file as image. MediaType is 'image' but file is PDF."
                        )
                    if any(doc_type in content_type for doc_type in ['word', 'document', 'msword', 'officedocument']):
                        raise HTTPException(
                            status_code=400,
                            detail=f"Cannot upload document file as image. MediaType is 'image' but file is a document."
                        )
                    if file_extension in ['.doc', '.docx', '.txt', '.csv', '.xlsx', '.xls']:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Cannot upload {file_extension} file as image. MediaType is 'image' but file type is {file_extension}."
                        )
                    # Verify it's actually an image
                    if 'image' not in content_type and file_extension not in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp']:
                        raise HTTPException(
                            status_code=400,
                            detail=f"File type mismatch. MediaType is 'image' but file appears to be: {content_type or file_extension}"
                        )
                
                elif request.mediaType == 'document':
                    # For documents, allow PDFs and office documents, reject images
                    if 'image' in content_type:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Cannot upload image file as document. MediaType is 'document' but file is an image."
                        )
                    if file_extension in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp']:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Cannot upload {file_extension} file as document. MediaType is 'document' but file is an image."
                        )
                
                elif request.mediaType == 'certificate':
                    # Certificates should only be images, reject PDFs and documents
                    if 'pdf' in content_type or file_extension == '.pdf':
                        raise HTTPException(
                            status_code=400,
                            detail=f"Cannot upload PDF file as certificate. MediaType is 'certificate' but file is PDF. Only image files are allowed."
                        )
                    if any(doc_type in content_type for doc_type in ['word', 'msword', 'sheet', 'excel', 'document', 'officedocument']):
                        raise HTTPException(
                            status_code=400,
                            detail=f"Cannot upload document file as certificate. MediaType is 'certificate' but file is a document. Only image files are allowed."
                        )
                    if file_extension in ['.doc', '.docx', '.xlsx', '.xls', '.csv', '.txt']:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Cannot upload {file_extension} file as certificate. MediaType is 'certificate' but file type is {file_extension}. Only image files are allowed."
                        )
                    # Verify it's actually an image
                    if 'image' not in content_type and file_extension not in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp']:
                        raise HTTPException(
                            status_code=400,
                            detail=f"File type mismatch. MediaType is 'certificate' but file appears to be: {content_type or file_extension}. Only image files are allowed."
                        )
                
                print(f"✅ File type validation passed for mediaType '{request.mediaType}'")
                
        except httpx.HTTPError as http_ex:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to download file from URL: {str(http_ex)}"
            )
        
        # Get blob service client
        blob_service_client = await get_blob_service_client()
        container_client = blob_service_client.get_container_client("sharepoint-files")
        
        # Ensure container exists
        try:
            await container_client.get_container_properties()
        except:
            await container_client.create_container()
            print(f"📦 Created container 'sharepoint-files'")
        
        # Determine folder name based on media type (pluralized)
        media_folder = f"{request.mediaType}s" if not request.mediaType.endswith('s') else request.mediaType
        
        # Calculate file size
        file_size_bytes = len(file_content)
        if file_size_bytes < 1024:
            size_str = f"{file_size_bytes} B"
        elif file_size_bytes < 1024 * 1024:
            size_str = f"{file_size_bytes / 1024:.2f} KB"
        else:
            size_str = f"{file_size_bytes / (1024 * 1024):.2f} MB"
        
        # Create blob path: tenant_id/user_id/rfp_name/manual/media_type/filename
        # Source is always 'manual' for this endpoint
        blob_name = f"{tenant_id}/{user_id}/{request.rfp_name}/manual/{media_folder}/{filename}"
        
        print(f"📁 Uploading '{filename}' to blob path: {blob_name}")
        
        # Get blob client and upload
        blob_client = container_client.get_blob_client(blob_name)
        await blob_client.upload_blob(file_content, overwrite=True)
        
        # Get blob URL
        blob_url = blob_client.url
        
        uploaded_file = {
            "name": filename,
            "blobUrl": blob_url,
            "size": size_str
        }
        
        print(f"✅ Successfully uploaded '{filename}' ({size_str})")
        
        await close_blob_service_client()
        
        # Categorize uploaded file by type
        images = []
        documents = []
        certificates = []
        
        if request.mediaType == 'image':
            images = [uploaded_file]
        elif request.mediaType == 'document':
            documents = [uploaded_file]
        elif request.mediaType == 'certificate':
            certificates = [uploaded_file]
        
        telemetry_client.track_event("File_Uploaded_From_URL", {
            "rfp_name": request.rfp_name,
            "media_type": request.mediaType,
            "source": "manual",
            "url": request.url,
            "user_id": user_id,
            "tenant_id": tenant_id
        })
        
        return {
            "images": images,
            "documents": documents,
            "certificates": certificates
        }
        
    except HTTPException:
        raise
    except Exception as ex:
        print(f"Error uploading file from URL for RFP '{request.rfp_name}': {str(ex)}")
        telemetry_client.track_exception(ex)
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload file from URL: {str(ex)}"
        )

@router.get("/api/v1/rfp/getBlobData")
async def get_blob_data(
    rfp_name: str,
    current_user: dict = get_current_user_if_auth_enabled()
):
    """
    Get all blob files (images, documents, certificates) for a specific RFP from Azure Blob Storage
    
    Query Parameters:
        rfp_name: Name of the RFP to get blob data for
        
    Returns:
        {
          rfpName: string,
          totalCount: number,
          images: Array<{name, blobUrl, size, source}>,
          documents: Array<{name, blobUrl, size, source}>,
          certificates: Array<{name, blobUrl, size, source}>
        }
    """
    try:
        tenant_id, user_email, user_name, user_id = extract_user_info(current_user)
        
        print(f"🔍 Retrieving blob data for RFP '{rfp_name}' (Tenant: {tenant_id}, User: {user_id})")
        
        # Get blob service client
        blob_service_client = await get_blob_service_client()
        container_client = blob_service_client.get_container_client("sharepoint-files")
        
        print(f"📦 Container name: {CONTAINER_NAME}")
        
        # Build the prefix path for this user's RFP
        prefix = f"{tenant_id}/{user_id}/{rfp_name}/"
        
        images = []
        documents = []
        certificates = []
        
        # List all blobs with the prefix
        print(f"🔍 Listing blobs with prefix: {prefix}")
        
        blob_count = 0
        async for blob in container_client.list_blobs(name_starts_with=prefix):
            blob_count += 1
            print(f"📄 Found blob #{blob_count}: {blob.name}, size: {blob.size}")
            print(f"📄 Found blob: {blob.name}, size: {blob.size}")
            
            # Parse blob name to extract source and media type
            # Expected format: tenant_id/user_id/rfp_name/source/media_type/filename
            blob_path_parts = blob.name.split('/')
            
            print(f"🔍 Blob path parts ({len(blob_path_parts)}): {blob_path_parts}")
            
            if len(blob_path_parts) >= 6:
                source_folder = blob_path_parts[3]  # sharepoint or drive
                media_type_folder = blob_path_parts[4]  # images, documents, certificates
                file_name = '/'.join(blob_path_parts[5:])  # filename (may contain /)
                
                print(f"✅ Parsed - Source: {source_folder}, Type: {media_type_folder}, File: {file_name}")
                
                # Determine source based on folder name
                if source_folder == 'sharepoint':
                    source = 'sharepoint'
                elif source_folder == 'drive':
                    source = 'drive'
                elif source_folder == 'manual':
                    source = 'manual'
                else:
                    source = 'upload'
                
                # Get blob URL
                blob_client = container_client.get_blob_client(blob.name)
                blob_url = blob_client.url
                
                # Format size in KB/MB
                size_bytes = blob.size
                if size_bytes < 1024:
                    size_str = f"{size_bytes} B"
                elif size_bytes < 1024 * 1024:
                    size_str = f"{size_bytes / 1024:.2f} KB"
                else:
                    size_str = f"{size_bytes / (1024 * 1024):.2f} MB"
                
                # Create file object
                file_obj = {
                    "name": file_name,
                    "blobUrl": blob_url,
                    "size": size_str,
                    "source": source
                }
                
                # Categorize by media type
                if media_type_folder == 'images':
                    images.append(file_obj)
                    print(f"📸 Added to images")
                elif media_type_folder == 'documents':
                    documents.append(file_obj)
                    print(f"📄 Added to documents")
                elif media_type_folder == 'certificates':
                    certificates.append(file_obj)
                    print(f"📜 Added to certificates")
            else:
                print(f"⚠️ Skipping blob - insufficient path parts (expected >= 6, got {len(blob_path_parts)})")
        
        total_count = len(images) + len(documents) + len(certificates)
        
        print(f"✅ Found {total_count} files for RFP '{rfp_name}': {len(images)} images, {len(documents)} documents, {len(certificates)} certificates")
        
        await close_blob_service_client()
        
        return {
            "rfpName": rfp_name,
            "totalCount": total_count,
            "images": images,
            "documents": documents,
            "certificates": certificates
        }
        
    except Exception as ex:
        print(f"Error retrieving blob data for RFP '{rfp_name}': {str(ex)}")
        telemetry_client.track_exception(ex)
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve blob data: {str(ex)}"
        )

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