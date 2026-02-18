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
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        const roadNumber = document.getElementById('roadNumber').value;
        const prefecture = document.getElementById('prefecture').value;
        const location = document.getElementById('location').value;
        const date = document.getElementById('date').value;
        const notes = document.getElementById('notes').value;

        // バリデーション
        if (!roadNumber || !prefecture || !date) {
            this.showToast('必須項目を入力してください', 'error');
            return;
        }

        const record = {
            roadNumber: parseInt(roadNumber),
            prefecture,
            location,
            date,
            notes,
            createdAt: new Date().toISOString()
        };

        try {
            await this.db.addRecord(record);
            this.showToast('ステッカー記録を追加しました！', 'success');
            document.getElementById('addForm').reset();
            this.setTodayAsDefault();
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

        container.innerHTML = sorted.map(record => `
            <div class="record-card">
                <div class="record-header">
                    <span class="record-road">国道${record.roadNumber}</span>
                    <span class="record-prefecture">${record.prefecture}</span>
                </div>
                <div class="record-details">
                    ${record.location ? `<div class="record-detail-item"><strong>取得場所:</strong> ${this.escapeHtml(record.location)}</div>` : ''}
                    <div class="record-detail-item"><strong>取得日:</strong> ${this.formatDate(record.date)}</div>
                    ${record.notes ? `<div class="record-detail-item"><strong>メモ:</strong> ${this.escapeHtml(record.notes)}</div>` : ''}
                </div>
                <div class="record-actions">
                    <button class="btn-edit btn-small" onclick="uiManager.handleEditRecord(${record.id})">編集</button>
                    <button class="btn-delete btn-small" onclick="uiManager.handleDeleteRecord(${record.id})">削除</button>
                </div>
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
}

// アプリケーション初期化
let uiManager;
document.addEventListener('DOMContentLoaded', async () => {
    uiManager = new UIManager();
    await uiManager.init();
});
