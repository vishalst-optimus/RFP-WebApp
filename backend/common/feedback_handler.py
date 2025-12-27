import os
from application.services.langgraph_services.checkpointers.cosmos_db_handler import CosmosClientSingleton
from applicationinsights import TelemetryClient

class FeedbackHandler:

    # Method to store chat feedback
    async def store_chat_feedback(request, auth_token, telemetry_client: TelemetryClient):
        try:
            message_response = "Chat history not found with specific id"
            # token_info = Auth.decode_token(auth_token.split(" ")[1], telemetry_client)
            # user_id = f"{token_info.name}-{token_info.tenant_id}" 
            # # session_id = request.session_id
            # # promptId = request.prompt_id
            # # id = f"{user_id}-{session_id}"
            # # feedback = int(request.feedback)

            # # async_client = CosmosClientSingleton.get_instance()
            # # database = async_client.get_database_client(os.environ["AZURE_COSMOSDB_NAME"])
            # # container = database.get_container_client(os.environ["AZURE_COSMOSDB_CHAT_HISTORY_CONTAINER"])
                
            # # query = f"SELECT * FROM c WHERE c.id = '{id}' AND c.user_id = '{user_id}'"
            # # result = container.query_items(query=query)
            # # documentFetched = [item async for item in result]
            # # data = list(documentFetched[0].get("data")) if documentFetched else []
            # # counter = -1
            # # isPatch = False

            # if data:
            #     for message in data:
            #         counter += 1
            #         if promptId in message.values():
            #             isPatch = True
            #             break

            # if isPatch:
            #     await container.patch_item(item=id, partition_key=user_id, patch_operations=[{"op": "add", "path": f"/data/{counter}/feedback", "value": feedback}])
            #     message_response = "Chat feedback updated successfully"
            # return message_response
            pass
        except Exception as ex:
            telemetry_client.track_exception(ex)
            raise ex