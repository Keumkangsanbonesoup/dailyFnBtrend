document.addEventListener('DOMContentLoaded', async () => {
    const summaryEl = document.getElementById('summary-text');
    const updateDateEl = document.getElementById('update-date');
    const grid = document.getElementById('trends-grid');

    const sentimentMap = {
        hot:      { emoji: '🔥', label: '지금 난리남' },
        growing:  { emoji: '📈', label: '상승세' },
        new:      { emoji: '✨', label: '신상' },
        positive: { emoji: '👍', label: '호평' }
    };

    try {
        // trendData가 로드되지 않았을 때를 대비한 안전 장치
        const data = typeof trendData !== 'undefined' ? trendData : {};

        if (data.error) {
            if (summaryEl) summaryEl.textContent = `오류: ${data.error}`;
            return;
        }

        if (updateDateEl) updateDateEl.textContent = data.updated_at || '';
        if (summaryEl) summaryEl.textContent = data.summary || '';

        if (grid) grid.innerHTML = '';

        (data.trends || []).forEach((trend, index) => {
            const s = sentimentMap[trend.sentiment] || { emoji: '💡', label: trend.sentiment };
            const keywordsHTML = (trend.keywords || [])
                .map(kw => `<span class="keyword">#${kw}</span>`)
                .join('');

            // 네이버 검색량 뱃지 추가
            let naverBadge = '';
            if (trend.naver_trend) {
                const arrow = trend.naver_trend.is_rising ? '▲ 네이버 검색 상승' : '▽ 네이버 검색 감소';
                const color = trend.naver_trend.is_rising ? '#B3E2A7' : '#FFD6D6';
                naverBadge = `<span class="sentiment" style="background:${color}; margin-left:8px;">${arrow}</span>`;
            }

            const card = document.createElement('div');
            card.className = `trend-card card-${index + 1}`;
            
            // source_link 호환성 처리
            const linkUrl = trend.source_link || trend.source_video || '#';
            const linkName = trend.source_name || '출처';

            card.innerHTML = `
                <div class="trend-number">${index + 1}</div>
                <div class="card-content">
                    <div class="trend-header">
                        <span class="sentiment ${trend.sentiment}">${s.emoji} ${s.label}</span>
                        ${naverBadge}
                    </div>
                    <h3 class="trend-title">${trend.title}</h3>
                    <p class="trend-desc">${trend.description}</p>
                    <div class="keywords">${keywordsHTML}</div>
                    <a href="${linkUrl}" class="source-btn" target="_blank">${linkName} 확인하기</a>
                </div>
            `;
            if (grid) grid.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading trend data:', error);
        if (summaryEl) summaryEl.textContent = '트렌드 데이터를 불러오는 데 실패했습니다.';
    }

    // 🔥 여기서부터 불꽃 파티클 버튼 애니메이션 및 영구 카운트(Firebase DB) 로직입니다 🔥
    const fireBtn = document.getElementById('fire-btn');
    if (!fireBtn) return;

    let localCount = 0;
    fireBtn.textContent = `도움되었다면 🔥를 눌러주세요 (...)`;

    // 1. 파티클 애니메이션 함수
    const triggerParticle = (button) => {
        const container = button.parentElement;
        const particle = document.createElement('div');
        
        particle.textContent = '🔥';
        particle.className = 'fire-particle';
        particle.style.left = `calc(50% - 12px)`;
        particle.style.top = `10px`;
        
        const randomX = (Math.random() - 0.5) * 80;
        particle.style.setProperty('--tx', `${randomX}px`);
        
        container.appendChild(particle);
        setTimeout(() => particle.remove(), 800);
    };

    // 2. 회원님의 실제 Firebase 데이터베이스 연동 (실시간 누적 로직)
    let updateDbCount = null;

    try {
        // 공식 DB 모듈 로드
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js");
        const { getFirestore, doc, onSnapshot, setDoc, updateDoc, increment, getDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");

        // 🔥 전달해주신 회원님만의 설정값 적용 완료! 🔥
        const firebaseConfig = {
            apiKey: "AIzaSyBOpIpRMPEj27XieFl2bzzLRtdlPlRLNZU",
            authDomain: "fnb-trend-db.firebaseapp.com",
            projectId: "fnb-trend-db",
            storageBucket: "fnb-trend-db.firebasestorage.app",
            messagingSenderId: "1092465751942",
            appId: "1:1092465751942:web:28836a7613f6ffb9a85e07",
            measurementId: "G-HK9022ZPN8"
        };

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        // 데이터베이스 저장 위치 지정 (reactions 폴더 안의 fire 문서)
        const dbRef = doc(db, 'reactions', 'fire');

        // 처음 눌리는 상태면 숫자 0으로 문서 생성
        const docSnap = await getDoc(dbRef);
        if (!docSnap.exists()) {
            await setDoc(dbRef, { count: 0 });
        }

        // 모든 방문자의 클릭 수를 실시간 감지하여 화면에 반영
        onSnapshot(dbRef, (snapshot) => {
            if (snapshot.exists()) {
                localCount = snapshot.data().count || 0;
                fireBtn.textContent = `도움되었다면 🔥를 눌러주세요 (${localCount})`;
            }
        }, (error) => {
            console.error("Firestore 감지 에러:", error);
        });

        // 카운트 +1 증가 함수 세팅
        updateDbCount = async () => {
            await updateDoc(dbRef, { count: increment(1) });
        };
    } catch (e) {
        console.error("데이터베이스 초기화 에러:", e);
        fireBtn.textContent = `도움되었다면 🔥를 눌러주세요 (0)`;
    }

    // 3. 버튼 클릭 시 동작
    fireBtn.addEventListener('click', function() {
        triggerParticle(this);
        
        // 클릭하자마자 화면의 숫자 먼저 1 올리기 (빠른 반응속도 체감)
        localCount++;
        this.textContent = `도움되었다면 🔥를 눌러주세요 (${localCount})`;

        // 데이터베이스에 숫자 영구 저장 전송
        if (updateDbCount) {
            updateDbCount().catch(err => console.error("카운트 업데이트 실패:", err));
        }
    });
});
