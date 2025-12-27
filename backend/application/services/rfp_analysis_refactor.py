"""
Refactored RFP Analysis Service

New Logic:
1. Executive Summary section - company details and overview
2. Direct Responses to RFP Questions - specific questions from "Questions To Be Answered" section
3. Other sections - remaining content not covered in Q&A section
"""

import os
import json
import requests
from typing import Dict, List, Any, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor
import time
import re
from dotenv import load_dotenv

load_dotenv(r"apps\backend\credentials.env")


class RefactoredRFPAnalyzer:
    """Refactored RFP Analyzer following new 3-section structure"""
    
    def __init__(self):
        self.azure_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
        self.azure_key = os.environ.get("AZURE_OPENAI_KEY")
        self.deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4")
        self.api_version = "2024-10-21"
        
        # Client extraction LLM (small/fast model)
        self.client_llm_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT", self.azure_endpoint)
        self.client_llm_key = os.environ.get("AZURE_OPENAI_KEY", self.azure_key)
        self.client_llm_deployment = os.environ.get("CLIENT_EXTRACTION_LLM_DEPLOYMENT", "gpt-4o-mini")
    
    def analyze_rfp_with_new_structure(self, document_content: str) -> Dict:
        """
        Analyze RFP document and create structured response with:
        1. Client Information (auto-generated)
        2. Executive Summary
        3. Direct Responses to RFP Questions  
        4. Other necessary sections
        """
        try:
            print("🔍 Starting refactored RFP analysis...")
            
            # Start client extraction in parallel thread (fast LLM)
            client_extraction_thread = None
            client_info_data = {}
            
            with ThreadPoolExecutor(max_workers=2) as executor:
                # Step 1: Start client information extraction in parallel
                client_future = executor.submit(self.extract_client_information, document_content)
                
                # Step 2: Identify and extract the Questions section (main thread)
                questions_section_data = self.extract_rfp_questions_section(document_content)
                
                # Step 3: Extract remaining content for other sections
                other_sections_data = self.extract_other_sections(document_content, questions_section_data)
                
                # Step 4: Wait for client extraction to complete
                try:
                    client_info_data = client_future.result(timeout=15)  # 15 second timeout for LLM call
                    print("✅ Client extraction completed successfully")
                except TimeoutError:
                    print("⚠️ Client extraction timed out after 15 seconds - using fallback data")
                    client_info_data = self._get_empty_client_data()
                except Exception as e:
                    print(f"⚠️ Client extraction failed: {e}")
                    client_info_data = self._get_empty_client_data()
            
            # Step 5: Create structured response including client section
            structured_response = self.create_structured_response(client_info_data, questions_section_data, other_sections_data)
            
            return structured_response
            
        except Exception as e:
            print(f"Error in refactored RFP analysis: {e}")
            return {"error": f"Analysis failed: {str(e)}"}
    
    def _get_empty_client_data(self) -> Dict:
        """Return empty client data structure as fallback"""
        return {
            "company": None,
            "address": None,
            "email": None,
            "contact_person": None,
            "phone": None,
            "website": None
        }
    
    def extract_client_information(self, document_content: str) -> Dict:
        """
        Extract client information from RFP document using LLM-based extraction.
        This creates a pre-filled client section without AI generation.
        """
        print("📋 Extracting client information using LLM...")
        
        # Initialize client data structure
        client_data = {
            "company": None,
            "address": None,
            "email": None,
            "contact_person": None,
            "phone": None,
            "website": None
        }
        
        try:
            # Use first 3000 characters (header/intro content where client info usually appears)
            content_sample = document_content[:3000]
            
            system_prompt = """You are a document analyzer specializing in extracting client/organization information from RFP documents.

Your task: Extract the issuing organization, company, government entity, or client details from this RFP document.

IMPORTANT: Return ONLY a valid JSON object with these exact fields:
- company: The name of the organization issuing this RFP
- address: Full address of the organization 
- email: Contact email address
- contact_person: Name of the contact person
- phone: Phone number
- website: Website URL

Rules:
- If a field is not found, use null (not empty string)
- For company: Look for the organization that ISSUED/CREATED this RFP (not vendors)
- Extract exactly as written in the document
- Return valid JSON only, no explanations"""

            user_prompt = f"""Extract client information from this RFP document content:

{content_sample}

Return the JSON object with the extracted information:"""

            response = self._call_client_extraction_llm(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                use_json_format=True,
                max_tokens=500
            )
            
            if response:
                # Parse JSON response
                extracted_data = json.loads(response)
                
                # Update client_data with extracted values
                for key in client_data.keys():
                    if key in extracted_data and extracted_data[key]:
                        client_data[key] = str(extracted_data[key]).strip()
                
                fields_found = sum(1 for v in client_data.values() if v)
                print(f"✅ LLM extraction complete: {fields_found} fields found")
                
            else:
                print("❌ LLM extraction failed")
                
        except json.JSONDecodeError as e:
            print(f"❌ JSON parsing error in client extraction: {e}")
        except Exception as e:
            print(f"❌ Error in LLM client extraction: {e}")
        
        # Fallback: basic pattern matching for email if LLM failed
        if not client_data["email"]:
            email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
            email_matches = re.findall(email_pattern, document_content)
            if email_matches:
                client_data["email"] = email_matches[0]
                print("📧 Found email using fallback pattern matching")
        
        return client_data
    
    def extract_rfp_questions_section(self, document_content: str) -> Dict:
        """
        Extract the specific 'Questions To Be Answered' section from RFP.
        This is the most critical section containing specific questions.
        """
        questions_extraction_prompt = f"""You are an expert RFP analyzer. Your primary task is to find and extract the "Questions To Be Answered" section from this RFP document.

RFP Document Content:
{document_content[:15000]}

CRITICAL INSTRUCTIONS:
1. Look for sections with names like:
   - "Questions To Be Answered"
   - "Vendor Questions"
   - "Response Requirements"
   - "Submission Questions"
   - "Evaluation Questions"
   - "Questionnaire"
   - "Requirements for Response"
   - Or similar question-focused section names

2. Extract ALL individual questions from this section
3. Number each question for easy reference
4. Identify the question type (technical, experience, compliance, pricing, etc.)

Return JSON structure:
{{
  "questions_section_found": true/false,
  "questions_section_name": "exact section name found",
  "questions_section_content": "full content of the questions section",
  "individual_questions": [
    {{
      "question_number": 1,
      "question_text": "exact question text",
      "question_type": "technical|experience|compliance|pricing|general",
      "requires_specific_response": true/false,
      "keywords": ["key", "terms"],
      "estimated_response_length": "short|medium|long"
    }}
  ],
  "total_questions": number,
  "section_importance": "high|medium|low"
}}

Focus on finding the dedicated questions section that vendors must answer specifically."""

        try:
            response = self._call_azure_openai(
                system_prompt="You are an expert RFP questions extractor focused on finding the main questions section.",
                user_prompt=questions_extraction_prompt,
                use_json_format=True,
                max_tokens=3000
            )
            
            if response:
                questions_data = json.loads(response)
                print(f"✅ Questions section analysis: Found {questions_data.get('total_questions', 0)} questions")
                return questions_data
            else:
                print("❌ Azure OpenAI returned no response for questions extraction")
                raise Exception("Azure OpenAI API failed to return response for questions extraction")
            
        except json.JSONDecodeError as e:
            print(f"❌ JSON parsing error in questions extraction: {e}")
            raise Exception(f"Failed to parse questions extraction response: {str(e)}")
        except Exception as e:
            print(f"❌ Error extracting questions section: {e}")
            raise e
    
    def extract_other_sections(self, document_content: str, questions_data: Dict) -> Dict:
        """
        Extract other RFP sections that are NOT covered in the questions section.
        Focus on content needed for Executive Summary and other response sections.
        """
        # Remove questions section content to avoid duplication
        questions_content = questions_data.get('questions_section_content', '')
        remaining_content = document_content
        if questions_content:
            remaining_content = document_content.replace(questions_content, '[QUESTIONS SECTION REMOVED]')
        
        other_sections_prompt = f"""Analyze this RFP content and intelligently determine the MINIMAL set of response sections needed to answer everything in the RFP.

RFP CONTENT TO ANALYZE:
{remaining_content[:12000]}

ALREADY EXTRACTED QUESTIONS:
- Section: {questions_data.get('questions_section_name', 'None')}
- Questions Count: {questions_data.get('total_questions', 0)}
- Questions Preview: {[q.get('question_text', '')[:100] for q in questions_data.get('individual_questions', [])][:3]}

YOUR INTELLIGENT ANALYSIS TASK:
1. **Analyze ALL content** - Look at requirements, questions, evaluation criteria, project details
2. **Group by theme** - What topics/themes appear across the RFP content?
3. **Create minimal sections** - What's the SMALLEST number of logical response sections that can address everything?
4. **Smart section names** - Create clear, descriptive names that reflect what vendors need to provide

THINKING PROCESS:
- If RFP has questions about "company experience", "past projects", "team qualifications" → Group into "Company Qualifications & Experience"
- If RFP asks about "technical approach", "methodology", "tools" → Group into "Technical Approach"
- If RFP asks about "project timeline", "milestones", "delivery schedule" → Group into "Project Timeline & Delivery"
- If RFP asks about "pricing", "cost breakdown", "payment terms" → Group into "Pricing & Commercial Terms"

CRITICAL RULES:
- Create LOGICAL groupings, not just copy RFP headings
- Minimize number of sections - group related themes together  
- Focus on what VENDORS need to provide, not what RFP is asking about
- Section names should be clear about what the response will contain

Return JSON structure:
{{
  "requires_executive_summary": true/false,
  "executive_summary_justification": "why executive summary is/isn't needed based on RFP content",
  "response_sections": [
    {{
      "section_name": "Clear descriptive name for vendor response",
      "section_purpose": "What this section will contain from vendor perspective",
      "addresses_rfp_content": ["what RFP requirements/questions this section answers"],
      "content_themes": ["main themes this section covers"],
      "importance": "critical|high|medium|low",
      "estimated_length": "short|medium|long"
    }}
  ],
  "submission_requirements": {{
    "format_requirements": "only if specified",
    "deadline": "only if mentioned", 
    "delivery_method": "only if specified"
  }},
  "analysis_summary": "brief explanation of the logical grouping approach used"
}}

GOAL: Create the most logical, minimal set of response sections that comprehensively address the RFP."""

        try:
            response = self._call_azure_openai(
                system_prompt="You are an expert RFP analyst and proposal strategist. Analyze RFP content intelligently and create the minimal, most logical response sections that address all requirements efficiently.",
                user_prompt=other_sections_prompt,
                use_json_format=True,
                max_tokens=3000
            )
            
            if response:
                other_data = json.loads(response)
                response_sections = other_data.get('response_sections', [])
                print(f"✅ Intelligent analysis complete: {len(response_sections)} logical response sections created")
                print(f"   Analysis summary: {other_data.get('analysis_summary', 'No summary provided')}")
                for section in response_sections:
                    print(f"   → {section.get('section_name')}: {section.get('section_purpose')}")
                return other_data
            else:
                print("❌ Azure OpenAI returned no response for other sections extraction")
                raise Exception("Azure OpenAI API failed to return response for other sections extraction")
            
        except json.JSONDecodeError as e:
            print(f"❌ JSON parsing error in other sections extraction: {e}")
            raise Exception(f"Failed to parse other sections extraction response: {str(e)}")
        except Exception as e:
            print(f"❌ Error extracting other sections: {e}")
            raise e
    
    def _determine_section_type(self, content_themes: List[str]) -> str:
        """
        Intelligently determine section type based on content themes
        """
        themes_str = ' '.join(content_themes).lower()
        
        if any(word in themes_str for word in ['experience', 'qualification', 'background', 'capability']):
            return 'company_qualifications'
        elif any(word in themes_str for word in ['technical', 'approach', 'methodology', 'solution']):
            return 'technical_approach'
        elif any(word in themes_str for word in ['timeline', 'schedule', 'delivery', 'milestone']):
            return 'project_timeline'
        elif any(word in themes_str for word in ['pricing', 'cost', 'budget', 'commercial']):
            return 'pricing_commercial'
        elif any(word in themes_str for word in ['team', 'staff', 'personnel', 'resource']):
            return 'team_resources'
        elif any(word in themes_str for word in ['implementation', 'execution', 'deployment']):
            return 'implementation_plan'
        else:
            return 'general_response'
    
    def create_structured_response(self, client_info_data: Dict, questions_data: Dict, other_data: Dict) -> Dict:
        """
        Create dynamic structured response based only on what's actually found in the RFP.
        No hardcoded sections - only create what the RFP actually requires.
        """
        print("📝 Creating dynamic structured response based on actual RFP content...")
        structured_sections = []
        section_order = 1
        
        # Import the template function
        from common.prompts.prompts import format_client_information_section
        
        # Always include Client Information section (auto-generated, no AI needed)
        client_section = {
            "section_name": "Client Information",
            "section_type": "client_information", 
            "section_order": section_order,
            "content": format_client_information_section(client_info_data),
            "word_count": len(format_client_information_section(client_info_data).split()),
            "completion_status": "complete", 
            "needs_response": False,  # Skip AI generation
            "confidence_score": 1.0,  # Always 100% confident in extracted data
            "completion_notes": "Auto-generated from document analysis with submission placeholders",
            "response_priority": "critical",
            "client_data": client_info_data  # Store raw client data for DOCX generation
        }
        structured_sections.append(client_section)
        section_order += 1
        
        # Only add Executive Summary if other_data suggests it's needed
        if other_data.get('executive_summary_content') or other_data.get('requires_executive_summary'):
            print("   Adding Executive Summary - found indicators in RFP")
            executive_summary = {
                "section_name": "Executive Summary",
                "section_type": "executive_summary",
                "section_order": section_order,
                "content": self._generate_executive_summary_content(other_data.get('executive_summary_content', {})),
                "word_count": 0,
                "completion_status": "needs_company_content",
                "needs_response": True,
                "content_gaps": [
                    "Need: Company overview and value proposition",
                    "Need: Relevant experience and capabilities", 
                    "Need: Understanding of client requirements",
                    "Need: Key differentiators and benefits"
                ],
                "response_priority": "high"
            }
            structured_sections.append(executive_summary)
            section_order += 1
        
        # Only add Questions section if questions were actually found
        # COMMENTED OUT: Direct Responses to RFP Questions section - not needed in workflow
        # if questions_data.get('questions_section_found') and questions_data.get('total_questions', 0) > 0:
        #     print(f"   Adding Questions section - found {questions_data.get('total_questions', 0)} questions in RFP")
        #     questions_section = {
        #         "section_name": "Direct Responses to RFP Questions",
        #         "section_type": "rfp_questions_responses",
        #         "section_order": section_order,
        #         "content": self._generate_questions_response_content(questions_data),
        #         "word_count": 0,
        #         "completion_status": "needs_detailed_responses",
        #         "needs_response": True,
        #         "individual_questions": questions_data.get('individual_questions', []),
        #         "total_questions": questions_data.get('total_questions', 0),
        #         "questions_section_name": questions_data.get('questions_section_name', 'Questions Section'),
        #         "content_gaps": [
        #             f"Need: Detailed answers to {questions_data.get('total_questions', 0)} specific RFP questions",
        #             "Need: Company-specific examples and case studies",
        #             "Need: Relevant experience and capabilities",
        #             "Need: Compliance documentation and certifications"
        #         ],
        #         "response_priority": "critical"
        #     }
        #     structured_sections.append(questions_section)
        #     section_order += 1
        
        # Add intelligently determined response sections
        response_sections = other_data.get('response_sections', [])
        for idx, section in enumerate(response_sections):
            print(f"   Adding intelligent section: {section.get('section_name')} - {section.get('section_purpose')}")
            response_section = {
                "section_name": section.get('section_name', f'Response Section {idx + 1}'),
                "section_type": self._determine_section_type(section.get('content_themes', [])),
                "section_order": section_order,
                "content": f"[{section.get('section_purpose', 'Response needed')}]",
                "word_count": 0,
                "completion_status": "needs_company_content",
                "needs_response": True,
                "importance": section.get('importance', 'medium'),
                "content_gaps": [
                    f"Need: {section.get('section_purpose', 'Company response')}",
                    f"Addresses: {', '.join(section.get('addresses_rfp_content', [])[:2])}"
                ],
                "response_priority": section.get('importance', 'medium'),
                "rfp_content_addressed": section.get('addresses_rfp_content', []),
                "content_themes": section.get('content_themes', [])
            }
            structured_sections.append(response_section)
            section_order += 1
        
        # Determine structure type based on what was actually created
        if len(structured_sections) <= 2:
            structure_type = "minimal_dynamic"
        elif len(structured_sections) <= 4:
            structure_type = "standard_dynamic"  
        else:
            structure_type = "comprehensive_dynamic"
        
        print(f"📊 Created {len(structured_sections)} sections with {structure_type} structure")
        
        return {
            "analysis_success": True,
            "rfp_structure": structure_type,
            "sections": structured_sections,
            "total_sections": len(structured_sections),
            "sections_needing_response": len([s for s in structured_sections if s.get('needs_response', True)]),
            "questions_analysis": {
                "questions_section_found": questions_data.get('questions_section_found', False),
                "total_questions": questions_data.get('total_questions', 0),
                "questions_section_name": questions_data.get('questions_section_name', ''),
                "individual_questions": questions_data.get('individual_questions', [])
            },
            "submission_info": other_data.get('submission_requirements', {}),
            "table_of_contents": "Using structure-first approach - TOC handled by main extraction"  # Disabled redundant TOC generation
        }
    
    def _generate_executive_summary_content(self, exec_data: Dict) -> str:
        """Generate placeholder content for executive summary based on RFP analysis."""
        content = "[Executive Summary - To be populated with company information]\n\n"
        
        if exec_data.get('project_overview'):
            content += f"Project Overview:\n{exec_data['project_overview']}\n\n"
        
        if exec_data.get('client_organization'):
            content += f"Client Organization:\n{exec_data['client_organization']}\n\n"
        
        if exec_data.get('project_objectives'):
            content += f"Project Objectives:\n{exec_data['project_objectives']}\n\n"
        
        content += "[Company response needed: Overview of our organization, relevant experience, and approach to this project]"
        
        return content
    
    def _generate_questions_response_content(self, questions_data: Dict) -> str:
        """Generate placeholder content for questions section."""
        if not questions_data.get('questions_section_found'):
            return "[No specific questions section found in RFP]"
        
        content = f"[Responses to {questions_data.get('total_questions', 0)} RFP Questions]\n\n"
        content += f"Source Section: {questions_data.get('questions_section_name', 'Questions Section')}\n\n"
        
        questions = questions_data.get('individual_questions', [])
        for question in questions:
            content += f"Question {question.get('question_number', 'N/A')}: {question.get('question_text', 'Question text')}\n"
            content += f"[Company response needed - {question.get('question_type', 'general')} question requiring {question.get('estimated_response_length', 'medium')} response]\n\n"
        
        return content
    
    def _generate_table_of_contents(self, sections: List[Dict]) -> str:
        """Generate table of contents for structured response."""
        toc = "RFP Response Table of Contents:\n\n"
        
        for section in sorted(sections, key=lambda x: x.get('section_order', 0)):
            toc += f"{section.get('section_order', 0)}. {section.get('section_name', 'Section')}\n"
            
            # Add sub-items for questions section
            if section.get('section_type') == 'rfp_questions_responses':
                questions = section.get('individual_questions', [])
                for question in questions[:5]:  # Show first 5 questions
                    toc += f"   {question.get('question_number', 'N/A')}. {question.get('question_text', 'Question')[:60]}...\n"
                if len(questions) > 5:
                    toc += f"   ... and {len(questions) - 5} more questions\n"
        
        return toc
    
    def _call_azure_openai(self, system_prompt: str, user_prompt: str, 
                          use_json_format: bool = False, max_tokens: int = 2000) -> Optional[str]:
        """Helper method to call Azure OpenAI API."""
        
        url = f"{self.azure_endpoint}/openai/deployments/{self.deployment}/chat/completions?api-version={self.api_version}"
        headers = {"api-key": self.azure_key, "Content-Type": "application/json"}
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        payload = {
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": max_tokens
        }
        
        if use_json_format:
            payload["response_format"] = {"type": "json_object"}
        
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=90)
            response.raise_for_status()
            result = response.json()
            return result["choices"][0]["message"]["content"]
            
        except Exception as e:
            print(f"Azure OpenAI API error: {e}")
            return None
    
    def _call_client_extraction_llm(self, system_prompt: str, user_prompt: str, 
                                   use_json_format: bool = False, max_tokens: int = 500) -> Optional[str]:
        """Helper method to call dedicated client extraction LLM API."""
        
        # Use dedicated client extraction LLM if configured, otherwise fallback to main LLM
        endpoint = self.client_llm_endpoint if self.client_llm_endpoint else self.azure_endpoint
        key = self.client_llm_key if self.client_llm_key else self.azure_key  
        deployment = self.client_llm_deployment if self.client_llm_deployment else self.deployment
        
        url = f"{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={self.api_version}"
        headers = {"api-key": key, "Content-Type": "application/json"}
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        payload = {
            "messages": messages,
            "temperature": 0.1,  # Lower temperature for more consistent extraction
            "max_tokens": max_tokens
        }
        
        if use_json_format:
            payload["response_format"] = {"type": "json_object"}
        
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=30)  # Shorter timeout for small LLM
            response.raise_for_status()
            result = response.json()
            return result["choices"][0]["message"]["content"]
            
        except Exception as e:
            print(f"Client extraction LLM API error: {e}")
            return None


def analyze_rfp_with_refactored_structure(document_content: str) -> Dict:
    """
    Main function to analyze RFP with new 3-section structure.
    """
    analyzer = RefactoredRFPAnalyzer()
    return analyzer.analyze_rfp_with_new_structure(document_content)