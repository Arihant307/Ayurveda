"""Admin CLI.

    python -m app.cli migrate
    python -m app.cli create-user --email soc@hospital.example --role admin   (prompts for the password)
"""

from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy import func, select


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m app.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("migrate", help="apply database migrations (alembic upgrade head)")
    cu = sub.add_parser("create-user", help="create a user")
    cu.add_argument("--email", required=True)
    cu.add_argument("--role", choices=["admin", "analyst", "viewer"], default="viewer")
    cu.add_argument("--name", default="")
    cu.add_argument("--password-stdin", action="store_true", help="read the password from stdin")
    args = ap.parse_args(argv)

    from app.main import run_migrations

    if args.cmd == "migrate":
        run_migrations()
        print("database is at head")
        return 0
    from app.core.db import SessionLocal
    from app.core.security import hash_password
    from app.models.db_models import User

    run_migrations()
    pw = sys.stdin.readline().rstrip("\n") if args.password_stdin else getpass.getpass("Password (min 12 chars): ")
    if len(pw) < 12:
        print("password must be at least 12 characters", file=sys.stderr)
        return 2
    with SessionLocal() as db:
        if db.execute(select(User).where(func.lower(User.email) == args.email.lower())).scalar_one_or_none():
            print("user exists", file=sys.stderr)
            return 1
        db.add(User(email=args.email.lower(), full_name=args.name, role=args.role, password_hash=hash_password(pw)))
        db.commit()
    print(f"created {args.role} {args.email}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
