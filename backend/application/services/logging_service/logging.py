import os
import uuid
import time
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request
from fastapi.responses import JSONResponse
from applicationinsights import TelemetryClient

from dotenv import load_dotenv
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
print("Root Directory: ", root_dir)
env_path = os.path.join(root_dir, 'credentials.env')
print("Env Path: ", env_path)
load_dotenv(env_path)
load_dotenv(r"apps\backend\credentials.env")


# Initialize the Telemetry Client with the instrumentation key from environment variables
telemetry_client = TelemetryClient(os.environ.get("APPLICATION_INSIGHT_INSTRUMENTATION_KEY"))

class AppInsightsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        operation_id = str(uuid.uuid4())
        
        # Store operation ID in request state for downstream tracing
        request.state.operation_id = operation_id
        
        response = None  # Initialize response

        try:
            # Process the request and obtain the response
            response = await call_next(request)
            success = response.status_code < 400
        except Exception as ex:
            telemetry_client.track_exception(f"Exception during middleware setup for logging {ex}")
            # Optionally, you can still create a response here, e.g.:
            response = JSONResponse(content={"detail": "Internal Server Error"}, status_code=500)
            success = False
        finally:
            duration = time.time() - start_time
            
            # Track response and associate it with the same operation ID
            telemetry_client.context.operation.id = operation_id
            telemetry_client.track_request(
                name=request.url.path,
                url=str(request.url),
                success=success,
                duration=float(duration),
                response_code=response.status_code if response else 500
            )

            telemetry_client.flush()     
            return response
        