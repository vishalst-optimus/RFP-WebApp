"""
Workflow graph builder.
Constructs the LangGraph workflow graph.
"""

from typing import Dict, Any, List

from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from applicationinsights import TelemetryClient

from core.models.graph_state import GraphState
from infrastructure.workflow.edge_functions import EdgeFunctions
from infrastructure.workflow.components import WorkflowComponents


class GraphBuilder:
    """
    Builds and configures the workflow graph.
    """
    
    @classmethod
    def build_workflow_graph(cls,
                           tool_node: ToolNode,
                           llm_with_tools: Any,
                           headers: Dict[str, Any],
                           request: Dict[str, Any],
                           telemetry_client: TelemetryClient) -> StateGraph:
        """
        Build the workflow graph with all components.
        
        Args:
            tools: List of tools
            tool_node: Tool node for the graph
            llm_with_tools: LLM with bound tools
            llmsummarization_with_tools: Summarization LLM with bound tools
            headers: Request headers
            word_count: Word count for prompt templates
            token_info: User token information
            request: The incoming request
            execute_api_tool: API execution tool
            telemetry_client: Application Insights telemetry client
            
        Returns:
            StateGraph: The configured workflow graph
        """
        # Create workflow components bindings
        async def call_model(state: GraphState):
            return await WorkflowComponents.call_model(
                state=state,
                headers=headers,
                llm_with_tools=llm_with_tools,
                telemetry_client=telemetry_client
            )
        
        async def call_final_model(state: GraphState):
            return await WorkflowComponents.call_final_model(
                state=state,
                headers=headers,
                llm_with_tools=llm_with_tools,
                telemetry_client=telemetry_client
            )
        
        async def store_chat_history_tool(state: Dict[str, Any]):
            return await WorkflowComponents.store_chat_history(
                state=state,
                request=request,
                headers=headers,
                telemetry_client=telemetry_client
            )
        
        # Edge function binding
        def should_continue(state: GraphState) -> str:
            return EdgeFunctions.should_continue(state, telemetry_client)
        
        # Create the workflow graph
        workflow = StateGraph(GraphState)
        
        # Add nodes
        workflow.add_node("brain", call_model)
        workflow.add_node("tools", tool_node)
        workflow.add_node("tools_final", call_final_model)
        workflow.add_node("chat_history", store_chat_history_tool)
        
        # Set entry point
        workflow.set_entry_point("brain")
        
        # Add conditional edges
        workflow.add_conditional_edges(
            "brain",
            should_continue,
            {
                "continue": "tools",
                "end": "chat_history"
            }
        )
        
        workflow.add_conditional_edges(
            "tools",
            should_continue,
            {
                "continue": "tools",
                "end": "tools_final"
            }
        )

        ## Change later on when more tools are introduced

        # Add direct edges
        # workflow.add_conditional_edges(
        #     "tools_final",
        #     should_continue,
        #     {
        #         "continue": "tools",
        #         "end": "chat_history"
        #     }
        # )

        workflow.add_edge("tools_final", "chat_history")
        
        # Add terminal edges
        workflow.add_edge("chat_history", END)
        
        return workflow
