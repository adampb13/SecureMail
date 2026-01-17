from datetime import datetime
import base64
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..crypto_utils import (
    decrypt_payload,
    encrypt_payload,
    generate_aes_key,
    sign_payload,
    unwrap_aes_key,
    verify_signature,
    wrap_aes_key_for_recipient,
)
from ..database import get_db
from ..dependencies import get_current_private_key, get_current_user

router = APIRouter(prefix="/messages", tags=["messages"])


@router.get("", response_model=List[schemas.MessageListItem])
def list_messages(
    current_user: models.User = Depends(get_current_user),
    private_key=Depends(get_current_private_key),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.MessageRecipient)
        .join(models.Message)
        .join(models.User, models.Message.sender)
        .filter(models.MessageRecipient.recipient_id == current_user.id, models.MessageRecipient.deleted_at.is_(None))
        .order_by(models.Message.created_at.desc())
        .all()
    )

    items: List[schemas.MessageListItem] = []
    for mr in rows:
        aes_key = unwrap_aes_key(mr.aes_key_enc, private_key)
        subject = decrypt_payload(mr.message.subject_enc, mr.message.subject_nonce, aes_key).decode("utf-8")
        items.append(
            schemas.MessageListItem(
                id=mr.message.id,
                subject=subject,
                sender_email=mr.message.sender.email,
                created_at=mr.message.created_at,
                read_at=mr.read_at,
            )
        )
    return items


@router.post("", response_model=schemas.MessageDetail, status_code=status.HTTP_201_CREATED)
def send_message(
    payload: schemas.MessageCreate,
    current_user: models.User = Depends(get_current_user),
    private_key=Depends(get_current_private_key),
    db: Session = Depends(get_db),
) -> schemas.MessageDetail:
    requested_recipients = [email.lower() for email in payload.recipients]
    recipients = db.query(models.User).filter(models.User.email.in_(requested_recipients)).all()

    missing = sorted(set(requested_recipients) - {user.email for user in recipients})
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recipients not found: {', '.join(missing)}",
        )

    aes_key = generate_aes_key()
    subject_enc, subject_nonce = encrypt_payload(payload.subject.encode("utf-8"), aes_key)
    body_enc, body_nonce = encrypt_payload(payload.body.encode("utf-8"), aes_key)

    attachments_models: list[models.Attachment] = []
    attachments_sizes: list[int] = []
    attachment_ciphertexts: list[bytes] = []
    for att in payload.attachments:
        try:
            raw = base64.b64decode(att.data_base64, validate=True)
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid base64 for {att.filename}")
        data_enc, data_nonce = encrypt_payload(raw, aes_key)
        attachment_ciphertexts.append(data_enc)
        attachments_sizes.append(len(raw))
        attachments_models.append(
            models.Attachment(
                filename=att.filename,
                content_type=att.content_type,
                data=data_enc,
                nonce=data_nonce,
            )
        )

    signature_payload = subject_enc + body_enc + b"".join(attachment_ciphertexts)
    signature = sign_payload(signature_payload, private_key)

    message = models.Message(
        sender_id=current_user.id,
        subject_enc=subject_enc,
        subject_nonce=subject_nonce,
        body_enc=body_enc,
        body_nonce=body_nonce,
        signature=signature,
        signature_algo="RSA-PSS-SHA256",
    )
    db.add(message)
    db.flush()  # to get message.id before recipient rows

    for recipient in recipients:
        aes_key_enc = wrap_aes_key_for_recipient(aes_key, recipient.public_key_pem)
        db.add(models.MessageRecipient(message_id=message.id, recipient_id=recipient.id, aes_key_enc=aes_key_enc))

    for att in attachments_models:
        att.message_id = message.id
        db.add(att)

    db.commit()
    db.refresh(message)

    attachments_meta = []
    for att, size in zip(attachments_models, attachments_sizes):
        attachments_meta.append(
            schemas.AttachmentMeta(id=att.id, filename=att.filename, content_type=att.content_type, size=size)
        )

    return schemas.MessageDetail(
        id=message.id,
        subject=payload.subject,
        body=payload.body,
        sender_email=current_user.email,
        created_at=message.created_at,
        recipients=[user.email for user in recipients],
        read_at=None,
        deleted_at=None,
        attachments=attachments_meta,
    )


@router.get("/{message_id}", response_model=schemas.MessageDetail)
def get_message(
    message_id: int,
    current_user: models.User = Depends(get_current_user),
    private_key=Depends(get_current_private_key),
    db: Session = Depends(get_db),
) -> schemas.MessageDetail:
    mr = (
        db.query(models.MessageRecipient)
        .join(models.Message)
        .filter(
            models.MessageRecipient.recipient_id == current_user.id,
            models.MessageRecipient.message_id == message_id,
        )
        .first()
    )

    if mr is None or mr.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    recipients = [link.recipient.email for link in mr.message.recipients]

    aes_key = unwrap_aes_key(mr.aes_key_enc, private_key)
    subject = decrypt_payload(mr.message.subject_enc, mr.message.subject_nonce, aes_key).decode("utf-8")
    body = decrypt_payload(mr.message.body_enc, mr.message.body_nonce, aes_key).decode("utf-8")

    attachment_ciphertexts: list[bytes] = []
    attachments_meta: list[schemas.AttachmentMeta] = []
    for att in sorted(mr.message.attachments, key=lambda a: a.id):
        attachment_ciphertexts.append(att.data)
        plain = decrypt_payload(att.data, att.nonce, aes_key)
        attachments_meta.append(
            schemas.AttachmentMeta(
                id=att.id,
                filename=att.filename,
                content_type=att.content_type,
                size=len(plain),
            )
        )

    verified = verify_signature(
        mr.message.subject_enc + mr.message.body_enc + b"".join(attachment_ciphertexts),
        mr.message.signature,
        mr.message.sender.public_key_pem,
    )
    if not verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Signature verification failed")

    return schemas.MessageDetail(
        id=mr.message.id,
        subject=subject,
        body=body,
        sender_email=mr.message.sender.email,
        created_at=mr.message.created_at,
        recipients=recipients,
        read_at=mr.read_at,
        deleted_at=mr.deleted_at,
        attachments=attachments_meta,
    )


@router.post("/{message_id}/read", response_model=schemas.MarkReadResponse)
def mark_as_read(
    message_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> schemas.MarkReadResponse:
    mr = (
        db.query(models.MessageRecipient)
        .filter(
            models.MessageRecipient.recipient_id == current_user.id,
            models.MessageRecipient.message_id == message_id,
        )
        .first()
    )

    if mr is None or mr.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    if mr.read_at is None:
        mr.read_at = datetime.utcnow()
        db.commit()

    return schemas.MarkReadResponse(status="read")


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(
    message_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    mr = (
        db.query(models.MessageRecipient)
        .filter(
            models.MessageRecipient.recipient_id == current_user.id,
            models.MessageRecipient.message_id == message_id,
        )
        .first()
    )

    if mr is None or mr.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    mr.deleted_at = datetime.utcnow()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
