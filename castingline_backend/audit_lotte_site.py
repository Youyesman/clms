import os
import time
import re
from playwright.sync_api import sync_playwright

def audit_theaters():
    print("--- 🕵️ Lotte Cinema Theater Audit Start ---")
    
    collected_theaters = {} # {Region: [Theater1, Theater2...]}
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        
        try:
            url = "https://www.lottecinema.co.kr/NLCHS/Ticketing/Schedule"
            print(f"Loading {url}...")
            
            # Retry logic for page load
            for attempt in range(3):
                try:
                    page.goto(url, timeout=60000)
                    page.wait_for_selector(".cinema_select_wrap", timeout=30000)
                    break
                except Exception as e:
                    print(f"Load failed ({attempt+1}/3), retrying...")
                    time.sleep(3)
            
            time.sleep(3) # Settle
            
            # 1. Get Region Count
            # Use the same XPath logic for consistency
            region_base = "/html/body/div[6]/div/ul/li[1]/div/div/div[1]/div[2]/div/ul/li"
            region_items = page.locator(".cinema_select_wrap .depth1")
            region_count = region_items.count()
            
            print(f"Found {region_count} regions.")
            
            for i in range(region_count):
                # XPath for Region
                region_li = page.locator(f"xpath={region_base}[{i+1}]")
                region_anchor = region_li.locator("xpath=./a")
                
                if region_anchor.count() == 0: continue
                
                region_full_text = region_anchor.inner_text().strip()
                if "MY" in region_full_text: continue
                
                region_name = re.sub(r'\(\d+\)', '', region_full_text).strip()
                print(f"\n📍 Region: {region_name}")
                
                # Click Region if not active
                if "active" not in region_li.get_attribute("class") or "":
                    region_anchor.click(force=True)
                    time.sleep(1.0)
                
                # Get Theaters
                theater_xpath_relative = "./div/div/div[1]/div/ul/li"
                theater_items = region_li.locator(f"xpath={theater_xpath_relative}/a")
                theater_count = theater_items.count()
                
                theaters = []
                for j in range(theater_count):
                    t_link = theater_items.nth(j)
                    t_name = t_link.inner_text().strip()
                    theaters.append(t_name)
                    print(f"  - {t_name}")
                
                collected_theaters[region_name] = theaters
                
        except Exception as e:
            print(f"Error during audit: {e}")
            import traceback
            traceback.print_exc()
        finally:
            browser.close()
            
    print("\n--- 📊 Audit Summary ---")
    total_theaters = 0
    for reg, t_list in collected_theaters.items():
        count = len(t_list)
        total_theaters += count
        print(f"{reg}: {count} theaters")
        
    print(f"\nTotal Theaters Found: {total_theaters}")
    return collected_theaters

if __name__ == "__main__":
    audit_theaters()
