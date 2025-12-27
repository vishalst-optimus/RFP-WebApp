import os
from fastapi import HTTPException
from azure.cosmos.aio import CosmosClient
from contextlib import asynccontextmanager
from typing import AsyncIterator
from dotenv import load_dotenv

load_dotenv(r"apps\backend\credentials.env")

class CosmosClientSingleton:
    _instance = None

    @staticmethod
    def get_instance():
        if not CosmosClientSingleton._instance:
            CosmosClientSingleton._instance = CosmosClient(os.environ["AZURE_COSMOSDB_ENDPOINT"], os.environ["AZURE_COSMOSDB_KEY"])
        return CosmosClientSingleton._instance

class CosmosDBHandler:
    
    def __init__(
        self,
        client: CosmosClient,
        database_name: str,
        container_name: str,
    ) -> None:
        super().__init__()
        self.client = client
        self.database = self.client.get_database_client(database_name)
        self.container = self.database.get_container_client(container_name)

    def __enter__(self):
        return self

    def __exit__(self, endpoint, collection, traceback):
        self.client = None

    @classmethod
    @asynccontextmanager
    async def from_conn_info(
        cls, *, database_name: str, container_name: str
    ) -> AsyncIterator["CosmosDBHandler"]:
        client = None
        try:
            client = CosmosClientSingleton.get_instance()
            yield CosmosDBHandler(client, database_name, container_name)
        #TODO - need to handle properly
        except HTTPException as ex:
            raise ex
        except Exception as ex:
            yield "Something went wrong while connecting to Cosmos DB"

    # Method to update conversation
    async def update_conversation(self, item):
        await self.container.upsert_item(body=item)