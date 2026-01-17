from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import models, session_store
from .database import get_db
from .security import JWTError, decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class TokenData:
    user_id: int
    jti: str


def get_token_data(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> TokenData:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub"))
        jti = payload.get("jti")
        if not jti:
            raise ValueError("missing jti")
    except (JWTError, ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return TokenData(user_id=user_id, jti=jti)


def get_current_user(token_data: TokenData = Depends(get_token_data), db: Session = Depends(get_db)) -> models.User:
    user = db.get(models.User, token_data.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user


def get_current_private_key(token_data: TokenData = Depends(get_token_data)) -> bytes:
    private_key = session_store.get_private_key(token_data.jti)
    if private_key is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    return private_key
