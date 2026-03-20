import os
import httpx
import asyncio
from datetime import datetime, timedelta
from dotenv import load_dotenv
import database

load_dotenv()

SERVICE_KEY = os.environ.get("SERVICE_KEY")
KAT_CODE_BASE_URL = "https://apis.data.go.kr/B552845/katCode"
KAT_REALTIME2_BASE_URL = "https://apis.data.go.kr/B552845/katRealTime2"

async def fetch_markets():
    """도매시장 목록을 API에서 가져와 DB에 저장"""
    url = f"{KAT_CODE_BASE_URL}/wholesaleMarkets"
    params = {
        "serviceKey": SERVICE_KEY,
        "returnType": "JSON",
        "pageNo": 1,
        "numOfRows": 200,
        "selectable": "whsl_mrkt_cd,whsl_mrkt_nm"
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, params=params, timeout=30.0)
            response.raise_for_status()
            data = response.json()
            items = data.get('response', {}).get('body', {}).get('items', {}).get('item', [])
            if not isinstance(items, list):
                items = [items] if items else []
            
            if items:
                database.save_markets(items)
                print(f"Saved {len(items)} markets to DB.")
                return items
        except Exception as e:
            print(f"Error fetching markets: {e}")
    return []

async def fetch_trades_for_market(date_str, market_cd):
    """특정 날짜, 특정 시장의 모든 경매 데이터를 페이징 처리하여 수집"""
    url = f"{KAT_REALTIME2_BASE_URL}/trades2"
    page = 1
    total_saved = 0
    
    async with httpx.AsyncClient() as client:
        while True:
            params = {
                "serviceKey": SERVICE_KEY,
                "returnType": "JSON",
                "pageNo": page,
                "numOfRows": 999,
                "cond[trd_clcln_ymd::EQ]": date_str,
                "cond[whsl_mrkt_cd::EQ]": market_cd,
                "cond[gds_lclsf_cd::EQ]": "06",
                "cond[gds_mclsf_cd::EQ]": "03",
                "cond[gds_sclsf_cd::EQ]": "36",
            }
            
            try:
                response = await client.get(url, params=params, timeout=60.0)
                response.raise_for_status()
                data = response.json()
                body = data.get('response', {}).get('body', {})
                items = body.get('items', {}).get('item', [])
                
                if not isinstance(items, list):
                    items = [items] if items else []
                
                if not items:
                    break
                
                saved = database.save_trades(items)
                total_saved += saved
                
                total_count = body.get('totalCount', 0)
                if page * 999 >= total_count:
                    break
                
                page += 1
                await asyncio.sleep(0.5) # API 부하 방지
                
            except Exception as e:
                print(f"Error fetching trades for {market_cd} on {date_str} (page {page}): {e}")
                break
                
    return total_saved

async def collect_all_markets_for_date(date_str):
    """지정한 날짜에 대해 모든 도매시장의 데이터를 수집"""
    print(f"Starting collection for {date_str}...")
    markets = database.get_markets()
    if not markets:
        markets = await fetch_markets()
    
    total_date_saved = 0
    for market in markets:
        market_cd = market['whsl_mrkt_cd']
        market_nm = market['whsl_mrkt_nm']
        saved = await fetch_trades_for_market(date_str, market_cd)
        if saved > 0:
            print(f"  - {market_nm}({market_cd}): {saved} new records saved.")
            total_date_saved += saved
            
    print(f"Finished {date_str}. Total new records: {total_date_saved}")
    return total_date_saved

async def historical_collection(start_date_str, end_date_str):
    """과거 기간 데이터 수집 (예: 2026-03-16 ~ 2026-03-20)"""
    start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
    end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
    
    current_date = start_date
    while current_date <= end_date:
        date_str = current_date.strftime("%Y-%m-%d")
        await collect_all_markets_for_date(date_str)
        current_date += timedelta(days=1)

if __name__ == "__main__":
    # 데이터베이스 초기화 확인
    database.init_db()
    # 테스트 수집 (과거 데이터 수집은 별도 스크립트나 app.py 기동 시 백그라운드로 실행 권장)
    # asyncio.run(fetch_markets())
