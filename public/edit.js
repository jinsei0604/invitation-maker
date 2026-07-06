const params = new URLSearchParams(window.location.search);
const id = params.get("id");
const token = params.get("token");

const states = {
    loading: document.getElementById("state-loading"),
    error: document.getElementById("state-error"),
    edit: document.getElementById("state-edit"),
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

// ISO文字列 → <input type="datetime-local"> にそのまま入れられるローカル時刻表記に変換する
function toDatetimeLocalValue(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const editTitle = document.getElementById("editTitle");
const editDatetime = document.getElementById("editDatetime");
const editLocation = document.getElementById("editLocation");
const editMessage = document.getElementById("editMessage");
const editDeadline = document.getElementById("editDeadline");
const editCapacityField = document.getElementById("editCapacityField");
const editCapacity = document.getElementById("editCapacity");
const editError = document.getElementById("editError");
const savedNote = document.getElementById("savedNote");

document.getElementById("backToManageLink").href =
    `manage.html?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;

async function init() {
    if (!id || !token) {
        showError("編集ページのURLが正しくありません", "管理ページから開き直してください。");
        return;
    }

    showState("loading");

    const res = await fetch(`/invitations/${encodeURIComponent(id)}/details?token=${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));

    if (res.status === 403) {
        showError("アクセスできません", "管理ページのURLからやり直してください。");
        return;
    }
    if (res.status === 404) {
        showError("この招待状は見つかりません", "URLが正しいかご確認ください。");
        return;
    }
    if (!res.ok) {
        showError("読み込みに失敗しました", data.error || "しばらくしてからもう一度お試しください。");
        return;
    }

    editTitle.value = data.title || "";
    editDatetime.value = toDatetimeLocalValue(data.event_datetime);
    editLocation.value = data.location || "";
    editMessage.value = data.message || "";
    editDeadline.value = toDatetimeLocalValue(data.response_deadline);
    editCapacity.value = data.capacity || "";
    editCapacityField.hidden = data.response_type === "schedule";

    showState("edit");
}

document.getElementById("editForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    editError.hidden = true;
    savedNote.hidden = true;

    const title = editTitle.value.trim();
    const message = editMessage.value.trim();
    if (!title) {
        editError.textContent = "タイトルを入力してください";
        editError.hidden = false;
        return;
    }
    if (!message) {
        editError.textContent = "メッセージ本文を入力してください";
        editError.hidden = false;
        return;
    }

    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;

    try {
        const res = await fetch(`/invitations/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title,
                event_datetime: editDatetime.value ? new Date(editDatetime.value).toISOString() : "",
                location: editLocation.value.trim(),
                message,
                response_deadline: editDeadline.value ? new Date(editDeadline.value).toISOString() : "",
                capacity: editCapacityField.hidden ? "" : editCapacity.value.trim(),
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || "保存に失敗しました");
        }
        savedNote.hidden = false;
    } catch (err) {
        editError.textContent = err.message;
        editError.hidden = false;
    } finally {
        submitBtn.disabled = false;
    }
});

init();
