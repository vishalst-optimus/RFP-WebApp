"""
Enhanced Knowledge Base Tool with Single-Index AI Content Priority.
Provides priority-based search within srch-index-rfp-01 for AI and non-AI content.

Environment Variables:
- ENABLE_DUAL_INDEX_AI_PRIORITY: Enable single-index AI content priority (default: false)
- AI_CONTENT_RELEVANCE_THRESHOLD: Minimum score threshold for AI content relevance (default: 0.6)
- AZURE_SEARCH_KEY: Azure Search service key
- AZURE_SEARCH_ENDPOINT: Azure Search service endpoint  
- AZURE_SEARCH_API_VERSION: Azure Search API version

Priority Logic:
1. Search srch-index-rfp-01 for both isAIContent=true and isAIContent=false content
2. Filter AI content results by relevance threshold
3. If relevant AI content is found, prioritize it and fill remaining slots with non-AI content
4. If no relevant AI content, use non-AI content exclusively
"""

import os
import heapq
import json
from typing import List, Optional, Type, Dict, Any
import requests
import asyncio
from collections import OrderedDict
import time
from langchain.callbacks.manager import AsyncCallbackManagerForToolRun, CallbackManagerForToolRun
from langchain.pydantic_v1 import BaseModel
from langchain.tools import BaseTool
from concurrent.futures import ThreadPoolExecutor
from langchain_core.retrievers import BaseRetriever
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from applicationinsights import TelemetryClient
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type
from langgraph.types import Command
from langchain_core.messages import ToolMessage
from common.utilities import Common
from core.models.tool_base_models.azure_search import SearchInput

executor = ThreadPoolExecutor()

class EnhancedKnowledgeBaseSearchTool(BaseTool):
    """Enhanced Knowledge Base Search Tool with Single-Index AI Content Priority."""
    
    name: str = "knowledge_base_tool"
    description: str = "Useful for performing AI-powered document search queries with single-index priority system. Searches srch-index-rfp-01 for both AI-generated and original content, prioritizing AI content when relevant."
    args_schema: Type[BaseModel] = SearchInput

    indexes: List[str] = []
    k: int = 10
    reranker_th: float = 1
    sas_token: str = ""
    user_language: str = "en"
    telemetry_client: TelemetryClient

    def _run(
        self, query: str, return_direct=False, run_manager: Optional[CallbackManagerForToolRun] = None
    ) -> str:
        pass

    async def _arun(
        self, query: str, tool_call_id, state, return_direct=False, run_manager: Optional[AsyncCallbackManagerForToolRun] = None
    ) -> str:
        try:
            # Check if dual-index AI content priority is enabled
            enable_dual_index = os.environ.get("ENABLE_DUAL_INDEX_AI_PRIORITY", "false").lower() == "true"
            
            if enable_dual_index:
                retriever = EnhancedAzureSearchRetriever(
                    indexes=self.indexes,
                    topK=self.k,
                    reranker_threshold=self.reranker_th,
                    sas_token=self.sas_token,
                    callback_manager=self.callbacks,
                    user_language=self.user_language,
                    telemetry_client=self.telemetry_client
                )
            else:
                # Fallback to original implementation
                try:
                    from .knowledge_base_tool import CustomAzureSearchRetriever
                    retriever = CustomAzureSearchRetriever(
                        indexes=self.indexes,
                        topK=self.k,
                        reranker_threshold=self.reranker_th,
                        sas_token=self.sas_token,
                        callback_manager=self.callbacks,
                        user_language=self.user_language,
                        telemetry_client=self.telemetry_client
                    )
                except ImportError:
                    # Use enhanced retriever as fallback
                    retriever = EnhancedAzureSearchRetriever(
                        indexes=self.indexes,
                        topK=self.k,
                        reranker_threshold=self.reranker_th,
                        sas_token=self.sas_token,
                        callback_manager=self.callbacks,
                        user_language=self.user_language,
                        telemetry_client=self.telemetry_client
                    )

            print("Enhanced Knowledge Base Tool Invoked")

            loop = asyncio.get_running_loop()
            content = await loop.run_in_executor(executor, retriever.invoke, query)
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            content=content,
                            tool_call_id=tool_call_id,
                            name=self.name,
                        )
                    ]
                }
            )
        except Exception as e:
            self.telemetry_client.track_exception(e)
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            content=f"Error occurred: {e}",
                            tool_call_id=tool_call_id,
                            name=self.name,
                        )
                    ]
                }
            )


class EnhancedAzureSearchRetriever(BaseRetriever):
    """Enhanced Azure Search Retriever with Single-Index AI Content Priority."""
    
    indexes: List
    topK: int
    reranker_threshold: float
    sas_token: str = ""
    user_language: str = "en"
    telemetry_client: TelemetryClient
    toc_structure: dict = None
    
    def set_toc_structure(self, toc_structure: dict):
        """Set the TOC structure for enhanced iterative search."""
        self.toc_structure = toc_structure

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun
    ) -> List[Document]:
        # Get TOC structure from environment or context if available
        toc_structure = getattr(self, 'toc_structure', None)
        
        ordered_results = get_enhanced_search_results(
            query, self.indexes, self.telemetry_client, 
            k=self.topK, reranker_threshold=self.reranker_threshold, 
            sas_token=self.sas_token, toc_structure=toc_structure
        )
        top_docs = []
        for key, value in ordered_results.items():
            top_docs.append(Document(
                page_content=value["chunk"], 
                metadata={
                    "score": value["score"], 
                    "index": value.get("index", ""),
                    "isAIContent": value.get("isAIContent", False)
                }
            ))
        return top_docs


def get_enhanced_search_results(query: str, indexes: list, telemetry_client: TelemetryClient,
                               k: int = 5,
                               reranker_threshold: float = 1,
                               sas_token: str = "",
                               toc_structure: dict = None) -> dict:
    """
    Enhanced search function with single-index AI content priority system.
    Uses only srch-index-rfp-01 and prioritizes isAIContent=true content over isAIContent=false content.
    
    Args:
        query: Search query
        indexes: List of indexes to search (will use only srch-index-rfp-01)
        telemetry_client: Application insights client
        k: Number of results to return
        reranker_threshold: Minimum reranker score threshold
        sas_token: SAS token for authentication
        toc_structure: Dictionary containing TOC hierarchy with sections and subsections
        
    Returns:
        Ordered dictionary of search results with priority to AI content
    """
    headers = {'Content-Type': 'application/json', 'api-key': os.environ.get("AZURE_SEARCH_KEY", "")}
    params = {'api-version': os.environ.get('AZURE_SEARCH_API_VERSION', "")}
    start_time = time.time()
    
    azure_endpoint = os.environ.get("AZURE_SEARCH_ENDPOINT", "")
    enable_filtering = os.environ.get("ENABLE_DUAL_INDEX_AI_PRIORITY", "false").lower() == "true"
    ai_content_relevance_threshold = float(os.environ.get("AI_CONTENT_RELEVANCE_THRESHOLD", "0.6"))
    
    # Use only srch-index-rfp-01 as the primary index
    primary_index = "srch-index-rfp-01"
    
    if not enable_filtering:
        # Use original logic if filtering is disabled
        return get_original_search_results(query, [primary_index], telemetry_client, k, reranker_threshold, sas_token)
    
    # Extract search queries based on TOC structure if available
    search_queries = extract_toc_based_search_queries(query, toc_structure, telemetry_client)
    
    telemetry_client.track_trace(
        f"Enhanced TOC-based search - Queries to execute: {len(search_queries)} for index: {primary_index}", 
        severity=1
    )
    
    # Step 1: Perform iterative searches based on TOC structure
    all_ai_results = []
    all_non_ai_results = []
    
    for search_query in search_queries:
        telemetry_client.track_trace(f"TOC-based search query: {search_query}", severity=1)
        
        # Search AI content
        ai_results = search_with_ai_content_filter(
            search_query, primary_index, True, headers, params, azure_endpoint, 
            k, telemetry_client
        )
        all_ai_results.extend(ai_results)
        
        # Search non-AI content
        non_ai_results = search_with_ai_content_filter(
            search_query, primary_index, False, headers, params, azure_endpoint, 
            k, telemetry_client
        )
        all_non_ai_results.extend(non_ai_results)
    
    # Remove duplicates by ID while preserving order and best scores
    ai_content_results = remove_duplicate_results(all_ai_results)
    non_ai_content_results = remove_duplicate_results(all_non_ai_results)
    
    telemetry_client.track_trace(
        f"Found {len(ai_content_results)} AI content results and {len(non_ai_content_results)} non-AI content results in {primary_index}", 
        severity=1
    )
    
    # Step 2: Filter and evaluate AI content relevance
    relevant_ai_results = filter_relevant_ai_content(ai_content_results, ai_content_relevance_threshold)
    
    # Step 3: Apply priority-based result combination
    final_results = combine_results_with_ai_priority(
        relevant_ai_results, non_ai_content_results, k, reranker_threshold, telemetry_client
    )
    
    # Step 4: Process final results
    ordered_results = process_final_results(final_results, k, reranker_threshold, telemetry_client)
    
    end_time = time.time()
    time_taken = end_time - start_time
    telemetry_client.track_trace(f"Time taken for Enhanced Single-Index Search: {time_taken}", severity=1)
    
    return ordered_results


def search_with_ai_content_filter(query: str, index: str, is_ai_content: bool, 
                                headers: dict, params: dict, azure_endpoint: str, 
                                k: int, telemetry_client: TelemetryClient) -> list:
    """Search specific index with AI content filter."""
    try:
        search_payload = {
            "search": query,
            "select": "id, title, chunk, name, isAIContent",
            "filter": f"isAIContent eq {str(is_ai_content).lower()}",
            "queryType": "semantic",
            "vectorQueries": [{"text": query, "fields": "chunkVector", "kind": "text", "k": k}],
            "semanticConfiguration": "my-semantic-config",
            "captions": "extractive",
            "answers": "extractive",
            "count": "true",
            "top": k
        }
        
        print(f"AI Search Query: {query} on index: {index} with isAIContent={is_ai_content}")
        
        response = requests.post(
            f"{azure_endpoint}/indexes/{index}/docs/search",
            data=json.dumps(search_payload), 
            headers=headers, 
            params=params
        )
        response.raise_for_status()
        search_results = response.json()
        
        results = []
        for result in search_results.get('value', []):
            result_data = {
                'id': result['id'],
                'chunk': result['chunk'],
                'score': result.get('@search.rerankerScore', 0),
                'index': index,
                'isAIContent': result.get('isAIContent', False)
            }
            results.append(result_data)
            
        telemetry_client.track_trace(
            f"Found {len(results)} results in {index} with isAIContent={is_ai_content}", 
            severity=1
        )
        return results
        
    except Exception as e:
        telemetry_client.track_exception(e)
        print(f"Error querying index {index} with AI content filter: {e}")
        return []


def filter_relevant_ai_content(ai_results: list, relevance_threshold: float) -> list:
    """
    Filter AI content results based on relevance threshold.
    
    Args:
        ai_results: List of AI content search results
        relevance_threshold: Minimum score threshold for relevance
        
    Returns:
        List of relevant AI content results
    """
    relevant_results = [result for result in ai_results if result['score'] >= relevance_threshold]
    return sorted(relevant_results, key=lambda x: x['score'], reverse=True)


def combine_results_with_ai_priority(ai_results: list, non_ai_results: list, k: int, 
                                   reranker_threshold: float, telemetry_client: TelemetryClient) -> list:
    """
    Combine AI and non-AI results with priority to AI content when it's relevant.
    
    Logic:
    1. If we have relevant AI content (score above threshold), prioritize it
    2. Fill remaining slots with non-AI content
    3. If no relevant AI content, use non-AI content
    
    Args:
        ai_results: List of AI content results (already filtered for relevance)
        non_ai_results: List of non-AI content results
        k: Number of results to return
        reranker_threshold: Minimum reranker score threshold
        telemetry_client: Application insights client
        
    Returns:
        List of combined results with AI priority
    """
    # Filter both result sets by reranker threshold
    filtered_ai_results = [r for r in ai_results if r['score'] > reranker_threshold]
    filtered_non_ai_results = [r for r in non_ai_results if r['score'] > reranker_threshold]
    
    # Sort both by score descending
    filtered_ai_results.sort(key=lambda x: x['score'], reverse=True)
    filtered_non_ai_results.sort(key=lambda x: x['score'], reverse=True)
    
    combined_results = []
    
    if filtered_ai_results:
        # We have relevant AI content, prioritize it
        telemetry_client.track_trace(
            f"Prioritizing {len(filtered_ai_results)} AI content results", 
            severity=1
        )
        
        # Add AI results first (up to k results)
        ai_slots = min(len(filtered_ai_results), k)
        combined_results.extend(filtered_ai_results[:ai_slots])
        
        # Fill remaining slots with non-AI content
        remaining_slots = k - len(combined_results)
        if remaining_slots > 0 and filtered_non_ai_results:
            combined_results.extend(filtered_non_ai_results[:remaining_slots])
            telemetry_client.track_trace(
                f"Added {min(remaining_slots, len(filtered_non_ai_results))} non-AI content results to fill remaining slots", 
                severity=1
            )
    else:
        # No relevant AI content, use non-AI content
        telemetry_client.track_trace(
            "No relevant AI content found, using non-AI content", 
            severity=1
        )
        combined_results.extend(filtered_non_ai_results[:k])
    
    telemetry_client.track_trace(
        f"Final combined results: {len(combined_results)} total, "
        f"AI content: {sum(1 for r in combined_results if r.get('isAIContent', False))}, "
        f"Non-AI content: {sum(1 for r in combined_results if not r.get('isAIContent', False))}", 
        severity=1
    )
    
    return combined_results


def process_final_results(results: list, k: int, reranker_threshold: float, 
                        telemetry_client: TelemetryClient) -> OrderedDict:
    """
    Process final results into ordered dictionary format.
    
    Args:
        results: List of search results
        k: Maximum number of results to return
        reranker_threshold: Minimum reranker score threshold
        telemetry_client: Application insights client
        
    Returns:
        OrderedDict of processed results
    """
    # Ensure we don't exceed k results
    final_results = results[:k]
    
    # Create ordered dict
    ordered_content = OrderedDict()
    for result in final_results:
        ordered_content[result["id"]] = result
        telemetry_client.track_trace(
            f"Final result - Document_id: {result['id']}, reranker: {result['score']}, "
            f"isAIContent: {result.get('isAIContent', False)}, index: {result['index']}", 
            severity=1
        )
    
    return ordered_content


def extract_toc_based_search_queries(query: str, toc_structure: dict, telemetry_client: TelemetryClient) -> list:
    """
    Extract search queries based on TOC structure and current query.
    
    Args:
        query: Original search query
        toc_structure: TOC hierarchy structure from the RFP analysis
        telemetry_client: Application insights client
        
    Returns:
        List of search queries to execute
    """
    search_queries = [query]  # Always include the original query
    
    if not toc_structure or not toc_structure.get('toc_found'):
        telemetry_client.track_trace("No TOC structure available, using original query only", severity=1)
        return search_queries
    
    # Extract main section name from query
    query_lower = query.lower()
    
    # Find matching section in TOC structure
    matching_section = None
    for section in toc_structure.get('sections', []):
        section_name = section.get('section_name', '').lower()
        if any(word in query_lower for word in section_name.split() if len(word) > 3):
            matching_section = section
            break
    
    if matching_section and matching_section.get('subsections'):
        telemetry_client.track_trace(
            f"Found matching TOC section: {matching_section.get('section_name')} with {len(matching_section['subsections'])} subsections", 
            severity=1
        )
        
        # Add subsection-based queries
        main_section_name = matching_section.get('section_name', '')
        for subsection in matching_section['subsections']:
            subsection_name = subsection.get('subsection_name', '')
            if subsection_name:
                # Create combined search query
                combined_query = f"{main_section_name} {subsection_name}"
                search_queries.append(combined_query)
                
                # Also add just the subsection name for more specific searches
                search_queries.append(subsection_name)
    
    # Limit to maximum 5 search queries to avoid overwhelming the system
    search_queries = search_queries[:5]
    
    telemetry_client.track_trace(f"Generated {len(search_queries)} search queries from TOC analysis", severity=1)
    return search_queries


def remove_duplicate_results(results: list) -> list:
    """
    Remove duplicate results by ID, keeping the highest scoring version of each document.
    
    Args:
        results: List of search result dictionaries
        
    Returns:
        Deduplicated list of results sorted by score descending
    """
    seen_ids = {}
    
    for result in results:
        doc_id = result.get('id')
        if not doc_id:
            continue
            
        # Keep the result with the highest score for each ID
        if doc_id not in seen_ids or result.get('score', 0) > seen_ids[doc_id].get('score', 0):
            seen_ids[doc_id] = result
    
    # Return sorted by score descending
    return sorted(seen_ids.values(), key=lambda x: x.get('score', 0), reverse=True)


def filter_high_quality_results(results: list, min_threshold: float) -> list:
    """Filter results based on minimum quality threshold."""
    return [result for result in results if result['score'] >= min_threshold]


def combine_priority_results(ai_results: list, non_ai_results: list, k: int) -> list:
    """Combine results with priority to AI content."""
    # Sort AI results by score (descending)
    ai_results_sorted = sorted(ai_results, key=lambda x: x['score'], reverse=True)
    non_ai_results_sorted = sorted(non_ai_results, key=lambda x: x['score'], reverse=True)
    
    # Combine with priority to AI content
    combined = []
    
    # Add all high-quality AI results first
    combined.extend(ai_results_sorted)
    
    # Add non-AI results to fill up to k
    remaining_slots = k - len(combined)
    if remaining_slots > 0:
        combined.extend(non_ai_results_sorted[:remaining_slots])
    
    return combined[:k]


def search_fallback_indexes(query: str, indexes: list, priority_index: str,
                          headers: dict, params: dict, azure_endpoint: str,
                          needed_count: int, telemetry_client: TelemetryClient) -> list:
    """Search fallback indexes excluding priority index."""
    fallback_results = []
    fallback_indexes = [idx for idx in indexes if idx != priority_index]
    
    for index in fallback_indexes:
        if len(fallback_results) >= needed_count:
            break
            
        try:
            search_payload = {
                "search": query,
                "select": "id, title, chunk, name",
                "queryType": "semantic",
                "vectorQueries": [{"text": query, "fields": "chunkVector", "kind": "text", "k": needed_count}],
                "semanticConfiguration": "my-semantic-config",
                "captions": "extractive",
                "answers": "extractive",
                "count": "true",
                "top": needed_count
            }
            
            response = requests.post(
                f"{azure_endpoint}/indexes/{index}/docs/search",
                data=json.dumps(search_payload),
                headers=headers,
                params=params
            )
            response.raise_for_status()
            search_results = response.json()
            
            for result in search_results.get('value', []):
                if len(fallback_results) >= needed_count:
                    break
                result_data = {
                    'id': result['id'],
                    'chunk': result['chunk'],
                    'score': result.get('@search.rerankerScore', 0),
                    'index': index,
                    'isAIContent': False  # Default for fallback indexes
                }
                fallback_results.append(result_data)
                
        except Exception as e:
            telemetry_client.track_exception(e)
            print(f"Error querying fallback index {index}: {e}")
            continue
    
    return fallback_results


def process_filtered_results(results: list, k: int, reranker_threshold: float, 
                           telemetry_client: TelemetryClient) -> OrderedDict:
    """Process and rank filtered results."""
    # Filter by reranker threshold
    filtered_results = [r for r in results if r['score'] > reranker_threshold]
    
    # Get top k results
    top_results = heapq.nlargest(k, filtered_results, key=lambda x: x["score"])
    
    # Create ordered dict
    ordered_content = OrderedDict()
    for result in top_results:
        ordered_content[result["id"]] = result
        telemetry_client.track_trace(
            f"Document_id: {result['id']}, reranker: {result['score']}, "
            f"isAIContent: {result.get('isAIContent', False)}, index: {result['index']}", 
            severity=1
        )
    
    return ordered_content


def get_original_search_results(query: str, indexes: list, telemetry_client: TelemetryClient,
                              k: int = 5, reranker_threshold: float = 1, sas_token: str = "") -> dict:
    """Original search function for backward compatibility. Uses srch-index-rfp-01 as primary index."""
    try:
        from .knowledge_base_tool import get_search_results
        # Use srch-index-rfp-01 as the primary index
        primary_index = ["srch-index-rfp-01"]
        return get_search_results(query, primary_index, telemetry_client, k, reranker_threshold, sas_token)
    except ImportError:
        # Fallback implementation
        telemetry_client.track_trace("Fallback to basic search implementation", severity=2)
        return {}