// invite.html と create.html の両方から読み込まれる、テンプレート共通定義。
// テンプレートを増やすときはここに1件追加するだけでよい。

const TEMPLATES = [
    {
        id: "standard",
        name: "スタンダード",
        description: "現行のシンプルな青い封蝋",
        themeClass: "theme-standard",
        swatch: "#2f5586",
    },
    {
        id: "wedding",
        name: "結婚式",
        description: "アイボリー×ゴールド、花びらが舞う演出",
        themeClass: "theme-wedding",
        swatch: "#b89658",
    },
    {
        id: "matsuri",
        name: "お祭り",
        description: "紅色の封蝋、花火が打ち上がる演出",
        themeClass: "theme-matsuri",
        swatch: "#a6332c",
    },
];

function getTemplate(templateId) {
    return TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];
}

// 封蝋の絵柄（.seal__glyph の中身）。既存の見た目・線の太さを踏襲したシンプルな線画。
const SEAL_GLYPHS = {
    // おひつじ座（現行のまま）
    standard: `
        <path d="M-28,15 Q-28,-15 0,-15 Q28,-15 28,15 Q28,45 0,58 Q-28,45 -28,15 Z" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/>
        <path d="M-22,-12 C-58,-18 -72,-48 -52,-72 C-42,-84 -22,-80 -20,-66" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
        <path d="M22,-12 C58,-18 72,-48 52,-72 C42,-84 22,-80 20,-66" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
        <path d="M14,-24 L4,-40 L-6,-38 L-70,-95" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
        <circle cx="14" cy="-24" r="7" fill="currentColor"/>
        <circle cx="4" cy="-40" r="4.4" fill="currentColor"/>
        <circle cx="-6" cy="-38" r="4" fill="currentColor"/>
        <circle cx="-70" cy="-95" r="5.4" fill="currentColor"/>
    `,
    // 重なり合う指輪。大きめのリングをはっきり太いストロークで
    wedding: `
        <circle cx="-17" cy="4" r="34" fill="none" stroke="currentColor" stroke-width="9"/>
        <circle cx="17" cy="4" r="34" fill="none" stroke="currentColor" stroke-width="9"/>
    `,
    // 提灯（樽型のボディ＋横リブ＋吊り輪＋房）
    matsuri: `
        <path d="M-22,-56 C-42,-56 -42,-18 -38,10 C-34,32 -20,36 0,36 C20,36 34,32 38,10 C42,-18 42,-56 22,-56 Z"
              fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/>
        <path d="M-40,-33 L40,-33 M-39,-9 L39,-9 M-38,15 L38,15"
              stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity="0.85"/>
        <path d="M-14,-56 L14,-56" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
        <circle cx="0" cy="-70" r="8" fill="none" stroke="currentColor" stroke-width="6"/>
        <path d="M0,-62 L0,-56" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
        <path d="M-10,36 L10,36" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
        <path d="M0,36 L0,56 M-8,44 L-8,56 M8,44 L8,56"
              stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity="0.85"/>
    `,
};

// 背景（#bgScene に差し込むシルエット）。standardは何も表示しない。
// 上部・下部を別々の固定高さの帯として描画することで、画面の縦横比が変わっても
// 上部（ガーランド・提灯）や下部（アーチ・屋台）が切れて見えなくなるのを防いでいる。
const BACKGROUND_SCENES = {
    wedding: buildWeddingBackground(),
    matsuri: buildMatsuriBackground(),
};

function buildWeddingBackground() {
    // 上部：ちょうちんと同じ仕組みで、電球ライト（グローブライト）を順番に光らせる
    const lightColors = ["#fff3d6", "#ffe9c2", "#fff8ef"];
    let lights = "";
    const lightCount = 9;
    for (let i = 0; i < lightCount; i++) {
        const x = 30 + (i / (lightCount - 1)) * 740;
        const delay = (i * 0.28).toFixed(2);
        const color = lightColors[i % lightColors.length];
        lights += `
            <g transform="translate(${x},50)">
                <line x1="0" y1="-30" x2="0" y2="-6" stroke="#c7a15f" stroke-width="1.5" opacity="0.5"/>
                <circle class="glow-dot" style="--glow-delay:${delay}s" cx="0" cy="0" r="9" fill="${color}"/>
                <circle cx="0" cy="0" r="9" fill="none" stroke="#c7a15f" stroke-width="1.2" opacity="0.5"/>
            </g>
        `;
    }

    // 下部：奥に向かって列が小さく・狭くなっていくベンチ（客席）を左右に並べる。
    // 中央はバージンロード（.bg-scene__aisle）のために空けておく
    let benches = "";
    const rowCount = 5;
    for (let r = 0; r < rowCount; r++) {
        const t = r / (rowCount - 1); // 0=手前 → 1=奥
        const y = 205 - t * 115;
        const benchHeight = 16 - t * 6;
        const benchWidth = 260 - t * 130;
        const gapHalf = 95 - t * 45;
        const leftX = 400 - gapHalf - benchWidth;
        const rightX = 400 + gapHalf;
        const opacity = (0.6 - t * 0.15).toFixed(2);
        benches += `
            <rect x="${leftX}" y="${y}" width="${benchWidth}" height="${benchHeight}" rx="3" opacity="${opacity}"/>
            <rect x="${rightX}" y="${y}" width="${benchWidth}" height="${benchHeight}" rx="3" opacity="${opacity}"/>
        `;
    }

    return `
        <div class="bg-scene__top">
            <svg viewBox="0 0 800 110" preserveAspectRatio="xMidYMin slice" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <path d="M0,20 Q100,45 200,20 T400,20 T600,20 T800,20" fill="none" stroke="#c7a15f" stroke-width="1.5" opacity="0.4"/>
                ${lights}
            </svg>
        </div>
        <div class="bg-scene__bottom">
            <svg viewBox="0 0 800 220" preserveAspectRatio="xMidYMax slice" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <g fill="#8f7245">${benches}</g>
            </svg>
        </div>
        <div class="bg-scene__curtain bg-scene__curtain--left"></div>
        <div class="bg-scene__curtain bg-scene__curtain--right"></div>
        <div class="bg-scene__aisle-clip">
            <div class="bg-scene__aisle"></div>
        </div>
        <div class="bg-scene__aisle-roll"></div>
    `;
}

function buildMatsuriBackground() {
    let stalls = "";
    const stallCount = 5;
    for (let i = 0; i < stallCount; i++) {
        const x = (i / stallCount) * 900 - 60;
        const w = 150;
        const overhang = 18;
        stalls += `
            <path d="M${x + overhang},170 L${x + overhang},120 L${x + w - overhang},120 L${x + w - overhang},170 Z"/>
            <path d="M${x},125 L${x + w / 2},85 L${x + w},125 Z"/>
        `;
    }

    let lanterns = "";
    const lanternCount = 7;
    for (let i = 0; i < lanternCount; i++) {
        const x = 60 + (i / (lanternCount - 1)) * 680;
        const delay = (i * 0.35).toFixed(2);
        lanterns += `
            <g transform="translate(${x},70)">
                <line x1="0" y1="-40" x2="0" y2="-14" stroke="#7a5230" stroke-width="2" opacity="0.5"/>
                <ellipse class="glow-dot" style="--glow-delay:${delay}s" cx="0" cy="0" rx="16" ry="20" fill="#ff8a3d"/>
                <ellipse cx="0" cy="0" rx="16" ry="20" fill="none" stroke="#b3401d" stroke-width="1.5" opacity="0.7"/>
                <line x1="-10" y1="-8" x2="10" y2="-8" stroke="#b3401d" stroke-width="1" opacity="0.5"/>
                <line x1="-13" y1="4" x2="13" y2="4" stroke="#b3401d" stroke-width="1" opacity="0.5"/>
            </g>
        `;
    }

    return `
        <div class="bg-scene__top">
            <svg viewBox="0 0 800 150" preserveAspectRatio="xMidYMin slice" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <line x1="0" y1="70" x2="800" y2="70" stroke="#7a5230" stroke-width="2" opacity="0.35"/>
                ${lanterns}
            </svg>
        </div>
        <div class="bg-scene__bottom">
            <svg viewBox="0 0 800 170" preserveAspectRatio="xMidYMax slice" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <g fill="#1c1930" opacity="0.55">${stalls}</g>
            </svg>
        </div>
    `;
}

// 現在のテーマに応じて <body> のクラス・封蝋の絵柄・背景をまとめて切り替える
function applyTemplateTheme(templateId) {
    const template = getTemplate(templateId);

    document.body.className = document.body.className
        .split(" ")
        .filter((cls) => cls && !cls.startsWith("theme-"))
        .concat(template.themeClass)
        .join(" ");

    const glyphMarkup = SEAL_GLYPHS[template.id] || SEAL_GLYPHS.standard;
    document.querySelectorAll(".seal__glyph").forEach((el) => {
        el.innerHTML = glyphMarkup;
    });

    // create.html/invite.htmlの両方に存在するが、この要素がないページには影響しない
    const bgScene = document.getElementById("bgScene");
    if (bgScene) {
        bgScene.classList.remove("is-open");
        bgScene.innerHTML = BACKGROUND_SCENES[template.id] || "";
    }

    return template;
}

// 封をタップして封筒が開き始める瞬間に呼ぶ。
// wedding ではカーテンが開き、バージンロードが伸びる演出のトリガーになる（他のテンプレートでは何も起きない）
function triggerSceneOpen() {
    const bgScene = document.getElementById("bgScene");
    if (bgScene) {
        bgScene.classList.add("is-open");
    }
}

// 開封後に再生する演出。standardは何も再生しない。
function playTemplateEffect(templateId) {
    if (templateId === "wedding") {
        playPetalEffect();
    } else if (templateId === "matsuri") {
        playFireworkEffect();
    }
}

function createEffectLayer(durationMs) {
    const layer = document.createElement("div");
    layer.className = "effect-layer";
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), durationMs);
    return layer;
}

function playPetalEffect() {
    const layer = createEffectLayer(4300);
    const petalCount = 25 + Math.floor(Math.random() * 16); // 25〜40枚

    for (let i = 0; i < petalCount; i++) {
        const petal = document.createElement("div");
        petal.className = "petal";
        const size = 10 + Math.random() * 9;
        petal.style.left = `${Math.random() * 100}%`;
        petal.style.width = `${size}px`;
        petal.style.height = `${size}px`;
        petal.style.setProperty("--drift", `${(Math.random() - 0.5) * 160}px`);
        petal.style.setProperty("--rot", `${180 + Math.random() * 360}deg`);
        petal.style.animationDelay = `${Math.random() * 1.2}s`;
        petal.style.animationDuration = `${1.8 + Math.random() * 1.2}s`;
        layer.appendChild(petal);
    }
}

function playFireworkEffect() {
    const layer = createEffectLayer(3800);
    const colors = ["#ff5252", "#ffd166", "#fff4e0", "#ff8a3d"];
    const burstCount = 4 + Math.floor(Math.random() * 3); // 4〜6発

    for (let b = 0; b < burstCount; b++) {
        const launchDelay = b * (0.3 + Math.random() * 0.15);
        const burstDelay = launchDelay + 0.42;
        const left = 15 + Math.random() * 70;
        const top = 12 + Math.random() * 32;
        const color = colors[b % colors.length];

        const launch = document.createElement("div");
        launch.className = "firework__launch";
        launch.style.left = `${left}%`;
        launch.style.top = `${top}%`;
        launch.style.animationDelay = `${launchDelay}s`;
        layer.appendChild(launch);

        const burst = document.createElement("div");
        burst.className = "firework";
        burst.style.left = `${left}%`;
        burst.style.top = `${top}%`;

        const sparkCount = 20 + Math.floor(Math.random() * 10); // 20〜29個
        for (let s = 0; s < sparkCount; s++) {
            const angle = (s / sparkCount) * Math.PI * 2 + Math.random() * 0.15;
            const distance = 90 + Math.random() * 55;
            const spark = document.createElement("span");
            spark.className = "firework__spark";
            spark.style.background = color;
            spark.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
            spark.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
            spark.style.animationDelay = `${burstDelay}s`;
            burst.appendChild(spark);
        }

        layer.appendChild(burst);
    }
}
