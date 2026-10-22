import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.storage import storage
from app.config import settings

@pytest_asyncio.fixture(autouse=True)
async def reset_storage():
    """Clear in-memory storage before each test."""
    await storage.clear_all()
    yield
    await storage.clear_all()

@pytest.fixture
def auth_headers():
    return {
        "X-API-Key": settings.API_KEY
    }

@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
