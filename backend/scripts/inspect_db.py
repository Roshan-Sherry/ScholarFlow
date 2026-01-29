
from app.models.database import get_db, LibraryItem, Project
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
import json

def inspect_library():
    # Setup DB
    db = next(get_db())
    
    print("\n--- Inspecting Library Items ---")
    items = db.query(LibraryItem).limit(10).all()
    
    for item in items:
        print(f"\nID: {item.id}")
        print(f"Title: {item.title}")
        print(f"Authors (Raw): {item.authors}")
        print(f"Authors Type: {type(item.authors)}")
        
        if isinstance(item.authors, str):
            print("WARNING: Authors is a string! Attempting JSON decode...")
            try:
                decoded = json.loads(item.authors)
                print(f"Decoded: {decoded} (Type: {type(decoded)})")
            except:
                print("Failed to decode.")

if __name__ == "__main__":
    inspect_library()
