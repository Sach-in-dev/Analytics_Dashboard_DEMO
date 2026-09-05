"""AnalyticsUser model — maps to the existing analytics_users table."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, JSON, Index, UniqueConstraint
from app.database import Base
import bcrypt


def gen_uuid():
    return str(uuid.uuid4())


class AnalyticsUser(Base):
    __tablename__ = "analytics_users"
    __table_args__ = (
        UniqueConstraint("email", name="analytics_users_email_key"),
        Index("analytics_users_email_idx", "email"),
    )

    id = Column(String, primary_key=True, default=gen_uuid)
    email = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=True)
    role = Column(String, nullable=False, default="user")  # 'admin' or 'user'
    permissions = Column(JSON, nullable=False, default=list)  # ["orders", "carts", ...]
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    def has_permission(self, resource: str) -> bool:
        """Check if user has access to a resource. Admins have full access."""
        if self.is_admin:
            return True
        return resource in (self.permissions or [])

    def verify_password(self, password: str) -> bool:
        """Verify a plaintext password against the stored hash."""
        if not self.password_hash:
            return False
        return bcrypt.checkpw(password.encode(), self.password_hash.encode())

    def set_password(self, password: str):
        """Hash and set a new password."""
        self.password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
