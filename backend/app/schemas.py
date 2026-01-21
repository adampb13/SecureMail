from datetime import datetime
from typing import List

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RegisterResponse(BaseModel):
    user: UserOut
    totp_uri: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    totp_code: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AttachmentCreate(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=255)
    data_base64: str


class AttachmentMeta(BaseModel):
    id: int
    filename: str
    content_type: str
    size: int

    model_config = ConfigDict(from_attributes=True)


class MessageCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    body: str
    recipients: List[EmailStr] = Field(min_length=1)
    attachments: List[AttachmentCreate] = []


class MessageListItem(BaseModel):
    id: int
    subject: str
    sender_email: EmailStr
    created_at: datetime
    read_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class MessageDetail(BaseModel):
    id: int
    subject: str
    body: str
    sender_email: EmailStr
    created_at: datetime
    recipients: List[EmailStr]
    verified: bool
    read_at: datetime | None = None
    deleted_at: datetime | None = None
    attachments: List[AttachmentMeta] = []

    model_config = ConfigDict(from_attributes=True)


class MarkReadResponse(BaseModel):
    status: str
