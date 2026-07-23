import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

// .env 파일 로드
dotenv.config();

const parser = new Parser();
// 기상청 RSS가 최근 전면 차단(API로 전환)됨에 따라, 구글 뉴스 '오늘 날씨' 검색 결과를 통해 날씨 기상을 수집합니다.
const RSS_URL = encodeURI('https://news.google.com/rss/search?q=오늘 날씨&hl=ko&gl=KR&ceid=KR:ko');
const dataDir = path.join(process.cwd(), 'public', 'data');
const MAX_DAYS = 7;
const MAX_NEWS_ITEMS = 10; // 날씨 종합을 위해 넉넉히 10개 수집

// Gemini API 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function processWeatherWithGemini(newsItems, cityWeatherData) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in .env file.");
  }

  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    }
  });

  const prompt = `
당신은 친절하고 활기찬 성우입니다.
아래 제공된 ${MAX_NEWS_ITEMS}개의 오늘 날씨 관련 뉴스 기사 제목과 요약, 그리고 주요 도시의 기상 수치 데이터를 바탕으로 종합적인 오늘 날씨 예보 대본을 작성해주세요.
시각장애인이나 운전자가 음성(TTS)으로 듣기 편하도록 자연스러운 구어체로 작성하되, "안녕하세요", "AI 기상캐스터입니다" 같은 도입부 인사말이나 자기소개는 대본에 절대 포함하지 말고 바로 날씨 본론부터 시작해야 합니다.

[입력 데이터 1 (오늘 날씨 기사들)]
${JSON.stringify(newsItems, null, 2)}

[입력 데이터 2 (주요 도시 기상 수치)]
${JSON.stringify(cityWeatherData, null, 2)}

[요청 사항]
1. 데이터를 종합 분석하여 다음 4가지 파트로 날씨 대본을 나누어 작성하세요. (반드시 4개의 배열 요소로 출력)
   - 파트 1: "전국 날씨 요약" (오늘의 전반적인 날씨 흐름)
   - 파트 2: "주의 사항" (폭염, 미세먼지, 태풍, 우산 챙기기 등 특이사항)
   - 파트 3: "주요 도시 날씨" (입력 데이터 2에 있는 서울, 대전, 대구, 부산, 광주, 제주, 경주의 최고/최저 기온 및 습도를 구어체로 아주 자연스럽게 상세 브리핑)
   - 파트 4: "내일 날씨 전망" (내일은 어떻게 될지 간단히)
2. 각 파트는 반드시 아래 4개의 필드를 가져야 합니다.
   - "id": 1부터 시작하는 순번 (정수)
   - "originalTitle": 해당 파트의 주제 (예: "주요 도시 날씨")
   - "speakableTitle": TTS가 읽었을 때 핵심을 명확히 전달하는 소제목 (예: "이어서 주요 도시별 자세한 날씨입니다.")
   - "detailedSummary": 기상캐스터가 방송하듯 자연스럽고 친절한 구어체 대본 (예: "서울은 낮 최고 30도, 최저 23도를 기록하겠고 습도는 94%로 무척 후텁지근하겠습니다. 대전은...")
3. 출력은 오직 JSON 형태여야 하며, 배열([])로 감싸주세요. 다른 마크다운 블록이나 텍스트는 일절 포함하지 마세요.
`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const enrichedNews = JSON.parse(responseText);
    
    return enrichedNews.map((item) => ({
      ...item,
      link: "https://weather.naver.com/", // 날씨 정보는 네이버 날씨 등으로 고정
      publisher: "AI 기상캐스터"
    }));
  } catch (error) {
    console.error("Gemini API 처리 중 오류 발생:", error);
    throw error;
  }
}

async function fetchAndSaveWeather() {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    console.log('Fetching weather news from Google News...');
    const feed = await parser.parseURL(RSS_URL);
    
    // 상위 N개의 뉴스만 추출
    const rawNewsItems = feed.items.slice(0, MAX_NEWS_ITEMS).map(item => {
      const titleParts = item.title.split(' - ');
      const publisher = titleParts.length > 1 ? titleParts.pop() : '';
      const cleanTitle = titleParts.join(' - ');

      return {
        title: cleanTitle,
        publisher: publisher,
        contentSnippet: item.contentSnippet || ''
      };
    });

    console.log('Fetching city weather data from wttr.in...');
    const cities = [
      { id: 'Seoul', name: '서울' },
      { id: 'Daejeon', name: '대전' },
      { id: 'Daegu', name: '대구' },
      { id: 'Busan', name: '부산' },
      { id: 'Gwangju', name: '광주' },
      { id: 'Jeju', name: '제주' },
      { id: 'Gyeongju', name: '경주' }
    ];
    
    const cityWeatherData = {};
    for (const city of cities) {
      try {
        const res = await fetch(`https://wttr.in/${city.id}?format=j1`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        const todayData = data.weather[0];
        const currentData = data.current_condition[0];
        cityWeatherData[city.name] = {
          "최고기온(°C)": todayData.maxtempC,
          "최저기온(°C)": todayData.mintempC,
          "현재습도(%)": currentData.humidity
        };
      } catch (err) {
        console.error(`Failed to fetch weather for ${city.name}:`, err);
        cityWeatherData[city.name] = "데이터 수집 실패";
      }
    }

    console.log('Extracted top ' + MAX_NEWS_ITEMS + ' weather items. Processing with Gemini API...');
    const enrichedNewsItems = await processWeatherWithGemini(rawNewsItems, cityWeatherData);

    const today = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(today.getTime() + kstOffset);
    const dateString = kstDate.toISOString().split('T')[0];
    
    const filePath = path.join(dataDir, `${dateString}.json`);
    fs.writeFileSync(filePath, JSON.stringify(enrichedNewsItems, null, 2), 'utf-8');
    console.log('Saved today AI-enriched weather script: ' + dateString + '.json');

    const files = fs.readdirSync(dataDir);
    const availableDates = [];
    const cutoffDate = new Date(kstDate.getTime() - (MAX_DAYS * 24 * 60 * 60 * 1000));
    const cutoffDateString = cutoffDate.toISOString().split('T')[0];

    files.forEach(file => {
      if (file === 'index.json' || !file.endsWith('.json')) return;

      const fileDateStr = file.replace('.json', '');
      if (fileDateStr < cutoffDateString) {
        fs.unlinkSync(path.join(dataDir, file));
        console.log('Deleted old weather data: ' + file);
      } else {
        availableDates.push(fileDateStr);
      }
    });

    availableDates.sort((a, b) => b.localeCompare(a));
    fs.writeFileSync(
      path.join(dataDir, 'index.json'), 
      JSON.stringify(availableDates, null, 2), 
      'utf-8'
    );
    console.log('Updated index.json successfully.');

  } catch (error) {
    console.error('Error fetching or saving weather:', error);
    process.exit(1);
  }
}

fetchAndSaveWeather();
