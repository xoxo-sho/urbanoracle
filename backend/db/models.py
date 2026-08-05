"""UrbanOracle identity models — the ONLY persisted data.

UrbanOracle persists no aggregation data: land prices, demographics,
transport and disaster panels are fetched from external APIs per-request
(REINFOLIB / e-Stat / GSI / DisasterShield) and transformed in memory; the
station/ward GeoJSON is served from disk. Postgres holds identity only, so
there are deliberately NO geometry columns and no PostGIS dependency.

Identity rules (ported from the Parallel City / Landcast precedent):

  - ``users.id`` is the internal UUID primary key.
  - ``users.auth_uid`` is the IdP subject (a 28-character NON-UUID string
    under GIP). It is VARCHAR and MUST NOT be reused as a primary key.
    auth_uid = id::text is a bug, not a shortcut.
  - 1 user : 1 org — provisioning (Stage 2b) creates an Organization per
    user; ``org_id`` is NOT NULL from birth.
  - ``is_active`` is a PRIMARY gate (curated access), not just a safety
    net: the schema default is FALSE so a row that provisioning has not
    explicitly evaluated can never be active. Protected routes require
    is_active=true as a second gate after token verification.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, false, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class UserRole(str, enum.Enum):
    viewer = "viewer"
    admin = "admin"


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    users: Mapped[list["User"]] = relationship(back_populates="organization")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    # External IdP subject (the ``sub`` claim). Under GIP this is a
    # 28-character non-UUID string. VARCHAR by design — never a PK.
    auth_uid: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    role: Mapped[str] = mapped_column(
        String(20), nullable=False, default=UserRole.viewer.value, server_default="viewer"
    )
    # Row exists = account exists. is_active = the account may be used.
    # Curated access: provisioning writes is_active=false (pending) and
    # activation is a manual step — the schema default keeps every
    # un-evaluated row inert.
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (Index("idx_users_org_id", "org_id"),)

    organization: Mapped[Organization] = relationship(back_populates="users")
