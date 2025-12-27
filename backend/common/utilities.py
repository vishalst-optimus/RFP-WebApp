import os
import json
from datetime import datetime
from typing import Any, Dict
from application.services.logging_service.logging import AppInsightsMiddleware, telemetry_client

# #Un-comment below code for local debugging
from dotenv import load_dotenv
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
print("Root Directory: ", root_dir)
env_path = os.path.join(root_dir, 'backend\credentials.env')

# load_dotenv(r"apps\backend\credentials.env")
os.environ["OPENAI_API_VERSION"] = os.environ["AZURE_OPENAI_API_VERSION"]


class Common:

    def index_list():
        return list(json.loads(os.environ.get("SEARCH_INDEX_CONFIG")))

    def get_indexes_word_count(product_info, user_role):
        configIndexes = Common.index_list()
        userRoleIndexes=[]
        word_count = 0

        ## In case if we receive multiple roles
        # Highest priority is for SystemAdmin index
        # If SystemAdmin is not present, take Supervisor index
        # Otherwise normal flow
        
        flag = False
        for index in configIndexes:
            if index["Product"].lower() == product_info.lower() and ("SystemAdmin" in user_role) : #SystemAdmin is a role that can access all indexes
                for nested_index in configIndexes:
                    if nested_index["Product"].lower() == product_info.lower() and ("SystemAdmin".lower() == nested_index["Role"].lower()) :
                        userRoleIndexes.append(nested_index["SearchIndex"])
                        word_count = nested_index["ResponseWordCount"]
                        flag = True
                        break
                    
                if flag == True:
                    break
            
            if index["Product"].lower() == product_info.lower() and ("Supervisor" in user_role) :
                for nested_index in configIndexes:
                    if nested_index["Product"].lower() == product_info.lower() and ("Supervisor".lower() == nested_index["Role"].lower()) :
                        userRoleIndexes.append(nested_index["SearchIndex"])
                        word_count = nested_index["ResponseWordCount"]
                        flag = True
                        break

                if flag == True:
                    break

            if(index["Product"] == product_info and index["Role"] == user_role):
                userRoleIndexes.append(index["SearchIndex"])
                word_count = index["ResponseWordCount"]

        if word_count == 0:
            word_count = 200

        telemetry_client.track_trace(f"User Role Indexes: {userRoleIndexes}", severity=1)

        return [userRoleIndexes, word_count]
    
    def create_trace_entry(
    tool_used: str="",
    reasoning: str = "",
    input_snapshot: str = "",
    output_snapshot: str = "",
    extra_metadata: Dict[str, Any] = None
) -> Dict[str, Any]:
        """
        Creates a standard trace dictionary for logging inside GraphState.

        Args:
            tool_used (str): Name of the tool or node that was used.
            reasoning (str): Why this tool/node was selected.
            input_snapshot (str): The input at the time of decision.
            output_snapshot (str, optional): The output generated (optional).
            extra_metadata (Dict[str, Any], optional): Any extra fields you want to add.

        Returns:
            Dict[str, Any]: A formatted trace dictionary.
        """
        try:
            trace = {
                "timestamp": datetime.utcnow().isoformat() + "Z",  # Always in UTC ISO format
                "tool_used": tool_used,
                "reasoning": reasoning,
                "input_snapshot": input_snapshot,
                "output_snapshot": output_snapshot,
            }
            if extra_metadata:
                trace.update(extra_metadata)
            return trace
        except Exception as e:
            telemetry_client.track_exception(e)
            return {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "tool_used": tool_used,
                "reasoning": "Parsing Error"
            }
