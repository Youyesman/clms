import os
import django
import sys

sys.path.append('c:\\clms\\castingline_backend')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "castingline_backend.settings")
django.setup()

from crawler.models import MovieSchedule

def test_normalization():
    test_cases = [
        ("1", "1관"),
        ("2", "2관"),
        ("10", "10관"),
        ("IMAX", "IMAX"),
        ("4DX", "4DX"),
        ("VIP관", "VIP관"),
        ("1관", "1관"),
        (" 1 ", "1관"),
        ("", ""),
        (None, ""),
        ("Business", "Business"),
        ("Screen 1", "Screen 1"),
        # User Provided Cases
        ("3관 (리클라이너,Laser)", "3관"),
        ("르 리클라이너 2관 &#40;7층&#41;", "2관"),
        ("5관&#40;리클라이너&#41;", "5관"),
        ("1관&#40;리클라이너&amp;LASER&#41;", "1관"),
        # Edge cases
        ("리클라이너관", "리클라이너관"), # No digits
        ("제 1관", "1관"), 
        ("Premium 7관", "7관")
    ]

    print("Running Screen Name Normalization Tests...")
    all_passed = True
    for input_name, expected in test_cases:
        result = MovieSchedule.normalize_screen_name(input_name)
        if result == expected:
            print(f"[PASS] '{input_name}' -> '{result}'")
        else:
            print(f"[FAIL] '{input_name}' -> '{result}' (Expected: '{expected}')")
            all_passed = False
    
    if all_passed:
        print("\nAll tests passed!")
    else:
        print("\nSome tests failed.")

if __name__ == "__main__":
    test_normalization()
