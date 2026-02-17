#!/usr/bin/env python
"""Initialize database with all tables"""

from app.models.database import init_db, Base, engine

print("🔧 Initializing database...")

try:
    # Create all tables defined in models
    Base.metadata.create_all(bind=engine)
    print("✅ Database initialized successfully!")
    print("   All tables created:")
    
    # List created tables
    from sqlalchemy import inspect
    inspector = inspect(engine)
    for table in inspector.get_table_names():
        print(f"   - {table}")
    
except Exception as e:
    print(f"❌ Error initializing database: {e}")
    import traceback
    traceback.print_exc()
