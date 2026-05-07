from fastapi import FastAPI
from .config import settings

app = FastAPI()

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/live")
async def liveness():
    return {"status": "alive"}

@app.get("/ready")
async def readiness():
    return {"status": "ready"}
