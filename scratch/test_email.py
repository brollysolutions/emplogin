import os
import json
import requests
from dotenv import load_dotenv

load_dotenv('backend/.env')
url = os.environ.get('GOOGLE_SCRIPT_URL')

payload = {
    "action": "sendEmail",
    "to": "glokesh8374@gmail.com", # Using a likely email based on screenshot name
    "subject": "Test Email from Antigravity",
    "body": "This is a test email to verify the Google Apps Script connection."
}

print(f"Sending to: {url}")
try:
    r = requests.post(url, data=json.dumps(payload), headers={"Content-Type": "text/plain"}, allow_redirects=True, timeout=15)
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text}")
except Exception as e:
    print(f"Error: {e}")
