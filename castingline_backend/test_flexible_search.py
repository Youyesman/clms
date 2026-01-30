import os
import django
import sys
import re
from datetime import datetime, timedelta

# Setup Django
sys.path.append('c:\\clms\\castingline_backend')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "castingline_backend.settings")
django.setup()

from crawler.models import MovieSchedule

def normalize_string(s):
    return re.sub(r'[^a-zA-Z0-9가-힣]', '', s)

def test_flexible_search():
    print("Testing Flexible Search Logic...")
    
    # 1. Find a schedule with a complex title
    # Let's look for something with spaces/special chars
    sample = MovieSchedule.objects.filter(movie_title__contains=" ").first()
    if not sample:
        print("No movie with spaces found. Creating dummy?")
        # Try finding *any* and just print it
        sample = MovieSchedule.objects.last()
        
    if not sample:
        print("No schedules at all.")
        return

    db_title = sample.movie_title
    print(f"\n[Test Case] DB Title: '{db_title}'")
    
    # 2. Define Test Inputs
    # Generate a variation: Remove spaces, add some noise
    clean_db = normalize_string(db_title)
    
    # Case A: Exact Match of a substring without spaces
    # e.g. "Mission Impossible" -> "MissionImpossible"
    if len(clean_db) > 2:
        input_a = clean_db[:len(clean_db)//2] # First half
        print(f"Test Input A (Substring No Space): '{input_a}'")
        
        # Logic Check
        clean_input = normalize_string(input_a)
        is_match = clean_input in clean_db
        print(f" -> Match Result: {is_match} (Expected: True)")
    
    # Case B: Input with extra spaces
    # e.g. "Mi ssion" matches "Mission"
    # Wait, my logic is: clean(input) in clean(db)
    # If input="Mi ssion", clean="Mission". clean(db)="Mission...". Match.
    
    # Let's try to simulate the View's logic exactly
    print("\n[Simulating View Logic]")
    
    search_term = "  " + db_title.replace(" ", "") + "  " # No spaces inside, spaces outside
    # Or better, just take a part of it and remove spaces
    search_term = db_title.split()[0] if " " in db_title else db_title[:3]
    print(f"Search Term: '{search_term}'")
    
    qs = MovieSchedule.objects.all()[:10] # Process small batch
    
    clean_target = normalize_string(search_term)
    
    matched_count = 0
    for sch in qs:
        clean_db_title = normalize_string(sch.movie_title)
        if clean_target in clean_db_title:
            print(f"   MATCH: '{sch.movie_title}' (Norm: {clean_db_title})")
            matched_count += 1
            
    print(f"Total Matches found in top 10: {matched_count}")

if __name__ == "__main__":
    test_flexible_search()
