import sqlite3
import os

db_path = "data/scholarflow.db"

if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
c = conn.cursor()

print(f"Connected to {db_path}")

try:
    # Check if column exists (though error says it doesn't)
    # Just try adding it
    c.execute("ALTER TABLE chat_sessions ADD COLUMN title VARCHAR(255) DEFAULT 'New Chat'")
    conn.commit()
    print("SUCCESS: Added 'title' column to chat_sessions")
except sqlite3.OperationalError as e:
    if "duplicate column name" in str(e):
        print("INFO: Column 'title' already exists")
    else:
        print(f"ERROR: {e}")
finally:
    conn.close()
