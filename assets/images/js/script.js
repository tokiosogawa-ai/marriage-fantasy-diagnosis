// =========================================
// 1. グローバル設定・変数
// =========================================
const ANIMATION_DURATION = 300; 
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyqZDDhUkMDC49xNpoXzo2hlSas5USx7oWwVabEGboD1C_P96D_ORmVf8-WKcOuIKJPOQ/exec";

// 診断ステータス
let currentQuestionIndex = 0;
let scores = { O:0, C:0, P:0, F:0, D:0, S:0, A:0, N:0 };
let answerHistory = []; 
let isNavigating = false; 
let currentResultType = null; 

// DOM要素
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
// 2. 初期化・イベントリスナー
// =========================================

// ページ読み込み時にURLパラメータをチェック
window.onload = function() {
    const params = new URLSearchParams(window.location.search);
    const typeParam = params.get('type');

    // データ(typesData)が読み込まれているか確認してから実行
    if (typeParam && typeof typesData !== 'undefined' && typesData[typeParam]) {
        setTimeout(() => {
            showResult(typeParam, false);
        }, 100);
    }
};

// イベントリスナー登録
document.querySelectorAll(".start-trigger").forEach(btn => {
    btn.addEventListener("click", startDiagnosis);
});

document.querySelectorAll(".option-btn").forEach(btn => {
    btn.addEventListener("click", function() {
        const val = parseInt(this.getAttribute("data-value"));
        registerAnswer(val);
    });
});

if(dom.backBtn) {
    dom.backBtn.addEventListener("click", prevQuestion);
}

document.getElementById("menu-btn").addEventListener("click", () => {
    dom.navOverlay.classList.remove("hidden");
});
document.getElementById("close-btn").addEventListener("click", () => {
    dom.navOverlay.classList.add("hidden");
});

const catalogBtn = document.getElementById("menu-catalog-btn");
if (catalogBtn) {
    catalogBtn.addEventListener("click", (e) => {
        e.preventDefault();
        dom.navOverlay.classList.add("hidden");
        showResult("OPDA", true); // 図鑑モード
    });
}


// =========================================
// 3. 画面遷移 & 診断進行ロジック
// =========================================

function startDiagnosis() {
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState(null, null, cleanUrl);

    currentQuestionIndex = 0;
    scores = { O:0, C:0, P:0, F:0, D:0, S:0, A:0, N:0 };
    answerHistory = [];
    isNavigating = false;
    switchScreen("question");
    updateQuestionView();
    window.scrollTo(0, 0);
    if(dom.fixedCta) dom.fixedCta.style.display = "none";
}

function backToTop() {
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.pushState(null, null, cleanUrl);
    switchScreen("top");
    window.scrollTo(0, 0);
    if(dom.navOverlay) dom.navOverlay.classList.add("hidden");
    currentQuestionIndex = 0;
    scores = { O:0, C:0, P:0, F:0, D:0, S:0, A:0, N:0 };
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
    
    // ★追加：結果画面以外では浮遊キャラを隠す
    const floatLayer = document.getElementById('floating-char-layer');
    if (floatLayer) {
        if (screenName === 'result') {
            // 結果画面の時は showResult 側で制御するので何もしない（または表示）
        } else {
            floatLayer.classList.add('hidden');
        }
    }
}

function updateQuestionView() {
    // data.jsのquestionsを使用
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

function getUserId() {
    try {
        let userId = localStorage.getItem('fantasy_user_id');
        if (!userId) {
            userId = 'user_' + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('fantasy_user_id', userId);
        }
        return userId;
    } catch (e) { return "guest_user"; }
}

function saveHistoryLocal(typeKey) {
    try {
        const userId = getUserId();
        const historyData = { userId: userId, type: typeKey, timestamp: new Date().toISOString() };
        localStorage.setItem('fantasy_last_result', JSON.stringify(historyData));
    } catch (e) {}
}

function sendToGoogleSheets(resultType) {
    const payload = {
        result_type: resultType,
        score_O: scores.O, score_C: scores.C,
        score_P: scores.P, score_F: scores.F,
        score_D: scores.D, score_S: scores.S,
        score_A: scores.A, score_N: scores.N,
        device: /Mobi|Android/i.test(navigator.userAgent) ? "Mobile" : "PC"
    };
    fetch(GAS_API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }).catch(e => console.error(e));
}

function finishDiagnosis() {
    switchScreen("loading");
    try {
        const type = calculateType();
        setTimeout(() => { saveHistoryLocal(type); sendToGoogleSheets(type); }, 0);

        let step = 0;
        const loadingText = document.getElementById("loading-text");
        const interval = setInterval(() => {
            step++;
            if(step === 1 && loadingText) loadingText.innerText = "運命の相手を探しています...";
            if(step === 2) {
                clearInterval(interval);
                showResult(type, false); 
            }
        }, 1500);
    } catch (e) {
        showResult("OPDA", false); // Fallback
    }
}

function calculateType() {
    let result = "";
    result += (scores.O >= scores.C) ? "O" : "C";
    result += (scores.P >= scores.F) ? "P" : "F";
    result += (scores.D >= scores.S) ? "D" : "S";
    result += (scores.A >= scores.N) ? "A" : "N";
    // data.jsのtypesDataを使用
    return typesData[result] ? result : "OPDA"; 
}


// =========================================
// 5. RPG結果表示ロジック
// =========================================

function showResult(typeKey, isCatalog = false) {
    currentResultType = typeKey; 
    switchScreen("result");
    window.scrollTo(0, 0);

    const baseData = typesData[typeKey];
    const rpgData = (typeof RPG_EXTENSION !== 'undefined' && RPG_EXTENSION[typeKey]) ? RPG_EXTENSION[typeKey] : RPG_EXTENSION["OPDA"];
    const grandClassKey = typeKey.substring(2, 4);
    const grandClass = grandClasses[grandClassKey];

    setText('res-name', baseData.name);
    setText('res-catch', baseData.catch);
    
    setText('res-intro', baseData.desc);
    setText('res-grand-class', grandClass.name.split(" ")[1]);
    
    // 画像表示処理（修正版）
    const charImg = document.getElementById('res-char-img');
    if (baseData.imageFile) {
        charImg.src = `assets/images/${baseData.imageFile}`;
        charImg.style.display = 'block';
    } else {
        charImg.src = ''; 
        charImg.style.display = 'none';
    }

    // 背景画像処理（キャラがいても背景は消さない）
    const headerBg = document.getElementById('rpg-header-bg');
    if(headerBg) {
        if (baseData.bgImage) {
            headerBg.style.backgroundImage = `url('assets/images/${baseData.bgImage}')`;
            headerBg.style.backgroundSize = 'cover';
            headerBg.style.backgroundPosition = 'center';
            headerBg.style.boxShadow = "inset 0 0 0 2000px rgba(0, 0, 0, 0.3)";
        } else {
            headerBg.style.background = `linear-gradient(135deg, #2d3436, ${grandClass.color})`;
            headerBg.style.boxShadow = "none";
        }
        headerBg.style.borderColor = grandClass.color;
    }

    // ② ステータスチャート
    const statusContainer = document.getElementById('res-status-list');
    
    // ★追加：背景用の画像タグを作成（既存の中身をリセットした直後に入れる）
    let bgImgHtml = '';
    if (baseData.imageFile) {
        bgImgHtml = `<img src="assets/images/${baseData.imageFile}" class="status-bg-chara" alt="">`;
    }
    
    // コンテナの中身を生成（背景画像 + リスト）
    statusContainer.innerHTML = bgImgHtml; 
    
    rpgData.stats.forEach(stat => {
        const row = document.createElement('div');
        row.className = 'status-row';
        const stars = '<span class="stat-stars">' + '★'.repeat(stat.val) + '</span>' + 
                      '<span class="stat-stars" style="color:#e0e0e0">' + '★'.repeat(5 - stat.val) + '</span>';
        const descText = stat.desc ? stat.desc : "";
        row.innerHTML = `<div class="stat-main"><span class="stat-label">${stat.label}</span>${stars}</div><p class="stat-desc-text">${descText}</p>`;
        statusContainer.appendChild(row);
    });

    // グラフ制御
    const chartSection = document.getElementById('chart-section');
    if (chartSection) {
        if (isCatalog) {
            chartSection.classList.add('hidden');
        } else {
            chartSection.classList.remove('hidden');
            renderChart(); 
        }
    }

    // スキル・ドロップ
    setText('res-skill-ult-name', rpgData.skillMap.ultimate.name);
    setText('res-skill-ult-desc', rpgData.skillMap.ultimate.desc);
    setText('res-skill-pas-name', rpgData.skillMap.passive.name);
    setText('res-skill-pas-desc', rpgData.skillMap.passive.desc);
    setText('res-skill-weak-name', rpgData.skillMap.weakness.name);
    setText('res-skill-weak-desc', rpgData.skillMap.weakness.desc);
    
    const lootRaw = rpgData.loot;
    const lootMatch = lootRaw.match(/^(【.*?】)(.*)/s);
    if (lootMatch) {
        const lootHtml = `<span class="loot-item-name">${lootMatch[1]}</span><span class="loot-item-desc">${lootMatch[2].trim()}</span>`;
        setHtml('res-loot-text', lootHtml);
    } else {
        setText('res-loot-text', lootRaw);
    }

    // ④ 攻略ガイド
    // 名前を取得（例：「勇者」）
    const jobName = baseData.name;

    // 1. レベルアップ・クエスト
    if (baseData.quests) {
        const questHtml = baseData.quests.map(q => 
            `<div class="quest-unit"><span class="quest-title">『${q.name}』</span><p class="quest-body">${q.desc}</p></div>`
        ).join('');
        setHtml('res-guide-levelup', questHtml);
        // ★追加：説明文の書き換え
        document.querySelector('.card-blue .card-desc').textContent = `${jobName}のあなたがさらに魅力的になるための、成長ミッション`;
    } else {
        setHtml('res-guide-levelup', "（調査中）");
    }
    
    const manual = baseData.manual || {};
    
    // 2. LINE攻略
    setHtml('res-guide-line', formatList(manual.line));
    // ★追加：説明文の書き換え
    document.querySelector('.card-green .card-desc').textContent = `${jobName}の心を掴むための、連絡の頻度とコツ`;

    // 3. デート戦略
    setHtml('res-guide-date', formatList(manual.date));
    // ★追加：説明文の書き換え
    document.querySelector('.card-pink .card-desc').textContent = `${jobName}との距離がグッと縮まる、推奨シチュエーション`;

    // 4. 取扱説明書
    setHtml('res-guide-woo',  formatList(manual.attention));
    // ★追加：説明文の書き換え
    document.querySelector('.card-secret .card-desc').textContent = `${jobName}を落とす殺し文句と、絶対に踏んではいけない地雷`;

    // 英雄リスト
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

    // シミュレーターリセット
    document.getElementById('sim-result-card').classList.add('hidden');
    document.getElementById('sim-default-view').classList.remove('hidden');
    const simSelect = document.getElementById('sim-selector');
    if(simSelect) simSelect.value = "";
    initPartySimulator(typeKey);

    // フッター
    renderFooterCatalog();

    // ★追加：常駐キャラクターの表示設定
    const floatLayer = document.getElementById('floating-char-layer');
    const floatImg = document.getElementById('floating-char-img');

    if (baseData.imageFile) {
        floatImg.src = `assets/images/${baseData.imageFile}`;
        // 画像読み込み完了後に表示（チラつき防止）
        floatImg.onload = () => {
            floatLayer.classList.remove('hidden');
        };
    } else {
        floatLayer.classList.add('hidden');
    }

    // スクロールリセット
    const questSlider = document.querySelector('.quest-slider-container');
    if (questSlider) questSlider.scrollLeft = 0;
    const soulSlider = document.querySelector('.soul-slider-container');
    if (soulSlider) soulSlider.scrollLeft = 0;

    setTimeout(() => {
        enableDragScroll('.quest-slider-container');
        enableDragScroll('.soul-slider-container');
    }, 100);
}

// チャート描画
function renderChart() {
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
        let winLabel = isLeftDominant ? axis.leftLabel.split(" ")[0] : axis.rightLabel.split(" ")[0];
        let barStyle = isLeftDominant ? `width: ${leftRatio}%; background-color: #c5a059; border-radius: 8px 0 0 8px;` : `width: ${100 - leftRatio}%; margin-left: auto; background-color: #2d3436; border-radius: 0 8px 8px 0;`;
        chartHTML += `<div class="chart-row"><div class="chart-header"><span class="chart-percent">${winPercent}%</span><span class="chart-winner">${winLabel}</span></div><div class="chart-labels"><span>${axis.leftLabel}</span><span>${axis.rightLabel}</span></div><div class="chart-bar-bg"><div class="chart-bar-fill" style="${barStyle}"></div><div class="chart-marker" style="left: ${leftRatio}%;"></div></div></div>`;
    });
    const container = document.getElementById("chart-container");
    if(container) container.innerHTML = chartHTML;
}

// シェア機能
function getBaseUrl() { return window.location.origin + window.location.pathname; }

function shareTwitter() {
    const name = document.getElementById('res-name').textContent;
    const type = document.getElementById('res-grand-class').textContent;
    const shareUrl = `${getBaseUrl()}?type=${currentResultType}`;
    const text = `私の結婚ファンタジー適正は…\n【${name}】（${type}タイプ）でした！\n\n相性の良いパートナーも判明！？\n⚔️ あなたも診断してみる？\n#結婚ファンタジー診断 #RPG診断\n`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
}

function shareLine() {
    const shareUrl = `${getBaseUrl()}?type=${currentResultType}`;
    window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}`, '_blank');
}

function copyToClipboard() {
    const shareUrl = `${getBaseUrl()}?type=${currentResultType}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
        const toast = document.getElementById('toast');
        if(toast) {
            toast.classList.remove('hidden'); toast.classList.add('show');
            setTimeout(() => { toast.classList.remove('show'); toast.classList.add('hidden'); }, 2000);
        } else { alert("リンクをコピーしました！"); }
    });
}

// ヘルパー関数
function setText(id, text) { const el = document.getElementById(id); if(el) el.textContent = text; }
function setHtml(id, html) { const el = document.getElementById(id); if(el) el.innerHTML = html; }
function formatList(list) {
    if (!list || list.length === 0) return "（調査中）";
    if (Array.isArray(list)) {
        return list.map(item => {
            let bodyText = item;
            const tabooMatch = bodyText.match(/(TABOO[:：])(.*)/);
            if (tabooMatch) {
                const mainText = bodyText.replace(tabooMatch[0], '').trim();
                bodyText = `${mainText}<span class="taboo-block"><span class="taboo-icon">🔥</span>TABOO：${tabooMatch[2].trim()}</span>`;
            }
            const titleMatch = bodyText.match(/^【(.*?)】/);
            if (titleMatch) {
                let content = bodyText.replace(titleMatch[0], '').trim();
                return `<div class="quest-unit"><span class="quest-title">【${titleMatch[1]}】</span><div class="quest-body">${content}</div></div>`;
            } else {
                return `<div class="quest-unit"><div class="quest-body">${bodyText}</div></div>`;
            }
        }).join('');
    }
    return list;
}

// シミュレーター
function initPartySimulator(myTypeCode) {
    const myData = typesData[myTypeCode];
    const relationships = myData.relationships;
    const rankOrder = { "★": 6, "◎": 5, "⚪︎": 4, "▲": 3, "×": 2, "🔥": 1 };
    const sortedRels = [...relationships].sort((a, b) => (rankOrder[b.rank] || 0) - (rankOrder[a.rank] || 0));
    
    const bestListContainer = document.getElementById('sim-best-list');
    bestListContainer.innerHTML = '';
    sortedRels.slice(0, 3).forEach((rel, index) => {
        createListItem(bestListContainer, rel, index + 1, myData.name, false);
    });

    const worstListContainer = document.getElementById('sim-worst-list');
    worstListContainer.innerHTML = '';
    const worstRel = sortedRels[sortedRels.length - 1];
    if(worstRel) {
        createListItem(worstListContainer, worstRel, "☠️", myData.name, true);
    }

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
    const newSelect = select.cloneNode(true);
    select.parentNode.replaceChild(newSelect, select);
    newSelect.addEventListener('change', function() { updateSimulator(myTypeCode, this.value); });

    const resetBtn = document.getElementById('sim-reset-btn');
    resetBtn.onclick = () => {
        document.getElementById('sim-result-card').classList.add('hidden');
        document.getElementById('sim-default-view').classList.remove('hidden');
        newSelect.value = "";
        document.querySelector('.sim-control-area').scrollIntoView({behavior: "smooth", block: "center"});
    };
}

function createListItem(container, rel, rankLabel, myName, isWorst) {
    const target = typesData[rel.target];
    const rankInfo = getRankDetail(rel.rank);
    const effectText = rel.effect ? rel.effect : `${myName}と${target.name}の誓い`;
    const effectName = `『${effectText}』`;
    const div = document.createElement('div');
    div.className = isWorst ? 'sim-best-item worst-item' : 'sim-best-item';
    const rankClass = typeof rankLabel === 'number' ? `rank-${rankLabel}` : '';
    div.innerHTML = `<div class="best-rank ${rankClass}">${rankLabel}</div><div class="best-info"><div class="best-job">${target.img} ${target.name} <span class="rank-badge-small">判定:${rankInfo.char}</span></div><div class="best-effect">👉 セット効果：${effectName}</div></div><div class="best-arrow">▶</div>`;
    div.onclick = () => {
        const select = document.getElementById('sim-selector');
        select.value = rel.target;
        const myCode = Object.keys(typesData).find(key => typesData[key].name === myName); 
        updateSimulator(myCode, rel.target);
    };
    container.appendChild(div);
}

function updateSimulator(myCode, targetCode) {
    if (!targetCode) {
        document.getElementById('sim-default-view').classList.remove('hidden');
        document.getElementById('sim-result-card').classList.add('hidden');
        return;
    }
    const myData = typesData[myCode];
    const targetData = typesData[targetCode];
    const rel = myData.relationships.find(r => r.target === targetCode);
    const rankMark = rel ? rel.rank : "-";
    const rankInfo = getRankDetail(rankMark);
    const effectTitle = rel && rel.effect ? `『${rel.effect}』` : `【${myData.name}】×【${targetData.name}】`;
    const effectName = rel && rel.effect ? rel.effect : `連携技：クロス・${targetData.name}`;
    const descText = rel ? rel.desc : "データがありません。";
    const buffs = rel ? rel.buffs : [];

    document.getElementById('sim-default-view').classList.add('hidden');
    const card = document.getElementById('sim-result-card');
    card.classList.remove('hidden');
    document.getElementById('sim-my-name').textContent = myData.name;
    document.getElementById('sim-target-name').textContent = targetData.name;
    document.getElementById('sim-rank-value').textContent = rankInfo.char;
    document.getElementById('sim-rank-desc').textContent = rankInfo.label;
    document.getElementById('sim-rank-value').style.color = rankInfo.color;
    setText('sim-rel-title', effectTitle);     
    setText('sim-effect-name', effectName);    
    setText('sim-desc-text', descText);
    
    const buffsContainer = document.getElementById('sim-buffs-list');
    buffsContainer.innerHTML = '';
    if (buffs.length > 0) {
        buffs.forEach(b => {
            const div = document.createElement('div');
            div.className = 'buff-item';
            div.innerHTML = `<span class="buff-label">${b.icon} ${b.label}</span><span class="buff-val">${b.lvl}</span>`;
            buffsContainer.appendChild(div);
        });
    } else {
        buffsContainer.innerHTML = '<div class="buff-item">データ収集中...</div>';
    }

    setTimeout(() => {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
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

function enableDragScroll(containerClass) {
    const sliders = document.querySelectorAll(containerClass);
    sliders.forEach(slider => {
        let isDown = false;
        let startX;
        let scrollLeft;
        slider.addEventListener('mousedown', (e) => {
            isDown = true;
            slider.classList.add('active');
            startX = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
            slider.style.cursor = 'grabbing';
        });
        slider.addEventListener('mouseleave', () => { isDown = false; slider.style.cursor = 'grab'; });
        slider.addEventListener('mouseup', () => { isDown = false; slider.style.cursor = 'grab'; });
        slider.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - slider.offsetLeft;
            const walk = (x - startX) * 2;
            slider.scrollLeft = scrollLeft - walk;
        });
    });
}

function renderFooterCatalog() {
    const container = document.getElementById("type-list-container");
    if(container.innerHTML !== "") return; 
    const groupKeys = ["DA", "DN", "SA", "SN"];
    groupKeys.forEach(key => {
        const groupInfo = grandClasses[key];
        const groupDiv = document.createElement("div");
        groupDiv.className = "catalog-group";
        groupDiv.innerHTML = `<div class="group-header" style="color:${groupInfo.color}"><span>${groupInfo.name}</span></div><p class="group-desc">${groupInfo.desc}</p>`;
        const gridDiv = document.createElement("div");
        gridDiv.className = "group-grid";
        Object.keys(typesData).forEach(code => {
            if (code.endsWith(key)) {
                const type = typesData[code];
                const btn = document.createElement("div");
                btn.className = "type-icon-btn";
                btn.innerHTML = `<span class="icon">${type.img}</span><span class="label">${type.name}</span>`;
                btn.addEventListener("click", () => {
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