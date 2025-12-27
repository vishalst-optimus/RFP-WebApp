"""
Chat History tool base models.
"""

from typing import Annotated
from langchain.pydantic_v1 import BaseModel, Field
from langchain_core.tools.base import InjectedToolCallId
from langgraph.prebuilt import InjectedState

class ChatHistoryInput(BaseModel):
    """Input model for Chat History tool."""
    messages: list = Field(description="List of chat message history")
    request: object = Field(description="Input request of api to get user details")
    token_info: object = Field(description="Details extracted from JWT token")
    headers: object = Field(description="Headers of the request")
    telemetry_client: object = Field(description="Telemetry client object")
    state: Annotated[dict, InjectedState]
    tool_call_id: Annotated[str, InjectedToolCallId]
