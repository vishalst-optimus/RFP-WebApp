"""
Document Service
Handles document generation utilities and time handling functions.
"""
import datetime
from datetime import timezone, timedelta
from typing import Tuple


def get_pacific_time() -> Tuple[datetime.datetime, str]:
    """Get current time in Pacific Time (PST/PDT)"""
    # Pacific Time: UTC-8 in winter (PST), UTC-7 in summer (PDT)
    # We'll use a simple approximation - typically PDT from March to November
    utc_now = datetime.datetime.utcnow()
    
    # Determine if it's daylight saving time (approximate)
    # PDT typically runs from 2nd Sunday in March to 1st Sunday in November
    year = utc_now.year
    
    # 2nd Sunday in March
    march_dst_start = datetime.datetime(year, 3, 8)
    while march_dst_start.weekday() != 6:  # 6 = Sunday
        march_dst_start += timedelta(days=1)
    
    # 1st Sunday in November  
    nov_dst_end = datetime.datetime(year, 11, 1)
    while nov_dst_end.weekday() != 6:  # 6 = Sunday
        nov_dst_end += timedelta(days=1)
    
    # Check if current date is in PDT period
    if march_dst_start <= utc_now.replace(hour=0, minute=0, second=0, microsecond=0) < nov_dst_end:
        # PDT: UTC-7
        pacific_time = utc_now - timedelta(hours=7)
        timezone_suffix = " PDT"
    else:
        # PST: UTC-8
        pacific_time = utc_now - timedelta(hours=8)
        timezone_suffix = " PST"
    
    return pacific_time, timezone_suffix


def generate_document_filename(source_file_name: str) -> str:
    """
    Generate a timestamped filename for RFP response documents.
    """
    source_name = source_file_name.replace('.pdf', '').replace('.docx', '').replace('.doc', '')
    pacific_time, _ = get_pacific_time()
    timestamp = pacific_time.strftime('%Y%m%d_%H%M%S')
    return f"RFP_Response_{source_name}_{timestamp}.docx"