"""profiles: marketing email opt-in and unsubscribe token

Marketing email is opt-in (unticked at sign-up, a switch in settings). unsubscribe_token is the key in the one-click
unsubscribe link and the List-Unsubscribe header; made when someone opts in.

Revision ID: 2f7c8b4d1e60
Revises: 9d4a6c2e7f15
Create Date: 2026-11-03 15:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2f7c8b4d1e60'
down_revision: Union[str, Sequence[str], None] = '9d4a6c2e7f15'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('profiles', sa.Column('marketing_opt_in', sa.Boolean(), server_default=sa.text('false'),
                                        nullable=False))
    op.add_column('profiles', sa.Column('marketing_opt_in_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('profiles', sa.Column('unsubscribe_token', sa.Text(), nullable=True))
    op.create_unique_constraint('profiles_unsubscribe_token_key', 'profiles', ['unsubscribe_token'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('profiles_unsubscribe_token_key', 'profiles', type_='unique')
    op.drop_column('profiles', 'unsubscribe_token')
    op.drop_column('profiles', 'marketing_opt_in_at')
    op.drop_column('profiles', 'marketing_opt_in')
