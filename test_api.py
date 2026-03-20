import httpx
import os
from dotenv import load_dotenv
import urllib.parse

load_dotenv()
SERVICE_KEY = os.environ.get("SERVICE_KEY")

base_url = "https://apis.data.go.kr/B552845/katRealTime2/trades2"
# 1. httpx params 사용 (자동 인코딩)
params = {
    "serviceKey": SERVICE_KEY,
    "returnType": "JSON",
    "pageNo": 1,
    "numOfRows": 1,
    "cond[trd_clcln_ymd::EQ]": "2024-03-16",
    "cond[whsl_mrkt_cd::EQ]": "110001",
    "cond[gds_lclsf_cd::EQ]": "06",
    "cond[gds_mclsf_cd::EQ]": "03",
    "cond[gds_sclsf_cd::EQ]": "36",
}

print("Test 1: httpx default params")
try:
    res = httpx.get(base_url, params=params)
    print(res.status_code, res.text[:200])
except Exception as e:
    print(e)

# 2. 명시적으로 디코딩된 키(서비스키 자체가 디코딩 키라고 가정)를 URL 인코딩하지 않고 바로 전달
query_string = urllib.parse.urlencode([
    ("serviceKey", SERVICE_KEY),
    ("returnType", "JSON"),
    ("pageNo", 1),
    ("numOfRows", 1),
    ("cond[trd_clcln_ymd::EQ]", "2024-03-16"),
    ("cond[whsl_mrkt_cd::EQ]", "110001"),
    ("cond[gds_lclsf_cd::EQ]", "06"),
    ("cond[gds_mclsf_cd::EQ]", "03"),
    ("cond[gds_sclsf_cd::EQ]", "36"),
], safe="=%&+/") 
full_url = f"{base_url}?{query_string}"
print("\nTest 2: safe urlencode (+ and / allowed)")
try:
    res = httpx.get(full_url)
    print(res.status_code, res.text[:200])
except Exception as e:
    print(e)

# 3. 브라캣 [] 도 인코딩 안함
query_string2 = urllib.parse.urlencode([
    ("serviceKey", SERVICE_KEY),
    ("returnType", "JSON"),
    ("pageNo", 1),
    ("numOfRows", 1),
    ("cond[trd_clcln_ymd::EQ]", "2024-03-16"),
    ("cond[whsl_mrkt_cd::EQ]", "110001"),
    ("cond[gds_lclsf_cd::EQ]", "06"),
    ("cond[gds_mclsf_cd::EQ]", "03"),
    ("cond[gds_sclsf_cd::EQ]", "36"),
], safe="=%&+/[]:") 
full_url2 = f"{base_url}?{query_string2}"
print("\nTest 3: safe brackets and colons")
try:
    res = httpx.get(full_url2)
    print(res.status_code, res.text[:200])
except Exception as e:
    print(e)
