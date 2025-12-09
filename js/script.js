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
// =========================================
// 2. 初期化・イベントリスナー
// =========================================

window.onload = function() {
    // data.jsの読み込みチェック
    if (typeof typesData === 'undefined') {
        console.error("data.js not loaded.");
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const typeParam = params.get('type');
    const modeParam = params.get('mode');

    // 診断結果パラメータがある場合のみ処理
    if (typeParam && typesData[typeParam]) {
        setTimeout(() => {
            // ★修正ポイント：
            // URLから来た場合はスコアデータがないので、ダミーを入れてエラーを防ぎつつ、
            // 第2引数を true (図鑑モード/グラフ非表示) にしてグラフを隠します。
            
            if(typeof scores === 'undefined') {
                scores = { O:50, C:50, P:50, F:50, D:50, S:50, A:50, N:50 };
            }
            
            // 図鑑モード(catalog) または 通常のシェアリンクの場合もグラフを隠す
            // (自分が診断直後でない限り、正確なグラフは出せないため)
            showResult(typeParam, true); 
            
            // 画面切り替え
            if(typeof switchScreen === 'function') switchScreen("result");
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

const menuBtn = document.getElementById("menu-btn");
if (menuBtn) {
    menuBtn.addEventListener("click", () => {
        const nav = document.getElementById("nav-overlay");
        if(nav) nav.classList.remove("hidden");
        const naviLayer = document.getElementById('question-navi-layer');
        if (naviLayer) naviLayer.classList.add("hidden");
    });
}

const closeBtn = document.getElementById("close-btn");
if (closeBtn) {
    closeBtn.addEventListener("click", () => {
        const nav = document.getElementById("nav-overlay");
        if(nav) nav.classList.add("hidden");
        
        const naviLayer = document.getElementById('question-navi-layer');
        const questionScreen = document.getElementById('screen-question');
        if (naviLayer && questionScreen && questionScreen.classList.contains('active')) {
            naviLayer.classList.remove("hidden");
        }
    });
}

const catalogBtn = document.getElementById("menu-catalog-btn");
if (catalogBtn) {
    catalogBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const nav = document.getElementById("nav-overlay");
        if(nav) nav.classList.add("hidden");
        showResult("OPDA", true); 
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
    
    // キャラの出し分け
    const floatLayer = document.getElementById('floating-char-layer');
    if (floatLayer) {
        if (screenName === 'result') { /* showResultで制御 */ }
        else { floatLayer.classList.add('hidden'); }
    }

    const naviLayer = document.getElementById('question-navi-layer');
    if (naviLayer) {
        if (screenName === 'question') { naviLayer.classList.remove('hidden'); }
        else { naviLayer.classList.add('hidden'); }
    }
}

function updateQuestionView() {
    // data.jsのquestionsを使う
    const q = questions[currentQuestionIndex];
    dom.questionText.innerText = `Q${currentQuestionIndex + 1}. ${q.text}`;
    dom.currentNum.innerText = currentQuestionIndex + 1;
    dom.totalNum.innerText = questions.length;
    
    const pct = ((currentQuestionIndex) / questions.length) * 100;
    dom.progressBar.style.width = `${pct}%`;

    dom.backBtn.style.display = (currentQuestionIndex === 0) ? "none" : "inline-block";

    // 妖精のセリフ更新
    const fukidashi = document.querySelector('.navi-fukidashi');
    if (fukidashi) {
        let msg = "";
        const current = currentQuestionIndex + 1;
        const total = questions.length;

        if (current === 1) msg = "直感で答えてね！";
        else if (current === 10) msg = "どんなタイプになるのかな？";
        else if (current === 20) msg = "運命の人が見つかるかも…！";
        else if (current === 30) msg = "折り返し地点だよ！";
        else if (current === 40) msg = "あなたの性格が見えてきたよ";
        else if (current === 50) msg = "ラストスパート！！";
        else if (current === total) msg = "最後の質問だよ！";

        if (msg) {
            fukidashi.textContent = msg;
            fukidashi.style.animation = 'none';
            fukidashi.offsetHeight;
            fukidashi.style.animation = 'pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        }
    }
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

// 履歴保存（スコアも追加）
function saveHistoryLocal(typeKey) {
    try {
        const userId = getUserId();
        const historyData = { 
            userId: userId, 
            type: typeKey, 
            timestamp: new Date().toISOString(),
            scores: scores // ★追加：スコアも保存する！
        };
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

    // テーマカラー
    document.body.className = '';
    document.body.classList.add(`theme-${grandClass.id}`);

    // ヘッダー情報
    const nameEl = document.getElementById('res-name');
    nameEl.innerHTML = `${baseData.name} <span class="type-code-label">(${typeKey})</span>`;
    
    setText('res-catch', baseData.catch);
    setText('res-intro', baseData.desc);
    setText('res-grand-class', grandClass.name.split(" ")[1]);

    // THE STORYの色
    const introBox = document.querySelector('.rpg-intro-box');
    const introIcon = document.querySelector('.intro-icon');
    if (introBox && introIcon) {
        introBox.style.borderTopColor = grandClass.color;
        introIcon.style.backgroundColor = grandClass.color;
        introIcon.style.boxShadow = `0 4px 10px ${grandClass.color}66`;
    }
    
    // 画像表示
    const charImg = document.getElementById('res-char-img');
    if (baseData.imageFile) {
        charImg.src = `assets/images/${baseData.imageFile}`;
        charImg.style.display = 'block';
    } else {
        charImg.src = ''; 
        charImg.style.display = 'none';
    }

    // 背景画像
    const headerBg = document.getElementById('rpg-header-bg');
    if(headerBg) {
        // スタイルリセット
        headerBg.style.background = ''; 
        headerBg.style.backgroundImage = '';

        if (baseData.bgImage) {
            const grad = `linear-gradient(135deg, rgba(45, 52, 54, 0.4), rgba(45, 52, 54, 0.4))`;
            const img = `url('assets/images/${baseData.bgImage}')`;
            headerBg.style.backgroundImage = `${grad}, ${img}`;
            headerBg.style.backgroundSize = 'cover';
            headerBg.style.backgroundPosition = 'center';
            headerBg.style.boxShadow = "none";
        } else {
            headerBg.style.background = `linear-gradient(135deg, #2d3436, ${grandClass.color})`;
            headerBg.style.boxShadow = "none";
        }
        headerBg.style.borderColor = grandClass.color;
    }

    // ステータス（透かし画像付き）
    const statusContainer = document.getElementById('res-status-list');
    let bgImgHtml = '';
    if (baseData.imageFile) {
        bgImgHtml = `<img src="assets/images/${baseData.imageFile}" class="status-bg-chara" alt="">`;
    }
    statusContainer.innerHTML = bgImgHtml;
    
    rpgData.stats.forEach(stat => {
        const row = document.createElement('div');
        row.className = 'status-row';
        const stars = '<span class="stat-stars">' + '★'.repeat(stat.val) + '</span>' + 
                      '<span class="stat-stars" style="color:#e0e0e0">' + '★'.repeat(5 - stat.val) + '</span>';
        row.innerHTML = `<div class="stat-main"><span class="stat-label">${stat.label}</span>${stars}</div><p class="stat-desc-text">${stat.desc}</p>`;
        statusContainer.appendChild(row);
    });

    // グラフ
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

    // 攻略ガイド（動的タイトル）
    const jobName = baseData.name;
    if (baseData.quests) {
        const questHtml = baseData.quests.map(q => 
            `<div class="quest-unit"><span class="quest-title">『${q.name}』</span><p class="quest-body">${q.desc}</p></div>`
        ).join('');
        setHtml('res-guide-levelup', questHtml);
        document.querySelector('.card-blue .card-desc').textContent = `${jobName}のあなたがさらに魅力的になるための、成長ミッション`;
    }
    
    const manual = baseData.manual || {};
    setHtml('res-guide-line', formatList(manual.line));
    document.querySelector('.card-green .card-desc').textContent = `${jobName}の心を掴むための、連絡の頻度とコツ`;

    setHtml('res-guide-date', formatList(manual.date));
    document.querySelector('.card-pink .card-desc').textContent = `${jobName}との距離がグッと縮まる、推奨シチュエーション`;

    setHtml('res-guide-woo',  formatList(manual.attention));
    document.querySelector('.card-secret .card-desc').textContent = `${jobName}を落とす殺し文句と、絶対に踏んではいけない地雷`;


    // 英雄リスト
    const soulContainer = document.getElementById('res-soul-tags');
    soulContainer.innerHTML = '';
    if (baseData.celebs) {
        baseData.celebs.forEach(c => {
            const div = document.createElement('div');
            let categoryClass = 'tag-default';
            if (c.type && c.type.includes('男')) categoryClass = 'tag-male';
            else if (c.type && c.type.includes('女')) categoryClass = 'tag-female';
            else if (c.type && c.type.includes('キャラ')) categoryClass = 'tag-char';
            else if (c.type && (c.type.includes('海外') || c.type.includes('偉人'))) categoryClass = 'tag-global';
            else if (c.type && (c.type.includes('芸人') || c.type.includes('文化人') || c.type.includes('論破'))) categoryClass = 'tag-fun';

            div.className = `celeb-tag ${categoryClass}`;
            div.innerHTML = `<span class="type">${c.type}</span><span class="name">${c.name}</span>`;
            soulContainer.appendChild(div);
        });
    }

    // シミュレーター
    document.getElementById('sim-result-card').classList.add('hidden');
    document.getElementById('sim-default-view').classList.remove('hidden');
    const simSelect = document.getElementById('sim-selector');
    if(simSelect) simSelect.value = "";
    initPartySimulator(typeKey);

    // フッター
    renderFooterCatalog();

    // 常駐キャラ
    const floatLayer = document.getElementById('floating-char-layer');
    const floatImg = document.getElementById('floating-char-img');
    if (baseData.imageFile) {
        floatImg.src = `assets/images/${baseData.imageFile}`;
        floatImg.onload = () => { floatLayer.classList.remove('hidden'); };
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

function getBaseUrl() { return window.location.origin + window.location.pathname; }

function shareTwitter() {
    const name = document.getElementById('res-name').textContent;
    const type = document.getElementById('res-grand-class').textContent;
    const shareUrl = `${getBaseUrl()}?type=${currentResultType}`;
    const text = `私の【RPG風ファンタジー診断】結果は…\n🛡️ 職業：${name}（${type}）でした！\n\n運命のパートナーや攻略法も判明！？\n⚔️ あなたも冒険に出る👇\n#RPG風ファンタジー診断\n`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
}

function shareLine() {
    const name = document.getElementById('res-name').textContent;
    const type = document.getElementById('res-grand-class').textContent;
    const shareUrl = `${getBaseUrl()}?type=${currentResultType}`;
    const text = `【RPG風ファンタジー診断】\n私の職業は…\n🛡️ ${name}（${type}）でした！\n\n運命のパートナーや、取扱説明書も判明！？\n⚔️ あなたも診断してみる？\n\n▼診断はこちら\n${shareUrl}`;
    window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, '_blank');
}

// URLコピー機能（画面に応じたURL生成）
function copyToClipboard() {
    let shareUrl = getBaseUrl(); // 基本のURL（トップページ）

    // ★修正：現在「結果画面」が表示されている場合のみ、パラメータを付ける
    const resultScreen = document.getElementById('screen-result');
    if (resultScreen && resultScreen.classList.contains('active') && currentResultType) {
        shareUrl += `?type=${currentResultType}`;
    }

    navigator.clipboard.writeText(shareUrl).then(() => {
        const toast = document.getElementById('toast');
        if(toast) {
            toast.classList.remove('hidden'); toast.classList.add('show');
            setTimeout(() => { toast.classList.remove('show'); toast.classList.add('hidden'); }, 2000);
        } else { alert("リンクをコピーしました！"); }
    });
}

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

    setText('sim-effect-title', effectTitle);     
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

// =========================================
// 過去の診断結果を呼び出す機能
// =========================================
// 過去の診断結果を呼び出す機能 (修正版)
function showSavedResult() {
    try {
        const lastResult = localStorage.getItem('fantasy_last_result');
        if (lastResult) {
            const data = JSON.parse(lastResult);
            
            if (data.type && typesData[data.type]) {
                // ★修正：スコアデータがあるかチェック
                if (data.scores) {
                    // スコアがある場合（最新版）→ グラフを表示
                    scores = data.scores; // 保存されたスコアを復元
                    showResult(data.type, false); // false = 通常モード（グラフあり）
                } else {
                    // スコアがない場合（過去データ）→ グラフを隠す（図鑑モード）
                    // true を渡すとグラフが非表示になります
                    showResult(data.type, true); 
                }
                return;
            }
        }
        
        alert("保存された診断データが見つかりませんでした。\nまずは「診断を始める」から冒険に出かけましょう！");
        
    } catch (e) {
        console.error("履歴読み込みエラー:", e);
        alert("データの読み込みに失敗しました。");
    }
}