const params = new URLSearchParams(window.location.search);
const id = params.get("id");

const scene = document.getElementById("scene");

const states = {
    loading: document.getElementById("state-loading"),
    tap: document.getElementById("state-tap"),
    opening: document.getElementById("state-opening"),
    revealed: document.getElementById("state-revealed"),
    error: document.getElementById("state-error"),
};

const tapSealButton = document.getElementById("tapSealButton");

const revealTitleEl = document.getElementById("revealTitle");
const revealMetaEl = document.getElementById("revealMeta");
const revealDateRowEl = document.getElementById("revealDateRow");
const revealDateEl = document.getElementById("revealDate");
const revealLocationRowEl = document.getElementById("revealLocationRow");
const revealLocationEl = document.getElementById("revealLocation");
const secretTextEl = document.getElementById("secretText");
const errorTitleEl = document.getElementById("errorTitle");
const errorSubEl = document.getElementById("errorSub");

let pendingInvitation = null; // 開封演出のために、内容を一時保持しておく

function showState(name) {
    Object.values(states).forEach((el) => { el.hidden = true; });
    states[name].hidden = false;
}

function showError(title, sub) {
    if (title) errorTitleEl.textContent = title;
    if (sub) errorSubEl.textContent = sub;
    showState("error");
}

function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

async function fetchInvitation() {
    const res = await fetch("/invitations/" + encodeURIComponent(id));
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}

async function init() {
    if (!id) {
        showError("招待状が指定されていません", "URLが正しいかご確認ください。");
        return;
    }

    showState("loading");

    const { ok, status, data } = await fetchInvitation();

    if (ok) {
        pendingInvitation = data;
        scene.dataset.seal = data.seal_color || "blue";
        showState("tap");
        return;
    }

    if (status === 404) {
        showError("この招待状は見つかりません", "URLが正しいかご確認ください。");
        return;
    }

    showError("読み込みに失敗しました", data.error || "しばらくしてからもう一度お試しください。");
}

function reveal(invitation) {
    revealTitleEl.textContent = invitation.title || "";

    let hasMeta = false;
    if (invitation.event_datetime) {
        revealDateEl.textContent = formatDateTime(invitation.event_datetime);
        revealDateRowEl.hidden = false;
        hasMeta = true;
    } else {
        revealDateRowEl.hidden = true;
    }

    if (invitation.location) {
        revealLocationEl.textContent = invitation.location;
        revealLocationRowEl.hidden = false;
        hasMeta = true;
    } else {
        revealLocationRowEl.hidden = true;
    }
    revealMetaEl.hidden = !hasMeta;

    secretTextEl.textContent = invitation.message || "";
    showState("revealed");
}

const envelopeScene = document.getElementById("envelopeScene");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ANIMATION_MS = prefersReducedMotion ? 0 : 1450;

// 封筒が開いて手紙が出てくる演出を再生してから中身を表示する
function playOpenAnimation(invitation) {
    showState("opening");
    envelopeScene.classList.remove("is-opening");

    // 描画を一度確定させてからクラスを付与し、確実にトランジションを発火させる
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            envelopeScene.classList.add("is-opening");
        });
    });

    setTimeout(() => reveal(invitation), ANIMATION_MS);
}

function openTap() {
    tapSealButton.disabled = true;
    playOpenAnimation(pendingInvitation);
}
tapSealButton.addEventListener("click", openTap);

init();
