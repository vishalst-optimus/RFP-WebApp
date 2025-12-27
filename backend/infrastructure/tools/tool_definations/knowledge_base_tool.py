import os
import heapq
import json
from typing import List, Optional, Type
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

class KnowledgeBaseSearchTool(BaseTool):
    name: str = "knowledge_base_tool"
    description: str = "Useful for performing AI-powered document search queries."
    args_schema: Type[BaseModel] = SearchInput

    indexes: List[str] = []
    k: int = 10
    reranker_th: float = 1
    sas_token: str = ""
    user_language: str = "en"
    telemetry_client: TelemetryClient

    def _run(
        self, query: str, tenant_id: str, return_direct=False, run_manager: Optional[CallbackManagerForToolRun] = None
    ) -> str:
        pass

    async def _arun(
        self, query: str, tenant_id: str, tool_call_id, state, return_direct=False, run_manager: Optional[AsyncCallbackManagerForToolRun] = None
    ) -> str:
        try:
            retriever = CustomAzureSearchRetriever(
                indexes=self.indexes,
                topK=self.k,
                reranker_threshold=self.reranker_th,
                sas_token=self.sas_token,
                callback_manager=self.callbacks,
                user_language=self.user_language,
                telemetry_client=self.telemetry_client,
                tenant_id=tenant_id
            )

            print("Knowledge Base Tool Invoked")

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
            self.telemetry_client.log_exception(e)
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            content="",
                            tool_call_id=tool_call_id,
                            name=self.name,
                        )
                    ]
                }
            )

class CustomAzureSearchRetriever(BaseRetriever):
    indexes: List
    topK: int
    reranker_threshold: float
    sas_token: str = ""
    user_language: str = "en"
    telemetry_client: TelemetryClient
    tenant_id: str 

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun
    ) -> List[Document]:
        ordered_results = get_search_results(query, self.indexes, self.telemetry_client, k=self.topK, reranker_threshold=self.reranker_threshold, sas_token=self.sas_token, tenant_id=self.tenant_id)
        top_docs = []
        for key, value in ordered_results.items():
            top_docs.append(Document(page_content=value["chunk"], metadata={"score": value["score"]}))
        return top_docs

def get_search_results(query: str, indexes: list, telemetry_client: TelemetryClient,
                       k: int = 5,
                       reranker_threshold: float = 1,
                       sas_token: str = "", tenant_id: str = "") -> dict:
    headers = {'Content-Type': 'application/json', 'api-key': os.environ.get("AZURE_SEARCH_KEY", "")}
    params = {'api-version': "2024-07-01"}
    start_time = time.time()
    agg_search_results = dict()
    azure_endpoint = os.environ.get("AZURE_SEARCH_ENDPOINT", "")
    for index in indexes:
        print(f"AI Search Query: {query} on index: {index}")

        telemetry_client.track_trace(f"Azure Search query:{query}", severity=1)
        search_payload = {
            "search": query,
            "select": "id, title, chunk, name",
            "queryType": "semantic",
            "vectorQueries": [{"text": query, "fields": "chunkVector", "kind": "text", "k": k}],
            "semanticConfiguration": "my-semantic-config",
            "captions": "extractive",
            "answers": "extractive",
            "count": "true",
            "top": k,
            "filter": f"tenant eq '{tenant_id}'"
        }
        try:
            response = requests.post(
                azure_endpoint + "/indexes/" + index + "/docs/search",
                data=json.dumps(search_payload), headers=headers, params=params)
            response.raise_for_status()
            search_results = response.json()
            agg_search_results[index] = search_results
        except Exception as e:
            print(f"Error querying Azure Search index {index}: {e}")
            telemetry_client.log_exception(e)
            continue
    content = dict()
    ordered_content = consume_azure_search_data(telemetry_client, k, reranker_threshold, agg_search_results, content)
    end_time = time.time()
    time_taken = end_time - start_time
    telemetry_client.track_trace(f"Time taken for Azure Search: {time_taken}", severity=1)
    return ordered_content

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(KeyError)
)
def consume_azure_search_data(telemetry_client, k, reranker_threshold, agg_search_results, content):
    try:
        for index, search_results in agg_search_results.items():
            for result in search_results.get('value', []):
                if result.get('@search.rerankerScore', 0) > reranker_threshold:
                    content[result['id']] = {
                        "id": result['id'],
                        "chunk": result['chunk'],
                        "score": result['@search.rerankerScore'],
                        "index": index
                    }
        top_k_results = heapq.nlargest(k, content.values(), key=lambda x: x["score"])
        ordered_content = OrderedDict((item["id"], item) for item in top_k_results)
        for result in top_k_results:
            telemetry_client.track_trace(f"Document_id: {result['id']}, reranker: {result['score']}", severity=1)
    except KeyError as e:
        telemetry_client.log_exception(e)
        raise
    except Exception as e:
        telemetry_client.log_exception(e)
    return ordered_content
