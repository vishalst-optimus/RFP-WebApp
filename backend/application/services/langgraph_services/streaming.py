import os
from openai import BadRequestError, AuthenticationError
from application.services.langgraph_services.checkpointers.cosmos_db_saver import JsonPlusSerializerCompat, CosmosDBSaver
from application.services.langgraph_services.checkpointers.cosmos_db_handler import CosmosDBHandler
from common.utilities import Common
import time
from core.models.graph_state import GraphState
from dotenv import load_dotenv

load_dotenv(r"apps\backend\credentials.env")

## Handle workflow streaming ##
class Streaming:
    #### Stream method to stream the response from the workflow ####
    async def langgraph_stream(inputPrompt, workflow, config, telemetry_client, headers, start_time):
        #load environment variables
        is_stream_events = int(os.environ.get("IS_STREAM_EVENTS", 0))
        cosmos_db_name = os.environ["AZURE_COSMOSDB_NAME"]
        cosmos_db_container = os.environ["AZURE_COSMOSDB_CHECKPOINTER_CONTAINER"] 

        #get search_index and word_count
        search_index ="srch-indexes-rfp"
        
        state = GraphState(
            messages=[("human", inputPrompt)],
            traces=[]
        )
        
        #Initialize Checkpointer Memory
        ##Cosmos DB Checkpointer
        async with CosmosDBHandler.from_conn_info(database_name = cosmos_db_name, container_name = cosmos_db_container) as handler:
            
            checkpointer = CosmosDBSaver(
                                    handler,
                                    serde=JsonPlusSerializerCompat()  
                                )
            graph = workflow.compile(checkpointer=checkpointer)
            event_names = {"agent", "LangGraph", "supervisor", "call_supervisor_chain", "should_continue", "tools", "tools_final"}

            streaming_start = 0 
            try:
                ## to handle the case when search_index is not found
                if search_index is None or len(search_index) == 0:
                    telemetry_client.track_trace(f"Search index not found for product: {headers['product_info']}")
                    # raise Exception(f"Search index not found for product  {headers["product_info"]}, user role {token_info.user_role} and user name {token_info.name}")
            
                async for event in graph.astream_events(state, config, version="v2", subgraphs=True, exclude_tags=["decide_view_node"]):
                    kind = event["event"]
                    
                    #logs for streaming start
                    if streaming_start == 1:
                        telemetry_client.track_trace(f"Streaming started for {inputPrompt}, time taken {time.time() - start_time}")

                    isStreamEvents = is_stream_events if is_stream_events else False
                    
                    if isStreamEvents == 1:
                        if kind == "on_chain_start" and event["name"] in event_names:
                                yield f"\nStarting: {event['name']}: \n"
                        elif kind == "on_chain_end" and event["name"] == "LangGraph":
                                yield f"END {event['name']}"

                    if kind == "on_chat_model_stream":
                        data = event["data"]
                        if data["chunk"].content:# return non empty data
                            streaming_start+=1
                            yield f"{data['chunk'].content}"
                    elif kind == "on_tool_start" and isStreamEvents == 1:
                        yield f"\nStarting tool: {event['name']} \n"
            except ValueError as ex:
                print(f"Value error: {str(ex)}")
                telemetry_client.track_exception(ex)
                yield "Something went wrong, please try again"
            except BadRequestError as ex:
                print(f"BadRequestError: {str(ex)}")
                telemetry_client.track_exception(ex)
                yield f"Content Filtering policy violation, for {inputPrompt}"
            
            except AuthenticationError as ex:
                telemetry_client.track_exception(ex)
                yield f"Something went wrong"

            except Exception as ex:
                print(f"Exception: {str(ex)}")
                telemetry_client.track_exception(ex)
                if search_index is None or len(search_index) == 0:
                    # telemetry_client.track_exception(f"Search index not found for product  {headers["product_info"]}, user role {token_info.user_role} and user name {token_info.name}")
                    yield f"Something went wrong"
                else:
                    telemetry_client.track_exception(ex)
                    yield f"Something went wrong, for {inputPrompt}"
            finally:
                telemetry_client.track_trace(f"Streaming completed for {inputPrompt}, time taken {time.time() - start_time}")
                telemetry_client.flush()
                