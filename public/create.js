const steps = {
    template: document.getElementById("step-template"),
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

// --- テンプレート選択 ---

const templateGrid = document.getElementById("templateGrid");
let selectedTemplateId = "standard";

function renderTemplateCards() {
    TEMPLATES.forEach((template) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "template-card";
        card.dataset.templateId = template.id;
        if (template.id === selectedTemplateId) card.classList.add("is-selected");

        card.innerHTML = `
            <span class="template-card__swatch" style="background: ${template.swatch}"></span>
            <span class="template-card__text">
                <h2>${template.name}</h2>
                <p>${template.description}</p>
            </span>
        `;

        card.addEventListener("click", () => selectTemplate(template.id));
        templateGrid.appendChild(card);
    });
}

function selectTemplate(templateId) {
    selectedTemplateId = templateId;
    templateGrid.querySelectorAll(".template-card").forEach((card) => {
        card.classList.toggle("is-selected", card.dataset.templateId === templateId);
    });
    applyTemplateTheme(templateId);
}

document.getElementById("templateNextBtn").addEventListener("click", () => {
    showStep("form");
});

renderTemplateCards();
applyTemplateTheme(selectedTemplateId);

// --- フォーム ---

const inviteForm = document.getElementById("inviteForm");
const titleInput = document.getElementById("titleInput");
const datetimeInput = document.getElementById("datetimeInput");
const locationInput = document.getElementById("locationInput");
const messageInput = document.getElementById("messageInput");
const formError = document.getElementById("formError");

document.getElementById("backToTemplateBtn").addEventListener("click", () => {
    showStep("template");
});

// --- 回答方式（出欠 / 日程調整）の選択 ---

const responseTypePicker = document.getElementById("responseTypePicker");
const scheduleOptionsField = document.getElementById("scheduleOptionsField");
const scheduleOptionsList = document.getElementById("scheduleOptionsList");
let selectedResponseType = "rsvp";

function addScheduleOptionRow() {
    const row = document.createElement("div");
    row.className = "schedule-option-row";
    row.innerHTML = `
        <input type="datetime-local" class="schedule-option-input">
        <button type="button" class="schedule-option-remove" aria-label="削除">×</button>
    `;
    row.querySelector(".schedule-option-remove").addEventListener("click", () => {
        if (scheduleOptionsList.children.length > 2) {
            row.remove();
        }
    });
    scheduleOptionsList.appendChild(row);
}

// 最初から2件、候補日の入力欄を用意しておく
addScheduleOptionRow();
addScheduleOptionRow();

document.getElementById("addScheduleOptionBtn").addEventListener("click", () => {
    addScheduleOptionRow();
});

responseTypePicker.addEventListener("click", (e) => {
    const btn = e.target.closest(".response-type-btn");
    if (!btn) return;
    selectedResponseType = btn.dataset.responseType;
    responseTypePicker.querySelectorAll(".response-type-btn").forEach((el) => {
        el.classList.toggle("is-selected", el === btn);
    });
    scheduleOptionsField.hidden = selectedResponseType !== "schedule";
});

function currentScheduleOptions() {
    return Array.from(scheduleOptionsList.querySelectorAll(".schedule-option-input"))
        .map((input) => input.value)
        .filter(Boolean)
        .map((value) => new Date(value).toLocaleString("ja-JP", {
            year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
        }));
}

function currentFormData() {
    return {
        title: titleInput.value.trim(),
        event_datetime: datetimeInput.value ? new Date(datetimeInput.value).toISOString() : "",
        location: locationInput.value.trim(),
        message: messageInput.value.trim(),
        template_id: selectedTemplateId,
        response_type: selectedResponseType,
        schedule_options: selectedResponseType === "schedule" ? currentScheduleOptions() : [],
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
    if (data.response_type === "schedule" && data.schedule_options.length < 2) {
        formError.textContent = "候補日を2つ以上入力してください";
        formError.hidden = false;
        return;
    }

    enterPreview(data);
});

// --- プレビュー（開封アニメーション） ---

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
    triggerSceneOpen();
    envelopeScene.classList.remove("is-opening");
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            envelopeScene.classList.add("is-opening");
        });
    });
    setTimeout(() => {
        showPreviewState("revealed");
        playTemplateEffect(selectedTemplateId);
    }, ANIMATION_MS);
}

tapSealButton.addEventListener("click", () => {
    tapSealButton.disabled = true;
    playOpenAnimation();
});

replayBtn.addEventListener("click", () => {
    tapSealButton.disabled = false;
    envelopeScene.classList.remove("is-opening");
    document.getElementById("bgScene")?.classList.remove("is-open");
    showPreviewState("tap");
});

function enterPreview(data) {
    applyTemplateTheme(data.template_id);
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
const manageUrlInput = document.getElementById("manageUrlInput");
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
    return resData;
}

goCheckoutBtn.addEventListener("click", async () => {
    checkoutError.hidden = true;
    goCheckoutBtn.disabled = true;
    showStep("processing");
    try {
        const { shareUrl, manageUrl } = await createInvitation(currentFormData());
        shareUrlInput.value = shareUrl;
        manageUrlInput.value = manageUrl;
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

function setupCopyButton(buttonId, inputEl, noteId) {
    const button = document.getElementById(buttonId);
    const note = document.getElementById(noteId);
    button.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(inputEl.value);
        } catch (err) {
            inputEl.select();
            document.execCommand("copy");
        }
        note.hidden = false;
        setTimeout(() => { note.hidden = true; }, 2000);
    });
}

setupCopyButton("copyShareBtn", shareUrlInput, "copiedShareNote");
setupCopyButton("copyManageBtn", manageUrlInput, "copiedManageNote");

showStep("template");
