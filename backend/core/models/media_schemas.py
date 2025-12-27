"""
Pydantic models for media insertion functionality
"""
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

class MediaItem(BaseModel):
    id: str
    name: str
    type: Literal['image', 'document', 'certificate']
    url: str = Field(..., description="SharePoint web URL")
    downloadUrl: Optional[str] = Field(None, description="Direct download URL")
    size: str
    source: Literal['sharepoint', 'drive', 'manual']
    mimeType: str

class LocationOptions(BaseModel):
    type: Literal['section', 'separate_page', 'appendix']
    sectionId: Optional[str] = None
    sectionTitle: Optional[str] = None

class DisplayOptions(BaseModel):
    type: Literal['inline', 'figure']
    caption: Optional[str] = None
    figureNumber: Optional[int] = None

class InsertionOptions(BaseModel):
    location: LocationOptions
    displayOptions: DisplayOptions

class InsertMediaRequest(BaseModel):
    mediaItem: MediaItem
    insertionOptions: InsertionOptions

class LocationData(BaseModel):
    type: Literal['section', 'separate_page', 'appendix']
    sectionId: Optional[str] = None
    sectionTitle: Optional[str] = None
    position: int

class DisplayInfo(BaseModel):
    type: Literal['inline', 'figure']
    caption: Optional[str] = None
    figureNumber: Optional[int] = None
    renderedHtml: str

class MediaItemResponse(BaseModel):
    id: str
    name: str
    type: Literal['image', 'document', 'certificate']
    url: str
    insertedAt: str

class ErrorDetails(BaseModel):
    field: str
    reason: str

class ErrorInfo(BaseModel):
    code: str
    message: str
    details: Optional[ErrorDetails] = None

class InsertMediaResponseData(BaseModel):
    insertionId: str
    mediaItem: MediaItemResponse
    location: LocationData
    displayInfo: DisplayInfo

class InsertMediaResponse(BaseModel):
    success: bool
    data: Optional[InsertMediaResponseData] = None
    message: Optional[str] = None
    error: Optional[ErrorInfo] = None