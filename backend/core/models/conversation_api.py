"""
Conversation API domain models.
Represents request and response structures for conversation API endpoints.
"""

from pydantic import BaseModel

class InputRequest(BaseModel):
    """Input request for conversation API (JSON only)."""
    prompt: str = "Let's say one person is always on days. How do I get his schedule to repeat itself?"
    prompt_id: str = "5467e0714e0f90edf288ae1234fb8"
    session_id: str = "session124901"
    user_id: str = "user123"

class Headers(BaseModel):
    """Request headers structure."""
    user_language: str = "EN"
    authorization: str = "<JWT_Token>"
    product_info:str = "<to detect indexes>"

class FeedbackRequest(BaseModel):
    """Feedback request structure."""
    session_id: str = "session365"
    feedback: str = "-1"# default -1
    prompt_id: str = "5467e07174414e0f90edf288aeb93fb8"
