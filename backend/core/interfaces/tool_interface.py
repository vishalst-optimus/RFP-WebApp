from abc import ABC, abstractmethod
from typing import Dict, Any


class ITool(ABC):
    """
    Interface for tools that can be used in the workflow.
    """
    
    @property
    @abstractmethod
    def name(self) -> str:
        """
        Get the name of the tool.
        
        Returns:
            The tool's name
        """
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """
        Get a description of what the tool does.
        
        Returns:
            The tool's description
        """
        pass
    
    @abstractmethod
    async def ainvoke(self, input: Dict[str, Any]) -> Any:
        """
        Execute the tool with the given input.
        
        Args:
            input: Tool input parameters
            
        Returns:
            Tool execution result
        """
        pass
