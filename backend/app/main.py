from fastapi import FastAPI

from .database import Base, engine
from .routers import auth, attachments, messages

Base.metadata.create_all(bind=engine)

app = FastAPI(title="SecureMail API")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(messages.router)
app.include_router(attachments.router)
