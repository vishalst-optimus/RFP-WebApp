"""
Cosmos DB Container Setup Script
Creates the RFPData container with proper partition key and settings
"""
import os
import asyncio
from azure.cosmos.aio import CosmosClient
from azure.cosmos import PartitionKey, exceptions
from dotenv import load_dotenv

# Load environment variables
load_dotenv("credentials.env")


async def setup_rfp_data_container():
    """
    Sets up the RFPData container in Cosmos DB with proper configuration
    """
    try:
        # Initialize Cosmos client
        endpoint = os.environ["AZURE_COSMOSDB_ENDPOINT"]
        key = os.environ["AZURE_COSMOSDB_KEY"]
        database_name = os.environ["AZURE_COSMOSDB_NAME"]
        container_name = os.environ["AZURE_COSMOSDB_RFP_DATA_CONTAINER"]
        
        print(f"Setting up Cosmos DB container: {container_name}")
        print(f"Database: {database_name}")
        print(f"Endpoint: {endpoint}")
        
        async with CosmosClient(endpoint, key) as client:
            # Get or create database
            try:
                database = await client.create_database_if_not_exists(
                    id=database_name,
                    offer_throughput=400  # Minimum throughput
                )
                print(f"✅ Database '{database_name}' ready")
            except Exception as db_ex:
                print(f"❌ Failed to create database: {str(db_ex)}")
                return False
            
            # Create container with partition key
            try:
                container = await database.create_container_if_not_exists(
                    id=container_name,
                    partition_key=PartitionKey(path="/User_id"),
                    offer_throughput=400
                )
                print(f"✅ Container '{container_name}' ready with partition key '/User_id'")
                
                # Verify container settings
                container_properties = await container.read()
                print(f"📋 Container properties:")
                print(f"   - ID: {container_properties['id']}")
                print(f"   - Partition Key: {container_properties['partitionKey']['paths'][0]}")
                
                return True
                
            except Exception as container_ex:
                print(f"❌ Failed to create container: {str(container_ex)}")
                return False
                
    except Exception as ex:
        print(f"❌ Setup failed: {str(ex)}")
        return False


async def test_container_operations():
    """
    Test basic operations on the RFPData container
    """
    try:
        endpoint = os.environ["AZURE_COSMOSDB_ENDPOINT"]
        key = os.environ["AZURE_COSMOSDB_KEY"]
        database_name = os.environ["AZURE_COSMOSDB_NAME"]
        container_name = os.environ["AZURE_COSMOSDB_RFP_DATA_CONTAINER"]
        
        async with CosmosClient(endpoint, key) as client:
            database = client.get_database_client(database_name)
            container = database.get_container_client(container_name)
            
            # Test document
            test_doc = {
                "id": "test_user_123",  # Use user_id as document id
                "Tenant_id": "test_tenant",
                "User_id": "test_user_123",
                "Total_RFPs": 1,
                "RFP_Data": [
                    {
                        "RFP_Name": "Test_RFP",
                        "isExported": False,
                        "confidenceScore": 85.0,
                        "sections": [
                            {
                                "SectionName": "Test Section",
                                "Content": "This is a test section",
                                "Image": "",
                                "Confidence": 0.9
                            }
                        ]
                    }
                ]
            }
            
            # Insert test document
            print("🧪 Testing insert operation...")
            await container.upsert_item(body=test_doc)
            print("✅ Insert test passed")
            
            # Read test document
            print("🧪 Testing read operation...")
            response = await container.read_item(
                item="test_user_123",  # Use user_id as document id
                partition_key="test_tenant"
            )
            print("✅ Read test passed")
            
            # Delete test document
            print("🧪 Cleaning up test document...")
            await container.delete_item(
                item="test_user_123",  # Use user_id as document id
                partition_key="test_tenant"
            )
            print("✅ Cleanup completed")
            
            print("🎉 All container tests passed successfully!")
            return True
            
    except Exception as ex:
        print(f"❌ Test failed: {str(ex)}")
        return False


async def main():
    """Main setup function"""
    print("🚀 Starting Cosmos DB RFP Data Container Setup")
    print("=" * 50)
    
    # Setup container
    setup_success = await setup_rfp_data_container()
    
    if setup_success:
        print("\n🧪 Running container tests...")
        test_success = await test_container_operations()
        
        if test_success:
            print("\n🎉 Setup completed successfully!")
            print("The RFP Data container is ready for use.")
        else:
            print("\n⚠️ Setup completed but tests failed.")
            print("Please check the container configuration manually.")
    else:
        print("\n❌ Setup failed.")
        print("Please check your Cosmos DB credentials and try again.")


if __name__ == "__main__":
    asyncio.run(main())