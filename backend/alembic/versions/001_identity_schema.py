"""Identity schema (greenfield) — organizations + users, nothing else.

UrbanOracle persists identity only (see backend/db/models.py): aggregation
data is fetched live from external APIs and never stored, so this initial
migration contains no geometry columns and needs plain Postgres, not PostGIS.

Revision ID: 001
Revises:
Create Date: 2026-08-04
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        # IdP subject (28-char non-UUID GIP uid). VARCHAR, unique, never a PK.
        sa.Column("auth_uid", sa.String(length=128), nullable=False, unique=True),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column(
            "email_verified", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="viewer"),
        # PRIMARY curated-access gate: an un-evaluated row is never active.
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    # auth_uid and email already carry unique indexes via their constraints;
    # only org_id needs an explicit index for the FK lookup path.
    op.create_index("idx_users_org_id", "users", ["org_id"])


def downgrade() -> None:
    op.drop_index("idx_users_org_id", table_name="users")
    op.drop_table("users")
    op.drop_table("organizations")
