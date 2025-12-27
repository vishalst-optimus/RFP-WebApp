"""
RFP Section Service
Handles section population, content generation, and streaming functionality.
"""
import os
import time
import asyncio
import re
from typing import AsyncGenerator
from openai import AzureOpenAI
from infrastructure.tools.tool_definations.knowledge_base_tool import CustomAzureSearchRetriever
from application.services.logging_service.logging import telemetry_client


class RFPSectionService:
    def __init__(self):
        self.client = AzureOpenAI(
            api_key=os.getenv("AZURE_OPENAI_KEY"),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
        )
        self.index_name = os.getenv("INDEX_NAME")
    
    async def get_knowledge_base_content(self, prompt: str, section_name: str, tenant_id: str, user_email: str) -> str:
        """
        Search knowledge base for relevant content and enhance it with OpenAI.
        """
        raw_content = ""
        
        try:
            telemetry_client.track_trace(f'Searching knowledge base for section: {section_name}, tenant: {tenant_id}', severity=1)
            
            retriever = CustomAzureSearchRetriever(
                indexes=[self.index_name],
                topK=3,
                reranker_threshold=1,
                sas_token="",
                telemetry_client=telemetry_client,
                callback_manager=None,
                tenant_id=tenant_id
            )

            # Use the prompt as the query for knowledge base search
            docs = retriever._get_relevant_documents(prompt, run_manager=None)
            print(f"🔍 Retrieved {len(docs)} documents from knowledge base for section '{section_name}' using query: '{prompt[:100]}...'")
            for d in docs:
                raw_content += d.page_content + "\n"
            print(f"📄 Total raw content length: {len(raw_content)} characters")

        except Exception as e:
            telemetry_client.track_exception(e)
            telemetry_client.track_trace(f"Knowledge base search error for section: {section_name}, tenant: {tenant_id}, user: {user_email}", severity=3)
            raw_content = f"Error retrieving content from knowledge base: {str(e)}"

        return raw_content
    
    async def enhance_content_with_openai(self, raw_content: str, section_name: str, tenant_id: str, user_email: str) -> str:
        """
        Enhance raw content using OpenAI for better formatting.
        """
        enhanced_content = ""
        print(f"🔍 Debug: raw_content length: {len(raw_content.strip())}, starts with 'Error': {raw_content.startswith('Error')}")
        
        if raw_content.strip() and not raw_content.startswith("Error"):
            try:
                system_message = f"You are an assistant that summarizes raw proposal data into polished RFP response text."
                user_message = f"Summarize and structure the following content for the '{section_name}' section of an RFP:\n\n{raw_content}"
                
                completion = self.client.chat.completions.create(
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
                telemetry_client.track_trace(f"OpenAI enhancement error for section: {section_name}, tenant: {tenant_id}, user: {user_email}", severity=3)
                print(f"❌ Error enhancing knowledge base content for section '{section_name}': {str(e)}")
                # Use raw content if enhancement fails
                enhanced_content = raw_content.strip()
        else:
            enhanced_content = raw_content
            print(f"⚠️ No valid content retrieved from knowledge base for section '{section_name}'")

        return enhanced_content
    
    async def regenerate_content_with_openai(self, prompt: str, section_name: str, tenant_id: str, user_email: str) -> str:
        """
        Regenerate content using OpenAI based on user prompt.
        """
        try:
            ai_prompt = f"""
            You are a helpful AI assistant that specializes in generating and refining RFP responses.
            Do not add explanations, commentary, introductions, or closing statements. 
            Regenerate content based on the following user request:

            {prompt}
            """

            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": ai_prompt}],
                temperature=0.7,
                max_tokens=800
            )
            regenerated_content = response.choices[0].message.content.strip()
            print(f"✅ Regenerated content for section '{section_name}' using OpenAI")
            return regenerated_content
            
        except Exception as e:
            telemetry_client.track_exception(e)
            telemetry_client.track_trace(f"OpenAI regeneration error for section: {section_name}, tenant: {tenant_id}, user: {user_email}", severity=3)
            print(f"❌ Error regenerating content for section '{section_name}': {str(e)}")
            raise Exception(f"Failed to regenerate content: {str(e)}")
    
    async def stream_content(self, content: str, section_name: str, user_name: str, 
                           tenant_id: str, user_email: str, start_time: float, 
                           content_source: str = "knowledge_base") -> AsyncGenerator[str, None]:
        """
        Stream content in logical chunks for better user experience.
        """
        try:
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
                f"Content streaming completed in {processing_time:.2f}s for user: {user_name}, tenant: {tenant_id}",
                severity=1,
                properties={
                    "processing_time_ms": round(processing_time * 1000, 2),
                    "tenant_id": tenant_id,
                    "user_email": user_email,
                    "content_source": content_source,
                    "content_length": len(content)
                }
            )
            
        except Exception as e:
            telemetry_client.track_exception(e)
            yield f"Error streaming content: {str(e)}"
    
    async def stream_skipped_message(self, section_name: str) -> AsyncGenerator[str, None]:
        """
        Stream a message for skipped sections like TOC.
        """
        yield f"'{section_name}' section is auto-generated during document creation and doesn't need manual population."