from playwright.sync_api import sync_playwright

def run_cuj(page):
    page.goto("http://localhost:5173")
    page.wait_for_timeout(1500)

    # Click on "Automation & Logic"
    page.get_by_role("button", name="Automation").click()
    page.wait_for_timeout(500)

    # Toggle one workflow off
    page.locator('.w-10.h-5').first.click()
    page.wait_for_timeout(2000)

    # Take screenshot of Automation Workflows
    page.screenshot(path="/home/jules/verification/screenshots/automation_workflows.png")
    page.wait_for_timeout(500)

    # Click on "Monitoring"
    page.get_by_role("button", name="Monitoring").click()
    page.wait_for_timeout(1000)

    # Take screenshot of Monitoring logs
    page.screenshot(path="/home/jules/verification/screenshots/monitoring.png")
    page.wait_for_timeout(500)

    # Click on "Importer"
    page.get_by_role("button", name="Data Importer").click()
    page.wait_for_timeout(1000)

    # Take screenshot of Data Importer
    page.screenshot(path="/home/jules/verification/screenshots/data_importer.png")
    page.wait_for_timeout(500)

if __name__ == "__main__":
    import os
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos",
            viewport={'width': 1280, 'height': 720}
        )
        page = context.new_page()
        try:
            run_cuj(page)
        except Exception as e:
            print("Error during execution:", e)
        finally:
            context.close()
            browser.close()
