import os
import asyncio
from fastapi import FastAPI, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from datetime import datetime
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
import database
import collector

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 환경 변수 로드 (상위 폴더의 .env 참조)
load_dotenv()

app = FastAPI(title="Realtime Auction API Proxy")

# 정적 파일 서빙을 위한 설정
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

SERVICE_KEY = os.environ.get("SERVICE_KEY")
if not SERVICE_KEY:
    raise ValueError("SERVICE_KEY is not set in the environment.")

# 공공데이터포털 API 기본 URL
KAT_CODE_BASE_URL = "https://apis.data.go.kr/B552845/katCode"
KAT_REALTIME2_BASE_URL = "https://apis.data.go.kr/B552845/katRealTime2"

# 스케줄러 설정
scheduler = BackgroundScheduler()

def scheduled_collection_job():
    """오늘 날짜의 데이터를 전수 수집하는 작업"""
    today_str = datetime.now().strftime("%Y-%m-%d")
    print(f"[Scheduler] Starting scheduled collection for {today_str}")
    asyncio.run(collector.collect_all_markets_for_date(today_str))

@app.on_event("startup")
async def startup_event():
    """앱 시작 시 DB 초기화 및 스케줄러 시작"""
    database.init_db()
    
    # 매일 06, 09, 12시에 수집 작업 등록
    scheduler.add_job(scheduled_collection_job, 'cron', hour='6,9,12', minute=0)
    scheduler.start()
    print("Scheduler started. Jobs will run at 06, 09, 12 o'clock.")

@app.on_event("shutdown")
def shutdown_event():
    scheduler.shutdown()

@app.get("/")
async def root():
    """메인 HTML 파일 서빙 기본"""
    return FileResponse(os.path.join(BASE_DIR, "static", "index.html"))

@app.get("/api/markets")
async def get_wholesale_markets():
    """DB에서 도매시장 목록 조회"""
    try:
        markets = database.get_markets()
        # 만약 DB가 비어있다면 API에서 한 번 가져오기 (초기 구동 시 대비)
        if not markets:
             markets = await collector.fetch_markets()
        return {"response": {"body": {"items": {"item": markets}}}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/trades")
async def get_realtime_trades(
    date: str = Query(..., description="조회할 날짜 (YYYY-MM-DD)", format="date"),
    market_cd: str = Query(..., description="도매시장 코드"),
):
    """DB에서 경매정보 조회 (모든 상품 분류 코드는 수집 단계에서 필터링됨)"""
    try:
        trades = database.query_trades(date, market_cd)
        return {
            "response": {
                "body": {
                    "totalCount": len(trades),
                    "items": {"item": trades}
                }
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # 개발 서버 실행
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
