# Stage 1: Build & Dependencies
FROM python:3.12-slim AS builder

WORKDIR /app

# Some networks inspect TLS traffic: a proxy on the machine or the network
# re-signs every certificate. The container has its own certificate store,
# separate from the host's, so that proxy's root CA must be trusted here too:
# put it in certs/ as a .crt file (empty in the repo; see certs/README.md).
COPY certs/ /usr/local/share/ca-certificates/extra/
RUN update-ca-certificates

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Runtime Minimal Image
FROM python:3.12-slim AS runner

WORKDIR /app

COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1

COPY src/ ./src/

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
