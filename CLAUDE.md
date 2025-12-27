# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an RFP (Request for Proposal) Response Generator application with a Python FastAPI backend and Streamlit frontend. The system analyzes RFP documents using Azure services and generates responses using LangGraph workflows powered by Azure OpenAI.

## Architecture

### Backend (`apps/backend/`)
- **FastAPI server** (`server.py`) - Main application entry point with two primary endpoints:
  - `/api/v1/rfp/analyze` - Analyzes uploaded RFP documents using Azure Document Intelligence
  - `/api/v1/rfp/draft` - Generates RFP responses using LangGraph workflows
- **Core models** (`core/models/`) - Data structures for API requests/responses
- **Application services** (`application/services/`) - Business logic layer:
  - `langgraph_services/` - Workflow orchestration and streaming
  - `caching_service/` - Request/response caching
  - `logging_service/` - Application telemetry
- **Common utilities** (`common/`) - Shared constants, prompts, and utilities
- **Infrastructure** (`infrastructure/`) - External service integrations and tool definitions

### Frontend (`apps/frontend/`)
- **Streamlit application** (`rfp_analyzer_streamlit.py`) - Single-file web interface for document upload, analysis, and response generation

## Development Commands

### Backend Development
```bash
# Navigate to backend directory
cd apps/backend

# Install dependencies
pip install -r requirements.txt

# Run development server
python server.py
# OR
uvicorn server:app --host 127.0.0.1 --port 8000 --reload

# Run with Gunicorn (production)
gunicorn -w 2 -k uvicorn.workers.UvicornWorker server:app
# OR
./startup.sh

# Run tests
pytest
```

### Frontend Development
```bash
# Navigate to frontend directory  
cd apps/frontend

# Run Streamlit application
streamlit run rfp_analyzer_streamlit.py
```

### Docker Deployment
```bash
# From backend directory
docker build -t rfp-analyzer .
docker run -p 8000:8000 rfp-analyzer
```

## Environment Configuration

The application requires Azure service credentials in `apps/backend/credentials.env`:
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_KEY` 
- `AZURE_OPENAI_DEPLOYMENT_NAME`
- `AZURE_DOCINT_ENDPOINT`
- `AZURE_DOCINT_KEY`

## Key Integration Points

### Azure Services
- **Azure Document Intelligence** - Document content extraction and analysis
- **Azure OpenAI** - LLM-powered content analysis and response generation
- **Application Insights** - Telemetry and monitoring

### LangGraph Workflows
The system uses LangGraph for orchestrating multi-step RFP response generation with streaming capabilities. Workflow configurations are managed through the `WorkflowService` class.

## Testing

Tests are configured with pytest. The requirements.txt includes `pytest==8.3.5` for testing framework.

## Code Organization Patterns

- All Azure service interactions are centralized in service classes
- LLM prompts are stored in `common/prompts/prompts.py`
- Error handling includes fallback mechanisms for service failures
- Concurrent processing is used for performance optimization (ThreadPoolExecutor)
- Response streaming is implemented for real-time user feedback