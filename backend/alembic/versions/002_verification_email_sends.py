"""verification_email_sends: one row per verification mail UrbanOracle sent

Revision ID: 002
Revises: 001
Create Date: 2026-10-25

The ledger behind POST /api/v1/auth/verification-email
(services/verification_email.py): its 60-second cooldown and its limit of five
sends per 24 hours are read from here, under a per-uid advisory lock, inside
the transaction that records the send. A row exists only for a mail Resend
accepted.

  id        BIGSERIAL primary key
  auth_uid  the GIP uid (users.auth_uid's type: varchar(128)), NOT NULL
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  index     (auth_uid, sent_at DESC) — "the latest sends for this uid"

No foreign key: the sender is by definition unverified and the endpoint never
provisions a users row. No email column: the address stays in the identity
tenant and in the caller's token. The endpoint deletes a uid's rows older than
seven days whenever it records a new send.

Additive only. In this repo the migration is applied by the Cloud Run job
urbanoracle-migrate, which deploy.yml runs with the new image BEFORE the new
revision takes traffic (and the old revision, which never reads this table,
keeps serving meanwhile).
"""

import sqlalchemy as sa
from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None

INDEX = "ix_verification_email_sends_auth_uid_sent_at"


def upgrade() -> None:
    op.create_table(
        "verification_email_sends",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("auth_uid", sa.String(length=128), nullable=False),
        sa.Column(
            "sent_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(INDEX, "verification_email_sends", ["auth_uid", sa.text("sent_at DESC")])


def downgrade() -> None:
    op.drop_index(INDEX, table_name="verification_email_sends")
    op.drop_table("verification_email_sends")
