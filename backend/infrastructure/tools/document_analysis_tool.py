import re
import requests
import base64
import os
from core.models.schemas import DocumentAnalysisResult, MistralAPIRequest, DocumentParagraph
from core.models.config import MistralDocumentAIConfig

def extract_keywords_from_content(content: str) -> dict:
    patterns = {
        "due_date": r"(?:due date|payment due|deadline)[:\-\s]*([A-Za-z0-9,\/\-\s]+)"
    }

    extracted = {}
    for key, pattern in patterns.items():
        match = re.search(pattern, content, re.IGNORECASE)
        extracted[key] = match.group(1).strip() if match else None
    return extracted


async def analyze_document_with_mistral(file_content: bytes, file_name: str) -> DocumentAnalysisResult:
    """
    Analyze document using Mistral Document AI instead of Azure Document Intelligence
    """
    try:
        print(f"Analyzing document with Mistral Document AI: {file_name}")
        
        # Load configuration
        config = MistralDocumentAIConfig.from_env()
        
        if not config.api_key:
            raise Exception("AZURE_DOCUMENTAI_KEY environment variable not set")
        
        # Encode file content to base64
        encoded_file = base64.b64encode(file_content).decode("utf-8")
        
        # Get file extension for MIME type
        file_extension = file_name.lower().split('.')[-1] if '.' in file_name else 'pdf'
        mime_type_map = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'txt': 'text/plain'
        }
        mime_type = mime_type_map.get(file_extension, 'application/pdf')
        
        # Prepare document for Mistral API
        document = {
            "type": "document_url",
            "document_url": f"data:{mime_type};base64,{encoded_file}"
        }
        
        # Set up API call
        headers = {
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json"
        }
        
        # Create API request using Pydantic model
        api_request = MistralAPIRequest(
            model=config.model,
            document=document,
            include_image_base64=config.include_image_base64
        )
        
        # Make API call
        response = requests.post(
            config.endpoint, 
            headers=headers, 
            json=api_request.model_dump(), 
            timeout=config.timeout
        )
        
        if response.status_code != 200:
            error_msg = f"Mistral API returned status {response.status_code}: {response.text}"
            print(error_msg)
            raise Exception(error_msg)
        
        result = response.json()
        print(f"Mistral Document AI analysis completed for: {file_name}")
        
        mistral_content = ""
        
        # Try different possible response structures
        if "choices" in result and len(result["choices"]) > 0:
            choice = result["choices"][0]
            if "message" in choice and "content" in choice["message"]:
                mistral_content = choice["message"]["content"]
            elif "text" in choice:
                mistral_content = choice["text"]
        elif "content" in result:
            mistral_content = result["content"]
        elif "text" in result:
            mistral_content = result["text"]
        elif "output" in result:
            mistral_content = result["output"]
        else:
            print(f"Unexpected Mistral response structure: {result}")
            mistral_content = str(result)
        
        if not mistral_content or len(mistral_content.strip()) < 10:
            raise Exception(f"Mistral Document AI returned empty or insufficient content. Response: {result}")
        
        # Create paragraphs using Pydantic models
        paragraphs = []
        if mistral_content:
            paragraphs_text = mistral_content.split('\n\n')
            for i, para_text in enumerate(paragraphs_text):
                if para_text.strip():
                    paragraph = DocumentParagraph(
                        content=para_text.strip(),
                        role="paragraph",
                        bounding_regions=[{'page_number': 1}]
                    )
                    paragraphs.append(paragraph)
        
        # Create and return DocumentAnalysisResult
        analysis_result = DocumentAnalysisResult(
            content=mistral_content,
            paragraphs=paragraphs
        )
        
        return analysis_result
        
    except Exception as e:
        error_msg = f"Mistral Document AI analysis failed: {str(e)}"
        print(error_msg)
        
        # Return error result using Pydantic model
        return DocumentAnalysisResult(
            content="",
            paragraphs=[],
            error=error_msg
        )
  
