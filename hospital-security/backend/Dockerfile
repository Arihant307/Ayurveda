# syntax=docker/dockerfile:1
# Build from the hospital-security directory: docker build -f backend/Dockerfile .
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv
COPY backend/requirements.txt backend/requirements.txt
# Behind a TLS-inspecting proxy, pass its CA as a build secret (EXTRA_CA_CERT in .env for compose).
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export PIP_CERT=/run/secrets/extra_ca; fi; \
    pip install -r backend/requirements.txt && useradd --system --uid 10001 --create-home app
COPY ml/__init__.py ml/__init__.py
COPY ml/preprocessing ml/preprocessing
COPY ml/training ml/training
COPY ml/evaluation ml/evaluation
COPY ml/artifacts ml/artifacts
COPY ml/reports ml/reports
COPY backend backend
WORKDIR /srv/backend
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health').status==200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
