import requests
import json

base_url = "http://localhost:8003/api/v1/"

print("Testing health...")
try:
    r = requests.get(base_url + "health/")
    print(f"Health: {r.status_code} {r.text}")
except Exception as e:
    print(f"Health failed: {e}")

print("\nTesting groups...")
try:
    r = requests.get(base_url + "groups/")
    print(f"Groups: {r.status_code} {r.text}")
except Exception as e:
    print(f"Groups failed: {e}")

print("\nTesting attendance...")
try:
    r = requests.get(base_url + "attendance/")
    print(f"Attendance: {r.status_code}")
except Exception as e:
    print(f"Attendance failed: {e}")

print("\nTesting messages...")
try:
    # user2 should be a valid employee_id if possible, but let's try random first
    r = requests.get(base_url + "messages/", params={"user1": "admin", "user2": "BG000169"})
    print(f"Messages: {r.status_code} {r.text}")
except Exception as e:
    print(f"Messages failed: {e}")
