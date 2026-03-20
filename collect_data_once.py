import asyncio
from app import collector
from app import database

async def main():
    print("=== Initial Data Setup ===")
    database.init_db()
    
    # 1. 도매시장 목록 수집
    print("Step 1: Fetching markets...")
    await collector.fetch_markets()
    
    # 2. 과거 데이터 수집 (2026-03-16 ~ 2026-03-20)
    print("Step 2: Fetching historical trades (2026-03-16 to 2026-03-20)...")
    await collector.historical_collection("2026-03-16", "2026-03-20")
    
    print("=== Setup Completed ===")

if __name__ == "__main__":
    asyncio.run(main())
