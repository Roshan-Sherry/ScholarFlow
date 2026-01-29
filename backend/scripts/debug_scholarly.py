
import logging
from scholarly import scholarly

logging.basicConfig(level=logging.INFO)

def test_scholarly():
    print("Searching Scholarly...")
    search_query = scholarly.search_pubs("Attention is all you need")
    try:
        item = next(search_query)
        print("\n--- Raw Item ---")
        print(item)
        print("\n--- Bib Author ---")
        print(f"Type: {type(item['bib'].get('author'))}")
        print(f"Value: {item['bib'].get('author')}")
        
    except StopIteration:
        print("No results found")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_scholarly()
