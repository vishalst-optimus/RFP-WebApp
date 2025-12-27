"""
Tools factory.
Creates and initializes tools needed by the workflow.
"""

import os
from typing import List, Dict, Any

from applicationinsights import TelemetryClient
from langchain_openai import AzureChatOpenAI
from langgraph.prebuilt import ToolNode

from infrastructure.tools.tool_definations.rfp_analyzer_tool import RfpAnalyzerTool
from infrastructure.tools.tool_definations.knowledge_base_tool import KnowledgeBaseSearchTool
from infrastructure.tools.tool_definations.enhanced_knowledge_base_tool import EnhancedKnowledgeBaseSearchTool


# from common.utilities import Common
from dotenv import load_dotenv
load_dotenv(r"apps\backend\credentials.env")

class ToolFactory:
    """
    Factory for creating and initializing tools.
    """
    
    @staticmethod
    def create_tools(headers: Dict[str, Any], 
                    llm: AzureChatOpenAI,
                    telemetry_client: TelemetryClient) -> tuple:
        """
        Create all tools needed for the workflow.
        
        Args:
            headers: Request headers
            user_role: User role for access control
            llm: Language model for tools that require it
            telemetry_client: Application Insights telemetry client
            
        Returns:
            Tuple of (tools, tool_node, search_index, word_count)
        """
        try:
            # Get search index and word count based on product info and user role
            search_index = os.environ["AZURE_SEARCH_INDEX_NAME_RFP"]
            
            # Check if AI content filtering is enabled
            enable_filtering = os.environ.get("ENABLE_AI_CONTENT_FILTERING", "false").lower() == "true"
            priority_index = os.environ.get("AI_CONTENT_PRIORITY_INDEX", "srch-index-rfp-01")
            
            # Create tools
            rfp_tool = RfpAnalyzerTool(
                azure_docint_endpoint=os.environ["AZURE_DOCINT_ENDPOINT"],
                azure_docint_key=os.environ["AZURE_DOCINT_KEY"],
                azure_openai_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
                azure_openai_key=os.environ["AZURE_OPENAI_KEY"],
                telemetry_client=telemetry_client
            )
            
            # Use enhanced tool if filtering is enabled, otherwise use original tool
            if enable_filtering:
                telemetry_client.track_trace("Using Enhanced Knowledge Base Tool with AI content filtering", severity=1)
                # Use only the priority index for enhanced search (srch-index-rfp-01)
                indexes = [priority_index]
                    
                knowledge_tool = EnhancedKnowledgeBaseSearchTool(
                    indexes=indexes,
                    k=10,
                    reranker_th=1.0,
                    sas_token="",
                    user_language="en",
                    telemetry_client=telemetry_client
                )
            else:
                telemetry_client.track_trace("Using Original Knowledge Base Tool", severity=1)
                knowledge_tool = KnowledgeBaseSearchTool(
                    indexes=[search_index],
                    k=10,
                    reranker_th=1.0,
                    sas_token="",
                    user_language="en",
                    telemetry_client=telemetry_client
                )
            
            # Combine tools into a list
            tools = [knowledge_tool]

            # Create tool node for graph
            tool_node = ToolNode(tools)
            
            return tools, tool_node
        except Exception as ex:
            telemetry_client.track_exception(ex)
            telemetry_client.track_trace("Error creating tools")
            raise