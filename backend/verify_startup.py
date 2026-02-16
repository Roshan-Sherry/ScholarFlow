import sys
import os

# Add current dir to path
sys.path.append(os.getcwd())

print("Testing app.main import...")
try:
    from app.main import app
    print("Import SUCCESS")
except Exception as e:
    print(f"Import ERROR: {e}")
    import traceback
    traceback.print_exc()
