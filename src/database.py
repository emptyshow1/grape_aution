import sqlite3


def get_connection():
    return sqlite3.connect("./auction.db")

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # 도매시장 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS wholesale_markets (
            whsl_mrkt_cd TEXT PRIMARY KEY,
            whsl_mrkt_nm TEXT
        )
    """)
    
    # 경매 데이터 테이블
    # 중복 방지를 위해 주요 필드 조합으로 UNIQUE 인덱스 생성
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS auction_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trd_clcln_ymd TEXT,
            whsl_mrkt_cd TEXT,
            corp_nm TEXT,
            gds_lclsf_nm TEXT,
            gds_mclsf_nm TEXT,
            gds_sclsf_nm TEXT,
            unit_qty REAL,
            unit_nm TEXT,
            pkg_nm TEXT,
            plor_nm TEXT,
            scsbd_prc REAL,
            qty REAL,
            scsbd_dt TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(scsbd_dt, whsl_mrkt_cd, corp_nm, scsbd_prc, qty, unit_qty)
        )
    """)
    
    conn.commit()
    conn.close()

def save_markets(markets):
    conn = get_connection()
    cursor = conn.cursor()
    for market in markets:
        cursor.execute("""
            INSERT OR IGNORE INTO wholesale_markets (whsl_mrkt_cd, whsl_mrkt_nm)
            VALUES (?, ?)
        """, (market['whsl_mrkt_cd'], market['whsl_mrkt_nm']))
    conn.commit()
    conn.close()

def save_trades(trades):
    conn = get_connection()
    cursor = conn.cursor()
    count = 0
    for t in trades:
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO auction_trades (
                    trd_clcln_ymd, whsl_mrkt_cd, corp_nm, 
                    gds_lclsf_nm, gds_mclsf_nm, gds_sclsf_nm, 
                    unit_qty, unit_nm, pkg_nm, plor_nm, 
                    scsbd_prc, qty, scsbd_dt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                t.get('trd_clcln_ymd'), t.get('whsl_mrkt_cd'), t.get('corp_nm'),
                t.get('gds_lclsf_nm'), t.get('gds_mclsf_nm'), t.get('gds_sclsf_nm'),
                t.get('unit_qty'), t.get('unit_nm'), t.get('pkg_nm'), t.get('plor_nm'),
                t.get('scsbd_prc'), t.get('qty'), t.get('scsbd_dt')
            ))
            if cursor.rowcount > 0:
                count += 1
        except Exception as e:
            print(f"Error saving trade: {e}")
            
    conn.commit()
    conn.close()
    return count

def get_markets():
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT whsl_mrkt_cd, whsl_mrkt_nm FROM wholesale_markets ORDER BY whsl_mrkt_nm")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def query_trades(date, market_cd):
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM auction_trades 
        WHERE trd_clcln_ymd = ? AND whsl_mrkt_cd = ?
        ORDER BY scsbd_dt DESC
    """, (date, market_cd))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

if __name__ == "__main__":
    init_db()
    print("Database initialized.")
