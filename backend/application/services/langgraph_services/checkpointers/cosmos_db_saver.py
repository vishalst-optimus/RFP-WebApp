import base64
import pickle
from contextlib import AbstractContextManager
from types import TracebackType
from typing import Any, Dict, AsyncIterator, Optional, Sequence, Tuple
from langchain_core.runnables import RunnableConfig
from typing_extensions import Self

from langgraph.checkpoint.base import (
    BaseCheckpointSaver,
    ChannelVersions,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
    SerializerProtocol,
)
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from application.services.langgraph_services.checkpointers.cosmos_db_handler import CosmosDBHandler
import logging
from application.services.logging_service.logging import telemetry_client

class JsonPlusSerializerCompat(JsonPlusSerializer):
    """A serializer that can handle both JSON and pickle data."""
    def loads(self, data: bytes) -> Any:
        if data.startswith(b"\x80") and data.endswith(b"."):
            return pickle.loads(data)
        return super().loads(data)

    def dumps(self, obj: Any) -> bytes:
        """Serializes an object to bytes."""
        return super().dumps(obj)

class CosmosDBSaver(AbstractContextManager, BaseCheckpointSaver):
    """A checkpoint saver that stores checkpoints in an Azure Cosmos DB database."""

    serde = JsonPlusSerializerCompat()

    handler: CosmosDBHandler

    def __init__(
        self,
        handler: CosmosDBHandler,
        *,
        serde: Optional[SerializerProtocol] = None,
    ) -> None:
        super().__init__(serde=serde)
        self.handler = handler

    async def __enter__(self) -> Self:
        return self

    async def __exit__(
        self,
        __exc_type: Optional[type[BaseException]],
        __exc_value: Optional[BaseException],
        __traceback: Optional[TracebackType],
    ) -> Optional[bool]:
        return True

    async def aget_tuple(self, config: RunnableConfig) -> Optional[CheckpointTuple]:
        try:
            """Get a checkpoint from the database."""
            query = {
                "thread_id": config["configurable"]["thread_id"],
                "id": f"{config['configurable']['thread_id']}-{config['configurable']['session_id']}",
            }
            
            if config["configurable"].get("thread_ts"):
                query["thread_ts"] = config["configurable"]["thread_ts"]
            
            query_string = ' AND '.join([f"c.{k} = '{v}'" for k, v in query.items()])
            items = [item async for item in self.handler.container.query_items(
                query=f"SELECT TOP 1 * FROM c WHERE {query_string} ORDER BY c._ts DESC",
            )]

            item = items[0] if items else None
            
            if item:
                return CheckpointTuple(
                    config,
                    self.serde.loads(base64.b64decode(item["checkpoint"])),
                    self.serde.loads(base64.b64decode(item["metadata"])),
                    (
                        {
                            "configurable": {
                                "thread_id": item["thread_id"],
                                "thread_ts": item["parent_ts"],
                                "session_id": item["session_id"]
                            }
                        }
                        if item.get("parent_ts")
                        else None
                    ),
                )
        except Exception as e:
            logging.error(f"Error while getting checkpoint, for {e}")
            telemetry_client.track_exception(f"Error while getting checkpoint, for {e}")
            raise e

    async def alist(
        self,
        config: Optional[RunnableConfig],
        *,
        filter: Optional[Dict[str, Any]] = None,
        before: Optional[RunnableConfig] = None,
        limit: Optional[int] = None,
    ) -> AsyncIterator[CheckpointTuple]:
        try:
            """List checkpoints from the database."""
            query = "SELECT * FROM c WHERE "
            conditions = []
            if config is not None:
                conditions.append(f"c.thread_id = '{config['configurable']['thread_id']}' and c.session_id = '{config['configurable']['session_id']}' ")
            if filter:
                for key, value in filter.items():
                    conditions.append(f"c.metadata.{key} = '{value}'")
            if before is not None:
                conditions.append(f"c.thread_ts < '{before['configurable']['thread_ts']}'")
            
            query += " AND ".join(conditions) if conditions else "1=1"
            items = await self.handler.container.query_items(
                query=query,
                enable_cross_partition_query=True
            )
            
            for doc in items:
                yield CheckpointTuple(
                    {
                        "configurable": {
                            "thread_id": doc["thread_id"],
                            "thread_ts": doc["thread_ts"],
                            "session_id": doc["session_id"]
                        }
                    },
                    self.serde.loads(base64.b64decode(doc["checkpoint"])),
                    self.serde.loads(base64.b64decode(doc["metadata"])),
                    (
                        {
                            "configurable": {
                                "thread_id": doc["thread_id"],
                                "thread_ts": doc["parent_ts"],
                                "session_id": doc["session_id"]
                            }
                        }
                        if doc.get("parent_ts")
                        else None
                    ),
                )
        except Exception as e:
            logging.error(f"Error while getting checkpoint list, for {e}")
            telemetry_client.track_exception(f"Error while getting checkpoint list, for {e}")
            raise e
        
    async def aput(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions
    ) -> RunnableConfig:
        try:
            """Save a checkpoint to the database."""
            doc = {
                "id": f"{config['configurable']['thread_id']}-{config['configurable']['session_id']}", #We want to just update the conversation not to store many records for the same conversation
                "thread_id": config["configurable"]["thread_id"],
                "session_id": config["configurable"]["session_id"],
                "thread_ts": checkpoint["id"],
                "checkpoint": base64.b64encode(self.serde.dumps(checkpoint)).decode('utf-8'),
                "metadata": base64.b64encode(self.serde.dumps(metadata)).decode('utf-8'),
            }
            if config["configurable"].get("thread_ts"):
                doc["parent_ts"] = config["configurable"]["thread_ts"]

            await self.handler.update_conversation(doc)  # Update conversations
            return {
                "configurable": {
                    "thread_id": config["configurable"]["thread_id"],
                    "thread_ts": checkpoint["id"],
                    "session_id": config["configurable"]["session_id"]
                }
            }
        except Exception as e:
            logging.error(f"Error while saving checkpoint, for {e}")
            telemetry_client.track_exception(f"Error while saving checkpoint, for {e}")
            raise e

    ## Not required for this implementation
    async def aput_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[Tuple[str, Any]],
        task_id: str,
    ) -> None:
        return