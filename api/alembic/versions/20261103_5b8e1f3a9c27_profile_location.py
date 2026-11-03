"""profiles: saved map pin (lat, lng)

The dashboard's "Pickup address" bar saves a pin with the address, and the request form starts from it.
Both null until the user drops a pin.

Revision ID: 5b8e1f3a9c27
Revises: e8a4c1d9f2b6
Create Date: 2026-11-03 13:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5b8e1f3a9c27'
down_revision: Union[str, Sequence[str], None] = 'e8a4c1d9f2b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('profiles', sa.Column('lat', sa.Numeric(9, 6), nullable=True))
    op.add_column('profiles', sa.Column('lng', sa.Numeric(9, 6), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('profiles', 'lng')
    op.drop_column('profiles', 'lat')
