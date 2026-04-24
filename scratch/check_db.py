
import sqlite3
import os

db_path = 'backend/db.sqlite3'

if not os.path.exists(db_path):
    print(f"Error: {db_path} not found")
else:
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [t[0] for t in cursor.fetchall()]
        print(f"Tables found: {tables}")
        
        # Check api_attendance table structure
        if 'api_attendance' in tables:
            cursor.execute("PRAGMA table_info(api_attendance);")
            columns = [c[1] for c in cursor.fetchall()]
            print(f"Columns in api_attendance: {columns}")
        else:
            print("Warning: api_attendance table NOT found!")
            
        # Check api_passwordresettoken table structure
        if 'api_passwordresettoken' in tables:
            cursor.execute("PRAGMA table_info(api_passwordresettoken);")
            columns = [c[1] for c in cursor.fetchall()]
            print(f"Columns in api_passwordresettoken: {columns}")
        else:
            print("Warning: api_passwordresettoken table NOT found!")
            
        conn.close()
    except Exception as e:
        print(f"Database error: {e}")
