"""
Graph State domain model.
Represents the state of the workflow graph during execution.
"""

from langchain_core.messages import HumanMessage, AIMessage
from typing import TypedDict, Annotated, Any
from langgraph.graph.message import add_messages
from typing import Dict, Any

class GraphState(TypedDict):
    """
    Represents the state of the workflow graph during execution.
    Used by LangGraph to maintain state between nodes.
    """
    messages: Annotated[list[HumanMessage | AIMessage], add_messages]
    traces: list[Dict[str, Any]]
    synerion_api_status: str
    sql_query: str
    is_largedataset_curr: str
    is_largedataset_prev: str
