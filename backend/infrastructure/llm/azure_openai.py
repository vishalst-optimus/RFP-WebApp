"""
Azure OpenAI LLM Provider Implementation.
Implements the ILLMProvider interface for Azure OpenAI.
"""

import os
from typing import Optional, Dict, Any, List

from langchain_openai import AzureChatOpenAI
from applicationinsights import TelemetryClient
from core.interfaces.llm_provider import ILLMProvider


class AzureOpenAIProvider(ILLMProvider):
    """Implementation of ILLMProvider for Azure OpenAI."""
    
    def __init__(self, telemetry_client: TelemetryClient):
        """
        Initialize the Azure OpenAI provider.
        
        Args:
            telemetry_client: Application Insights telemetry client
        """
        self.telemetry_client = telemetry_client
    
    def initialize_llm(self, deployment_name: str, 
                      temperature: Optional[float] = None,
                      max_tokens: Optional[int] = None,
                      streaming: bool = True) -> AzureChatOpenAI:
        """
        Initialize Azure OpenAI LLM with the specified deployment.
        
        Args:
            deployment_name: The Azure OpenAI deployment name
            temperature: The temperature parameter for generation
            max_tokens: The maximum tokens to generate
            streaming: Whether to enable streaming
            
        Returns:
            The initialized AzureChatOpenAI instance
        """
        try:
            # Use environment variables or provided parameters
            temp = temperature if temperature is not None else float(os.environ.get("TEMPERATURE", 0))
            tokens = max_tokens if max_tokens is not None else int(os.environ.get("MAX_COMPLETION_TOKENS", 2000))
            
            llm = AzureChatOpenAI(
                deployment_name=deployment_name,
                temperature=temp,
                streaming=streaming,
                max_tokens=tokens
            )
            
            return llm
        except Exception as ex:
            self.telemetry_client.track_exception(ex)
            self.telemetry_client.track_trace(f"Error initializing LLM with deployment {deployment_name}")
            raise
