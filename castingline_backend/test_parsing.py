import re

def parse_and_normalize_title(raw_title):
    """
    영화 제목에서 메타데이터(태그)를 추출하고 순수 제목만 반환합니다.
    Returns: (clean_title, tags_list)
    """
    if not raw_title:
        return "", []

    tags = set()
    clean_title = raw_title
    
    # 0. HTML Entity Decoding (Common in crawled data)
    clean_title = clean_title.replace("&#40;", "(").replace("&#41;", ")")

    # 1. Bracket Tags: [무대인사], [F], [담력챌린지] ...
    # Pattern: [Anything except brackets]
    bracket_pattern = r'\[([^\]]+)\]'
    matches = re.findall(bracket_pattern, clean_title)
    for m in matches:
        tags.add(m.strip())
    # Remove tags from title
    clean_title = re.sub(bracket_pattern, '', clean_title).strip()

    # 2. Parenthesis Tags (Suffix/Infix): (더빙), (자막), (3D)...
    # Pattern: (Anything except parenthesis) at the end or middle
    paren_pattern = r'\(([^)]+)\)'
    matches = re.findall(paren_pattern, clean_title)
    
    for m in matches:
        tags.add(m.strip())
        
    clean_title = re.sub(paren_pattern, '', clean_title).strip()

    # 3. Cleanup extra spaces
    clean_title = re.sub(r'\s+', ' ', clean_title).strip()
    
    return clean_title, list(tags)

test_cases = [
    "주토피아 2(팝콘 패키지,더빙)",
    "주토피아 2（팝콘 패키지,더빙）",  # Full-width parenthesis
    "&#40;더빙&#41; 주토피아 2"
]

print("--- Testing parse_and_normalize_title ---")
for title in test_cases:
    clean, tags = parse_and_normalize_title(title)
    print(f"Original: {title}")
    print(f"Clean:    {clean}")
    print(f"Tags:     {tags}")
    print("-" * 20)
