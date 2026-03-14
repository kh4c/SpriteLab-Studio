import webbrowser
import threading
import time
from server import app

def open_browser():
    time.sleep(1.5) # Wait for server to start
    webbrowser.open("http://127.0.0.1:5000")

if __name__ == "__main__":
    print("Starting SpriteLab Web...")
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(port=5000, debug=True)
