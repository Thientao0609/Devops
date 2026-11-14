from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from clinic.config import settings


@lru_cache
def engine():
    url = settings().database_url.get_secret_value()
    kwargs = (
        {"connect_args": {"check_same_thread": False}}
        if url.startswith("sqlite")
        else {
            "connect_args": {
                "connect_timeout": 5,
                "options": "-c statement_timeout=15000 -c lock_timeout=5000",
            }
        }
    )
    return create_engine(url, pool_pre_ping=True, **kwargs)


def session():
    return sessionmaker(engine(), expire_on_commit=False)()


def get_db():
    with session() as db:
        yield db
