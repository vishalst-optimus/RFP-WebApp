"""
Workflow components.
Contains node functions for the workflow graph.
"""

import time
from datetime import datetime
from typing import Dict, Any, List

from applicationinsights import TelemetryClient
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import AzureChatOpenAI
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type
from langchain_core.exceptions import LangChainException
import httpx

from core.models.graph_state import GraphState
from infrastructure.tools.tool_definations.chat_history_tool import ChatHistoryTool
from common.constants import Constants
from common.utilities import Common
from common.prompts.prompts import (
    CUSTOM_CHATBOT_PREFIX, 
    DOCSEARCH_PROMPT_TEXT
)


class WorkflowComponents:
    """
    Contains node functions for the workflow graph.
    Each method represents a node in the workflow graph that processes messages.
    """
    
    @staticmethod
    def is_retriable_error(exception):
        """
        Check if an exception is retriable (429, 502, 503, 504, timeouts).
        """
        if isinstance(exception, httpx.HTTPStatusError):
            return exception.response.status_code in [429, 502, 503, 504]
        if isinstance(exception, (httpx.TimeoutException, httpx.ConnectError)):
            return True
        if isinstance(exception, LangChainException):
            error_msg = str(exception).lower()
            return any(keyword in error_msg for keyword in ['429', 'rate limit', 'timeout', '502', '503', '504'])
        return False
    
    @staticmethod
    @retry(
        retry=lambda retry_state: WorkflowComponents.is_retriable_error(retry_state.outcome.exception()) if retry_state.outcome.failed else False,
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(3)
    )
    async def execute_llm_chain_with_retry(chain, input_data, telemetry_client, operation_name):
        """
        Execute LLM chain with retry logic for rate limiting and transient errors.
        """
        try:
            return await chain.ainvoke(input_data)
        except Exception as e:
            telemetry_client.track_trace(f"Retry attempt failed for {operation_name}: {str(e)}")
            raise
    
    @staticmethod
    def filter_messages(messages: List[Any], count: int = 0) -> List[Any]:
        """
        Filter conversation history to include only the most recent messages.
        
        Args:
            messages: List of conversation messages
            count: Additional messages to include beyond the default limit
            
        Returns:
            Filtered list of messages
        """
        return messages[-(Constants.CHAT_HISTORY_FILTERING_LIMIT + count):]
    
    @classmethod
    async def call_model(cls, 
                        state: GraphState,
                        headers: Dict[str, Any],
                        llm_with_tools: Any,
                        telemetry_client: TelemetryClient) -> Dict[str, Any]:
        """
        Initial model call to process user input.
        
        Args:
            state: Current graph state
            headers: Request headers
            word_count: Word count for prompt templates
            llm_with_tools: Language model with bound tools
            telemetry_client: Application Insights telemetry client
            
        Returns:
            Updated state
        """
        try:
            messages = state["messages"]
            # Filter the messages
            messages = cls.filter_messages(messages, 0)
                            
            # Add trace
            new_trace = Common.create_trace_entry(
                tool_used="Entry Point",
                reasoning="Entry point for Chatbot",
                input_snapshot=messages[-1].content,
            )
            
            # Create and format prompt
            prompt = ChatPromptTemplate.from_messages([
                ("system", CUSTOM_CHATBOT_PREFIX),
                ("human", "{question}")
            ])
            
            # Create and execute chain
            chain = (
                {"question": lambda x: x["question"]}
                | prompt
                | llm_with_tools
            )
            
            # Track execution time and execute with retry
            start_time_model = time.time()
            response = await cls.execute_llm_chain_with_retry(
                chain, 
                {"question": messages}, 
                telemetry_client, 
                "initial_model_call"
            )
            execution_time = time.time() - start_time_model
            
            telemetry_client.track_trace(f"Time taken for the model call: {execution_time}")
            
            # Return updated state
            return {"messages": [response], "traces": state["traces"] + [new_trace]}
        except Exception as ex:
            telemetry_client.track_exception(ex)
            telemetry_client.track_trace(f"Error in call_model: {str(ex)}")
            raise
    
    @classmethod
    async def call_final_model(cls,
                             state: GraphState,
                             headers: Dict[str, Any],
                             llm_with_tools: Any,
                             telemetry_client: TelemetryClient) -> Dict[str, Any]:
        """
        Generate final response after tool execution.
        
        Args:
            state: Current graph state
            headers: Request headers
            word_count: Word count for prompt templates
            llm_with_tools: Language model with bound tools
            llmsummarization_with_tools: Summarization model with bound tools
            telemetry_client: Application Insights telemetry client
            
        Returns:
            Updated state
        """
        try:
            messages = state["messages"]
            messages = cls.filter_messages(messages, 5)
            last_message = messages[-1]
            new_trace = None
            
            # Determine which prompt and model to use based on the last tool used
            
            prompt = DOCSEARCH_PROMPT_TEXT
            llm_to_use = llm_with_tools
                
            # Create and execute the prompt chain
            PROMPT = ChatPromptTemplate.from_messages([
                ("system", prompt),
                ("human", "{question}")
            ])
            
            chain = (
                {"question": lambda x: x["question"]}
                | PROMPT
                | llm_to_use
            )
            
            # Measure and track execution time with retry
            start_time_final_model = time.time()
            response = await cls.execute_llm_chain_with_retry(
                chain, 
                {"question": messages}, 
                telemetry_client, 
                "final_model_call"
            )
            execution_time = time.time() - start_time_final_model
            telemetry_client.track_trace(f"Time taken for the final model call: {execution_time}")
            
            # Update traces if needed
            if new_trace is not None:
                state["traces"].append(new_trace)
            
            return {"messages": [response], "traces": state["traces"]}
        except Exception as ex:
            telemetry_client.track_exception(ex)
            telemetry_client.track_trace(f"Error in call_final_model: {str(ex)}")
            raise
    

    @staticmethod
    async def store_chat_history(state: Dict[str, Any],
                               request: Dict[str, Any],
                               headers: Dict[str, Any],
                               telemetry_client: TelemetryClient) -> Dict[str, Any]:
        """
        Store conversation history in the database.
        
        Args:
            state: Current graph state
            request: The incoming request
            token_info: User token information
            headers: Request headers
            telemetry_client: Application Insights telemetry client
            
        Returns:
            Updated state
        """
        try:
            messages = state["messages"]
            
            chat_history_tool = ChatHistoryTool()
            tool_invocation = await chat_history_tool.ainvoke(
                input={
                    "messages": messages, 
                    "state": state, 
                    "tool_call_id": "history_12345", 
                    "request": request, 
                    "telemetry_client": telemetry_client
                }
            )
            
            return {"messages": tool_invocation.update["messages"]}
        except Exception as ex:
            telemetry_client.track_exception(ex)
            telemetry_client.track_trace(f"Error in store_chat_history: {str(ex)}")
            raise
