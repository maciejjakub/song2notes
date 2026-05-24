from sqlmodel import SQLModel, Session, create_engine
from .config import settings
from . import db_models  # noqa: F401  ensure models are registered before create_all

engine = create_engine(
    f"sqlite:///{settings.DB_PATH}",
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
