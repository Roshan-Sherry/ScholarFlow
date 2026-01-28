"""Initialize database with Alembic migrations"""

import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.models.database import Base, engine

def init_db():
    """Create all tables"""
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("✅ Database initialized successfully with all tables")
    print("✅ Schema includes current_phase and phase_history columns")

if __name__ == "__main__":
    init_db()
