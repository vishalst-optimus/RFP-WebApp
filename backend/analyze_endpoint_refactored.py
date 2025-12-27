"""
Refactored RFP Analyze Endpoint

This contains the new clean analyze endpoint to replace the complex existing one.
Copy this logic into server.py to replace the existing analyze_rfp function.
"""

from fastapi import FastAPI, Form, File, UploadFile, HTTPException, status
import time
import os
from application.services.logging_service.logging import telemetry_client

async def analyze_rfp_refactored(
    session_id: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Refactored RFP Analysis Endpoint with new 3-section structure:
    1. Executive Summary
    2. Direct Responses to RFP Questions  
    3. Other Required Sections
    """
    start_time = time.time()
    print(f"🔍 Starting refactored RFP analysis for session: {session_id}")
    
    try:
        # Step 1: Extract document content using Azure Document Intelligence
        file_content = await file.read()
        file_name = file.filename
        telemetry_client.track_trace(f"Starting refactored RFP analysis for: {file_name}", severity=1)

        print("Step 1: Extracting document content with Azure Document Intelligence...")
        from infrastructure.tools.tool_definations.rfp_analyzer_tool import RfpAnalyzerTool
        
        analyzer = RfpAnalyzerTool(
            azure_docint_endpoint=os.environ["AZURE_DOCINT_ENDPOINT"],
            azure_docint_key=os.environ["AZURE_DOCINT_KEY"],
            telemetry_client=telemetry_client
        )
        
        adi_result_object = analyzer.analyze_document(file_content, file_name)
        if not adi_result_object or not adi_result_object.content:
            raise Exception("Failed to extract content from document")
        
        print(f"✅ Document content extracted: {len(adi_result_object.content)} characters")
        
        # Step 2: Apply refactored 3-section analysis
        print("Step 2: Applying refactored 3-section analysis...")
        print("  - Section 1: Executive Summary (company details)")
        print("  - Section 2: Direct Responses to RFP Questions")
        print("  - Section 3: Other Required Sections")
        
        from application.services.rfp_analysis_refactor import analyze_rfp_with_refactored_structure
        analysis_result = analyze_rfp_with_refactored_structure(adi_result_object.content)
        
        if not analysis_result.get("analysis_success"):
            print("⚠️  Refactored analysis had issues, using minimal structure...")
            analysis_result = {
                "analysis_success": True,
                "rfp_structure": "minimal_fallback",
                "sections": [
                    {
                        "section_name": "Executive Summary",
                        "section_type": "executive_summary",
                        "section_order": 1,
                        "content": "[Executive Summary - Company overview and project understanding needed]",
                        "completion_status": "needs_company_content",
                        "needs_response": True,
                        "response_priority": "high",
                        "content_gaps": ["Need: Company overview", "Need: Project understanding"]
                    },
                    {
                        "section_name": "RFP Content Response",
                        "section_type": "general_response",
                        "section_order": 2,
                        "content": "[RFP Response - Detailed analysis and response needed]",
                        "completion_status": "needs_detailed_analysis",
                        "needs_response": True,
                        "response_priority": "high",
                        "content_gaps": ["Need: Detailed RFP analysis", "Need: Company capabilities"]
                    }
                ],
                "total_sections": 2,
                "sections_needing_response": 2,
                "table_of_contents": "1. Executive Summary\n2. RFP Content Response",
                "questions_analysis": {"questions_section_found": False, "total_questions": 0}
            }
        
        # Step 3: Format sections for response
        print("Step 3: Formatting sections for response...")
        sections_response = []
        
        for section in analysis_result.get("sections", []):
            formatted_section = {
                "name": section.get("section_name", "Unknown Section"),
                "type": section.get("section_type", "other"),
                "content": section.get("content", ""),
                "word_count": section.get("word_count", 0),
                "completion_status": section.get("completion_status", "needs_content"),
                "needs_response": section.get("needs_response", True),
                "content_gaps": section.get("content_gaps", []),
                "response_priority": section.get("response_priority", "medium"),
                "section_order": section.get("section_order", 0)
            }
            
            # Add questions-specific data if it's the questions section
            if section.get("section_type") == "rfp_questions_responses":
                formatted_section.update({
                    "individual_questions": section.get("individual_questions", []),
                    "total_questions": section.get("total_questions", 0),
                    "questions_section_name": section.get("questions_section_name", "")
                })
                print(f"  ✅ Questions section: {formatted_section['total_questions']} questions found")
            
            sections_response.append(formatted_section)
        
        processing_time = time.time() - start_time
        questions_found = analysis_result.get("questions_analysis", {}).get("total_questions", 0)
        
        print(f"✅ Refactored analysis complete:")
        print(f"  - Processing time: {processing_time:.2f}s")
        print(f"  - Total sections: {len(sections_response)}")
        print(f"  - Questions found: {questions_found}")
        print(f"  - Structure: {analysis_result.get('rfp_structure', 'unknown')}")
        
        telemetry_client.track_trace(f"Refactored RFP analysis completed: {len(sections_response)} sections, {questions_found} questions", severity=1)

        return {
            "session_id": session_id,
            "file_name": file_name,
            "status": "analyzed",
            "processing_time": round(processing_time, 2),
            "rfp_structure": analysis_result.get("rfp_structure", "refactored_3_section"),
            "table_of_contents": analysis_result.get("table_of_contents", ""),
            "total_sections": analysis_result.get("total_sections", len(sections_response)),
            "sections_needing_response": analysis_result.get("sections_needing_response", len(sections_response)),
            "sections": sections_response,
            "questions_analysis": analysis_result.get("questions_analysis", {}),
            "submission_info": analysis_result.get("submission_info", {}),
            "refactored": True  # Flag to indicate new structure
        }
        
    except Exception as ex:
        print(f"❌ Error in refactored analyze_rfp: {ex}")
        telemetry_client.track_exception(ex)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Refactored RFP analysis failed: {str(ex)}")