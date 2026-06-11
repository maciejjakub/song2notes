import pytest
from app.db import init_db


@pytest.fixture(scope="session", autouse=True)
def _init_db():
    # Tests hit endpoints without running the app lifespan, so create tables and
    # apply the lightweight column migrations here.
    init_db()
