from fastapi import FastAPI

app = FastAPI(title="SecureMail API")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
