from fastapi import FastAPI, APIRouter, HTTPException, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import hmac
import hashlib
import logging
import secrets
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Annotated, Any
from pydantic.functional_validators import BeforeValidator
from bson import ObjectId
import uuid
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

LICENSE_SECRET = os.environ.get('LICENSE_SECRET', 'dev-license-secret-change-me')
LICENSE_ADMIN_SECRET = os.environ.get('LICENSE_ADMIN_SECRET', 'dev-admin-secret-change-me')

PLAN_DAYS = {"Trial": 14, "Starter": 30, "Pro": 30, "Business": 30, "Lifetime": 365 * 20}
PLAN_DEVICES = {"Trial": 2, "Starter": 1, "Pro": 3, "Business": 10, "Lifetime": 5}

app = FastAPI(title="JewelBox POS API")
api_router = APIRouter(prefix="/api")

PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    def to_mongo(self) -> dict:
        doc = self.model_dump(by_alias=True, exclude_none=True)
        doc.pop("_id", None)
        return doc

    @classmethod
    def from_mongo(cls, doc: dict):
        return cls(**doc) if doc else None


def now() -> datetime:
    return datetime.now(timezone.utc)


class License(BaseDocument):
    key: str
    business: str
    plan: str = "Trial"
    status: str = "Active"
    deviceLimit: int = 2
    devices: List[str] = []
    expiry: str
    createdAt: str = Field(default_factory=lambda: now().isoformat())


class ActivateReq(BaseModel):
    licenseKey: str
    deviceId: str


class AdminLicenseReq(BaseModel):
    business: str
    plan: str = "Trial"
    deviceLimit: Optional[int] = None


class AdminUpdateReq(BaseModel):
    licenseKey: str
    plan: Optional[str] = None
    status: Optional[str] = None
    extendDays: Optional[int] = None
    deviceLimit: Optional[int] = None


def make_key() -> str:
    chunk = lambda: "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(4))
    return f"JBX-{chunk()}-{chunk()}-{chunk()}"


def activation_token(key: str, device_id: str, expiry: str) -> str:
    msg = f"{key}|{device_id}|{expiry}".encode()
    return hmac.new(LICENSE_SECRET.encode(), msg, hashlib.sha256).hexdigest()


def public_license(doc: dict) -> dict:
    return {
        "key": doc["key"],
        "business": doc["business"],
        "plan": doc["plan"],
        "status": doc["status"],
        "deviceLimit": doc["deviceLimit"],
        "expiry": doc["expiry"],
    }


def require_admin(secret: Optional[str]):
    if not secret or not hmac.compare_digest(secret, LICENSE_ADMIN_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")


@api_router.get("/")
async def root():
    return {"app": "JewelBox POS API", "status": "ok"}


@api_router.post("/license/activate")
async def activate(req: ActivateReq):
    key = req.licenseKey.strip().upper()
    doc = await db.licenses.find_one({"key": key})
    if not doc:
        raise HTTPException(status_code=404, detail="License key not found")
    if doc["status"] == "Revoked":
        raise HTTPException(status_code=403, detail="This license has been revoked")
    devices = doc.get("devices", [])
    if req.deviceId not in devices:
        if len(devices) >= doc["deviceLimit"]:
            raise HTTPException(status_code=403, detail="Device limit reached for this license")
        devices.append(req.deviceId)
        await db.licenses.update_one({"key": key}, {"$set": {"devices": devices, "updatedAt": now().isoformat()}})
    doc["devices"] = devices
    return {"license": public_license(doc), "token": activation_token(key, req.deviceId, doc["expiry"])}


@api_router.post("/license/validate")
async def validate(req: ActivateReq):
    key = req.licenseKey.strip().upper()
    doc = await db.licenses.find_one({"key": key})
    if not doc:
        raise HTTPException(status_code=404, detail="License key not found")
    expired = datetime.fromisoformat(doc["expiry"]) < now()
    status = "Expired" if expired and doc["status"] != "Revoked" else doc["status"]
    doc["status"] = status
    return {"license": public_license(doc), "valid": status == "Active"}


@api_router.post("/admin/licenses")
async def create_license(req: AdminLicenseReq, x_admin_secret: Optional[str] = Header(default=None)):
    require_admin(x_admin_secret)
    plan = req.plan if req.plan in PLAN_DAYS else "Trial"
    lic = License(
        key=make_key(),
        business=req.business,
        plan=plan,
        deviceLimit=req.deviceLimit or PLAN_DEVICES[plan],
        expiry=(now() + timedelta(days=PLAN_DAYS[plan])).isoformat(),
    )
    await db.licenses.insert_one(lic.to_mongo())
    return public_license(lic.to_mongo())


@api_router.get("/admin/licenses")
async def list_licenses(x_admin_secret: Optional[str] = Header(default=None)):
    require_admin(x_admin_secret)
    docs = await db.licenses.find({}, {"_id": 0}).to_list(500)
    return docs


@api_router.patch("/admin/licenses")
async def update_license(req: AdminUpdateReq, x_admin_secret: Optional[str] = Header(default=None)):
    require_admin(x_admin_secret)
    key = req.licenseKey.strip().upper()
    doc = await db.licenses.find_one({"key": key})
    if not doc:
        raise HTTPException(status_code=404, detail="License key not found")
    patch: dict[str, Any] = {"updatedAt": now().isoformat()}
    if req.plan in PLAN_DAYS:
        patch["plan"] = req.plan
        patch["deviceLimit"] = req.deviceLimit or PLAN_DEVICES[req.plan]
    if req.status in {"Active", "Expired", "Revoked"}:
        patch["status"] = req.status
    if req.deviceLimit:
        patch["deviceLimit"] = req.deviceLimit
    if req.extendDays:
        base = max(datetime.fromisoformat(doc["expiry"]), now())
        patch["expiry"] = (base + timedelta(days=req.extendDays)).isoformat()
    await db.licenses.update_one({"key": key}, {"$set": patch})
    return public_license({**doc, **patch})


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def seed_demo_license():
    await db.licenses.create_index("key", unique=True)
    if not await db.licenses.find_one({"key": "JBX-7F4K-92LM-X8Q2"}):
        await db.licenses.insert_one(
            License(
                key="JBX-7F4K-92LM-X8Q2",
                business="JewelBox Jewellers",
                plan="Trial",
                deviceLimit=2,
                expiry=(now() + timedelta(days=14)).isoformat(),
            ).to_mongo()
        )


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
