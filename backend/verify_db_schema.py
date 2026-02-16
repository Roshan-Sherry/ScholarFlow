import sqlite3
import os
import sys

with open("db_log.txt", "w") as f:
    try:
        db_path = "data/scholarflow.db"
        if not os.path.exists(db_path):
            f.write(f"DB not found at {db_path}\n")
            sys.exit(1)

        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        cursor = c.execute("PRAGMA table_info(chat_sessions)")
        columns = [row[1] for row in cursor.fetchall()]
        f.write(f"Columns: {columns}\n")
        
        if "title" in columns:
            f.write("SUCCESS: title column exists.\n")
        else:
            f.write("FAILURE: title column MISSING.\n")
            
    except Exception as e:
        f.write(f"Error: {e}\n")
    finally:
        if 'conn' in locals(): conn.close()
