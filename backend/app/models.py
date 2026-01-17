from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    totp_secret = Column(String, nullable=False)
    public_key_pem = Column(LargeBinary, nullable=False)
    private_key_enc = Column(LargeBinary, nullable=False)
    private_key_salt = Column(LargeBinary, nullable=False)
    private_key_nonce = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    messages_sent = relationship("Message", back_populates="sender", cascade="all, delete-orphan")
    inbox = relationship("MessageRecipient", back_populates="recipient", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    subject_enc = Column(LargeBinary, nullable=False)
    subject_nonce = Column(LargeBinary, nullable=False)
    body_enc = Column(LargeBinary, nullable=False)
    body_nonce = Column(LargeBinary, nullable=False)
    signature = Column(LargeBinary, nullable=False)
    signature_algo = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    sender = relationship("User", back_populates="messages_sent")
    recipients = relationship("MessageRecipient", back_populates="message", cascade="all, delete-orphan")
    attachments = relationship("Attachment", back_populates="message", cascade="all, delete-orphan")


class MessageRecipient(Base):
    __tablename__ = "message_recipients"
    __table_args__ = (UniqueConstraint("message_id", "recipient_id", name="uix_message_recipient"),)

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id"), nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    aes_key_enc = Column(LargeBinary, nullable=False)
    read_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)

    message = relationship("Message", back_populates="recipients")
    recipient = relationship("User", back_populates="inbox")


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id"), nullable=False)
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    data = Column(LargeBinary, nullable=False)
    nonce = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    message = relationship("Message", back_populates="attachments")
