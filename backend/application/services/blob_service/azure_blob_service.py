from dotenv import load_dotenv
from fastapi import UploadFile
from pathlib import Path
from typing import Optional, Dict, Any
import logging
import os
from azure.storage.blob.aio import BlobServiceClient
from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError
from contextlib import asynccontextmanager
load_dotenv('new.env')

MAX_FILE_SIZE = 100 * 1024 * 1024
ALLOWED_EXTENSIONS = {'.pdf', '.doc', '.docx', '.txt', '.rtf', '.xls', '.xlsx', '.ppt', '.pptx', '.csv'}
STORAGE_CONNECTION_STRING = os.getenv("STORAGE_CONNECTION_STRING")


_blob_service_client: Optional[BlobServiceClient] = None

async def get_blob_service_client() -> BlobServiceClient:
    """Get or create async blob service client"""
    global _blob_service_client
    if _blob_service_client is None:
        _blob_service_client = BlobServiceClient.from_connection_string(
            STORAGE_CONNECTION_STRING
        )
    return _blob_service_client

async def close_blob_service_client():
    """Close the blob service client"""
    global _blob_service_client
    if _blob_service_client:
        await _blob_service_client.close()
        _blob_service_client = None

@asynccontextmanager
async def get_container_client(container_name: str):
    """Async context manager for container client"""
    blob_service_client = await get_blob_service_client()
    container_client = blob_service_client.get_container_client(container_name)
    try:
        yield container_client
    finally:
        pass

async def validate_file_async(file: UploadFile) -> tuple[bool, Optional[str]]:
    """Validate file type and size asynchronously"""
    try:
        # Check file extension
        if not file.filename:
            return False, "Filename is required"
        
        file_extension = Path(file.filename).suffix.lower()
        if file_extension not in ALLOWED_EXTENSIONS:
            return False, f"Invalid file type. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        
        # Check file size by reading content
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            return False, f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB"
        
        # Reset file pointer
        await file.seek(0)
        
        return True, None
        
    except Exception as e:
        return False, f"File validation error: {str(e)}"


async def container_exists_async(container_name: str) -> bool:
    """Check if Azure container exists asynchronously"""
    try:
        async with get_container_client(container_name) as container_client:
            await container_client.get_container_properties()
            return True
    except ResourceNotFoundError:
        return False
    except Exception as e:
        logging.error(f"Error checking container existence: {e}")
        return False

async def create_container_async(container_name: str) -> bool:
    """Create Azure container asynchronously"""
    try:
        blob_service_client = await get_blob_service_client()
        await blob_service_client.create_container(
            container_name,
            public_access=None  # Private container
        )
        logging.info(f"Container '{container_name}' created successfully")
        return True
    except ResourceExistsError:
        logging.info(f"Container '{container_name}' already exists")
        return True
    except Exception as e:
        logging.error(f"Failed to create container '{container_name}': {e}")
        return False


async def process_single_file_upload_with_path(file: UploadFile, container_name: str, tenant_id: str) -> Dict[str, Any]:
    """Process a single file upload with tenant folder structure - direct upload to blob storage"""
    
    try:
        # Validate file
        is_valid, error_message = await validate_file_async(file)
        if not is_valid:
            raise ValueError(error_message)
        
        # Read file content directly
        file_content = await file.read()
        file_size = len(file_content)
        
        # Reset file pointer for potential future use
        await file.seek(0)
        
        # Generate unique blob name with tenant folder structure
        blob_name = f"{tenant_id}/{file.filename}"
        
        # Upload directly to Azure Blob Storage
        async with get_container_client(container_name) as container_client:
            blob_client = container_client.get_blob_client(blob_name)
            await blob_client.upload_blob(file_content, overwrite=True)
            blob_url = blob_client.url

        return {
            "filename": file.filename,
            "blob_name": blob_name,
            "blob_url": blob_url,
            "file_size": file_size,
            "tenant_id": tenant_id
        }
        
    except Exception as e:
        # Re-raise with more context
        raise ValueError(f"Failed to upload {file.filename}: {str(e)}")
