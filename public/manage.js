const params = new URLSearchParams(window.location.search);
const id = params.get("id");
const token = params.get("token");

const states = {
    loading: document.getElementById("state-loading"),
    error: document.getElementById("state-error"),
    manage: document.getElementById("state-manage"),
};

function showState(name) {
    Object.values(states).forEach((el) => { el.hidden = true; });
    states[name].hidden = false;
}

function showError(title, sub) {
    document.getElementById("errorTitle").textContent = title;
    document.getElementById("errorSub").textContent = sub || "";
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
        hour: "2-digit",
        minute: "2-digit",
    });
}

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
}

function metaLine(reply) {
    const parts = [];
    if (reply.role_grade) parts.push(escapeHtml(reply.role_grade));
    if (reply.age) parts.push(`${escapeHtml(reply.age)}歳`);
    return parts.length ? `<p class="rsvp-reply-card__meta">${parts.join(" / ")}</p>` : "";
}

// --- 出欠フォーム（response_type = 'rsvp'）の表示 ---

let currentReplies = [];

function renderReplies(replies) {
    const listEl = document.getElementById("replyList");
    const emptyNote = document.getElementById("emptyNote");

    if (!replies.length) {
        listEl.innerHTML = "";
        emptyNote.hidden = false;
        return;
    }
    emptyNote.hidden = true;

    listEl.innerHTML = replies.map((reply) => {
        const badgeClass = reply.attending === "yes" ? "rsvp-reply-card__badge--yes" : "rsvp-reply-card__badge--no";
        const badgeLabel = reply.attending === "yes" ? "出席" : "欠席";
        const comment = reply.comment
            ? `<p class="rsvp-reply-card__comment">${escapeHtml(reply.comment)}</p>`
            : "";

        return `
            <div class="rsvp-reply-card">
                <div class="rsvp-reply-card__head">
                    <span class="rsvp-reply-card__name">${escapeHtml(reply.guest_name)}</span>
                    <span class="rsvp-reply-card__badge ${badgeClass}">${badgeLabel}</span>
                </div>
                ${metaLine(reply)}
                ${comment}
                <p class="rsvp-reply-card__date">${formatDateTime(reply.created_at)}</p>
            </div>
        `;
    }).join("");
}

function buildRsvpExcelText(replies) {
    const sanitize = (value) => String(value || "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
    const header = ["お名前", "役職・学年", "年齢", "出欠", "コメント", "回答日時"];
    const rows = replies.map((reply) => [
        sanitize(reply.guest_name),
        sanitize(reply.role_grade),
        sanitize(reply.age),
        reply.attending === "yes" ? "出席" : "欠席",
        sanitize(reply.comment),
        formatDateTime(reply.created_at),
    ]);
    return [header, ...rows].map((row) => row.join("\t")).join("\n");
}

async function copyToClipboard(text, noteId) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
    }
    const note = document.getElementById(noteId);
    note.hidden = false;
    setTimeout(() => { note.hidden = true; }, 2000);
}

document.getElementById("copyExcelBtn").addEventListener("click", () => {
    copyToClipboard(buildRsvpExcelText(currentReplies), "copiedExcelNote");
});

async function loadRsvpView() {
    const res = await fetch(`/invitations/${encodeURIComponent(id)}/replies?token=${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, data };

    document.getElementById("countYes").textContent = data.counts.yes;
    document.getElementById("countNo").textContent = data.counts.no;
    currentReplies = data.replies;
    renderReplies(data.replies);
    return { ok: true, data };
}

// --- 日程調整フォーム（response_type = 'schedule'）の表示 ---

let currentVotes = [];
let currentOptions = [];

function renderScheduleTally(options, counts, totalVoters) {
    const tallyEl = document.getElementById("scheduleTally");
    tallyEl.innerHTML = options.map((option) => {
        const count = counts[option.id] || 0;
        const percent = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0;
        return `
            <div class="schedule-tally__row">
                <div class="schedule-tally__row-head">
                    <span class="schedule-tally__label">${escapeHtml(option.option_label)}</span>
                    <span class="schedule-tally__count">${count}人</span>
                </div>
                <div class="schedule-tally__bar-track">
                    <div class="schedule-tally__bar-fill" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    }).join("");
}

function renderScheduleVotes(votes, options) {
    const listEl = document.getElementById("scheduleVoteList");
    const emptyNote = document.getElementById("scheduleEmptyNote");

    if (!votes.length) {
        listEl.innerHTML = "";
        emptyNote.hidden = false;
        return;
    }
    emptyNote.hidden = true;

    const labelById = {};
    options.forEach((option) => { labelById[option.id] = option.option_label; });

    listEl.innerHTML = votes.map((vote) => {
        const dateLabels = vote.selected_option_ids.map((optionId) => labelById[optionId]).filter(Boolean);
        const comment = vote.comment
            ? `<p class="rsvp-reply-card__comment">${escapeHtml(vote.comment)}</p>`
            : "";

        return `
            <div class="rsvp-reply-card">
                <div class="rsvp-reply-card__head">
                    <span class="rsvp-reply-card__name">${escapeHtml(vote.guest_name)}</span>
                </div>
                ${metaLine(vote)}
                <p class="rsvp-reply-card__dates">${dateLabels.map(escapeHtml).join("、")}</p>
                ${comment}
                <p class="rsvp-reply-card__date">${formatDateTime(vote.created_at)}</p>
            </div>
        `;
    }).join("");
}

function buildScheduleExcelText(votes, options) {
    const sanitize = (value) => String(value || "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
    const labelById = {};
    options.forEach((option) => { labelById[option.id] = option.option_label; });

    const header = ["お名前", "役職・学年", "年齢", "参加できる候補日", "コメント", "回答日時"];
    const rows = votes.map((vote) => [
        sanitize(vote.guest_name),
        sanitize(vote.role_grade),
        sanitize(vote.age),
        sanitize(vote.selected_option_ids.map((optionId) => labelById[optionId]).filter(Boolean).join("、")),
        sanitize(vote.comment),
        formatDateTime(vote.created_at),
    ]);
    return [header, ...rows].map((row) => row.join("\t")).join("\n");
}

document.getElementById("copyScheduleExcelBtn").addEventListener("click", () => {
    copyToClipboard(buildScheduleExcelText(currentVotes, currentOptions), "copiedScheduleExcelNote");
});

async function loadScheduleView() {
    const res = await fetch(`/invitations/${encodeURIComponent(id)}/schedule-votes?token=${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, data };

    currentOptions = data.options;
    currentVotes = data.votes;
    renderScheduleTally(data.options, data.counts, data.votes.length);
    renderScheduleVotes(data.votes, data.options);
    return { ok: true, data };
}

// --- 初期化 ---

async function init() {
    if (!id || !token) {
        showError("管理ページのURLが正しくありません", "招待状作成時に発行されたURLをそのままお使いください。");
        return;
    }

    showState("loading");

    // まずreplies APIでこの招待状のresponse_typeを判定し、それに応じて表示を切り替える
    const rsvpResult = await loadRsvpView();

    if (rsvpResult.status === 403) {
        showError("アクセスできません", "管理用URLが正しいかご確認ください。");
        return;
    }
    if (rsvpResult.status === 404) {
        showError("この招待状は見つかりません", "URLが正しいかご確認ください。");
        return;
    }
    if (!rsvpResult.ok) {
        showError("読み込みに失敗しました", rsvpResult.data.error || "しばらくしてからもう一度お試しください。");
        return;
    }

    const invitation = rsvpResult.data;
    applyTemplateTheme(invitation.template_id);
    document.getElementById("inviteTitle").textContent = invitation.title;

    const isSchedule = invitation.response_type === "schedule";
    document.getElementById("rsvpView").hidden = isSchedule;
    document.getElementById("scheduleView").hidden = !isSchedule;

    if (isSchedule) {
        const scheduleResult = await loadScheduleView();
        if (!scheduleResult.ok) {
            showError("読み込みに失敗しました", scheduleResult.data.error || "しばらくしてからもう一度お試しください。");
            return;
        }
    }

    showState("manage");
}

init();
