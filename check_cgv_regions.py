import os
from playwright.sync_api import sync_playwright

def check_cgv_regions():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            url = "https://cgv.co.kr/cnm/movieBook/cinema"
            print(f"Connecting to {url}...")
            page.goto(url, timeout=30000)
            
            # Modal Handling logic from existing crawler
            def ensure_modal_open():
                if page.locator(".cgv-bot-modal.active").count() > 0:
                    return
                open_btn = page.locator("button[class*='editBtn']").first
                if open_btn.count() > 0:
                    open_btn.click()
                    page.wait_for_selector(".cgv-bot-modal.active", state="visible", timeout=3000)

            ensure_modal_open()
            
            modal_selector = ".cgv-bot-modal.active"
            region_items_selector = f"{modal_selector} .bottom_region__2bZCS > ul > li"
            
            # Wait for "서울" button to be visible to ensure list is loaded
            print("Waiting for '서울' button...")
            seoul_btn = page.locator(".cgv-bot-modal.active button:has-text('서울')").first
            seoul_btn.wait_for(state="visible", timeout=30000)
            
            # Find the container UL of the Seoul button
            # '서울' button -> parent li -> parent ul
            region_list_ul = seoul_btn.locator("xpath=../..")
            
            region_items = region_list_ul.locator("li")
            region_count = region_items.count()
            print(f"Found {region_count} regions (via '서울' anchor):")
            
            for i in range(region_count):
                region_btn = region_items.nth(i).locator("button")
                raw_text = region_btn.inner_text().strip()
                print(f"- {raw_text}")
                
        except Exception as e:
            print(f"Error: {e}")
            with open("debug_cgv.html", "w", encoding="utf-8") as f:
                f.write(page.content())
            print("Saved debug_cgv.html")
        finally:
            browser.close()

if __name__ == "__main__":
    check_cgv_regions()
