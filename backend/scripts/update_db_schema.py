import sqlite3
import os

DB_PATH = "data/scholarflow.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database {DB_PATH} not found. Skipping migration (will be created by app).")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        print("Attempting to add 'url' column to 'library_items'...")
        cursor.execute("ALTER TABLE library_items ADD COLUMN url VARCHAR(500)")
        print("✅ Successfully added 'url' column.")
    except sqlite3.OperationalError:
        pass

    try:
        print("Attempting to add 'title' column to 'chat_sessions'...")
        cursor.execute("ALTER TABLE chat_sessions ADD COLUMN title VARCHAR(255) DEFAULT 'New Chat'")
        print("✅ Successfully added 'title' column.")
    except sqlite3.OperationalError:
        pass
        
    try:
        print("Attempting to add 'current_phase' column to 'projects'...")
        cursor.execute("ALTER TABLE projects ADD COLUMN current_phase VARCHAR(50)")
        print("✅ Successfully added 'current_phase' column.")
    except sqlite3.OperationalError:
        pass

    conn.commit()
    conn.close()

if __name__ == "__main__":
    migrate()
