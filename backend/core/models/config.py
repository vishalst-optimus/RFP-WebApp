"""
Configuration models for RFP Agent
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional
import os

class AzureOpenAIConfig(BaseModel):
    """Configuration for Azure OpenAI service"""
    endpoint: str = Field(..., description="Azure OpenAI endpoint URL")
    api_key: str = Field(..., description="Azure OpenAI API key")
    deployment_name: str = Field(default="gpt-4", description="Deployment name")
    api_version: str = Field(default="2024-10-21", description="API version")
    
    @field_validator('endpoint')
    @classmethod
    def validate_endpoint(cls, v):
        if not v.startswith(('http://', 'https://')):
            raise ValueError('Endpoint must be a valid URL')
        return v
    
    @classmethod
    def from_env(cls):
        """Create config from environment variables"""
        return cls(
            endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
            api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
            deployment_name=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4"),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21")
        )

class MistralDocumentAIConfig(BaseModel):
    """Configuration for Mistral Document AI service"""
    endpoint: str = Field(..., description="Mistral Document AI endpoint URL")
    api_key: str = Field(..., description="Mistral Document AI API key")
    model: str = Field(default="mistral-document-ai-2505", description="Model name")
    timeout: int = Field(default=120, description="Request timeout in seconds")
    include_image_base64: bool = Field(default=False, description="Include image base64 in response")
    
    @field_validator('endpoint')
    @classmethod
    def validate_endpoint(cls, v):
        if not v.startswith(('http://', 'https://')):
            raise ValueError('Endpoint must be a valid URL')
        return v
    
    @field_validator('timeout')
    @classmethod
    def validate_timeout(cls, v):
        if v <= 0:
            raise ValueError('Timeout must be positive')
        return v
    
    @classmethod
    def from_env(cls):
        """Create config from environment variables"""
        return cls(
            endpoint=os.getenv("AZURE_DOCUMENTAI_ENDPOINT", ""),
            api_key=os.getenv("AZURE_DOCUMENTAI_KEY", "")
        )

class ApplicationInsightsConfig(BaseModel):
    """Configuration for Application Insights"""
    instrumentation_key: str = Field(..., description="Application Insights instrumentation key")
    
    @classmethod
    def from_env(cls):
        """Create config from environment variables"""
        return cls(
            instrumentation_key=os.getenv("APPLICATION_INSIGHT_INSTRUMENTATION_KEY", "")
        )

class ServerConfig(BaseModel):
    """Server configuration"""
    host: str = Field(default="0.0.0.0", description="Server host")
    port: int = Field(default=8000, description="Server port")
    environment: str = Field(default="development", description="Environment (development, staging, production)")
    log_level: str = Field(default="INFO", description="Logging level")
    max_file_size: int = Field(default=10485760, description="Maximum file upload size in bytes")
    allowed_file_extensions: list = Field(default=[".pdf", ".doc", ".docx", ".txt"], description="Allowed file extensions")
    
    @field_validator('port')
    @classmethod
    def validate_port(cls, v):
        if not 1 <= v <= 65535:
            raise ValueError('Port must be between 1 and 65535')
        return v
    
    @field_validator('max_file_size')
    @classmethod
    def validate_file_size(cls, v):
        if v <= 0:
            raise ValueError('Max file size must be positive')
        return v
    
    @classmethod
    def from_env(cls):
        """Create config from environment variables"""
        allowed_extensions = os.getenv("ALLOWED_FILE_EXTENSIONS", ".pdf,.doc,.docx,.txt").split(",")
        return cls(
            host=os.getenv("HOST", "0.0.0.0"),
            port=int(os.getenv("PORT", "8000")),
            environment=os.getenv("ENVIRONMENT", "development"),
            log_level=os.getenv("LOG_LEVEL", "INFO"),
            max_file_size=int(os.getenv("MAX_FILE_SIZE", "10485760")),
            allowed_file_extensions=allowed_extensions
        )

class AppConfig(BaseModel):
    """Main application configuration"""
    azure_openai: AzureOpenAIConfig
    mistral_document_ai: MistralDocumentAIConfig
    application_insights: ApplicationInsightsConfig
    server: ServerConfig
    
    @classmethod
    def from_env(cls):
        """Create complete config from environment variables"""
        return cls(
            azure_openai=AzureOpenAIConfig.from_env(),
            mistral_document_ai=MistralDocumentAIConfig.from_env(),
            application_insights=ApplicationInsightsConfig.from_env(),
            server=ServerConfig.from_env()
        )
