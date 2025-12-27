"""
Workflow edge functions.
Contains functions that determine routing in the workflow graph.
"""

import ast
from typing import Dict, Any

from applicationinsights import TelemetryClient
from core.models.graph_state import GraphState


class EdgeFunctions:
    """
    Contains routing logic for the workflow graph edges.
    Determines which node should be executed next based on the current state.
    """
    
    @staticmethod
    def should_continue(state: GraphState, telemetry_client: TelemetryClient) -> str:
        """
        Determine the next node in the workflow based on the current state.
        
        Args:
            state: The current state of the graph
            telemetry_client: Application Insights telemetry client
            
        Returns:
            str: The next node to route to
        """
        messages = state["messages"]
        last_message = messages[-1]

        # Check for tool calls in the message
        if not hasattr(last_message, 'tool_calls') or (not last_message.tool_calls and 
                                                     (last_message.content is None or last_message.content == '')):
            return "end"
        # Otherwise check if there are tool calls to process
        else:
            if last_message.tool_calls:
                return "continue"
            else:
                return "end"
