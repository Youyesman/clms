from datetime import datetime

try:
    ymd = "20260131"
    tm = "2405"
    dt_str = f"{ymd}{tm}"
    print(f"Attempting to parse: {dt_str}")
    dt = datetime.strptime(dt_str, "%Y%m%d%H%M")
    print("Success:", dt)
except ValueError as e:
    print("Caught expected error:", e)

# Test proposed fix logic
def parse_cgv_time(ymd, hm):
    hour = int(hm[:2])
    minute = int(hm[2:])
    
    from datetime import timedelta
    
    # Base date
    dt = datetime.strptime(ymd, "%Y%m%d")
    
    # Add hours/minutes
    dt += timedelta(hours=hour, minutes=minute)
    return dt

print("Proposed fix result:", parse_cgv_time(ymd, tm))
