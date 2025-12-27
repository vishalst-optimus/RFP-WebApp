import os
from typing import Optional,Type
from langchain.callbacks.manager import CallbackManagerForToolRun
from langchain.pydantic_v1 import BaseModel
from langchain.tools import BaseTool
from langchain_core.messages import AIMessage
from common.utilities import Common
from application.services.langgraph_services.checkpointers.cosmos_db_handler import CosmosClientSingleton
from applicationinsights import TelemetryClient
from langgraph.types import Command
from langchain_core.messages import ToolMessage
from core.models.tool_base_models.chat_history import ChatHistoryInput

## Chat history and Graph history tall can be called parallely ##

## This tool is intended to store chat history in Azure Cosmos DB ##

class ChatHistoryTool(BaseTool):
    name:str = "chat_history_tool"
    description:str = "Tool to store chat history using Azure Cosmos DB"
    args_schema: Type[BaseModel] = ChatHistoryInput
    
    database_name:str = os.environ["AZURE_COSMOSDB_NAME"]
    container_name:str = os.environ["AZURE_COSMOSDB_CHAT_HISTORY_CONTAINER"]
    
    async def store_chat_history(self, messages, request, telemetry_client: TelemetryClient) -> str:
        try:
            async_client = CosmosClientSingleton.get_instance()
            database = async_client.get_database_client(self.database_name)
            container = database.get_container_client(self.container_name)
            user_id= request.user_id

            query = "SELECT * FROM c WHERE c.id = @id AND c.user_id = @user_id"
            query_params = [
                {"name": "@user_id", "value": user_id},
                {"name": "@id", "value": f"{user_id}-{request.session_id}"}
            ]
            
            result = [item async for item in container.query_items(query=query, parameters=query_params)]
            documentFetched = result[0] if result else None
            data = list(documentFetched.get("data")) if documentFetched  else []
            
            messageList = []

            ##Human Message
            messageList.append({
                "message": request.prompt,
                "type": "Human"
            })

            ##AI Message - Get last message appended to the message list
            if isinstance(messages[-1], AIMessage) and messages[-1].content != '':
                messageList.append({
                    "message": messages[-1].content,
                    "type": "AI"
                })

            ## Form single object for update
            messageList = {
                "messages": messageList,
                "feedback": -1, # TODO - Check it should not overrwrite from feedback API
                "promptId": request.prompt_id
            }
            
            data.append(messageList)
            
            # TODO - Add logic to update the chat history in Cosmos DB
            await container.upsert_item({
                "id": f"{user_id}-{request.session_id}",
                "user_id": user_id,
                "session_id": request.session_id,
                "user_language": "en",
                "data": data
            })
            
            return "Chat history stored successfully"
            
        except Exception as ex:
            telemetry_client.track_exception(ex)
    
    def _run(self, question: str, response: str, recipient_email: str, run_manager: Optional[CallbackManagerForToolRun] = None) -> str:
        pass

    async def _arun(self,messages, request,state, tool_call_id, telemetry_client: TelemetryClient) -> str:
        try:
            chat_history = await self.store_chat_history(messages, request, telemetry_client)
            
            return Command(
                    update={
                                "traces": [Common.create_trace_entry(
                                    tool_used=self.name,
                                    reasoning="Successfully stored chat history traces",
                                    input_snapshot=chat_history
                                )], # N - Also see if we can create method like add_messages
                                "messages": [
                                    ToolMessage(
                                        content = chat_history,  # explicit field names are better
                                        tool_call_id=tool_call_id,
                                        name = self.name,
                                    )
                                ]
                            }
                    )
        except Exception as ex:
            telemetry_client.track_exception(ex)
            
            return Command(
                    update={
                                "traces": state["traces"] + [Common.create_trace_entry(
                                    tool_used=self.name,
                                    reasoning="Failed to store chat history traces",
                                    input_snapshot=str(ex)
                                )], # N - Also see if we can create method like add_messages
                                "messages": [
                                    ToolMessage(
                                        content = str(ex),  # explicit field names are better
                                        tool_call_id=tool_call_id,
                                        name = self.name,
                                    )
                                ]
                            }
                    )
            