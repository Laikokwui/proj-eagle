from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.core.security import decode_token
from app.core.exceptions import credentials_exception

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_token(request: Request) -> str:
    """Read the access token from the Authorization header or, for clients
    that cannot set headers (EventSource/WebSocket), the ``token`` query param.
    """
    query_token = request.query_params.get("token")
    if query_token:
        return query_token
    return await oauth2_scheme(request)


async def get_current_user(
    token: str = Depends(get_token),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exception
        username: str = payload.get("sub")
        if not username:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise credentials_exception
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
