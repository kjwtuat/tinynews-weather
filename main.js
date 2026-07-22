import './style.css';

const dateListEl = document.getElementById('date-list');
const currentDateTitle = document.getElementById('current-date-title');
const weatherContainer = document.getElementById('weather-container');

async function init() {
  try {
    // 1. 저장된 날짜 목록(index.json) 불러오기
    const res = await fetch(`${import.meta.env.BASE_URL}data/index.json`);
    if (!res.ok) throw new Error('데이터를 불러올 수 없습니다.');
    const dates = await res.json();
    
    if (dates.length === 0) {
      currentDateTitle.textContent = "저장된 날씨가 없습니다.";
      return;
    }

    // 2. 사이드바에 날짜 탭 렌더링
    renderDateList(dates);
    
    // 3. 가장 최신 날짜의 날씨 자동 로드
    loadNewsForDate(dates[0]);

  } catch (err) {
    console.error(err);
    currentDateTitle.textContent = "날씨 데이터를 준비 중입니다.";
  }
}

function renderDateList(dates) {
  dateListEl.innerHTML = '';
  
  dates.forEach((date, index) => {
    const btn = document.createElement('div');
    btn.className = `date-item ${index === 0 ? 'active' : ''}`;
    
    // 날짜 포맷팅 (YYYY-MM-DD -> YYYY. MM. DD.)
    const [year, month, day] = date.split('-');
    btn.textContent = `${year}. ${month}. ${day}.`;
    
    btn.addEventListener('click', () => {
      // 메뉴 액티브 상태 전환
      document.querySelectorAll('.date-item').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      
      loadNewsForDate(date);
    });
    
    dateListEl.appendChild(btn);
  });
}

async function loadNewsForDate(dateString) {
  try {
    const [year, month, day] = dateString.split('-');
    currentDateTitle.textContent = `${year}년 ${month}월 ${day}일 주요 날씨`;
    weatherContainer.innerHTML = '<p style="color: var(--text-tertiary);">날씨를 불러오는 중입니다...</p>';
    
    // 특정 날짜의 JSON 데이터 패치
    const res = await fetch(`${import.meta.env.BASE_URL}data/${dateString}.json`);
    if (!res.ok) throw new Error('날씨를 찾을 수 없습니다.');
    const newsItems = await res.json();
    
    weatherContainer.innerHTML = '';
    
    if (newsItems.length === 0) {
      weatherContainer.innerHTML = '<p>저장된 날씨 기사가 없습니다.</p>';
      return;
    }
    
    // 날씨 기사 목록 렌더링
    newsItems.forEach(item => {
      const articleEl = document.createElement('article');
      articleEl.className = 'weather-item';
      
      const publisherEl = document.createElement('div');
      publisherEl.className = 'weather-publisher';
      publisherEl.textContent = item.publisher || 'Google News';
      
      const titleEl = document.createElement('h3');
      titleEl.className = 'weather-title';
      
      const linkEl = document.createElement('a');
      linkEl.href = item.link;
      linkEl.target = '_blank';
      linkEl.rel = 'noopener noreferrer';
      linkEl.textContent = item.speakableTitle || item.originalTitle || item.title;
      titleEl.appendChild(linkEl);
      
      articleEl.appendChild(publisherEl);
      articleEl.appendChild(titleEl);
      
      // AI가 생성한 상세 요약본(detailedSummary) 처리
      if (item.detailedSummary) {
        const snippetEl = document.createElement('p');
        snippetEl.className = 'weather-snippet';
        // 구어체 텍스트이므로 별도 파싱 없이 그대로 렌더링
        snippetEl.textContent = item.detailedSummary; 
        articleEl.appendChild(snippetEl);
      } else if (item.contentSnippet) {
        // Fallback for old data
        const snippetEl = document.createElement('p');
        snippetEl.className = 'weather-snippet';
        snippetEl.textContent = item.contentSnippet.replace(/<[^>]*>?/gm, '').trim(); 
        articleEl.appendChild(snippetEl);
      }
      
      weatherContainer.appendChild(articleEl);
    });
    
    // 모바일 환경 등에서 다른 날짜 클릭 시 부드럽게 상단으로 스크롤 이동
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
  } catch (err) {
    console.error(err);
    weatherContainer.innerHTML = '<p style="color: #ff4444;">날씨를 불러오는 중 오류가 발생했습니다.</p>';
  }
}

// 앱 시작
init();
