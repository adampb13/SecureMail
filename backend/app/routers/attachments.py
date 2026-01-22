from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from urllib.parse import quote

from .. import models
from ..crypto_utils import decrypt_payload, unwrap_aes_key
from ..database import get_db
from ..dependencies import get_current_private_key, get_current_user

router = APIRouter(prefix="/attachments", tags=["attachments"])


def build_disposition(filename: str) -> str:
    ascii_name = filename.encode("ascii", "ignore").decode() or "plik"
    encoded = quote(filename)
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'


@router.get("/{attachment_id}")
def download_attachment(
    attachment_id: int,
    current_user: models.User = Depends(get_current_user),
    private_key=Depends(get_current_private_key),
    db: Session = Depends(get_db),
) -> Response:
    attachment = (
        db.query(models.Attachment)
        .join(models.Message)
        .join(models.MessageRecipient)
        .filter(
            models.Attachment.id == attachment_id,
            models.MessageRecipient.recipient_id == current_user.id,
            models.MessageRecipient.deleted_at.is_(None),
        )
        .first()
    )

    if attachment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Załącznik nie znaleziony")

    mr = (
        db.query(models.MessageRecipient)
        .filter(
            models.MessageRecipient.message_id == attachment.message_id,
            models.MessageRecipient.recipient_id == current_user.id,
            models.MessageRecipient.deleted_at.is_(None),
        )
        .first()
    )
    if mr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Załącznik nie znaleziony")

    aes_key = unwrap_aes_key(mr.aes_key_enc, private_key)
    data = decrypt_payload(attachment.data, attachment.nonce, aes_key)

    headers = {
        "Content-Disposition": build_disposition(attachment.filename),
    }
    return Response(content=data, media_type=attachment.content_type, headers=headers)
