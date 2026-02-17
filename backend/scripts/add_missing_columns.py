import sqlite3

conn = sqlite3.connect('data/scholarflow.db')
cursor = conn.cursor()

# Check if columns already exist
cursor.execute('PRAGMA table_info(drafts)')
columns = {row[1] for row in cursor.fetchall()}

print('📊 Current drafts columns:', columns)

try:
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
    
    # Verify
    cursor.execute('PRAGMA table_info(drafts)')
    columns = cursor.fetchall()
    print('\n📋 Updated drafts table columns:')
    for col in columns:
        print(f'  {col[1]:20} ({col[2]})')
    
except Exception as e:
    print(f'❌ Error: {e}')
finally:
    conn.close()
