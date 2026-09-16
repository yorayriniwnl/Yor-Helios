"""Shared response-model configuration for supported Pydantic runtimes."""

from pydantic import BaseModel, VERSION as PYDANTIC_VERSION

if PYDANTIC_VERSION.startswith("2."):
    from pydantic import ConfigDict
else:
    ConfigDict = None


class ORMResponseModel(BaseModel):
    """Allow response models to serialize SQLAlchemy objects in both runtimes."""

    if ConfigDict is not None:
        model_config = ConfigDict(from_attributes=True)
    else:
        class Config:
            orm_mode = True
