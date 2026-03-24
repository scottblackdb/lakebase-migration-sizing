from fastapi import APIRouter, Form, HTTPException, Request, UploadFile

from backend.identity import owner_from_x_forwarded_user
from backend.ingest import ingest_metrics_json_bytes
from backend.models import UploadResponse

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload_metrics(
    request: Request,
    file: UploadFile,
    group_name: str = Form(""),
):
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="File must be a .json file")

    content = await file.read()
    owner = owner_from_x_forwarded_user(request.headers)
    return ingest_metrics_json_bytes(content, group_name, owner)
