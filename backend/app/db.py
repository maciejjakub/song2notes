from sqlmodel import SQLModel, Session, create_engine
from .config import settings
from . import db_models  # noqa: F401  ensure models are registered before create_all

engine = create_engine(
    f"sqlite:///{settings.DB_PATH}",
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    # create_all doesn't alter existing tables; add columns introduced after the
    # first release to DBs that predate them.
    with engine.connect() as conn:
        columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(job)")}
        if "separator_model" not in columns:
            conn.exec_driver_sql("ALTER TABLE job ADD COLUMN separator_model VARCHAR")
            conn.commit()


def get_session():
    with Session(engine) as session:
        yield session
