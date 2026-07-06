const params = new URLSearchParams(window.location.search);
const id = params.get("id");

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
        applyTemplateTheme(data.template_id);
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
    playTemplateEffect(invitation.template_id);
    showResponseSection(invitation);
}

// invitationのresponse_typeに応じて、出欠フォーム／日程調整フォームのどちらかを表示する
function showResponseSection(invitation) {
    const isSchedule = invitation.response_type === "schedule";
    document.getElementById("rsvpSection").hidden = isSchedule;
    document.getElementById("scheduleSection").hidden = !isSchedule;

    if (isSchedule) {
        renderScheduleOptions(invitation.schedule_options || []);
        showScheduleSection();
    } else {
        showRsvpSection();
    }
}

// --- 出欠フォーム（同じページ内で完結させる。別ページには遷移しない） ---
// ひとつのURLを複数人で使うことがあるため、送信後もフォームに戻って何度でも
// 送信できるようにしている。同じ名前（＋役職・学年）で再送信した場合はサーバー側で上書きされる。

const rsvpFormWrap = document.getElementById("rsvpFormWrap");
const rsvpDone = document.getElementById("rsvpDone");
const rsvpDoneSub = document.getElementById("rsvpDoneSub");
const rsvpForm = document.getElementById("rsvpForm");
const rsvpNameInput = document.getElementById("rsvpName");
const rsvpRoleInput = document.getElementById("rsvpRole");
const rsvpCommentInput = document.getElementById("rsvpComment");
const rsvpAttendPicker = document.getElementById("rsvpAttendPicker");
const rsvpAnotherBtn = document.getElementById("rsvpAnotherBtn");
const rsvpError = document.getElementById("rsvpError");

let selectedAttend = null;
const ATTEND_LABELS = { yes: "出席", no: "欠席" };

function showRsvpDone(guestName, attending) {
    rsvpDoneSub.textContent = guestName
        ? `${guestName} 様（${ATTEND_LABELS[attending] || ""}）で承りました。`
        : "";
    rsvpFormWrap.hidden = true;
    rsvpDone.hidden = false;
}

function resetRsvpForm() {
    rsvpForm.reset();
    selectedAttend = null;
    rsvpAttendPicker.querySelectorAll(".rsvp-attend-btn").forEach((el) => {
        el.classList.remove("is-selected");
    });
    rsvpError.hidden = true;
}

function showRsvpSection() {
    resetRsvpForm();
    rsvpFormWrap.hidden = false;
    rsvpDone.hidden = true;
}

rsvpAnotherBtn.addEventListener("click", () => {
    showRsvpSection();
});

rsvpAttendPicker.addEventListener("click", (e) => {
    const btn = e.target.closest(".rsvp-attend-btn");
    if (!btn) return;
    selectedAttend = btn.dataset.attend;
    rsvpAttendPicker.querySelectorAll(".rsvp-attend-btn").forEach((el) => {
        el.classList.toggle("is-selected", el === btn);
    });
});

rsvpForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    rsvpError.hidden = true;

    const guestName = rsvpNameInput.value.trim();
    if (!guestName) {
        rsvpError.textContent = "お名前を入力してください";
        rsvpError.hidden = false;
        return;
    }
    if (!selectedAttend) {
        rsvpError.textContent = "出欠を選択してください";
        rsvpError.hidden = false;
        return;
    }

    const submitBtn = rsvpForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;

    try {
        const res = await fetch(`/invitations/${encodeURIComponent(id)}/replies`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                guest_name: guestName,
                attending: selectedAttend,
                comment: rsvpCommentInput.value.trim(),
                role_grade: rsvpRoleInput.value.trim(),
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || "送信に失敗しました");
        }

        showRsvpDone(guestName, selectedAttend);
    } catch (err) {
        rsvpError.textContent = err.message;
        rsvpError.hidden = false;
    } finally {
        submitBtn.disabled = false;
    }
});

// --- 日程調整フォーム（同じページ内で完結させる。別ページには遷移しない） ---

const scheduleFormWrap = document.getElementById("scheduleFormWrap");
const scheduleDone = document.getElementById("scheduleDone");
const scheduleDoneSub = document.getElementById("scheduleDoneSub");
const scheduleForm = document.getElementById("scheduleForm");
const scheduleNameInput = document.getElementById("scheduleName");
const scheduleRoleInput = document.getElementById("scheduleRole");
const scheduleCommentInput = document.getElementById("scheduleComment");
const scheduleVoteOptionsEl = document.getElementById("scheduleVoteOptions");
const scheduleAnotherBtn = document.getElementById("scheduleAnotherBtn");
const scheduleError = document.getElementById("scheduleError");

function renderScheduleOptions(options) {
    scheduleVoteOptionsEl.innerHTML = options.map((option) => `
        <label class="schedule-vote-option">
            <input type="checkbox" value="${option.id}">
            <span>${option.option_label}</span>
        </label>
    `).join("");
}

function showScheduleDone(guestName) {
    scheduleDoneSub.textContent = guestName ? `${guestName} 様のご回答を承りました。` : "";
    scheduleFormWrap.hidden = true;
    scheduleDone.hidden = false;
}

function resetScheduleForm() {
    scheduleForm.reset();
    scheduleError.hidden = true;
}

function showScheduleSection() {
    resetScheduleForm();
    scheduleFormWrap.hidden = false;
    scheduleDone.hidden = true;
}

scheduleAnotherBtn.addEventListener("click", () => {
    showScheduleSection();
});

scheduleForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    scheduleError.hidden = true;

    const guestName = scheduleNameInput.value.trim();
    if (!guestName) {
        scheduleError.textContent = "お名前を入力してください";
        scheduleError.hidden = false;
        return;
    }

    const selectedOptionIds = Array.from(scheduleVoteOptionsEl.querySelectorAll("input[type=checkbox]:checked"))
        .map((el) => el.value);
    if (selectedOptionIds.length === 0) {
        scheduleError.textContent = "候補日を1つ以上選択してください";
        scheduleError.hidden = false;
        return;
    }

    const submitBtn = scheduleForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;

    try {
        const res = await fetch(`/invitations/${encodeURIComponent(id)}/schedule-votes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                guest_name: guestName,
                selected_option_ids: selectedOptionIds,
                comment: scheduleCommentInput.value.trim(),
                role_grade: scheduleRoleInput.value.trim(),
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || "送信に失敗しました");
        }

        showScheduleDone(guestName);
    } catch (err) {
        scheduleError.textContent = err.message;
        scheduleError.hidden = false;
    } finally {
        submitBtn.disabled = false;
    }
});

const envelopeScene = document.getElementById("envelopeScene");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ANIMATION_MS = prefersReducedMotion ? 0 : 1450;

// 封筒が開いて手紙が出てくる演出を再生してから中身を表示する
function playOpenAnimation(invitation) {
    showState("opening");
    triggerSceneOpen();
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
