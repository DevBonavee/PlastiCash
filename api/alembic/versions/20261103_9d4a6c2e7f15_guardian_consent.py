"""profiles: date of birth and parent or guardian consent (NDPA 2023)

Individuals give a date of birth at sign-up. Under 13 can't sign up; 13 to 17 is a minor whose parent or guardian
consents through a single-use emailed link (only its sha256 hash is stored; 7-day expiry; up to 3 resends, counted in
guardian_link_sends). Existing profiles are NOT_REQUIRED.

Revision ID: 9d4a6c2e7f15
Revises: 5b8e1f3a9c27
Create Date: 2026-11-03 14:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '9d4a6c2e7f15'
down_revision: Union[str, Sequence[str], None] = '5b8e1f3a9c27'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

consent = postgresql.ENUM('NOT_REQUIRED', 'PENDING', 'GRANTED', 'DECLINED', name='guardian_consent', create_type=False)


def upgrade() -> None:
    """Upgrade schema."""
    consent.create(op.get_bind(), checkfirst=True)
    op.add_column('profiles', sa.Column('date_of_birth', sa.Date(), nullable=True))
    op.add_column('profiles', sa.Column('is_minor', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('profiles', sa.Column('guardian_name', sa.Text(), nullable=True))
    op.add_column('profiles', sa.Column('guardian_phone', sa.Text(), nullable=True))
    op.add_column('profiles', sa.Column('guardian_email', sa.Text(), nullable=True))
    op.add_column('profiles', sa.Column('guardian_consent_status', consent,
                                        server_default=sa.text("'NOT_REQUIRED'"), nullable=False))
    op.add_column('profiles', sa.Column('guardian_consent_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('profiles', sa.Column('guardian_token_hash', sa.Text(), nullable=True))
    op.add_column('profiles', sa.Column('guardian_token_expires_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('profiles', sa.Column('guardian_link_sends', sa.Integer(), server_default=sa.text('0'),
                                        nullable=False))
    op.create_index('profiles_guardian_token_hash_key', 'profiles', ['guardian_token_hash'], unique=True,
                    postgresql_where=sa.text('guardian_token_hash is not null'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('profiles_guardian_token_hash_key', table_name='profiles')
    for column in ('guardian_link_sends', 'guardian_token_expires_at', 'guardian_token_hash', 'guardian_consent_at',
                   'guardian_consent_status', 'guardian_email', 'guardian_phone', 'guardian_name', 'is_minor',
                   'date_of_birth'):
        op.drop_column('profiles', column)
    consent.drop(op.get_bind(), checkfirst=True)
