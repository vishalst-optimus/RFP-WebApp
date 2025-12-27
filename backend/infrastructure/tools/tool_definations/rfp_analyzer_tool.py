from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.core.credentials import AzureKeyCredential
from langchain.pydantic_v1 import BaseModel
from langchain.tools import BaseTool
from applicationinsights import TelemetryClient
from langgraph.types import Command
from langchain_core.messages import ToolMessage
from typing import Type
from core.models.tool_base_models.rfp_analyzer import RfpAnalyzerToolInput
from azure.ai.documentintelligence.models import AnalyzeDocumentRequest, ContentFormat
import ssl
import certifi
import time
import io
from docx import Document
from typing import Dict, Any

class RfpAnalyzerTool(BaseTool):
    """
    A tool for analyzing RFP documents using Azure Document Intelligence SDK and Azure OpenAI.
    """
    name: str = "rfp_analyzer_tool"
    description: str = "Analyzes RFP documents using Azure Document Intelligence SDK and Azure OpenAI."
    args_schema: Type[BaseModel] = RfpAnalyzerToolInput

    azure_docint_endpoint: str
    azure_docint_key: str
    azure_openai_endpoint: str
    azure_openai_key: str
    telemetry_client: TelemetryClient

    def _fallback_text_extraction(self, file_bytes: bytes) -> Dict[str, Any]:
        """
        Fallback text extraction method when Document Intelligence fails.
        Uses python-docx for basic text extraction from Word documents.
        """
        try:
            print("Attempting fallback text extraction using python-docx...")
            
            # Create a document object from bytes
            doc_stream = io.BytesIO(file_bytes)
            doc = Document(doc_stream)
            
            # Extract text from all paragraphs
            full_text = []
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    full_text.append(paragraph.text.strip())
            
            # Extract text from tables
            for table in doc.tables:
                for row in table.rows:
                    for cell in row.cells:
                        if cell.text.strip():
                            full_text.append(cell.text.strip())
            
            extracted_content = "\n\n".join(full_text)
            
            # Create a minimal mock result object that mimics Document Intelligence structure
            mock_result = type('MockResult', (), {
                'content': extracted_content,
                'pages': [],
                'tables': [],
                'paragraphs': []
            })()
            
            print(f"Fallback extraction successful: {len(extracted_content)} characters extracted")
            return mock_result
            
        except Exception as e:
            print(f"Fallback text extraction failed: {str(e)}")
            raise Exception(f"Both Document Intelligence and fallback extraction failed. Error: {str(e)}")

    def _create_docint_client(self):
        """Create a Document Intelligence client with proper SSL configuration"""
        try:
            # Create client with default settings first
            client = DocumentIntelligenceClient(
                endpoint=self.azure_docint_endpoint,
                credential=AzureKeyCredential(self.azure_docint_key),
                api_version="2024-11-30"
            )
            return client
        except Exception as e:
            print(f"Failed to create Document Intelligence client: {str(e)}")
            raise

    async def analyze_document(self, file_url: str) -> dict:
        max_retries = 3
        retry_delay = 2
        
        for attempt in range(max_retries):
            try:
                # Create client with better SSL configuration
                client = self._create_docint_client()
                
                print(f"Attempting document analysis via URL (attempt {attempt + 1}/{max_retries})...")
                
                poller = client.begin_analyze_document(
                    "prebuilt-layout",
                    AnalyzeDocumentRequest(bytes_source=file_url)
                )
                
                result = poller.result()
                self.telemetry_client.track_trace(f"Doc Intelligence SDK called successfully on attempt {attempt + 1}: {file_url}", severity=1)
                return result["content"]
                
            except Exception as e:
                error_msg = str(e)
                print(f"Document analysis attempt {attempt + 1} failed: {error_msg}")
                
                # Check if it's an SSL/connection error
                if "ssl" in error_msg.lower() or "eof" in error_msg.lower() or "connection" in error_msg.lower():
                    if attempt < max_retries - 1:
                        print(f"SSL/Connection error detected. Retrying in {retry_delay} seconds...")
                        time.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                        continue
                    else:
                        self.telemetry_client.track_exception(e)
                        return {"error": f"Document analysis failed after {max_retries} attempts due to SSL/connection issues: {error_msg}"}
                else:
                    # For non-SSL errors, fail immediately
                    self.telemetry_client.track_exception(e)
                    return {"error": error_msg}
        
        # This shouldn't be reached, but just in case
        return {"error": f"Document analysis failed after {max_retries} attempts"}

    async def analyze_document_full(self, file_bytes: bytes):
        """
        Analyze document using Azure Document Intelligence and return the full result object.
        Used for chunking logic that requires paragraph roles and structure.
        """
        max_retries = 3
        retry_delay = 2
        
        for attempt in range(max_retries):
            try:
                # Create client with better SSL configuration
                client = self._create_docint_client()
                
                print(f"Attempting document analysis (attempt {attempt + 1}/{max_retries})...")
                
                poller = client.begin_analyze_document(
                    "prebuilt-layout",
                    AnalyzeDocumentRequest(bytes_source=file_bytes)
                )
                
                result = poller.result()
                self.telemetry_client.track_trace(f"Full document analysis completed on attempt {attempt + 1}", severity=1)
                return result
                
            except Exception as e:
                error_msg = str(e)
                print(f"Document analysis attempt {attempt + 1} failed: {error_msg}")
                
                # Check if it's an SSL/connection error
                if "ssl" in error_msg.lower() or "eof" in error_msg.lower() or "connection" in error_msg.lower():
                    if attempt < max_retries - 1:
                        print(f"SSL/Connection error detected. Retrying in {retry_delay} seconds...")
                        time.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                        continue
                    else:
                        self.telemetry_client.track_exception(e)
                        raise Exception(f"Document analysis failed after {max_retries} attempts due to SSL/connection issues: {error_msg}")
                else:
                    # For non-SSL errors, fail immediately
                    self.telemetry_client.track_exception(e)
                    raise Exception(f"Document analysis failed: {error_msg}")
        
        # This shouldn't be reached, but just in case
        raise Exception(f"Document analysis failed after {max_retries} attempts")

    async def analyze_with_llm(self, extracted_data: dict, prompt: str) -> str:
        import requests
        try:
            headers = {
                "api-key": self.azure_openai_key,
                "Content-Type": "application/json"
            }
            payload = {
                "messages": [
                    {"role": "system", "content": "You are an RFP analysis assistant."},
                    {"role": "user", "content": f"{prompt}\n\nExtracted Data:\n{extracted_data}"}
                ]
            }
            llm_url = f"{self.azure_openai_endpoint}/openai/deployments/gpt-4/chat/completions?api-version=2024-02-15-preview"
            response = requests.post(llm_url, headers=headers, json=payload)
            result = response.json()
            return result.get("choices", [{}])[0].get("message", {}).get("content", "")
        except Exception as e:
            self.telemetry_client.track_exception(e)
            return f"Error occurred: {e}"

    def _run(self, *args, **kwargs):
        pass

    async def _arun(self, file_url: str, prompt: str, state, tool_call_id, **kwargs) -> str:
        self.telemetry_client.track_trace(f"Starting RFP analysis for: {file_url}", severity=1)

        extracted_data = await self.analyze_document(file_url)
        if "error" in extracted_data:
            result = extracted_data["error"]
        else:
            result = await self.analyze_with_llm(extracted_data, prompt)

        tool_message = ToolMessage(
            content=result,
            tool_call_id=tool_call_id,
            name=self.name,
        )

        return Command(
            update={
                "messages": state["messages"] + [tool_message],
            }
        )
