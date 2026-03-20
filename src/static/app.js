document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const form = document.getElementById('search-form');
    const dateInput = document.getElementById('date-input');
    const marketSelect = document.getElementById('market-select');
    const searchBtn = document.getElementById('search-btn');
    const btnText = document.getElementById('btn-text');
    
    // State Containers
    const emptyState = document.getElementById('empty-state');
    const loadingState = document.getElementById('loading-state');
    const resultsContainer = document.getElementById('results-container');
    const errorState = document.getElementById('error-state');
    
    // Data Containers
    const resultsBody = document.getElementById('results-body');
    const totalCount = document.getElementById('total-count');
    const errorMessage = document.getElementById('error-message');
    
    // 글로벌 상태
    let currentItems = [];
    let currentTotalCount = 0;
    let currentSort = { key: '', asc: false }; // 기본: 내림차순(false)
    let currentFilterPkg = 'all'; // 단위 필터 상태
    let currentFilterCorp = 'all'; // 법인 필터 상태
    let priceChartInstance = null; // 차트 인스턴스
    
    // 정렬 이벤트 등록
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => handleSort(th.dataset.sort, th));
    });
    
    // 단위/포장 필터 이벤트 등록
    const pkgFilterEl = document.getElementById('pkg-filter');
    pkgFilterEl.addEventListener('change', (e) => {
        currentFilterPkg = e.target.value;
        updateUIAfterFilter();
    });
    
    // 법인명 필터 이벤트 등록
    const corpFilterEl = document.getElementById('corp-filter');
    corpFilterEl.addEventListener('change', (e) => {
        currentFilterCorp = e.target.value;
        updateUIAfterFilter();
    });

    function updateUIAfterFilter() {
        const filtered = getFilteredItems();
        totalCount.textContent = filtered.length.toLocaleString();
        renderResults();
        renderChart();
    }
    
    // 기본 날짜를 오늘로 설정
    const today = new Date();
    // 대한민국 표준시 (KST) 기준으로 로컬 날짜 문자열 YYYY-MM-DD 가져오기
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(today.getTime() + kstOffset);
    dateInput.value = kstDate.toISOString().split('T')[0];
    
    // 1. 초기 도매시장 목록 가져오기
    async function fetchMarkets() {
        try {
            // 페이지당 200개 정도면 전국 공영도매시장은 충분히 가져옵니다
            const response = await fetch('/api/markets?numOfRows=200');
            if (!response.ok) {
                throw new Error(`API 오류: ${response.status}`);
            }
            
            const data = await response.json();
            
            // 공공데이터포털 응답 구조 파싱 (katCode-openapi 명세 참고)
            // JSON 응답 구조가 {"items": {"item": [...]}} 형식이므로 item 배열을 추출합니다.
            let itemsData = data?.response?.body?.items?.item || data?.response?.body?.items || [];
            let items = [];
            if (Array.isArray(itemsData)) {
                items = itemsData;
            } else if (itemsData && typeof itemsData === 'object') {
                items = [itemsData];
            }
            
            // 옵션 추가
            if (items.length > 0) {
                marketSelect.innerHTML = '<option value="" disabled selected>도매시장을 선택해주세요</option>';
                items.forEach(market => {
                    const option = document.createElement('option');
                    option.value = market.whsl_mrkt_cd;
                    option.textContent = market.whsl_mrkt_nm;
                    marketSelect.appendChild(option);
                });
            } else {
                throw new Error('도매시장 목록 데이터가 비어있습니다.');
            }
        } catch (error) {
            console.error('도매시장 목록 로드 실패:', error);
            marketSelect.innerHTML = '<option value="" disabled>데이터 로드 실패 (API 키 확인 필요)</option>';
            showError('도매시장 목록을 불러올 수 없습니다.', error.message);
        }
    }
    
    // 2. 경매 데이터 조회
    async function searchTrades(e) {
        e.preventDefault();
        
        const dateStr = dateInput.value;
        const marketCd = marketSelect.value;
        
        if (!marketCd) {
            alert('도매시장을 선택해주세요.');
            return;
        }

        // UI 상태 변경 (로딩 중)
        emptyState.classList.add('hidden');
        resultsContainer.classList.add('hidden');
        errorState.classList.add('hidden');
        loadingState.classList.remove('hidden');
        
        // 버튼 상태 변경
        searchBtn.disabled = true;
        btnText.textContent = '조회 중...';
        
        try {
            // katRealTime2 명세에 따라 API 호출 (최대 999건 단위 페이징 조회)
            const fetchPage = async (page) => {
                const queryParams = new URLSearchParams({
                    date: dateStr,
                    market_cd: marketCd,
                    numOfRows: 999,
                    pageNo: page
                });
                const response = await fetch(`/api/trades?${queryParams}`);
                if (!response.ok) throw new Error(`API 오류: ${response.status}`);
                const data = await response.json();
                return data?.response?.body;
            };
            
            // 첫 번째 페이지 호출
            const body = await fetchPage(1);
            if (!body) {
                throw new Error('데이터 포맷 오류 또는 결과가 없습니다.');
            }
            
            let allItems = [];
            let itemsData = body.items?.item || body.items || [];
            
            if (Array.isArray(itemsData)) {
                allItems = itemsData;
            } else if (itemsData && typeof itemsData === 'object') {
                allItems = [itemsData];
            }
            
            const count = body.totalCount || allItems.length;
            
            // 총 건수가 999보다 크다면, 남은 페이지들을 모두 순차적으로 불러오기
            if (count > 999) {
                const totalPages = Math.ceil(count / 999);
                for (let i = 2; i <= totalPages; i++) {
                    btnText.textContent = `조회 중... (${i}/${totalPages})`;
                    const pBody = await fetchPage(i);
                    if (pBody) {
                        let pItems = pBody.items?.item || pBody.items || [];
                        if (Array.isArray(pItems)) {
                            allItems = allItems.concat(pItems);
                        } else if (pItems && typeof pItems === 'object') {
                            allItems.push(pItems);
                        }
                    }
                }
            }
            
            // 전역 상태에 저장 전 미리 단위 규격(_pkgSpec)을 계산해 둡니다
            currentItems = allItems.map(item => {
                const pQtyVal = parseFloat(item.unit_qty);
                item._pkgSpec = !isNaN(pQtyVal) ? `${pQtyVal}kg` : '-';
                return item;
            });
            currentTotalCount = count;
            
            // 필터 옵션 구성 요소 생성 및 UI 업데이트
            // 법인명 필터 옵션 생성
            const uniqueCorps = [...new Set(currentItems.map(i => i.corp_nm))].filter(Boolean).sort();
            corpFilterEl.innerHTML = '<option value="all">모든 법인</option>';
            uniqueCorps.forEach(corp => {
                const opt = document.createElement('option');
                opt.value = corp;
                opt.textContent = corp;
                corpFilterEl.appendChild(opt);
            });
            corpFilterEl.classList.remove('hidden');
            currentFilterCorp = 'all';

            // 단위/포장 필터 옵션 생성
            const uniquePkgs = [...new Set(currentItems.map(i => i._pkgSpec))].filter(p => p !== '-').sort((a,b) => parseFloat(a) - parseFloat(b));
            if (currentItems.some(i => i._pkgSpec === '-')) uniquePkgs.push('-');
            
            pkgFilterEl.innerHTML = '<option value="all">모든 단위/포장</option>';
            uniquePkgs.forEach(pkg => {
                const opt = document.createElement('option');
                opt.value = pkg;
                opt.textContent = pkg;
                pkgFilterEl.appendChild(opt);
            });
            pkgFilterEl.classList.remove('hidden');
            currentFilterPkg = 'all';
            
            // 기존 정렬 상태가 있다면 유지해서 렌더링
            if (currentSort.key) {
                sortItems(currentSort.key, currentSort.asc);
            }
            
            // 결과 및 차트 렌더링
            const filtered = getFilteredItems();
            totalCount.textContent = filtered.length.toLocaleString();
            
            renderResults();
            renderChart();
            
        } catch (error) {
            console.error('경매 데이터 조회 실패:', error);
            showError('경매 정보를 불러오는 중 오류가 발생했습니다.', error.message);
        } finally {
            // 로딩 종료
            loadingState.classList.add('hidden');
            searchBtn.disabled = false;
            btnText.textContent = '조회하기';
        }
    }
    
    // 내부 필터링 함수
    function getFilteredItems() {
        let items = currentItems;
        if (currentFilterPkg !== 'all') {
            items = items.filter(i => i._pkgSpec === currentFilterPkg);
        }
        if (currentFilterCorp !== 'all') {
            items = items.filter(i => i.corp_nm === currentFilterCorp);
        }
        return items;
    }
    
    // 3. 결과 렌더링 함수
    function renderResults() {
        const itemsToRender = getFilteredItems();
        
        if (itemsToRender.length === 0) {
            showError('조회 결과가 없습니다.', '조건에 해당하는 매칭 데이터가 없습니다.');
            return;
        }
        
        // 테이블 비우기
        resultsBody.innerHTML = '';
        
        // 데이터 채우기
        itemsToRender.forEach(item => {
            const tr = document.createElement('tr');
            
            // 데이터 추출 (안전하게 처리)
            const scsbdDt = formatDateTime(item.scsbd_dt);
            const corpNm = item.corp_nm || '-';
            
            // 분류명 (대 > 중 > 소)
            const clsPath = [item.gds_lclsf_nm, item.gds_mclsf_nm, item.gds_sclsf_nm]
                            .filter(Boolean).join(' > ');
                            
            // 이미 계산해둔 _pkgSpec 사용
            const pkgSpec = item._pkgSpec;
            
            const origin = item.plor_nm || '-';
            
            // 가격 처리 (단량당 낙찰가)
            const priceVal = parseFloat(item.scsbd_prc);
            const price = isNaN(priceVal) ? '-' : Math.floor(priceVal).toLocaleString();
            
            // 물량
            const qtyVal = parseFloat(item.qty);
            const qty = isNaN(qtyVal) ? '-' : qtyVal.toLocaleString();
            
            tr.innerHTML = `
                <td class="hidden">${scsbdDt}</td>
                <td>${corpNm}</td>
                <td class="hidden">상품정보숨김</td>
                <td>${pkgSpec}</td>
                <td class="text-right"><span class="price-text">${price}</span>원</td>
                <td class="text-right">${qty}</td>
                <td>${origin}</td>
            `;
            
            resultsBody.appendChild(tr);
        });
        
        // 결과 영역 표시
        resultsContainer.classList.remove('hidden');
    }
    
    // 4. 오류 화면 표시
    function showError(title, message) {
        document.getElementById('error-title').textContent = title;
        errorMessage.textContent = message;
        
        emptyState.classList.add('hidden');
        resultsContainer.classList.add('hidden');
        loadingState.classList.add('hidden');
        errorState.classList.remove('hidden');
    }
    
    // 유틸리티 함수: '2026-03-16 14:30:00' 포맷 변경 (날짜만 반환)
    function formatDateTime(dtStr) {
        if (!dtStr) return '-';
        try {
            return dtStr.split(' ')[0]; // 날짜 부분만 표기
        } catch (e) {
            return dtStr;
        }
    }
    
    // 정렬 함수
    function handleSort(key, thElement) {
        if (!currentItems || currentItems.length === 0) return;
        
        if (currentSort.key === key) {
            currentSort.asc = !currentSort.asc; // 방향 토글
        } else {
            currentSort.key = key;
            currentSort.asc = false; // 기본은 내림차순
        }
        
        // UI 아이콘 업데이트
        document.querySelectorAll('.sortable').forEach(el => {
            el.classList.remove('active', 'asc');
        });
        thElement.classList.add('active');
        if (currentSort.asc) thElement.classList.add('asc');
        
        sortItems(currentSort.key, currentSort.asc);
        renderResults();
    }
    
    function sortItems(key, isAsc) {
        currentItems.sort((a, b) => {
            let valA, valB;
            switch(key) {
                case 'scsbdDt': valA = a.scsbd_dt; valB = b.scsbd_dt; break;
                case 'corpNm': valA = a.corp_nm; valB = b.corp_nm; break;
                case 'pkgSpec': valA = parseFloat(a.unit_qty) || 0; valB = parseFloat(b.unit_qty) || 0; break;
                case 'origin': valA = a.plor_nm; valB = b.plor_nm; break;
                case 'price': valA = parseFloat(a.scsbd_prc) || 0; valB = parseFloat(b.scsbd_prc) || 0; break;
                case 'qty': valA = parseFloat(a.qty) || 0; valB = parseFloat(b.qty) || 0; break;
                default: return 0;
            }
            
            if (valA < valB) return isAsc ? -1 : 1;
            if (valA > valB) return isAsc ? 1 : -1;
            return 0;
        });
    }

    // Chart.js 히스토그램 렌더링
    function renderChart() {
        const canvas = document.getElementById('priceChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // 기존 차트 파기
        if (priceChartInstance) {
            priceChartInstance.destroy();
        }
        
        // 유효한 가격만 추출
        const itemsToRender = getFilteredItems();
        const prices = itemsToRender
            .map(item => parseFloat(item.scsbd_prc))
            .filter(price => !isNaN(price) && price > 0);
            
        if (prices.length === 0) return;
        
        // 히스토그램 Bin 계산 (10개의 구간으로 나누기)
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        
        const binCount = 10;
        const binSize = (maxPrice - minPrice) / binCount || 1; // 동일 가격일 경우 방지
        const bins = Array(binCount).fill(0);
        const labels = [];
        
        for (let i = 0; i < binCount; i++) {
            const rangeStart = Math.floor(minPrice + (i * binSize));
            const rangeEnd = Math.floor(minPrice + ((i + 1) * binSize));
            // 마지막 라벨의 경우 이상적인 보기 위해 포맷
            labels.push(`${rangeStart.toLocaleString()}~${rangeEnd.toLocaleString()}`);
        }
        
        prices.forEach(price => {
            let binIndex = Math.floor((price - minPrice) / binSize);
            if (binIndex >= binCount) binIndex = binCount - 1; // 최대값 예외 처리
            if (binIndex < 0) binIndex = 0;
            bins[binIndex]++;
        });
        
        // 차트 생성
        priceChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '낙찰가 분포 (건수)',
                    data: bins,
                    backgroundColor: 'rgba(99, 102, 241, 0.5)', // primary-500 with opacity
                    borderColor: 'rgba(79, 70, 229, 1)', // primary-600
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '단량당 낙찰가 분포도',
                        font: { size: 16, family: 'Pretendard' }
                    },
                    tooltip: {
                        callbacks: {
                            title: (items) => `가격대: ${items[0].label}원`,
                            label: (item) => `빈도: ${item.raw}건`
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: '가격대 (원)' },
                        ticks: { maxRotation: 45, minRotation: 45 }
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: '경매 건수' },
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    }

    // 이벤트 리스너 등록
    form.addEventListener('submit', searchTrades);
    
    // 값 변경 시 자동 조회 이벤트
    marketSelect.addEventListener('change', () => {
        if (marketSelect.value) {
            searchTrades({ preventDefault: () => {} });
        }
    });
    
    dateInput.addEventListener('change', () => {
        if (marketSelect.value) {
            searchTrades({ preventDefault: () => {} });
        }
    });

    // 초기화 과정
    fetchMarkets();
});
