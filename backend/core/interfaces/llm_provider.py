from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional


class ILLMProvider(ABC):
    """Interface for LLM providers."""
    
   ## Placeholder for the LLM initialization method
    @abstractmethod
    def initialize_llm(self, deployment_name: str,
                      temperature: Optional[float] = None,
                      max_tokens: Optional[int] = None,
                      streaming: bool = True) -> Any:
        """
        Initialize the LLM with the specified parameters.

        Args:
            deployment_name: The deployment name for the LLM
            temperature: The temperature for the LLM
            max_tokens: The maximum tokens for the LLM
            streaming: Whether to enable streaming for the LLM

        Returns:
            The initialized LLM instance
        """
        pass