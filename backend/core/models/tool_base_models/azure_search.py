"""
Azure Search tool base models.
"""

from langchain.pydantic_v1 import BaseModel, Field
from typing import Annotated
from langchain_core.tools.base import InjectedToolCallId
from langgraph.prebuilt import InjectedState

class SearchInput(BaseModel):
    """Input model for Azure Search tool."""
    query: str = Field(description="should be a search query")
    state: Annotated[dict, InjectedState]
    tool_call_id: Annotated[str, InjectedToolCallId]
    return_direct: bool = Field(
        description="Whether or the result of this should be returned directly to the user without you seeing what it is",
        default=False,
    )
