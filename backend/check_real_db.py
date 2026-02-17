import sqlite3

conn = sqlite3.connect('data/scholarflow.db')
cursor = conn.cursor()

# List all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print('📊 Tables in database:')
for table in tables:
    print(f'  - {table[0]}')

# Check drafts table columns
print('\n📋 Drafts table columns:')
cursor.execute('PRAGMA table_info(drafts)')
columns = cursor.fetchall()
for col in columns:
    print(f'  {col[1]:20} ({col[2]})')

conn.close()
