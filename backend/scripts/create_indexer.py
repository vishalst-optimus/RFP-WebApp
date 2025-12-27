
import os
import json
import requests


# Azure Search Constants - Use environment variables or Azure Key Vault
AZURE_SEARCH_ENDPOINT = os.getenv("AZURE_SEARCH_ENDPOINT")
AZURE_SEARCH_API_KEY = os.getenv("AZURE_SEARCH_KEY")
AZURE_SEARCH_API_VERSION = os.getenv("AZURE_SEARCH_API_VERSION")

# Azure OpenAI Constants - Use environment variables or Azure Key Vault
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_INDEXER_OPENAI_ENDPOINT")
AZURE_OPENAI_API_KEY = os.getenv("AZURE_INDEXER_OPENAI_API_KEY")
EMBEDDING_DEPLOYMENT_NAME = os.getenv("EMBEDDING_DEPLOYMENT_NAME")
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME")

# Azure Cognitive Services Constants - Use environment variables or Azure Key Vault
AZURE_COGNITIVE_SERVICE_KEY = os.getenv("AZURE_COGNITIVE_SERVICE_KEY")

# Azure Storage Constants - Use environment variables or Azure Key Vault
STORAGE_CONNECTION_STRING = os.getenv("STORAGE_CONNECTION_STRING")
BLOB_CONTAINER_NAME = os.getenv("BLOB_CONTAINER_NAME")

# Resource Names
INDEX_NAME = os.getenv("INDEX_NAME")
SKILLSET_NAME = os.getenv("SKILLSET_NAME")
INDEXER_NAME = os.getenv("INDEXER_NAME")
DATASOURCE_NAME = os.getenv("DATASOURCE_NAME")

# Derived Constants
BLOB_CONNECTION_STRING = STORAGE_CONNECTION_STRING
COG_SERVICE_NAME = os.getenv("COG_SERVICE_NAME")
COG_SERVICES_KEY = AZURE_COGNITIVE_SERVICE_KEY

AZURE_FUNCTION_URL = os.getenv("AZURE_FUNCTION_URL")



# Setup the Payloads header
headers = {'Content-Type': 'application/json', 'api-key':AZURE_SEARCH_API_KEY}
params = {'api-version': AZURE_SEARCH_API_VERSION}



datasource_payload = {
    "name":DATASOURCE_NAME,
    "description": "Demo files to demonstrate ai search capabilities.",
    "type": "azureblob",
    "credentials": {
        "connectionString":BLOB_CONNECTION_STRING
    },
    "dataDeletionDetectionPolicy" : {
        "@odata.type" :"#Microsoft.Azure.Search.NativeBlobSoftDeleteDeletionDetectionPolicy"
    },
    "container": {
        "name": BLOB_CONTAINER_NAME
    }
}
r = requests.put(AZURE_SEARCH_ENDPOINT+ "/datasources/" +DATASOURCE_NAME,
                 data=json.dumps(datasource_payload), headers=headers, params=params)

 
 

print(r.text )
print(r.status_code)
 
index_payload = {
   
    "name": INDEX_NAME,
    "vectorSearch": {
        "algorithms": [
            {
                "name": "use-hnsw",
                "kind": "hnsw",
            }
        ],
        "compressions": [ 
            {
                "name": "use-scalar",
                "kind": "scalarQuantization",
                "rescoringOptions": {
                    "enableRescoring": "true",
                    "defaultOversampling": 10,
                    "rescoreStorageMethod": "preserveOriginals"
                },
                "scalarQuantizationParameters": {
                    "quantizedDataType": "int8"
                },
                "truncationDimension": 1024
            },
            {
                "name": "use-binary",
                "kind": "binaryQuantization",
                "rescoringOptions": {
                    "enableRescoring": "true",
                    "defaultOversampling": 10,
                    "rescoreStorageMethod": "preserveOriginals"
                },
                "truncationDimension": 1024
            }
        ],
       
        "vectorizers": [
            {
                "name": "use-openai",
                "kind": "azureOpenAI",
                "azureOpenAIParameters": {
                    "resourceUri": AZURE_OPENAI_ENDPOINT,
                    "apiKey": AZURE_OPENAI_API_KEY,
                    "deploymentId": EMBEDDING_DEPLOYMENT_NAME,
                    "modelName": EMBEDDING_DEPLOYMENT_NAME
                }
            }
        ],
        "profiles": [
           {
                "name": "vector-profile-hnsw-scalar",
                "compression": "use-scalar",
                "algorithm": "use-hnsw",
                "vectorizer": "use-openai"
           },
           {
                "name": "vector-profile-hnsw-binary",
                "compression": "use-binary",
                "algorithm": "use-hnsw",
                "vectorizer": "use-openai"
           }
         ]
    },
    "semantic": {
        "configurations": [
            {
                "name": "my-semantic-config",
                "prioritizedFields": {
                    "titleField": {
                        "fieldName": "title"
                    },
                    "prioritizedContentFields": [
                        {
                            "fieldName": "chunk"
                        }
                    ],
                    "prioritizedKeywordsFields": []
                }
            }
        ]
    },
    "fields": [
        {"name": "id", "type": "Edm.String", "key": "true", "analyzer": "keyword", "searchable": "true", "retrievable": "true", "sortable": "false", "filterable": "false","facetable": "false"},
        {"name": "ParentKey", "type": "Edm.String", "searchable": "true", "retrievable": "true", "facetable": "false", "filterable": "true", "sortable": "false"},
        {"name": "title", "type": "Edm.String", "searchable": "true", "retrievable": "true", "facetable": "false", "filterable": "true", "sortable": "false"},
        {"name": "name", "type": "Edm.String", "searchable": "true", "retrievable": "true", "sortable": "false", "filterable": "false", "facetable": "false"},
        {"name": "location", "type": "Edm.String", "searchable": "true", "retrievable": "true", "sortable": "false", "filterable": "false", "facetable": "false"},  
        {"name": "chunk","type": "Edm.String", "searchable": "true", "retrievable": "true", "sortable": "false", "filterable": "false", "facetable": "false"},
        {
            "name": "chunkVector",
            "type": "Collection(Edm.Half)",
            "dimensions": 1536, 
            "vectorSearchProfile": "vector-profile-hnsw-scalar",
            "searchable": "true",
            "retrievable": "false",
            "filterable": "false",
            "sortable": "false",
            "facetable": "false",
            "stored": "false" 
        }
         ,
       {
                    "name": "tenant",
                    "type": "Edm.String",
                    "searchable": "true",
                    "retrievable": "true",  # Changed to true
                    "filterable": "true",
                    "facetable": "true"  # Added facetable property
                }
    ]
}
 
r = requests.put(AZURE_SEARCH_ENDPOINT + "/indexes/" + INDEX_NAME,
                 data=json.dumps(index_payload), headers=headers, params=params)

print(r.text )
print(r.status_code)
 
# Create a skillset
skillset_payload = {
    "name": SKILLSET_NAME,
    "description": "e2e Skillset for RAG - Files",
    "skills":
    [
        {
            "@odata.type": "#Microsoft.Skills.Vision.OcrSkill",
            "description": "Extract text (plain and structured) from image.",
            "context": "/document/normalized_images/*",
            "defaultLanguageCode": "en",
            "detectOrientation": True,
            "inputs": [
                {
                  "name": "image",
                  "source": "/document/normalized_images/*"
                }
            ],
                "outputs": [
                {
                  "name": "text",
                  "targetName" : "images_text"
                }
            ]
        },
        {
            "@odata.type": "#Microsoft.Skills.Text.MergeSkill",
            "description": "Create merged_text, which includes all the textual representation of each image inserted at the right location in the content field. This is useful for PDF and other file formats that supported embedded images.",
            "context": "/document",
            "insertPreTag": " ",
            "insertPostTag": " ",
            "inputs": [
                {
                  "name":"text", "source": "/document/content"
                },
                {
                  "name": "itemsToInsert", "source": "/document/normalized_images/*/images_text"
                },
                {
                  "name":"offsets", "source": "/document/normalized_images/*/contentOffset"
                }
            ],
            "outputs": [
                {
                  "name": "mergedText",
                  "targetName" : "merged_text"
                }
            ]
        },
        {
            "@odata.type": "#Microsoft.Skills.Text.SplitSkill",
            "context": "/document",
            "textSplitMode": "pages",  # although it says "pages" it actally means chunks, not actual pages
            "maximumPageLength": 5000, # 5000 characters is default and a good choice
            "pageOverlapLength": 750,  # 15% overlap among chunks
            "defaultLanguageCode": "en",
            "inputs": [
                {
                    "name": "text",
                    "source": "/document/merged_text"
                }
            ],
            "outputs": [
                {
                    "name": "textItems",
                    "targetName": "chunks"
                }
            ]
        },
        {
            "@odata.type": "#Microsoft.Skills.Text.AzureOpenAIEmbeddingSkill",
            "description": "Azure OpenAI Embedding Skill",
            "context": "/document/chunks/*",
            "resourceUri": AZURE_OPENAI_ENDPOINT,
            "apiKey": AZURE_OPENAI_API_KEY,
            "deploymentId": EMBEDDING_DEPLOYMENT_NAME,
            "modelName": EMBEDDING_DEPLOYMENT_NAME,
            "inputs": [
                {
                    "name": "text",
                    "source": "/document/chunks/*"
                }
            ],
            "outputs": [
                {
                    "name": "embedding",
                    "targetName": "vector"
                }
            ]
        }
        ,{
            "@odata.type": "#Microsoft.Skills.Custom.WebApiSkill",
            "name": "get-original-url-skill",
            "description": "Fetch tenant id from the document URL",
            "uri": AZURE_FUNCTION_URL,
            "batchSize": 10,
            "context": "/document/chunks/*",
            "httpMethod": "POST",
            "inputs": [
                        {
                            "name": "url",
                            "source": "/document/location"
                        }
                    ],
            "outputs": [
                        {
                            "name": "tenant_id"
                        }
                    ]
        }
    ],
    "indexProjections": {
        "selectors": [
            {
                "targetIndexName": INDEX_NAME,
                "parentKeyFieldName": "ParentKey",
                "sourceContext": "/document/chunks/*",
                "mappings": [
                    
                    {
                        "name": "name",
                        "source": "/document/name"
                    },
                    {
                        "name": "location",
                        "source": "/document/location"
                    },
                    {
                          "name": "chunk",
                          "source": "/document/chunks/*"
                    },
                    {
                          "name": "chunkVector",
                          "source": "/document/chunks/*/vector"
                    }
                    ,
                    {
                        "name": "tenant",
                        "source": "/document/chunks/*/tenant_id"
                    }

                ]
            }
        ],
        "parameters": {
            "projectionMode": "skipIndexingParentDocuments"
        }
    },
        "cognitiveServices": {
        "@odata.type": "#Microsoft.Azure.Search.CognitiveServicesByKey",
        "description": COG_SERVICE_NAME,
        "key": COG_SERVICES_KEY
    }
    
}
 
r = requests.put(AZURE_SEARCH_ENDPOINT + "/skillsets/" + SKILLSET_NAME,
                 data=json.dumps(skillset_payload), headers=headers, params=params)


print(r.text )
print(r.status_code)
# Create an indexer
indexer_payload = {
    "name": INDEXER_NAME,
    "dataSourceName": DATASOURCE_NAME,
    "targetIndexName": INDEX_NAME,
    "skillsetName": SKILLSET_NAME,
    "schedule" : { "interval" : "PT5M"},
    "cache" : {
            "storageConnectionString" :BLOB_CONNECTION_STRING,
            "enableReprocessing": True
        },
    "fieldMappings": [
        {
          "sourceFieldName" : "metadata_title",
          "targetFieldName" : "title"
        },
        {
          "sourceFieldName" : "metadata_storage_name",
          "targetFieldName" : "name"
        },
        {
          "sourceFieldName" : "metadata_storage_path",
          "targetFieldName" : "location"
        }
    ],
    "outputFieldMappings":[],
    "parameters":
    {
        "maxFailedItems": -1,
        "maxFailedItemsPerBatch": -1,
        "configuration":
        {
            "dataToExtract": "contentAndMetadata",
            "imageAction": "generateNormalizedImages"
        }
    }
}
 
r = requests.put(AZURE_SEARCH_ENDPOINT + "/indexers/" + INDEXER_NAME,
                 data=json.dumps(indexer_payload), headers=headers, params=params)
print(r.text )
print(r.status_code)