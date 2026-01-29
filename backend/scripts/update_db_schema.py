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
        conn.commit()
        print("✅ Successfully added 'url' column.")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e):
            print("ℹ️ Column 'url' already exists.")
        else:
            print(f"❌ Error adding column: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
