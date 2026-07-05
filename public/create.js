const steps = {
    form: document.getElementById("step-form"),
    preview: document.getElementById("step-preview"),
    processing: document.getElementById("step-processing"),
    complete: document.getElementById("step-complete"),
    error: document.getElementById("step-error"),
};

function showStep(name) {
    Object.values(steps).forEach((el) => { el.hidden = true; });
    steps[name].hidden = false;
}

function showFatalError(title, sub) {
    document.getElementById("errorTitle").textContent = title;
    document.getElementById("errorSub").textContent = sub || "";
    showStep("error");
}

// --- フォーム ---

const inviteForm = document.getElementById("inviteForm");
const titleInput = document.getElementById("titleInput");
const datetimeInput = document.getElementById("datetimeInput");
const locationInput = document.getElementById("locationInput");
const messageInput = document.getElementById("messageInput");
const formError = document.getElementById("formError");
const sealPicker = document.getElementById("sealPicker");

let selectedSealColor = "blue";

sealPicker.addEventListener("click", (e) => {
    const btn = e.target.closest(".seal-swatch");
    if (!btn) return;
    sealPicker.querySelectorAll(".seal-swatch").forEach((el) => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    selectedSealColor = btn.dataset.color;
});

function currentFormData() {
    return {
        title: titleInput.value.trim(),
        event_datetime: datetimeInput.value ? new Date(datetimeInput.value).toISOString() : "",
        location: locationInput.value.trim(),
        message: messageInput.value.trim(),
        seal_color: selectedSealColor,
    };
}

inviteForm.addEventListener("submit", (e) => {
    e.preventDefault();
    formError.hidden = true;

    const data = currentFormData();
    if (!data.title) {
        formError.textContent = "タイトルを入力してください";
        formError.hidden = false;
        return;
    }
    if (!data.message) {
        formError.textContent = "メッセージ本文を入力してください";
        formError.hidden = false;
        return;
    }

    enterPreview(data);
});

// --- プレビュー（開封アニメーション） ---

const scene = document.getElementById("scene");
const previewStates = {
    tap: document.getElementById("state-tap"),
    opening: document.getElementById("state-opening"),
    revealed: document.getElementById("state-revealed"),
};
const tapSealButton = document.getElementById("tapSealButton");
const envelopeScene = document.getElementById("envelopeScene");
const replayBtn = document.getElementById("replayBtn");

const revealTitleEl = document.getElementById("revealTitle");
const revealMetaEl = document.getElementById("revealMeta");
const revealDateRowEl = document.getElementById("revealDateRow");
const revealDateEl = document.getElementById("revealDate");
const revealLocationRowEl = document.getElementById("revealLocationRow");
const revealLocationEl = document.getElementById("revealLocation");
const secretTextEl = document.getElementById("secretText");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ANIMATION_MS = prefersReducedMotion ? 0 : 1450;

function showPreviewState(name) {
    Object.values(previewStates).forEach((el) => { el.hidden = true; });
    previewStates[name].hidden = false;
}

function formatDateTime(isoValue) {
    if (!isoValue) return "";
    const date = new Date(isoValue);
    if (Number.isNaN(date.getTime())) return isoValue;
    return date.toLocaleString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function fillRevealContent(data) {
    revealTitleEl.textContent = data.title;

    let hasMeta = false;
    if (data.event_datetime) {
        revealDateEl.textContent = formatDateTime(data.event_datetime);
        revealDateRowEl.hidden = false;
        hasMeta = true;
    } else {
        revealDateRowEl.hidden = true;
    }
    if (data.location) {
        revealLocationEl.textContent = data.location;
        revealLocationRowEl.hidden = false;
        hasMeta = true;
    } else {
        revealLocationRowEl.hidden = true;
    }
    revealMetaEl.hidden = !hasMeta;

    secretTextEl.textContent = data.message;
}

function playOpenAnimation() {
    showPreviewState("opening");
    envelopeScene.classList.remove("is-opening");
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            envelopeScene.classList.add("is-opening");
        });
    });
    setTimeout(() => showPreviewState("revealed"), ANIMATION_MS);
}

tapSealButton.addEventListener("click", () => {
    tapSealButton.disabled = true;
    playOpenAnimation();
});

replayBtn.addEventListener("click", () => {
    tapSealButton.disabled = false;
    envelopeScene.classList.remove("is-opening");
    showPreviewState("tap");
});

function enterPreview(data) {
    scene.dataset.seal = data.seal_color;
    fillRevealContent(data);
    tapSealButton.disabled = false;
    envelopeScene.classList.remove("is-opening");
    showPreviewState("tap");
    showStep("preview");
}

document.getElementById("backToFormBtn").addEventListener("click", () => {
    showStep("form");
});

// --- 招待状を作成する ---

const checkoutError = document.getElementById("checkoutError");
const goCheckoutBtn = document.getElementById("goCheckoutBtn");
const shareUrlInput = document.getElementById("shareUrlInput");
const copyBtn = document.getElementById("copyBtn");
const copiedNote = document.getElementById("copiedNote");
const viewInviteLink = document.getElementById("viewInviteLink");

async function createInvitation(data) {
    const res = await fetch("/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    const resData = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(resData.error || "招待状の作成に失敗しました");
    }
    return resData.shareUrl;
}

goCheckoutBtn.addEventListener("click", async () => {
    checkoutError.hidden = true;
    goCheckoutBtn.disabled = true;
    showStep("processing");
    try {
        const shareUrl = await createInvitation(currentFormData());
        shareUrlInput.value = shareUrl;
        viewInviteLink.href = shareUrl;
        showStep("complete");
    } catch (err) {
        showStep("preview");
        checkoutError.textContent = err.message;
        checkoutError.hidden = false;
    } finally {
        goCheckoutBtn.disabled = false;
    }
});

copyBtn.addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(shareUrlInput.value);
    } catch (err) {
        shareUrlInput.select();
        document.execCommand("copy");
    }
    copiedNote.hidden = false;
    setTimeout(() => { copiedNote.hidden = true; }, 2000);
});

showStep("form");
