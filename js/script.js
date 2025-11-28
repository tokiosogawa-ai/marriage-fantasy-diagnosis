// =========================================
// 0. ユーザー識別機能 (iOS対応・安全版)
// =========================================

// ★修正：エラーが出ても止まらないように try-catch で囲む
function getUserId() {
    try {
        let userId = localStorage.getItem('fantasy_user_id');
        if (!userId) {
            userId = 'user_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('fantasy_user_id', userId);
        }
        return userId;
    } catch (e) {
        console.warn("LocalStorage is not available (Private Mode?):", e);
        return "guest_user"; // エラー時はゲストとして扱う
    }
}

function saveHistoryLocal(typeKey) {
    try {
        const userId = getUserId();
        const historyData = {
            userId: userId,
            type: typeKey,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('fantasy_last_result', JSON.stringify(historyData));
    } catch (e) {
        console.warn("Failed to save history locally:", e);
        // エラーを握りつぶして、処理を止めない
    }
}

function checkHistory() {
    try {
        const lastResult = localStorage.getItem('fantasy_last_result');
        if (lastResult) {
            const data = JSON.parse(lastResult);
            return data.type;
        }
    } catch (e) {
        console.warn("Failed to load history:", e);
    }
    return null;
}

// =========================================
// 1. グローバル設定・変数
// =========================================
const ANIMATION_DURATION = 300; 

// ★追加：Google Apps ScriptのURL
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyqZDDhUkMDC49xNpoXzo2hlSas5USx7oWwVabEGboD1C_P96D_ORmVf8-WKcOuIKJPOQ/exec";

// 診断ステータス
let currentQuestionIndex = 0;
let scores = { O:0, C:0, P:0, F:0, D:0, S:0, A:0, N:0 };
let answerHistory = []; 
let isNavigating = false; 

// DOM要素（キャッシュ）
const screens = {
    top: document.getElementById("screen-top"),
    question: document.getElementById("screen-question"),
    loading: document.getElementById("screen-loading"),
    result: document.getElementById("screen-result")
};

const dom = {
    progressBar: document.getElementById("progress-bar"),
    currentNum: document.getElementById("current-num"),
    totalNum: document.getElementById("total-num"),
    questionText: document.getElementById("question-text"),
    questionCard: document.getElementById("question-card"),
    backBtn: document.getElementById("back-btn"),
    navOverlay: document.getElementById("nav-overlay"),
    fixedCta: document.querySelector(".fixed-cta")
};


// =========================================
// 2. イベントリスナー設定
// =========================================

// ① 開始ボタン
document.querySelectorAll(".start-trigger").forEach(btn => {
    btn.addEventListener("click", startDiagnosis);
});

// ② 回答ボタン
document.querySelectorAll(".option-btn").forEach(btn => {
    btn.addEventListener("click", function() {
        const val = parseInt(this.getAttribute("data-value"));
        registerAnswer(val);
    });
});

// ③ 戻るボタン
if(dom.backBtn) {
    dom.backBtn.addEventListener("click", prevQuestion);
}

// ④ メニュー制御
document.getElementById("menu-btn").addEventListener("click", () => {
    dom.navOverlay.classList.remove("hidden");
});
document.getElementById("close-btn").addEventListener("click", () => {
    dom.navOverlay.classList.add("hidden");
});

// ⑤ 図鑑ボタン（勇者をデフォルト表示：図鑑モード）
const catalogBtn = document.getElementById("menu-catalog-btn");
if (catalogBtn) {
    catalogBtn.addEventListener("click", (e) => {
        e.preventDefault();
        dom.navOverlay.classList.add("hidden");
        showResult("OPDA", true); // 図鑑モードとして表示（グラフ非表示）
    });
}


// =========================================
// 3. 画面遷移 & 診断進行ロジック
// =========================================

function startDiagnosis() {
    currentQuestionIndex = 0;
    scores = { O:0, C:0, P:0, F:0, D:0, S:0, A:0, N:0 };
    answerHistory = [];
    isNavigating = false;
    switchScreen("question");
    updateQuestionView();
    window.scrollTo(0, 0);
    if(dom.fixedCta) dom.fixedCta.style.display = "none";
}

function switchScreen(screenName) {
    Object.keys(screens).forEach(key => {
        if (key === screenName) return;
        screens[key].classList.remove("active");
        screens[key].classList.add("hidden");
    });
    const target = screens[screenName];
    target.classList.remove("hidden");
    setTimeout(() => { target.classList.add("active"); }, 50);
}

function updateQuestionView() {
    const q = questions[currentQuestionIndex];
    dom.questionText.innerText = `Q${currentQuestionIndex + 1}. ${q.text}`;
    dom.currentNum.innerText = currentQuestionIndex + 1;
    dom.totalNum.innerText = questions.length;
    
    const pct = ((currentQuestionIndex) / questions.length) * 100;
    dom.progressBar.style.width = `${pct}%`;

    dom.backBtn.style.display = (currentQuestionIndex === 0) ? "none" : "inline-block";
}

function registerAnswer(value) {
    if (isNavigating) return;
    isNavigating = true;

    const q = questions[currentQuestionIndex];
    answerHistory.push({ type: q.type, value: value });
    scores[q.type] += value;

    dom.questionCard.classList.add("fade-out-left");

    setTimeout(() => {
    currentQuestionIndex++;
    if (currentQuestionIndex < questions.length) {
            updateQuestionView();
            dom.questionCard.classList.remove("fade-out-left");
            dom.questionCard.classList.add("fade-in-right");
            setTimeout(() => {
                dom.questionCard.classList.remove("fade-in-right");
                isNavigating = false;
            }, 50);
    } else {
        finishDiagnosis();
    }
    }, ANIMATION_DURATION);
}

function prevQuestion() {
    if (currentQuestionIndex === 0) return;
    if (isNavigating) return;
    const lastAnswer = answerHistory.pop();
    if (lastAnswer) scores[lastAnswer.type] -= lastAnswer.value;
    currentQuestionIndex--;
    updateQuestionView();
}

// =========================================
// 5. 結果計算・表示ロジック (安全版)
// =========================================

/**
 * 診断終了処理
 */
function finishDiagnosis() {
    switchScreen("loading");
    
    // エラーが起きても止まらないように包む
    try {
        const type = calculateType();
        
        // バックグラウンド処理（失敗しても無視）
        setTimeout(() => {
            saveHistoryLocal(type);     // ローカル保存
            sendToGoogleSheets(type);   // GAS送信
        }, 0);

        // 演出：少し待たせる（ここは絶対に実行させる）
        let step = 0;
        const loadingText = document.getElementById("loading-text");
        const interval = setInterval(() => {
            step++;
            if(step === 1) {
                if(loadingText) loadingText.innerText = "運命の相手を探しています...";
            }
            if(step === 2) {
                clearInterval(interval);
                showResult(type); // 結果表示へ
            }
        }, 1500);

    } catch (e) {
        console.error("Diagnosis Error:", e);
        // 万が一エラーが出ても、強制的にデフォルト結果（勇者）を表示して救済する
        alert("エラーが発生しましたが、結果を表示します。");
        showResult("OPDA"); 
    }
}

function calculateType() {
    let result = "";
    result += (scores.O >= scores.C) ? "O" : "C";
    result += (scores.P >= scores.F) ? "P" : "F";
    result += (scores.D >= scores.S) ? "D" : "S";
    result += (scores.A >= scores.N) ? "A" : "N";
    return typesData[result] ? result : "OPDA"; 
}


// =========================================
// 5. RPG結果表示ロジック
// =========================================

// 第2引数 isCatalog で「図鑑モードかどうか」を判定
function showResult(typeKey, isCatalog = false) {
    // 画面切り替え
    switchScreen("result");
    window.scrollTo(0, 0);

    // データ取得
    const baseData = typesData[typeKey];
    const rpgData = (typeof RPG_EXTENSION !== 'undefined' && RPG_EXTENSION[typeKey]) 
                    ? RPG_EXTENSION[typeKey] 
                    : RPG_EXTENSION["OPDA"];
    
    const grandClassKey = typeKey.substring(2, 4);
    const grandClass = grandClasses[grandClassKey];

    // ① ヘッダー情報の注入
    setText('res-name', baseData.name);
    setText('res-catch', baseData.catch);
    setText('res-img', baseData.img);
    setText('res-intro', baseData.desc);
    setText('res-grand-class', grandClass.name.split(" ")[1]);
    setText('res-rarity', rpgData.rarity);
    
    const headerBg = document.getElementById('rpg-header-bg');
    if(headerBg) {
        headerBg.style.background = `linear-gradient(135deg, #2d3436, ${grandClass.color})`;
        headerBg.style.borderColor = grandClass.color;
    }

    // ② ステータスチャート
    const statusContainer = document.getElementById('res-status-list');
    statusContainer.innerHTML = '';
    rpgData.stats.forEach(stat => {
        const row = document.createElement('div');
        row.className = 'status-row';
        const stars = '<span class="stat-stars">' + '★'.repeat(stat.val) + '</span>' + 
                      '<span class="stat-stars" style="color:#e0e0e0">' + '★'.repeat(5 - stat.val) + '</span>';
        const descText = stat.desc ? stat.desc : "";
        row.innerHTML = `
            <div class="stat-main">
                <span class="stat-label">${stat.label}</span>
                ${stars}
            </div>
            <p class="stat-desc-text">${descText}</p>
        `;
        statusContainer.appendChild(row);
    });

    // ★ グラフの表示制御（図鑑モードなら非表示）
    const chartSection = document.getElementById('chart-section');
    if (chartSection) {
        if (isCatalog) {
            chartSection.classList.add('hidden');
        } else {
            chartSection.classList.remove('hidden');
            renderChart();
        }
    }

    // ③ バトルスキル & ドロップ
    setText('res-skill-ult-name', rpgData.skillMap.ultimate.name);
    setText('res-skill-ult-desc', rpgData.skillMap.ultimate.desc);
    setText('res-skill-pas-name', rpgData.skillMap.passive.name);
    setText('res-skill-pas-desc', rpgData.skillMap.passive.desc);
    setText('res-skill-weak-name', rpgData.skillMap.weakness.name);
    setText('res-skill-weak-desc', rpgData.skillMap.weakness.desc);
    setText('res-loot-text', rpgData.loot);

    // ④ 攻略ガイド
    if (baseData.quests) {
        const questHtml = baseData.quests.map(q => 
            `<div class="quest-unit">
                <span class="quest-title">『${q.name}』</span>
                <p class="quest-body">${q.desc}</p>
             </div>`
        ).join('');
        setHtml('res-guide-levelup', questHtml);
    } else {
        setHtml('res-guide-levelup', "（調査中）");
    }
    
    const manual = baseData.manual || {};
    setHtml('res-guide-line', formatList(manual.line));
    setHtml('res-guide-date', formatList(manual.date));
    setHtml('res-guide-woo',  formatList(manual.attention));

    // ⑤ 異界の英雄
    const soulContainer = document.getElementById('res-soul-tags');
    soulContainer.innerHTML = '';
    if(baseData.celebs){
        baseData.celebs.forEach(c => {
            const div = document.createElement('div');
            div.className = 'celeb-tag';
            const name = typeof c === 'string' ? c : c.name;
            const typeLabel = typeof c === 'string' ? 'HERO' : c.type;
            div.innerHTML = `<span class="type">${typeLabel}</span><span>${name}</span>`;
            soulContainer.appendChild(div);
        });
    }

    // ⑥ シミュレーター（リセットしてから初期化）
    const simResultCard = document.getElementById('sim-result-card');
    const simDefaultView = document.getElementById('sim-default-view');
    if (simResultCard) simResultCard.classList.add('hidden');
    if (simDefaultView) simDefaultView.classList.remove('hidden');
    const simSelect = document.getElementById('sim-selector');
    if (simSelect) simSelect.value = "";

    initPartySimulator(typeKey);

    // ⑦ フッター
    renderFooterCatalog();

    // ★PCでのドラッグスクロールを有効化（攻略ガイド & 英雄リスト）
    setTimeout(() => {
        enableDragScroll('.quest-slider-container');
        enableDragScroll('.soul-slider-container');
    }, 100);
}

// =========================================
// PC用 ドラッグスクロール機能
// =========================================
function enableDragScroll(containerClass) {
    const sliders = document.querySelectorAll(containerClass);
    
    sliders.forEach(slider => {
        let isDown = false;
        let startX;
        let scrollLeft;

        slider.addEventListener('mousedown', (e) => {
            isDown = true;
            slider.classList.add('active'); // 必要ならCSSで cursor: grabbing; をつける
            startX = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
            // ドラッグ開始時の誤クリック防止のため
            slider.style.cursor = 'grabbing';
        });

        slider.addEventListener('mouseleave', () => {
            isDown = false;
            slider.style.cursor = 'grab';
        });

        slider.addEventListener('mouseup', () => {
            isDown = false;
            slider.style.cursor = 'grab';
        });

        slider.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault(); // 文字選択などを防ぐ
            const x = e.pageX - slider.offsetLeft;
            const walk = (x - startX) * 2; // スクロール速度（*2で少し速く）
            slider.scrollLeft = scrollLeft - walk;
        });
    });
}

// =========================================
// 魂の成分チャート描画（修正版）
// =========================================
function renderChart() {
    // ラベルを専門的＆アルファベット付きに変更
    const axes = [
        { left: "O", right: "C", leftLabel: "独創性 (O)", rightLabel: "協調性 (C)" },
        { left: "P", right: "F", leftLabel: "規律性 (P)", rightLabel: "柔軟性 (F)" },
        { left: "D", right: "S", leftLabel: "主導性 (D)", rightLabel: "支援性 (S)" },
        { left: "A", right: "N", leftLabel: "野心 (A)", rightLabel: "安定 (N)" }
    ];

    let chartHTML = "";
    axes.forEach(axis => {
        const scoreL = scores[axis.left];
        const scoreR = scores[axis.right];
        const total = scoreL + scoreR;

        let leftRatio = total === 0 ? 50 : Math.round((scoreL / total) * 100);

        let isLeftDominant = leftRatio >= 50;
        let winPercent = isLeftDominant ? leftRatio : (100 - leftRatio);
        // 勝った方のラベル（日本語部分だけ）を表示
        let winLabel = isLeftDominant
            ? axis.leftLabel.split(" ")[0]
            : axis.rightLabel.split(" ")[0];

        let barStyle = "";
        let barColor = "#c5a059";

        if (isLeftDominant) {
            barStyle = `width: ${leftRatio}%; background-color: ${barColor}; border-radius: 8px 0 0 8px;`;
        } else {
            barStyle = `width: ${100 - leftRatio}%; margin-left: auto; background-color: #2d3436; border-radius: 0 8px 8px 0;`;
        }

        let markerPos = leftRatio;

        chartHTML += `
            <div class="chart-row">
                <div class="chart-header">
                    <span class="chart-percent">${winPercent}%</span>
                    <span class="chart-winner">${winLabel}</span>
                </div>
                <div class="chart-labels">
                    <span>${axis.leftLabel}</span>
                    <span>${axis.rightLabel}</span>
                </div>
                <div class="chart-bar-bg">
                    <div class="chart-bar-fill" style="${barStyle}"></div>
                    <div class="chart-marker" style="left: ${markerPos}%;"></div>
                </div>
            </div>
        `;
    });

    const container = document.getElementById("chart-container");
    if (container) container.innerHTML = chartHTML;
}

// -----------------------------------------
// ヘルパー関数群
// -----------------------------------------

function setText(id, text) {
    const el = document.getElementById(id);
    if(el) el.textContent = text;
}

function setHtml(id, html) {
    const el = document.getElementById(id);
    if(el) el.innerHTML = html;
}

// ★修正：リスト整形関数（TABOO対応版）
function formatList(list) {
    if (!list || list.length === 0) return "（調査中）";
    
    if (Array.isArray(list)) {
        return list.map(item => {
            // 1. TABOOの処理
            // "TABOO：" または "TABOO:" を見つけたら、改行して警告スタイルにする
            let bodyText = item;
            const tabooMatch = bodyText.match(/(TABOO[:：])(.*)/);
            
            if (tabooMatch) {
                // TABOO部分を削除した本文 + TABOO専用ブロック
                const mainText = bodyText.replace(tabooMatch[0], '').trim();
                const tabooContent = tabooMatch[2].trim();
                
                // 本文があれば表示、その後にTABOOブロック
                bodyText = `${mainText}
                    <span class="taboo-block">
                        <span class="taboo-icon">🔥</span>TABOO：${tabooContent}
                    </span>`;
            }

            // 2. 【タイトル】の処理
            const titleMatch = bodyText.match(/^【(.*?)】/);
            
            if (titleMatch) {
                // タイトルを除去した本文を取得（TABOOタグが含まれている可能性あり）
                // ※TABOO処理で置換済みの場合は、タイトル部分だけを除去
                let content = bodyText.replace(titleMatch[0], '').trim();
                
                return `<div class="quest-unit">
                            <span class="quest-title">【${titleMatch[1]}】</span>
                            <div class="quest-body">${content}</div>
                        </div>`;
            } else {
                // タイトルがない場合（レベルアップクエストなど）
                return `<div class="quest-unit">
                            <div class="quest-body">${bodyText}</div>
                        </div>`;
            }
        }).join('');
    }
    return list;
}

// =========================================
// パーティ編成シミュレーター ロジック (修正版)
// =========================================

function initPartySimulator(myTypeCode) {
    const myData = typesData[myTypeCode];
    const relationships = myData.relationships;

    // ランク順にソート
    const rankOrder = { "★": 6, "◎": 5, "⚪︎": 4, "▲": 3, "×": 2, "🔥": 1 };
    const sortedRels = [...relationships].sort((a, b) => (rankOrder[b.rank] || 0) - (rankOrder[a.rank] || 0));
    
    // 1. ベスト3リスト
    const bestListContainer = document.getElementById('sim-best-list');
    bestListContainer.innerHTML = '';
    sortedRels.slice(0, 3).forEach((rel, index) => {
        createListItem(bestListContainer, rel, index + 1, myData.name, false);
    });

    // 2. ワースト1リスト
    const worstListContainer = document.getElementById('sim-worst-list');
    worstListContainer.innerHTML = '';
    const worstRel = sortedRels[sortedRels.length - 1];
    if (worstRel) {
        createListItem(worstListContainer, worstRel, "☠️", myData.name, true);
    }

    // 3. プルダウン
    const select = document.getElementById('sim-selector');
    select.innerHTML = '<option value="">相手のジョブを選択してください ▼</option>';
    Object.keys(typesData).forEach(code => {
        if (code === myTypeCode) return; 
        const type = typesData[code];
        const option = document.createElement('option');
        option.value = code;
        option.textContent = `${type.img} ${type.name}`;
        select.appendChild(option);
    });

    // イベントリスナー再登録
    const newSelect = select.cloneNode(true);
    select.parentNode.replaceChild(newSelect, select);
    
    newSelect.addEventListener('change', function() {
        updateSimulator(myTypeCode, this.value);
    });

    const resetBtn = document.getElementById('sim-reset-btn');
    resetBtn.onclick = () => {
        document.getElementById('sim-result-card').classList.add('hidden');
        newSelect.value = "";
        document.querySelector('.sim-control-area').scrollIntoView({behavior: "smooth", block: "center"});
    };
}

// リストアイテム生成ヘルパー（微修正版）
function createListItem(container, rel, rankLabel, myName, isWorst) {
    const target = typesData[rel.target];
    const rankInfo = getRankDetail(rel.rank);

    // データ内の effect があれば優先して使う
    const effectText = rel.effect ? rel.effect : `${myName}と${target.name}の誓い`;
    const effectName = `『${effectText}』`;

    const div = document.createElement('div');
    div.className = isWorst ? 'sim-best-item worst-item' : 'sim-best-item';

    // rankLabel が数字の場合はクラスを付与
    const rankClass = typeof rankLabel === 'number' ? `rank-${rankLabel}` : '';

    div.innerHTML = `
        <div class="best-rank ${rankClass}">${rankLabel}</div>
        <div class="best-info">
            <div class="best-job">
                ${target.img} ${target.name} 
                <span class="rank-badge-small">判定:${rankInfo.char}</span>
            </div>
            <div class="best-effect">👉 セット効果：${effectName}</div>
        </div>
        <div class="best-arrow">▶</div>
    `;
    div.onclick = () => {
        const select = document.getElementById('sim-selector');
        select.value = rel.target;
        const myCode = Object.keys(typesData).find(key => typesData[key].name === myName); 
        updateSimulator(myCode, rel.target);
    };
    container.appendChild(div);
}

// シミュレーター更新処理 (修正版)
function updateSimulator(myCode, targetCode) {
    // 「選択してください（空）」が選ばれた場合はリセットして戻る
    if (!targetCode) {
        const defaultView = document.getElementById('sim-default-view');
        const card = document.getElementById('sim-result-card');
        if (defaultView) defaultView.classList.remove('hidden');
        if (card) card.classList.add('hidden');
        return;
    }

    const myData = typesData[myCode];
    const targetData = typesData[targetCode];
    const rel = myData.relationships.find(r => r.target === targetCode);

    // データ取得
    const rankMark = rel ? rel.rank : "-";
    const rankInfo = getRankDetail(rankMark);

    // データ内の effect を使う
    const effectTitle = rel && rel.effect ? `『${rel.effect}』` : `【${myData.name}】×【${targetData.name}】`;
    const descText = rel && rel.desc ? rel.desc : "データがありません。";
    const buffs = rel && Array.isArray(rel.buffs) ? rel.buffs : [];

    // 画面切り替え
    const defaultView = document.getElementById('sim-default-view');
    if (defaultView) defaultView.classList.add('hidden');
    const card = document.getElementById('sim-result-card');
    card.classList.remove('hidden');

    // 内容注入
    document.getElementById('sim-my-name').textContent = myData.name;
    document.getElementById('sim-target-name').textContent = targetData.name;
    document.getElementById('sim-rank-value').textContent = rankInfo.char;
    document.getElementById('sim-rank-desc').textContent = rankInfo.label;
    document.getElementById('sim-rank-value').style.color = rankInfo.color;

    // セット効果タイトルと説明文
    setText('sim-effect-title', effectTitle);
    setText('sim-desc-text', descText);

    // ステータス補正リスト生成（毎回クリアしてから追加）
    const buffsContainer = document.getElementById('sim-buffs-list');
    buffsContainer.innerHTML = '';

    if (buffs.length > 0) {
        buffs.forEach(b => {
            const div = document.createElement('div');
            div.className = 'buff-item';
            div.innerHTML = `
                <span class="buff-label">${b.icon} ${b.label}</span>
                <span class="buff-val">${b.lvl}</span>
            `;
            buffsContainer.appendChild(div);
        });
    } else {
        buffsContainer.innerHTML = '<div class="buff-item">データ収集中...</div>';
    }
}

function getRankDetail(mark) {
    const map = {
        "★": { char: "SS", label: "運命の相手", color: "#ffd700" },
        "◎": { char: "S",  label: "最高の相棒", color: "#ffd700" },
        "⚪︎": { char: "A",  label: "良好な関係", color: "#8bc34a" },
        "▲": { char: "B",  label: "努力が必要", color: "#9e9e9e" },
        "×": { char: "C",  label: "衝突注意",   color: "#607d8b" },
        "🔥": { char: "D",  label: "壊滅的",     color: "#ff4757" }
    };
    return map[mark] || { char: "?", label: "判定不能", color: "#ccc" };
}

// シェア機能
// =========================================
// シェア機能 (Share Functions)
// =========================================

// 現在のページURLを取得
const currentUrl = window.location.href;

// X (Twitter) シェア
function shareTwitter() {
    const name = document.getElementById('res-name').textContent;
    const type = document.getElementById('res-grand-class').textContent;
    const text = `私の結婚ファンタジー適正は…\n【${name}】（${type}タイプ）でした！\n\n相性の良いパートナーも判明！？\n⚔️ あなたも診断してみる？\n#結婚ファンタジー診断 #RPG診断\n`;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(currentUrl)}`;
    window.open(shareUrl, '_blank');
}

// LINE シェア
function shareLine() {
    const shareUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(currentUrl)}`;
    window.open(shareUrl, '_blank');
}

// URLコピー機能
function copyToClipboard() {
    navigator.clipboard.writeText(currentUrl).then(() => {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.classList.remove('hidden');
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            toast.classList.add('hidden');
        }, 2000);
    }).catch(err => {
        console.error('コピーに失敗しました', err);
    });
}

// =========================================
// トップに戻る機能 (Reset & Scroll Top)
// =========================================
function backToTop() {
    // 1. 画面をトップ（LP）に切り替え
    switchScreen("top");
    
    // 2. スクロール位置を強制的に一番上へ
    window.scrollTo(0, 0);

    // 3. メニューが開いていたら閉じる
    if(dom.navOverlay) dom.navOverlay.classList.add("hidden");
    
    // 4. 内部データをリセット（次回の診断のため）
    currentQuestionIndex = 0;
    scores = { O:0, C:0, P:0, F:0, D:0, S:0, A:0, N:0 };
}

// =========================================
// データ送信機能 (Google Sheets)
// =========================================
function sendToGoogleSheets(resultType) {
    // 送信するデータを作成
    const payload = {
        result_type: resultType,
        score_O: scores.O,
        score_C: scores.C,
        score_P: scores.P,
        score_F: scores.F,
        score_D: scores.D,
        score_S: scores.S,
        score_A: scores.A,
        score_N: scores.N,
        // PCかスマホか簡易判定
        device: /Mobi|Android/i.test(navigator.userAgent) ? "Mobile" : "PC"
    };

    // 非同期で送信（結果を待たずに画面遷移させるため、awaitはしない）
    fetch(GAS_API_URL, {
        method: "POST",
        mode: "no-cors", // CORSエラー回避のため（レスポンスは読めないが送信はできる）
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    })
    .then(() => {
        console.log("Data sent to spreadsheet successfully.");
    })
    .catch(err => {
        console.error("Failed to send data:", err);
    });
}

// フッターカタログ生成
function renderFooterCatalog() {
    const container = document.getElementById("type-list-container");
    if(container.innerHTML !== "") return; 

    const groupKeys = ["DA", "DN", "SA", "SN"];
    
    groupKeys.forEach(key => {
        const groupInfo = grandClasses[key];
        const groupDiv = document.createElement("div");
        groupDiv.className = "catalog-group";
        
        groupDiv.innerHTML = `
            <div class="group-header" style="color:${groupInfo.color}">
                <span>${groupInfo.name}</span>
            </div>
            <p class="group-desc">${groupInfo.desc}</p>
        `;
        
        const gridDiv = document.createElement("div");
        gridDiv.className = "group-grid";
        
        Object.keys(typesData).forEach(code => {
            if (code.endsWith(key)) {
                const type = typesData[code];
                const btn = document.createElement("div");
                btn.className = "type-icon-btn";
                btn.innerHTML = `<span class="icon">${type.img}</span><span class="label">${type.name}</span>`;
                
                btn.addEventListener("click", () => {
                    // 図鑑モードとして表示（グラフは非表示）
                    showResult(code, true);
                    window.scrollTo(0,0);
                });
                gridDiv.appendChild(btn);
            }
        });
        
        groupDiv.appendChild(gridDiv);
        container.appendChild(groupDiv);
    });
}