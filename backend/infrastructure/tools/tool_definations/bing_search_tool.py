# import os
# import requests
# from typing import Type, Optional
# from langchain.pydantic_v1 import BaseModel
# from langchain.tools import BaseTool
# from applicationinsights import TelemetryClient
# from langgraph.types import Command
# from langchain_core.messages import ToolMessage
# from domain.models.tool_base_models.bing_search import BingSearchInput

# class BingSearchTool(BaseTool):
#     name: str = "bing_search_tool"
#     description: str = "Useful for performing Bing web search queries."
#     args_schema: Type[BaseModel] = BingSearchInput

#     bing_api_key: str
#     telemetry_client: TelemetryClient

#     def _run(self, query: str, **kwargs) -> str:
#         pass

#     async def _arun(self, query: str, tool_call_id, state, **kwargs) -> str:
#         try:
#             headers = {
#                 "Ocp-Apim-Subscription-Key": self.bing_api_key
#             }
#             params = {
#                 "q": query,
#                 "count": 5,
#                 "mkt": "en-US"
#             }
#             endpoint = os.environ.get("BING_SEARCH_ENDPOINT", "https://api.bing.microsoft.com/v7.0/search")
#             response = requests.get(endpoint, headers=headers, params=params)
#             response.raise_for_status()
#             data = response.json()
#             results = []
#             for item in data.get("webPages", {}).get("value", []):
#                 results.append(f"{item.get('name')}: {item.get('url')}")
#             content = "\n".join(results) if results else "No results found."
#         except Exception as e:
#             self.telemetry_client.track_exception(e)
#             content = f"Error occurred: {e}"

#         tool_message = ToolMessage(
#             content=content,
#             tool_call_id=tool_call_id,
#             name=self.name,
#         )

#         return Command(
#             update={
#                 "messages": state["messages"] + [tool_message],
#             }
#         )
