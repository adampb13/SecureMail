import time
import uuid

import pyotp
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas, session_store
from ..config import get_settings
from ..crypto_utils import decrypt_private_key, encrypt_private_key, generate_rsa_keypair
from ..database import get_db
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/register", response_model=schemas.RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)) -> schemas.RegisterResponse:
    existing = db.query(models.User).filter(models.User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already exists")

    private_pem, public_pem = generate_rsa_keypair()
    private_enc, salt, nonce = encrypt_private_key(private_pem, payload.password)
    totp_secret = pyotp.random_base32()

    user = models.User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        totp_secret=totp_secret,
        public_key_pem=public_pem,
        private_key_enc=private_enc,
        private_key_salt=salt,
        private_key_nonce=nonce,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    totp_uri = pyotp.TOTP(totp_secret).provisioning_uri(name=user.email, issuer_name=settings.totp_issuer)
    return schemas.RegisterResponse(user=user, totp_uri=totp_uri)


@router.post("/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)) -> schemas.TokenResponse:
    user = db.query(models.User).filter(models.User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(payload.totp_code, valid_window=1):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    private_key = decrypt_private_key(
        ciphertext=user.private_key_enc,
        salt=user.private_key_salt,
        nonce=user.private_key_nonce,
        password=payload.password,
    )

    jti = uuid.uuid4().hex
    expires_at = time.time() + settings.access_token_expire_minutes * 60
    session_store.store_private_key(jti, private_key, expires_at)

    token = create_access_token(subject=str(user.id), jti=jti)
    return schemas.TokenResponse(access_token=token)
