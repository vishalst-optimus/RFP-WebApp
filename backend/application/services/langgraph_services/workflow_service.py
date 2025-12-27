import os
from typing import Dict, Any

from applicationinsights import TelemetryClient

from core.interfaces.llm_provider import ILLMProvider
from application.services.caching_service.caching import Caching
from infrastructure.llm.azure_openai import AzureOpenAIProvider
from infrastructure.tools.tool_factory import ToolFactory
from infrastructure.workflow.graph_builder import GraphBuilder


class WorkflowService:
    """
    Service for creating and managing workflows.
    """
    
    def __init__(self, llm_provider: ILLMProvider):
        """
        Initialize the workflow service.
        
        Args:
            llm_provider: The LLM provider implementation
        """
        self.llm_provider = llm_provider
    
    async def create_workflow(request: Dict[str, Any], 
                            headers: Dict[str, Any],
                            telemetry_client: TelemetryClient, 
                            caching_instance: Any):
        """
        Create a workflow graph based on the request and context.
        
        Args:
            token_info: User token information
            request: The incoming request
            headers: Request headers
            telemetry_client: Application Insights telemetry client
            caching_instance: Caching instance for token management
            
        Returns:
            The configured workflow graph
        """
        try:
            # Verify and set the OpenAI API token
            open_ai_token = Caching.handle_refresh_token_for_open_ai(
                "OPEN_AI_TOKEN", 
                telemetry_client, 
                caching_instance
            )
            os.environ["OPENAI_API_KEY"] = open_ai_token
            
            # Initialize LLM provider
            llm_provider = AzureOpenAIProvider(telemetry_client)
            
            # Initialize LLMs
            llm = llm_provider.initialize_llm(os.environ["AZURE_OPENAI_MODEL_NAME_RAG"])
            
            # Create tools
            tools, tool_node = ToolFactory.create_tools(
                headers=headers,
                llm=llm,
                telemetry_client=telemetry_client
            )
            
            # Bind tools to LLMs
            llm_with_tools = llm.bind_tools(tools)
            
            # Build workflow graph
            workflow = GraphBuilder.build_workflow_graph(
                tool_node=tool_node,
                llm_with_tools=llm_with_tools,
                headers=headers,
                request=request,
                telemetry_client=telemetry_client
            )
            
            return workflow
        except Exception as ex:
            print(ex)
            telemetry_client.track_exception(ex)
            telemetry_client.track_trace(f"Error creating workflow: {str(ex)}")
            raise
