"""
RFP Question Extraction and Answering Service

This service provides functionality to:
1. Extract specific questions from RFP documents
2. Map questions to knowledge base content
3. Generate comprehensive answers for RFP responses
"""

import os
import json
import requests
from typing import Dict, List, Any, Optional
from concurrent.futures import ThreadPoolExecutor
import time
from dotenv import load_dotenv

load_dotenv(r"apps\backend\credentials.env")


class RFPQuestionService:
    """Service for extracting and answering RFP questions"""
    
    def __init__(self):
        self.azure_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
        self.azure_key = os.environ.get("AZURE_OPENAI_KEY")
        self.deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4")
        self.api_version = "2024-10-21"
    
    def extract_questions_from_content(self, rfp_content: str, section_name: str = "") -> List[Dict]:
        """
        Extract specific questions from RFP content that need vendor responses.
        
        Args:
            rfp_content: The RFP text content
            section_name: Optional section name for context
            
        Returns:
            List of extracted questions with metadata
        """
        from common.prompts.prompts import RFP_QUESTION_EXTRACTION_PROMPT
        
        prompt = f"""Extract all questions and requirements that need vendor responses from this RFP content.

Section: {section_name if section_name else 'Unknown Section'}

RFP Content:
{rfp_content}

Return a JSON object with this structure:
{{
  "questions": [
    {{
      "question_id": "unique_id",
      "question_text": "exact question or requirement text",
      "question_type": "direct_question|requirement|compliance|experience|technical|pricing|implementation|timeline|support",
      "section_source": "{section_name if section_name else 'Unknown Section'}",
      "priority": "high|medium|low",
      "response_length": "short|medium|long",
      "keywords": ["key", "terms"],
      "requires_specific_details": true/false
    }}
  ],
  "total_questions": number,
  "section_summary": "brief summary of what this section asks for"
}}

Focus on extracting questions that require specific vendor information, capabilities, experience, or approaches."""

        try:
            response = self._call_azure_openai(
                system_prompt=RFP_QUESTION_EXTRACTION_PROMPT,
                user_prompt=prompt,
                use_json_format=True,
                max_tokens=2000
            )
            
            if response:
                questions_data = json.loads(response)
                print(f"Extracted {questions_data.get('total_questions', 0)} questions from section: {section_name}")
                return questions_data.get('questions', [])
            
            return []
            
        except Exception as e:
            print(f"Error extracting questions from section {section_name}: {e}")
            return []
    
    def extract_questions_from_rfp_sections(self, rfp_sections: List[Dict]) -> Dict[str, List[Dict]]:
        """
        Extract questions from multiple RFP sections in parallel.
        
        Args:
            rfp_sections: List of RFP sections with content
            
        Returns:
            Dictionary mapping section names to extracted questions
        """
        questions_by_section = {}
        
        # Process sections in parallel
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = []
            for section in rfp_sections:
                section_name = section.get('name', 'Unknown Section')
                section_content = section.get('content', '')
                
                if section_content and len(section_content.strip()) > 100:  # Only process substantial sections
                    future = executor.submit(
                        self.extract_questions_from_content,
                        section_content,
                        section_name
                    )
                    futures.append((section_name, future))
            
            # Collect results
            for section_name, future in futures:
                try:
                    questions = future.result(timeout=60)
                    if questions:
                        questions_by_section[section_name] = questions
                        print(f"✓ Extracted {len(questions)} questions from '{section_name}'")
                except Exception as e:
                    print(f"✗ Failed to extract questions from '{section_name}': {e}")
        
        return questions_by_section
    
    def generate_question_response(self, question: Dict, knowledge_base_content: str, rfp_context: str = "") -> str:
        """
        Generate a comprehensive response to a specific RFP question using knowledge base.
        
        Args:
            question: Question dictionary with metadata
            knowledge_base_content: Relevant company information
            rfp_context: Additional RFP project context
            
        Returns:
            Generated response text
        """
        from common.prompts.prompts import RFP_QUESTION_ANSWERING_PROMPT
        
        prompt = f"""Generate a comprehensive response to this RFP question using the provided knowledge base.

QUESTION DETAILS:
- Question ID: {question.get('question_id', 'N/A')}
- Question Type: {question.get('question_type', 'unknown')}
- Priority: {question.get('priority', 'medium')}
- Expected Length: {question.get('response_length', 'medium')}
- Keywords: {', '.join(question.get('keywords', []))}

RFP QUESTION/REQUIREMENT:
{question.get('question_text', '')}

KNOWLEDGE BASE CONTENT:
{knowledge_base_content}

RFP PROJECT CONTEXT:
{rfp_context}

Generate a professional, comprehensive response that:
1. Directly addresses the question/requirement
2. Uses specific examples and metrics from knowledge base
3. Demonstrates relevant experience and capabilities
4. Shows understanding of client needs
5. Includes quantifiable achievements where possible
6. Uses plain text formatting only - NO markdown (**, *, #, etc.)
7. Avoids asterisks (*) or special formatting characters

Response should be ready for direct insertion into RFP document."""

        try:
            response = self._call_azure_openai(
                system_prompt=RFP_QUESTION_ANSWERING_PROMPT,
                user_prompt=prompt,
                max_tokens=1500 if question.get('response_length') == 'long' else 800
            )
            
            return response if response else "Unable to generate response for this question."
            
        except Exception as e:
            print(f"Error generating response for question {question.get('question_id')}: {e}")
            return f"Error generating response: {str(e)}"
    
    def create_questions_answers_section(self, questions_by_section: Dict[str, List[Dict]], 
                                       knowledge_base_content: str) -> Dict:
        """
        Create a comprehensive Questions & Answers section for RFP response.
        
        Args:
            questions_by_section: Questions organized by section
            knowledge_base_content: Company knowledge base content
            
        Returns:
            Structured Q&A section data
        """
        qa_section = {
            "section_name": "RFP Questions & Responses",
            "section_type": "questions_answers",
            "total_questions": 0,
            "sections": [],
            "summary": ""
        }
        
        all_questions = []
        
        # Process each section's questions
        for section_name, questions in questions_by_section.items():
            if not questions:
                continue
                
            section_qa = {
                "section_name": section_name,
                "questions_count": len(questions),
                "questions_and_answers": []
            }
            
            print(f"Generating responses for {len(questions)} questions in '{section_name}'...")
            
            # Generate responses for each question
            with ThreadPoolExecutor(max_workers=2) as executor:
                futures = []
                for question in questions:
                    # Create search query from question keywords and text
                    search_terms = question.get('keywords', [])
                    if question.get('question_type') in ['technical', 'experience', 'implementation']:
                        search_terms.extend([question.get('question_type')])
                    
                    search_query = ' '.join(search_terms[:5])  # Limit search terms
                    
                    future = executor.submit(
                        self.generate_question_response,
                        question,
                        knowledge_base_content[:3000],  # Limit context size
                        f"RFP Section: {section_name}"
                    )
                    futures.append((question, future))
                
                # Collect responses
                for question, future in futures:
                    try:
                        response = future.result(timeout=90)
                        qa_item = {
                            "question_id": question.get('question_id'),
                            "question": question.get('question_text'),
                            "question_type": question.get('question_type'),
                            "priority": question.get('priority'),
                            "answer": response,
                            "keywords": question.get('keywords', [])
                        }
                        section_qa["questions_and_answers"].append(qa_item)
                        all_questions.append(question)
                        
                    except Exception as e:
                        print(f"Failed to generate response for question {question.get('question_id')}: {e}")
            
            if section_qa["questions_and_answers"]:
                qa_section["sections"].append(section_qa)
        
        qa_section["total_questions"] = len(all_questions)
        qa_section["summary"] = f"Comprehensive responses to {len(all_questions)} key RFP questions across {len(qa_section['sections'])} sections."
        
        return qa_section
    
    def _call_azure_openai(self, system_prompt: str, user_prompt: str, 
                          use_json_format: bool = False, max_tokens: int = 1000) -> Optional[str]:
        """Helper method to call Azure OpenAI API."""
        
        url = f"{self.azure_endpoint}/openai/deployments/{self.deployment}/chat/completions?api-version={self.api_version}"
        headers = {"api-key": self.azure_key, "Content-Type": "application/json"}
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        payload = {
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": max_tokens
        }
        
        if use_json_format:
            payload["response_format"] = {"type": "json_object"}
        
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=60)
            response.raise_for_status()
            result = response.json()
            return result["choices"][0]["message"]["content"]
            
        except Exception as e:
            print(f"Azure OpenAI API error: {e}")
            return None


# Utility functions for integration with existing system
def extract_and_process_rfp_questions(rfp_sections: List[Dict], knowledge_base_content: str) -> Dict:
    """
    Main function to extract questions from RFP sections and generate comprehensive responses.
    
    Args:
        rfp_sections: List of RFP sections with content
        knowledge_base_content: Company knowledge base for generating responses
        
    Returns:
        Complete Q&A section ready for RFP response
    """
    service = RFPQuestionService()
    
    print("🔍 Extracting questions from RFP sections...")
    questions_by_section = service.extract_questions_from_rfp_sections(rfp_sections)
    
    if not questions_by_section:
        print("❌ No questions found in RFP sections")
        return None
    
    print(f"✅ Found questions in {len(questions_by_section)} sections")
    
    print("🤖 Generating comprehensive responses...")
    qa_section = service.create_questions_answers_section(questions_by_section, knowledge_base_content)
    
    print(f"✅ Generated Q&A section with {qa_section['total_questions']} questions and responses")
    return qa_section