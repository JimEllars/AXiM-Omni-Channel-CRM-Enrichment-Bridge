from playwright.sync_api import sync_playwright

def run_cuj(page):
    page.goto("http://localhost:5173")
    page.wait_for_timeout(3000)

    # Hover and test some basic interaction to get the video to show clearly.
    page.mouse.move(500, 500)
    page.wait_for_timeout(1000)

    page.screenshot(path="/home/jules/verification/screenshots/dashboard_final.png")

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
            # print out the newest file in the videos directory
            videos = os.listdir("/home/jules/verification/videos")
            videos.sort(key=lambda x: os.path.getmtime(os.path.join("/home/jules/verification/videos", x)))
            print(f"Video saved as: {videos[-1]}")
