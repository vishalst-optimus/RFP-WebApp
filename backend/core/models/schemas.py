"""
Pydantic models for RFP Agent API
"""
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Union, Any, Dict
from enum import Enum

class CompletionStatus(str, Enum):
    """Enum for section completion status"""
    NEEDS_CONTENT = "needs_content"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    REVIEWED = "reviewed"

class ResponsePriority(str, Enum):
    """Enum for response priority levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class SectionType(str, Enum):
    """Enum for section types"""
    STRUCTURED = "structured"
    UNSTRUCTURED = "unstructured"
    TECHNICAL = "technical"
    COMMERCIAL = "commercial"

class HealthCheckResponse(BaseModel):
    """Response model for health check endpoint"""
    status: str = Field(..., description="Health status of the API")
    message: str = Field(..., description="Descriptive message about the health status")

class DocumentAnalysisResult(BaseModel):
    """Model for document analysis result from Mistral"""
    content: str = Field(..., description="Extracted document content")
    paragraphs: Optional[List[Any]] = Field(default=[], description="List of document paragraphs")
    error: Optional[str] = Field(default=None, description="Error message if analysis failed")

class TOCItem(BaseModel):
    """Model for Table of Contents item"""
    title: str = Field(..., description="Section title")
    page_number: Optional[int] = Field(default=None, description="Page number where section starts")
    level: int = Field(default=1, description="Hierarchical level of the section")
    children: Optional[List['TOCItem']] = Field(default=[], description="Subsections")

# Enable forward references for recursive model
TOCItem.model_rebuild()

class TableOfContents(BaseModel):
    """Model for complete Table of Contents"""
    items: List[TOCItem] = Field(..., description="List of TOC items")
    raw: Optional[str] = Field(default=None, description="Raw TOC text")

class RFPSection(BaseModel):
    """Model for individual RFP section"""
    name: str = Field(..., description="Section name")
    type: SectionType = Field(default=SectionType.STRUCTURED, description="Type of section")
    content: str = Field(default="", description="Section content")
    word_count: int = Field(default=0, description="Number of words in the section")
    completion_status: CompletionStatus = Field(default=CompletionStatus.NEEDS_CONTENT, description="Current completion status")
    needs_response: bool = Field(default=True, description="Whether this section needs a response")
    content_gaps: List[str] = Field(default=[], description="List of identified content gaps")
    response_priority: ResponsePriority = Field(default=ResponsePriority.MEDIUM, description="Priority level for response")
    section_order: int = Field(default=0, description="Order of section in document")
    sort_key: str = Field(..., description="Sorting key for section ordering")
    section_purpose: str = Field(default="", description="Purpose or description of the section")
    estimated_length: str = Field(default="2-3 pages", description="Estimated length for response")
    knowledge_base_queries: List[str] = Field(default=[], description="Suggested queries for knowledge base")
    source: str = Field(default="structured", description="Source of the section")
    client_description: str = Field(default="", description="Client's description of requirements")
    weight_percentage: str = Field(default="", description="Weight percentage for scoring")

    @field_validator('word_count')
    @classmethod
    def validate_word_count(cls, v):
        if v < 0:
            raise ValueError('Word count must be non-negative')
        return v

    @field_validator('section_order')
    @classmethod
    def validate_section_order(cls, v):
        if v < 0:
            raise ValueError('Section order must be non-negative')
        return v

class RFPAnalysisRequest(BaseModel):
    """Request model for RFP analysis"""
    session_id: str = Field(..., description="Unique session identifier")
    # Note: file is handled separately as UploadFile in FastAPI

class RFPAnalysisResponse(BaseModel):
    """Response model for RFP analysis"""
    session_id: Optional[str] = Field(default=None, description="Session identifier")
    file_name: str = Field(..., description="Name of the analyzed file")
    status: str = Field(..., description="Analysis status")
    processing_time: float = Field(..., description="Time taken to process the document in seconds")
    rfp_structure: str = Field(..., description="Type of RFP structure approach used")
    table_of_contents: Union[str, TableOfContents] = Field(..., description="Formatted table of contents")
    total_sections: int = Field(..., description="Total number of sections identified")
    sections_needing_response: int = Field(..., description="Number of sections that need responses")
    sections: List[RFPSection] = Field(..., description="List of identified sections")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata from document analysis")

    @field_validator('processing_time')
    @classmethod
    def validate_processing_time(cls, v):
        if v < 0:
            raise ValueError('Processing time must be non-negative')
        return v

    @field_validator('total_sections')
    @classmethod
    def validate_total_sections(cls, v):
        if v < 0:
            raise ValueError('Total sections must be non-negative')
        return v

    @field_validator('sections_needing_response')
    @classmethod
    def validate_sections_needing_response(cls, v):
        if v < 0:
            raise ValueError('Sections needing response must be non-negative')
        return v

class ErrorResponse(BaseModel):
    """Generic error response model"""
    detail: str = Field(..., description="Error message")
    error_code: Optional[str] = Field(default=None, description="Specific error code")
    timestamp: Optional[str] = Field(default=None, description="Error timestamp")

class MistralDocumentRequest(BaseModel):
    """Request model for Mistral Document AI"""
    file_content: bytes = Field(..., description="Document file content")
    file_name: str = Field(..., description="Document file name")
    mime_type: Optional[str] = Field(default=None, description="MIME type of the document")

class MistralAPIRequest(BaseModel):
    """Model for Mistral API request body"""
    model: str = Field(default="mistral-document-ai-2505", description="Model name")
    document: dict = Field(..., description="Document data for analysis")
    include_image_base64: bool = Field(default=False, description="Whether to include image base64")

class DocumentParagraph(BaseModel):
    """Model for document paragraph"""
    content: str = Field(..., description="Paragraph content")
    role: str = Field(default="paragraph", description="Role of the paragraph")
    bounding_regions: Optional[List[dict]] = Field(default=[], description="Bounding regions information")

class AnalysisMetrics(BaseModel):
    """Model for analysis metrics and statistics"""
    total_characters: int = Field(..., description="Total characters in document")
    total_words: int = Field(..., description="Total words in document")
    total_paragraphs: int = Field(..., description="Total paragraphs in document")
    analysis_duration: float = Field(..., description="Time taken for analysis")
    
    @field_validator('total_characters', 'total_words', 'total_paragraphs')
    @classmethod
    def validate_non_negative(cls, v):
        if v < 0:
            raise ValueError('Metrics must be non-negative')
        return v
    
class SectionContent(BaseModel):
    content: str = Field(..., description="Content of the section")

class Metadata(BaseModel):
    document_type: str
    analysis_date: str
    total_sections: int

class RFPRequest(BaseModel):
    metadata: Metadata
    sections: Dict[str, SectionContent]
    rfp_name: str

# RFP Data Storage Models
class RFPSectionData(BaseModel):
    """Model for individual RFP section data"""
    SectionName: str = Field(..., description="Name of the section")
    Content: str = Field(default="", description="Content of the section")
    Image: str = Field(default="", description="Image URL or path for the section")
    Confidence: float = Field(default=0.0, description="Confidence score for the section", ge=0.0, le=1.0)


class RFPAnalysisData(BaseModel):
    """Model for individual RFP analysis result"""
    RFP_Name: str = Field(..., description="Name of the RFP document")
    isExported: bool = Field(default=False, description="Whether the RFP has been exported")
    confidenceScore: float = Field(..., description="Overall confidence score for the RFP", ge=0.0, le=100.0)
    sections: List[RFPSectionData] = Field(..., description="List of sections in the RFP")
    createdAt: Optional[str] = Field(default=None, description="Creation timestamp")
    updatedAt: Optional[str] = Field(default=None, description="Last update timestamp")
    exportedAt: Optional[str] = Field(default=None, description="Export timestamp")
    sessionId: Optional[str] = Field(default=None, description="Session ID for tracking")


class UserRFPDataDocument(BaseModel):
    """Model for the complete user RFP data document stored in Cosmos DB"""
    id: str = Field(..., description="Document ID (tenant_id_user_id)")
    Tenant_id: str = Field(..., description="Tenant/organization ID")
    User_id: str = Field(..., description="User ID")
    Total_RFPs: int = Field(..., description="Total number of RFPs for this user", ge=0)
    RFP_Data: List[RFPAnalysisData] = Field(..., description="List of RFP analysis data")
    createdAt: Optional[str] = Field(default=None, description="Document creation timestamp")
    updatedAt: Optional[str] = Field(default=None, description="Document last update timestamp")


class SectionUpdateData(BaseModel):
    """Model for individual section update data"""
    section_title: str = Field(..., description="Title of the section to update")
    section_content: str = Field(..., description="New content for the section")
    section_type: Optional[str] = Field(default="unknown", description="Type of the section")


class UpdateSectionContentRequest(BaseModel):
    """Model for updating multiple section contents in Cosmos DB"""
    rfp_name: str = Field(..., description="Name of the RFP to update")
    sections: List[SectionUpdateData] = Field(..., description="List of sections to update")


class DocumentGenerationRequest(BaseModel):
    """Simplified model for document generation - retrieves section data from Cosmos DB"""
    rfp_name: str
    metadata: Metadata

class SectionToImport(BaseModel):
    id: str
    name: str

class ImportSectionsRequest(BaseModel):
    sessionId: str
    rfpName: str
    currentRfpName: str
    selectedSections: List[SectionToImport]

class MediaItemModel(BaseModel):
    id: str
    name: str
    type: str
    url: str
    downloadUrl: str
    size: str
    source: str
    mimeType: str
    googleDriveFileId: str = None
    googleDriveAccessToken: str = None

class InsertToBlobRequest(BaseModel):
    mediaItems: list[MediaItemModel]

class InsertToBlobResponse(BaseModel):
    success: bool
    message: str = None

class UploadFileFromUrlRequest(BaseModel):
    rfp_name: str
    url: str
    mediaType: str
    source: str = "manual"