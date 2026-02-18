// アプリケーション設定
const APP_CONFIG = {
    DB_NAME: 'kokudoStickerDB',
    STORE_NAME: 'records',
    VERSION: 1
};

// IndexedDB初期化
class Database {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(APP_CONFIG.DB_NAME, APP_CONFIG.VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(APP_CONFIG.STORE_NAME)) {
                    const store = db.createObjectStore(APP_CONFIG.STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('prefecture', 'prefecture', { unique: false });
                }
            };
        });
    }

    async addRecord(record) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([APP_CONFIG.STORE_NAME], 'readwrite');
            const store = tx.objectStore(APP_CONFIG.STORE_NAME);
            const request = store.add(record);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateRecord(id, record) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([APP_CONFIG.STORE_NAME], 'readwrite');
            const store = tx.objectStore(APP_CONFIG.STORE_NAME);
            record.id = id;
            const request = store.put(record);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteRecord(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([APP_CONFIG.STORE_NAME], 'readwrite');
            const store = tx.objectStore(APP_CONFIG.STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getAllRecords() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([APP_CONFIG.STORE_NAME], 'readonly');
            const store = tx.objectStore(APP_CONFIG.STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async clearAll() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([APP_CONFIG.STORE_NAME], 'readwrite');
            const store = tx.objectStore(APP_CONFIG.STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

// UIマネージャー
class UIManager {
    constructor() {
        this.currentTab = 'form-tab';
        this.records = [];
        this.filteredRecords = [];
        this.db = new Database();
        this.photos = []; // 写真データを保存
        this.map = null;
    }

    async init() {
        await this.db.init();
        this.setupEventListeners();
        this.setTodayAsDefault();
        await this.loadRecords();
        this.updateStats();
        this.registerServiceWorker();
    }

    setupEventListeners() {
        // タブ切り替え
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // フォーム送信
        document.getElementById('addForm').addEventListener('submit', (e) => this.handleFormSubmit(e));

        // 検索
        document.getElementById('searchInput').addEventListener('input', (e) => this.handleSearch(e.target.value));

        // すべて削除
        document.getElementById('clearAllBtn').addEventListener('click', () => this.handleClearAll());

        // エクスポート・インポート
        document.getElementById('exportBtn').addEventListener('click', () => this.handleExport());
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });
        document.getElementById('importFile').addEventListener('change', (e) => this.handleImport(e));

        // ジオコード機能
        document.getElementById('geocodeBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleGeocode();
        });

        document.getElementById('location').addEventListener('input', () => {
            document.getElementById('geocodeSuggestions').classList.remove('active');
            document.getElementById('coordsDisplay').textContent = '';
            document.getElementById('latitude').value = '';
            document.getElementById('longitude').value = '';
        });

        // 現在地取得機能
        document.getElementById('currentLocationBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleGetCurrentLocation();
        });

        // 写真入力
        document.getElementById('photo').addEventListener('change', (e) => this.handlePhotoInput(e));

        // 手動緯度経度入力
        document.getElementById('manualLatitude').addEventListener('input', () => {
            this.syncManualCoords();
        });

        document.getElementById('manualLongitude').addEventListener('input', () => {
            this.syncManualCoords();
        });
    }

    syncManualCoords() {
        const lat = document.getElementById('manualLatitude').value;
        const lon = document.getElementById('manualLongitude').value;

        if (lat && lon) {
            document.getElementById('latitude').value = lat;
            document.getElementById('longitude').value = lon;
            document.getElementById('coordsDisplay').textContent = `✓ 座標: ${parseFloat(lat).toFixed(4)}, ${parseFloat(lon).toFixed(4)}`;
        }
    }

    setTodayAsDefault() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('date').value = today;
    }

    switchTab(tabName) {
        // タブボタンのアクティブ状態を更新
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // タブコンテンツの表示・非表示
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        this.currentTab = tabName;

        // 統計情報タブに切り替えた時は統計を更新
        if (tabName === 'stats-tab') {
            this.updateStats();
        }

        // 地図タブに切り替えた時は地図を初期化
        if (tabName === 'map-tab') {
            setTimeout(() => {
                this.initMap();
            }, 100);
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        const roadNumber = document.getElementById('roadNumber').value;
        const prefecture = document.getElementById('prefecture').value;
        const location = document.getElementById('location').value;
        const date = document.getElementById('date').value;
        const notes = document.getElementById('notes').value;
        const latitude = document.getElementById('latitude').value;
        const longitude = document.getElementById('longitude').value;

        // バリデーション
        if (!roadNumber || !prefecture || !date || !location) {
            this.showToast('必須項目を入力してください', 'error');
            return;
        }

        const record = {
            roadNumber: parseInt(roadNumber),
            prefecture,
            location,
            date,
            notes,
            latitude: latitude ? parseFloat(latitude) : null,
            longitude: longitude ? parseFloat(longitude) : null,
            photos: this.photos, // 写真データを保存
            createdAt: new Date().toISOString()
        };

        try {
            await this.db.addRecord(record);
            this.showToast('ステッカー記録を追加しました！', 'success');
            document.getElementById('addForm').reset();
            this.setTodayAsDefault();
            document.getElementById('latitude').value = '';
            document.getElementById('longitude').value = '';
            document.getElementById('manualLatitude').value = '';
            document.getElementById('manualLongitude').value = '';
            document.getElementById('coordsDisplay').textContent = '';
            this.photos = []; // 写真データをリセット
            document.getElementById('photoPreview').innerHTML = '';
            await this.loadRecords();
            this.updateStats();
        } catch (error) {
            console.error('Error adding record:', error);
            this.showToast('記録の追加に失敗しました', 'error');
        }
    }

    async loadRecords() {
        try {
            this.records = await this.db.getAllRecords();
            this.filteredRecords = [...this.records];
            this.renderRecords();
        } catch (error) {
            console.error('Error loading records:', error);
            this.showToast('記録の読み込みに失敗しました', 'error');
        }
    }

    handleSearch(query) {
        if (!query) {
            this.filteredRecords = [...this.records];
        } else {
            const lowerQuery = query.toLowerCase();
            this.filteredRecords = this.records.filter(record => {
                return record.roadNumber.toString().includes(query) ||
                       record.prefecture.toLowerCase().includes(lowerQuery) ||
                       (record.location && record.location.toLowerCase().includes(lowerQuery));
            });
        }
        this.renderRecords();
    }

    renderRecords() {
        const container = document.getElementById('recordsList');

        if (this.filteredRecords.length === 0) {
            container.innerHTML = '<p class="empty-message">記録がありません</p>';
            return;
        }

        // 日付でソート（新しい順）
        const sorted = [...this.filteredRecords].sort((a, b) => new Date(b.date) - new Date(a.date));

        container.innerHTML = sorted.map(record => {
            const photosHtml = record.photos && record.photos.length > 0 ? `
                <div class="record-photos">
                    <div class="record-photos-grid">
                        ${record.photos.map((photo, idx) => `
                            <div class="record-photo">
                                <img src="${photo}" alt="写真${idx + 1}" onclick="uiManager.viewPhotoModal('${photo}')">
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : '';

            return `
                <div class="record-card">
                    <div class="record-header">
                        <span class="record-road">国道${record.roadNumber}</span>
                        <span class="record-prefecture">${record.prefecture}</span>
                    </div>
                    <div class="record-details">
                        ${record.location ? `<div class="record-detail-item"><strong>取得場所:</strong> ${this.escapeHtml(record.location)}</div>` : ''}
                        <div class="record-detail-item"><strong>取得日:</strong> ${this.formatDate(record.date)}</div>
                        ${record.latitude && record.longitude ? `<div class="record-detail-item"><strong>座標:</strong> ${parseFloat(record.latitude).toFixed(4)}, ${parseFloat(record.longitude).toFixed(4)}</div>` : ''}
                        ${record.notes ? `<div class="record-detail-item"><strong>メモ:</strong> ${this.escapeHtml(record.notes)}</div>` : ''}
                    </div>
                    ${photosHtml}
                    <div class="record-actions">
                        <button class="btn-edit btn-small" onclick="uiManager.handleEditRecord(${record.id})">編集</button>
                        <button class="btn-delete btn-small" onclick="uiManager.handleDeleteRecord(${record.id})">削除</button>
                    </div>
                </div>
            `;
        }).join('');
            </div>
        `).join('');
    }

    async handleDeleteRecord(id) {
        if (confirm('このレコードを削除してもよろしいですか？')) {
            try {
                await this.db.deleteRecord(id);
                this.showToast('レコードを削除しました', 'success');
                await this.loadRecords();
                this.updateStats();
            } catch (error) {
                console.error('Error deleting record:', error);
                this.showToast('削除に失敗しました', 'error');
            }
        }
    }

    async handleEditRecord(id) {
        const record = this.records.find(r => r.id === id);
        if (!record) return;

        document.getElementById('roadNumber').value = record.roadNumber;
        document.getElementById('prefecture').value = record.prefecture;
        document.getElementById('location').value = record.location || '';
        document.getElementById('date').value = record.date;
        document.getElementById('notes').value = record.notes || '';
        document.getElementById('latitude').value = record.latitude || '';
        document.getElementById('longitude').value = record.longitude || '';
        document.getElementById('manualLatitude').value = record.latitude || '';
        document.getElementById('manualLongitude').value = record.longitude || '';
        
        if (record.latitude && record.longitude) {
            document.getElementById('coordsDisplay').textContent = `✓ 座標: ${parseFloat(record.latitude).toFixed(4)}, ${parseFloat(record.longitude).toFixed(4)}`;
        }

        // 写真を復元
        this.photos = record.photos || [];
        this.renderPhotoPreview();

        // 削除して新規作成の流れで更新
        await this.handleDeleteRecord(id);
        this.switchTab('form-tab');
    }

    async handleClearAll() {
        if (confirm('すべての記録を削除してもよろしいですか？この操作は取り消せません。')) {
            try {
                await this.db.clearAll();
                this.showToast('すべての記録を削除しました', 'success');
                await this.loadRecords();
                this.updateStats();
            } catch (error) {
                console.error('Error clearing all records:', error);
                this.showToast('削除に失敗しました', 'error');
            }
        }
    }

    updateStats() {
        if (this.records.length === 0) {
            document.getElementById('totalCount').textContent = '0';
            document.getElementById('prefectureCount').textContent = '0';
            document.getElementById('latestDate').textContent = '-';
            document.getElementById('topPrefecture').textContent = '-';
            document.getElementById('topPrefectureCount').textContent = '0個';
            document.getElementById('prefectureStats').innerHTML = '<p class="empty-message">データがありません</p>';
            return;
        }

        // 総取得数
        document.getElementById('totalCount').textContent = this.records.length;

        // 取得した都道府県数
        const prefectures = new Set(this.records.map(r => r.prefecture));
        document.getElementById('prefectureCount').textContent = prefectures.size;

        // 最近の取得日
        const latestRecord = [...this.records].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        if (latestRecord) {
            document.getElementById('latestDate').textContent = `国道${latestRecord.roadNumber}`;
        }

        // 都道府県別取得数
        const prefectureStats = {};
        this.records.forEach(record => {
            prefectureStats[record.prefecture] = (prefectureStats[record.prefecture] || 0) + 1;
        });

        // 最多取得都道府県
        const topPrefecture = Object.entries(prefectureStats).sort((a, b) => b[1] - a[1])[0];
        if (topPrefecture) {
            document.getElementById('topPrefecture').textContent = topPrefecture[0];
            document.getElementById('topPrefectureCount').textContent = `${topPrefecture[1]}個`;
        }

        // 都道府県別チャート
        const maxCount = Math.max(...Object.values(prefectureStats));
        const statsHtml = Object.entries(prefectureStats)
            .sort((a, b) => b[1] - a[1])
            .map(([prefecture, count]) => {
                const percentage = (count / maxCount) * 100;
                return `
                    <div class="prefecture-stat-item">
                        <span class="prefecture-stat-name">${prefecture}</span>
                        <div class="prefecture-stat-bar">
                            <div class="prefecture-stat-fill" style="width: ${percentage}%"></div>
                        </div>
                        <span class="prefecture-stat-count">${count}</span>
                    </div>
                `;
            }).join('');
        document.getElementById('prefectureStats').innerHTML = statsHtml;
    }

    handleExport() {
        if (this.records.length === 0) {
            this.showToast('エクスポートするデータがありません', 'error');
            return;
        }

        const dataStr = JSON.stringify(this.records, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `kokudo-sticker-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        this.showToast('データをエクスポートしました', 'success');
    }

    async handleImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (!Array.isArray(data)) {
                    throw new Error('Invalid data format');
                }

                // 既存データをクリアしてインポート
                await this.db.clearAll();
                for (const record of data) {
                    await this.db.addRecord(record);
                }

                await this.loadRecords();
                this.updateStats();
                this.showToast('データをインポートしました', 'success');
            } catch (error) {
                console.error('Error importing data:', error);
                this.showToast('データのインポートに失敗しました', 'error');
            }
        };
        reader.readAsText(file);
        document.getElementById('importFile').value = '';
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }

    formatDate(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('sw.js');
                console.log('Service Worker registered successfully');
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }
    }

    // ジオコーディング機能
    async handleGeocode() {
        const location = document.getElementById('location').value.trim();
        
        if (!location) {
            this.showToast('取得場所を入力してください', 'error');
            return;
        }

        const geocodeBtn = document.getElementById('geocodeBtn');
        geocodeBtn.disabled = true;
        geocodeBtn.textContent = '検索中...';

        try {
            const results = await this.geocodeLocation(location);
            
            if (results.length === 0) {
                this.showToast('住所が見つかりません', 'error');
                this.showGeocodeSuggestions([]);
            } else if (results.length === 1) {
                this.selectGeocodeSuggestion(results[0]);
            } else {
                this.showGeocodeSuggestions(results);
            }
        } catch (error) {
            console.error('Geocoding error:', error);
            this.showToast('住所検索に失敗しました', 'error');
        } finally {
            geocodeBtn.disabled = false;
            geocodeBtn.textContent = '🔍';
        }
    }

    async geocodeLocation(location) {
        // OpenStreetMap Nominatimサービスを使用
        const query = `${location}, Japan`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            
            const results = await response.json();
            return results.slice(0, 5); // 上位5件を返す
        } catch (error) {
            console.error('Geocoding fetch error:', error);
            throw error;
        }
    }

    showGeocodeSuggestions(results) {
        const container = document.getElementById('geocodeSuggestions');
        
        if (results.length === 0) {
            container.innerHTML = '';
            container.classList.remove('active');
            return;
        }

        container.innerHTML = results.map((result, index) => `
            <div class="geocode-suggestion" onclick="uiManager.selectGeocodeSuggestion(${JSON.stringify(result).replace(/"/g, '&quot;')})">
                <p class="geocode-suggestion-text">${this.escapeHtml(result.display_name)}</p>
                <p class="geocode-suggestion-sub">緯度: ${result.lat}, 経度: ${result.lon}</p>
            </div>
        `).join('');
        
        container.classList.add('active');
    }

    selectGeocodeSuggestion(result) {
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);
        
        document.getElementById('location').value = result.display_name;
        document.getElementById('latitude').value = lat;
        document.getElementById('longitude').value = lon;
        document.getElementById('coordsDisplay').textContent = `✓ 座標を取得しました (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
        document.getElementById('coordsDisplay').classList.remove('error');
        document.getElementById('geocodeSuggestions').classList.remove('active');
        
        this.showToast('座標を取得しました', 'success');
    }

    // 地図機能
    initMap() {
        if (this.records.length === 0) {
            document.getElementById('map').innerHTML = '<p style="padding: 20px; text-align: center; color: #7f8c8d;">地図に表示するデータがありません</p>';
            return;
        }

        // 地図が既に初期化されていたら再初期化
        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        // 日本の中心座標
        const japanCenter = [36.2048, 138.2529];
        
        // Leaflet地図を初期化
        this.map = L.map('map').setView(japanCenter, 5);

        // タイルレイヤーを追加（OpenStreetMap）
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);

        // マーカーグループを作成
        const markerGroup = L.featureGroup();
        const markersByRoad = {};

        // 座標がある記録のマーカーを追加
        this.records.forEach(record => {
            if (record.latitude && record.longitude) {
                const lat = parseFloat(record.latitude);
                const lon = parseFloat(record.longitude);
                
                // 国道ごとの色を変更
                const roadNum = record.roadNumber;
                if (!markersByRoad[roadNum]) {
                    markersByRoad[roadNum] = [];
                }

                // マーカーの色を国道番号に基づいて設定
                const colors = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c'];
                const colorIndex = roadNum % colors.length;
                const color = colors[colorIndex];

                const marker = L.circleMarker([lat, lon], {
                    radius: 8,
                    fillColor: color,
                    color: '#fff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                });

                // ポップアップコンテンツを作成
                let popupContent = `
                    <div style="max-width: 300px;">
                        <strong style="font-size: 16px; color: ${color};">国道${record.roadNumber}</strong><br>
                        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e0e0e0;">
                            <div><strong>都道府県:</strong> ${record.prefecture}</div>
                            <div><strong>取得場所:</strong> ${record.location || '未設定'}</div>
                            <div><strong>取得日:</strong> ${this.formatDate(record.date)}</div>
                            <div><strong>座標:</strong> ${lat.toFixed(4)}, ${lon.toFixed(4)}</div>
                `;

                // メモがあれば表示
                if (record.notes) {
                    popupContent += `<div style="margin-top: 8px;"><strong>メモ:</strong> ${this.escapeHtml(record.notes)}</div>`;
                }

                // 写真があれば表示
                if (record.photos && record.photos.length > 0) {
                    popupContent += `
                        <div style="margin-top: 12px; border-top: 1px solid #e0e0e0; padding-top: 8px;">
                            <strong>写真:</strong>
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; margin-top: 4px;">
                    `;
                    record.photos.slice(0, 4).forEach((photo, idx) => {
                        popupContent += `
                            <img src="${photo}" alt="写真${idx + 1}" style="width: 100%; height: auto; border-radius: 4px; cursor: pointer;" onclick="uiManager.viewPhotoModal('${photo}')">
                        `;
                    });
                    if (record.photos.length > 4) {
                        popupContent += `<div style="grid-column: 1 / -1; text-align: center; color: #999; font-size: 12px;">他 ${record.photos.length - 4} 枚</div>`;
                    }
                    popupContent += `</div></div>`;
                }

                popupContent += '</div>';

                marker.bindPopup(popupContent, { maxWidth: 350 });
                marker.addTo(markerGroup);
                markersByRoad[roadNum].push(marker);
            }
        });

        // マーカーが存在する場合、ビューをマーカーに合わせる
        if (markerGroup.getLayers().length > 0) {
            this.map.fitBounds(markerGroup.getBounds(), { padding: [50, 50] });
        }

        // 凡例を更新
        this.updateMapLegend();
    }

    updateMapLegend() {
        const container = document.getElementById('mapLegend');
        
        const prefectureCounts = {};
        let totalWithCoords = 0;

        this.records.forEach(record => {
            if (record.latitude && record.longitude) {
                totalWithCoords++;
                prefectureCounts[record.prefecture] = (prefectureCounts[record.prefecture] || 0) + 1;
            }
        });

        let html = `
            <div class="legend-item">
                <strong>マップ情報</strong><br>
                座標付き記録: ${totalWithCoords}/${this.records.length}
            </div>
        `;

        if (totalWithCoords > 0) {
            html += '<div class="legend-item" style="margin-top: 10px;"><strong>都道府県別</strong></div>';
            Object.entries(prefectureCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .forEach(([prefecture, count]) => {
                    html += `
                        <div class="legend-item">
                            <span class="legend-marker primary"></span>
                            ${prefecture}: ${count}件
                        </div>
                    `;
                });
        } else {
            html += '<div class="legend-item" style="color: #e74c3c; margin-top: 10px;">座標情報がありません</div>';
        }

        container.innerHTML = html;
    }

    // 写真処理機能
    async handlePhotoInput(e) {
        const files = e.target.files;
        if (files.length === 0) return;

        for (let file of files) {
            if (!file.type.startsWith('image/')) {
                this.showToast('画像ファイルのみアップロード可能です', 'error');
                continue;
            }

            // ファイルサイズチェック（5MB以下）
            if (file.size > 5 * 1024 * 1024) {
                this.showToast('画像サイズは5MB以下にしてください', 'error');
                continue;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                // Base64文字列として保存
                const base64String = event.target.result;
                this.photos.push(base64String);
                this.renderPhotoPreview();
            };
            reader.readAsDataURL(file);
        }

        // ファイル入力をリセット
        e.target.value = '';
    }

    renderPhotoPreview() {
        const container = document.getElementById('photoPreview');
        
        if (this.photos.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = this.photos.map((photo, index) => `
            <div class="photo-preview-item">
                <img src="${photo}" alt="プレビュー${index + 1}">
                <button type="button" class="photo-preview-remove" onclick="uiManager.removePhoto(${index})" title="削除">×</button>
            </div>
        `).join('');
    }

    removePhoto(index) {
        this.photos.splice(index, 1);
        this.renderPhotoPreview();
    }

    // 現在地取得機能
    async handleGetCurrentLocation() {
        const btn = document.getElementById('currentLocationBtn');
        btn.disabled = true;
        btn.textContent = '取得中...';

        try {
            const position = await this.getCurrentPosition();
            document.getElementById('manualLatitude').value = position.latitude.toFixed(4);
            document.getElementById('manualLongitude').value = position.longitude.toFixed(4);
            document.getElementById('latitude').value = position.latitude;
            document.getElementById('longitude').value = position.longitude;
            document.getElementById('coordsDisplay').textContent = `✓ 現在地を取得しました (${position.latitude.toFixed(4)}, ${position.longitude.toFixed(4)})`;
            this.showToast('現在地を取得しました', 'success');
        } catch (error) {
            console.error('Geolocation error:', error);
            let errorMsg = '現在地の取得に失敗しました';
            if (error.code === 1) {
                errorMsg = '位置情報の許可が必要です';
            } else if (error.code === 2) {
                errorMsg = 'GPS信号が取得できません';
            } else if (error.code === 3) {
                errorMsg = 'タイムアウトしました';
            }
            this.showToast(errorMsg, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '📍';
        }
    }

    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    });
                },
                (error) => reject(error),
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }

    // 写真表示モーダル
    viewPhotoModal(photoData) {
        // シンプルな写真表示（新しいウィンドウで開く）
        const img = new Image();
        img.src = photoData;
        const w = window.open();
        w.document.write(img.outerHTML);
    }
}

// アプリケーション初期化
let uiManager;
document.addEventListener('DOMContentLoaded', async () => {
    uiManager = new UIManager();
    await uiManager.init();
});
