import os
import json
import traceback
import urllib.request
from datetime import datetime, timedelta, timezone
from googleapiclient.discovery import build

YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY", "").strip()
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
NAVER_CLIENT_ID = os.environ.get("NAVER_CLIENT_ID", "").strip()
NAVER_CLIENT_SECRET = os.environ.get("NAVER_CLIENT_SECRET", "").strip()

time_limit = datetime.now(timezone.utc) - timedelta(days=3)
three_days_ago = time_limit.strftime('%Y-%m-%dT%H:%M:%SZ')
today_str = datetime.now().strftime('%Y-%m-%d')
one_month_ago_str = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')


def get_latest_youtube_trends(keywords, max_results=20):
    youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)
    request = youtube.search().list(
        part="snippet", q=keywords, type="video",
        order="viewCount", publishedAfter=three_days_ago, maxResults=max_results
    )
    response = request.execute()
    videos = []
    for item in response.get("items", []):
        videos.append({
            "title": item["snippet"]["title"],
            "description": item["snippet"]["description"][:200],
            "video_id": item["id"]["videoId"],
            "url": f"https://youtube.com/watch?v={item['id']['videoId']}"
        })
    return videos


def get_naver_trend(keyword):
    """네이버 데이터랩 API로 특정 키워드의 최근 1달 검색량 트렌드를 조회합니다."""
    if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
        return None
    url = "https://openapi.naver.com/v1/datalab/search"
    body = json.dumps({
        "startDate": one_month_ago_str,
        "endDate": today_str,
        "timeUnit": "week",
        "keywordGroups": [{"groupName": keyword, "keywords": [keyword]}]
    }).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers={
        'Content-Type': 'application/json',
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
    })
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            ratios = [d['ratio'] for d in result['results'][0]['data']]
            # 검색량이 증가세면 True, 감소세면 False
            is_rising = ratios[-1] > ratios[0] if len(ratios) >= 2 else True
            return {"ratios": ratios, "is_rising": is_rising}
    except Exception:
        return None


def summarize_with_ai(videos_data, max_retries=3):
    """Gemini 2.5 Flash로 구체적인 F&B 상품명/메뉴명 키워드를 추출합니다. (503 자동 재시도 포함)"""
    import time
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

    prompt = f"""
당신은 대한민국 F&B(식음료) 트렌드 전문 분석가입니다.
아래는 최근 3일간 유튜브에서 조회수가 높은 F&B 관련 영상 목록입니다.

[유튜브 데이터]
{json.dumps(videos_data, ensure_ascii=False)}

[분석 지시]
위 데이터를 분석하여, 현재 한국에서 실제로 유행하거나 화제가 되고 있는 구체적인 F&B 아이템 5개를 추출하세요.

중요:
- "디저트가 유행", "편의점 트렌드" 같은 모호한 양상 표현은 절대 금지.
- 반드시 실제 상품명, 메뉴명, 또는 브랜드명을 중심으로 작성할 것.
  (예: "삼각김밥 불닭버터맛", "탕후루", "맥도날드 크리스피 버거", "오뚜기 진라면 마라맛")
- sentiment 값은 반드시 "hot"(지금 난리남), "growing"(상승세), "new"(신상) 중 하나로만 작성.
- keywords 배열에는 실제 검색에 쓸 수 있는 구체적인 단어만 3~5개 넣을 것.
- source_video는 반드시 위 유튜브 데이터의 실제 url 중 하나를 선택할 것.

[출력 형식] 반드시 아래 JSON만 출력하고, 다른 설명이나 마크다운(```json 등)은 절대 붙이지 말 것:
{{"updated_at": "{today_str}", "summary": "한 문장으로 오늘의 F&B 트렌드 핵심 요약", "trends": [{{"id": 1, "title": "구체적인 상품명 또는 메뉴명", "description": "이 메뉴/상품이 왜 지금 화제인지 2~3문장으로 설명", "sentiment": "hot", "keywords": ["키워드1", "키워드2", "키워드3"], "source_video": "https://youtube.com/watch?v=..."}}]}}
"""

    data = {"contents": [{"parts": [{"text": prompt}]}]}

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(data).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=60) as response:
                result = json.loads(response.read().decode('utf-8'))
                text = result['candidates'][0]['content']['parts'][0]['text'].strip()
                if text.startswith('```json'): text = text[7:]
                if text.startswith('```'): text = text[3:]
                if text.endswith('```'): text = text[:-3]
                return text.strip()
        except Exception as e:
            if attempt < max_retries - 1:
                wait = (attempt + 1) * 10  # 10초, 20초, 30초 간격으로 재시도
                print(f"   ⚠️ Gemini API 오류 ({e}). {wait}초 후 재시도... ({attempt+1}/{max_retries})")
                time.sleep(wait)
            else:
                raise

