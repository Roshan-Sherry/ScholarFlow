import sqlite3

conn = sqlite3.connect('app.db')
cursor = conn.cursor()
cursor.execute('PRAGMA table_info(drafts)')
columns = cursor.fetchall()
print('Drafts table columns:')
for col in columns:
    print(f'  {col[1]:20} ({col[2]})')
conn.close()
