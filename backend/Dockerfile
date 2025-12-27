FROM python:3.12.4
EXPOSE 8000

# Keeps Python from generating .pyc files in container
ENV PYTHONDONTWRITEBYTECODE=1

#Turns off buffering for easier container logging
ENV PYTHONBUFFERED=1

#Install pip requirements
COPY requirements.txt .
RUN python -m pip install -r requirements.txt

WORKDIR /app
COPY . /app

# During debugging, this entry point will be overridden. For production
CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "server:app", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "600"]