"""Seed default admin user. Safe to run multiple times."""
import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import hash_password


async def seed():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == "admin"))
        if result.scalar_one_or_none():
            return
        admin = User(
            username="admin",
            email="admin@localhost",
            hashed_password=hash_password("admin123"),
            role="admin",
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        print("Created default admin user: admin / admin123")


if __name__ == "__main__":
    asyncio.run(seed())
