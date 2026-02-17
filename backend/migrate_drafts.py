#!/usr/bin/env python
"""Quick migration script to add missing columns to drafts table"""

import sqlite3
import os
import sys

# Navigate to backend directory
db_path = os.path.join(os.path.dirname(__file__), 'app.db')

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if columns already exist
    cursor.execute("PRAGMA table_info(drafts)")
    columns = {row[1] for row in cursor.fetchall()}
    
    print(f"📊 Current drafts columns: {columns}")
    
    # Add columns if they don't exist
    if 'full_content' not in columns:
        cursor.execute('ALTER TABLE drafts ADD COLUMN full_content TEXT')
        print('✅ Added full_content column')
    else:
        print('✓ full_content column already exists')
    
    if 'outline' not in columns:
        cursor.execute('ALTER TABLE drafts ADD COLUMN outline JSON')
        print('✅ Added outline column')
    else:
        print('✓ outline column already exists')
    
    conn.commit()
    print('✅ Database updated successfully')
    
except Exception as e:
    print(f'❌ Error: {e}')
    sys.exit(1)
finally:
    if conn:
        conn.close()
