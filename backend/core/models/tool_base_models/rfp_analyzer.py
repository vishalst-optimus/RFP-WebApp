"""
Execute API tool base models.
"""

from langchain.pydantic_v1 import BaseModel, Field
from langchain_core.tools.base import InjectedToolCallId
from langgraph.prebuilt import InjectedState
from typing import Annotated

class RfpAnalyzerToolInput(BaseModel):
    """Input model for Execute API tool."""
    query: str = Field(default="", description="should only be a valid SQL query, if you are not sure what to put here, leave it empty")
    user_intent: str = Field(default="",description="User intent whether to fetch large dataset or not, it can be Yes or No only, no other values are allowed, if you are not sure assume it as No")
    state: Annotated[dict, InjectedState]
    tool_call_id: Annotated[str, InjectedToolCallId]
    return_direct: bool = Field(
        description="Whether or not the result of this should be returned directly to the user without you seeing what it is",
        default=False,
    )
