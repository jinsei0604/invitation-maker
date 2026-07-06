require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const QRCode = require("qrcode");

let DatabaseSync;
try {
    ({ DatabaseSync } = require("node:sqlite"));
} catch (err) {
    console.error(
        "node:sqlite が利用できません。Node.js 23.4以降を推奨します（それ以前は --experimental-sqlite フラグが必要です）。",
    );
    throw err;
}

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const TEMPLATE_IDS = ["standard", "wedding", "matsuri"];
// LINEやX等でURLをシェアしたときのリンクプレビューに使うサービス名。.envで自由に設定できる
const SITE_NAME = process.env.SITE_NAME || "デジタル招待状";

function escapeHtmlAttr(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// --- DB setup ---
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "invitations.db"));

db.exec(`
    CREATE TABLE IF NOT EXISTS invitations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        event_datetime TEXT,
        location TEXT,
        message TEXT NOT NULL,
        seal_color TEXT DEFAULT 'blue',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// 既存のDBファイルに対しては、足りない列を追加する（新規作成時は最初から含まれる）
const existingColumns = db.prepare(`PRAGMA table_info(invitations)`).all();
if (!existingColumns.some((col) => col.name === "template_id")) {
    db.exec(`ALTER TABLE invitations ADD COLUMN template_id TEXT DEFAULT 'standard'`);
}
if (!existingColumns.some((col) => col.name === "manage_token")) {
    db.exec(`ALTER TABLE invitations ADD COLUMN manage_token TEXT`);
}
if (!existingColumns.some((col) => col.name === "response_type")) {
    db.exec(`ALTER TABLE invitations ADD COLUMN response_type TEXT DEFAULT 'rsvp'`);
}
if (!existingColumns.some((col) => col.name === "response_deadline")) {
    db.exec(`ALTER TABLE invitations ADD COLUMN response_deadline TEXT`);
}
if (!existingColumns.some((col) => col.name === "capacity")) {
    db.exec(`ALTER TABLE invitations ADD COLUMN capacity INTEGER`);
}

db.exec(`
    CREATE TABLE IF NOT EXISTS replies (
        id TEXT PRIMARY KEY,
        invitation_id TEXT NOT NULL,
        guest_name TEXT NOT NULL,
        attending TEXT NOT NULL,
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invitation_id) REFERENCES invitations(id)
    )
`);

const replyColumns = db.prepare(`PRAGMA table_info(replies)`).all();
if (!replyColumns.some((col) => col.name === "role_grade")) {
    db.exec(`ALTER TABLE replies ADD COLUMN role_grade TEXT`);
}
if (!replyColumns.some((col) => col.name === "companion_count")) {
    db.exec(`ALTER TABLE replies ADD COLUMN companion_count INTEGER DEFAULT 0`);
}

db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_options (
        id TEXT PRIMARY KEY,
        invitation_id TEXT NOT NULL,
        option_label TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (invitation_id) REFERENCES invitations(id)
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_votes (
        id TEXT PRIMARY KEY,
        invitation_id TEXT NOT NULL,
        guest_name TEXT NOT NULL,
        role_grade TEXT,
        selected_option_ids TEXT NOT NULL,
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invitation_id) REFERENCES invitations(id)
    )
`);

const statements = {
    insert: db.prepare(`
        INSERT INTO invitations (id, title, event_datetime, location, message, template_id, manage_token, response_type, response_deadline, capacity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getById: db.prepare(`SELECT * FROM invitations WHERE id = ?`),

    insertScheduleOption: db.prepare(`
        INSERT INTO schedule_options (id, invitation_id, option_label, sort_order)
        VALUES (?, ?, ?, ?)
    `),
    getScheduleOptions: db.prepare(`
        SELECT id, option_label FROM schedule_options
        WHERE invitation_id = ? ORDER BY sort_order ASC
    `),

    // 出欠フォーム（response_type = 'rsvp'）
    insertReply: db.prepare(`
        INSERT INTO replies (id, invitation_id, guest_name, attending, comment, role_grade, companion_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    getReplyByNameAndRole: db.prepare(`
        SELECT id FROM replies WHERE invitation_id = ? AND guest_name = ? AND IFNULL(role_grade, '') = IFNULL(?, '')
    `),
    updateReply: db.prepare(`
        UPDATE replies SET attending = ?, comment = ?, companion_count = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?
    `),
    getRepliesByInvitationId: db.prepare(`
        SELECT guest_name, attending, comment, role_grade, companion_count, created_at FROM replies
        WHERE invitation_id = ? ORDER BY created_at DESC
    `),
    getYesHeadcount: db.prepare(`
        SELECT COALESCE(SUM(1 + IFNULL(companion_count, 0)), 0) AS total FROM replies
        WHERE invitation_id = ? AND attending = 'yes'
    `),

    // 日程調整フォーム（response_type = 'schedule'）
    insertScheduleVote: db.prepare(`
        INSERT INTO schedule_votes (id, invitation_id, guest_name, role_grade, selected_option_ids, comment)
        VALUES (?, ?, ?, ?, ?, ?)
    `),
    getScheduleVoteByNameAndRole: db.prepare(`
        SELECT id FROM schedule_votes WHERE invitation_id = ? AND guest_name = ? AND IFNULL(role_grade, '') = IFNULL(?, '')
    `),
    updateScheduleVote: db.prepare(`
        UPDATE schedule_votes SET selected_option_ids = ?, comment = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?
    `),
    getScheduleVotesByInvitationId: db.prepare(`
        SELECT guest_name, role_grade, selected_option_ids, comment, created_at FROM schedule_votes
        WHERE invitation_id = ? ORDER BY created_at DESC
    `),
};

// 回答期限・定員（RSVPのみ）による自動締め切りを判定する
function getClosedState(invitation) {
    if (invitation.response_deadline) {
        const deadline = new Date(invitation.response_deadline);
        if (!Number.isNaN(deadline.getTime()) && Date.now() > deadline.getTime()) {
            return { closed: true, reason: "deadline" };
        }
    }
    if ((invitation.response_type || "rsvp") === "rsvp" && invitation.capacity) {
        const { total } = statements.getYesHeadcount.get(invitation.id);
        if (total >= invitation.capacity) {
            return { closed: true, reason: "capacity" };
        }
    }
    return { closed: false, reason: null };
}

// --- App setup ---
const app = express();

app.use(express.json());

// LINEやX、Slack等でURLを貼ったときに、招待状ごとのタイトルでリンクプレビューが
// 表示されるよう、invite.htmlの<head>にOGPタグを差し込んでから返す。
// リンクプレビューを取得するクローラーはJavaScriptを実行しないため、
// クライアント側の描画ではなくサーバー側でHTMLに埋め込む必要がある。
app.get("/invite.html", (req, res, next) => {
    const invitationId = req.query.id;
    if (!invitationId) return next();

    const invitation = statements.getById.get(invitationId);
    if (!invitation) return next();

    fs.readFile(path.join(__dirname, "public", "invite.html"), "utf8", (err, html) => {
        if (err) return next(err);

        const pageUrl = `${BASE_URL}/invite.html?id=${invitationId}`;
        const ogTitle = escapeHtmlAttr(`${invitation.title} | ${SITE_NAME}`);
        const ogDescription = escapeHtmlAttr(`${invitation.title} の招待状が届いています。タップして開いてください。`);
        const ogUrl = escapeHtmlAttr(pageUrl);
        const ogSiteName = escapeHtmlAttr(SITE_NAME);

        const metaTags = `
    <meta property="og:type" content="website">
    <meta property="og:title" content="${ogTitle}">
    <meta property="og:description" content="${ogDescription}">
    <meta property="og:url" content="${ogUrl}">
    <meta property="og:site_name" content="${ogSiteName}">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${ogTitle}">
    <meta name="twitter:description" content="${ogDescription}">
`;

        res.set("Content-Type", "text/html; charset=utf-8");
        res.send(html.replace("<!-- OGP_META -->", metaTags));
    });
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.redirect("/create.html");
});

// フォーム内容を保存し、招待状の共有URLを発行する（完全無料なので決済は挟まない）
app.post("/invitations", async (req, res) => {
    const { title, event_datetime, location, message, template_id, response_type, schedule_options, response_deadline, capacity } = req.body || {};

    if (!title || !String(title).trim()) {
        return res.status(400).json({ error: "タイトルを入力してください" });
    }
    if (!message || !String(message).trim()) {
        return res.status(400).json({ error: "メッセージ本文を入力してください" });
    }

    const responseType = response_type === "schedule" ? "schedule" : "rsvp";
    let cleanedOptions = [];
    if (responseType === "schedule") {
        cleanedOptions = Array.isArray(schedule_options)
            ? schedule_options.map((label) => String(label).trim()).filter(Boolean)
            : [];
        if (cleanedOptions.length < 2) {
            return res.status(400).json({ error: "候補日を2つ以上入力してください" });
        }
    }

    let parsedDeadline = null;
    if (response_deadline && String(response_deadline).trim()) {
        const deadlineDate = new Date(String(response_deadline).trim());
        if (Number.isNaN(deadlineDate.getTime())) {
            return res.status(400).json({ error: "回答期限の形式が正しくありません" });
        }
        parsedDeadline = deadlineDate.toISOString();
    }

    // 定員はRSVP形式のみ意味を持つ（日程調整には座席数の概念がないため）
    let parsedCapacity = null;
    if (responseType === "rsvp" && capacity !== undefined && capacity !== null && String(capacity).trim() !== "") {
        const capacityNum = parseInt(capacity, 10);
        if (!Number.isInteger(capacityNum) || capacityNum < 1) {
            return res.status(400).json({ error: "定員は1以上の整数で入力してください" });
        }
        parsedCapacity = capacityNum;
    }

    const templateId = TEMPLATE_IDS.includes(template_id) ? template_id : "standard";
    const id = crypto.randomUUID();
    // IDとは別の値にすることで、招待状のURLを知っているだけでは管理ページに入れないようにする
    const manageToken = crypto.randomBytes(12).toString("hex");

    statements.insert.run(
        id,
        String(title).trim(),
        event_datetime ? String(event_datetime) : null,
        location ? String(location).trim() : null,
        String(message).trim(),
        templateId,
        manageToken,
        responseType,
        parsedDeadline,
        parsedCapacity,
    );

    cleanedOptions.forEach((label, index) => {
        statements.insertScheduleOption.run(crypto.randomUUID(), id, label, index);
    });

    const shareUrl = `${BASE_URL}/invite.html?id=${id}`;
    // 紙の招待状や当日の受付など、オンラインで完結しないシーンでも共有できるようにQRコードも発行する
    const qrDataUrl = await QRCode.toDataURL(shareUrl, { margin: 1, width: 320 });

    res.json({
        id,
        shareUrl,
        manageUrl: `${BASE_URL}/manage.html?id=${id}&token=${manageToken}`,
        qrDataUrl,
    });
});

// 招待状閲覧ページ用。閲覧回数の制限はない。
app.get("/invitations/:id", (req, res) => {
    const invitation = statements.getById.get(req.params.id);
    if (!invitation) {
        return res.status(404).json({ error: "この招待状は見つかりません" });
    }

    const responseType = invitation.response_type || "rsvp";
    const closedState = getClosedState(invitation);

    res.json({
        title: invitation.title,
        event_datetime: invitation.event_datetime,
        location: invitation.location,
        message: invitation.message,
        template_id: invitation.template_id || "standard",
        response_type: responseType,
        schedule_options: responseType === "schedule" ? statements.getScheduleOptions.all(invitation.id) : [],
        closed: closedState.closed,
        closed_reason: closedState.reason,
    });
});

// 出欠の返信を保存する。招待状のページ内で完結させ、別ページには遷移させない
app.post("/invitations/:id/replies", (req, res) => {
    const invitation = statements.getById.get(req.params.id);
    if (!invitation) {
        return res.status(404).json({ error: "この招待状は見つかりません" });
    }

    const { guest_name, attending, comment, role_grade, companion_count } = req.body || {};

    if (!guest_name || !String(guest_name).trim()) {
        return res.status(400).json({ error: "お名前を入力してください" });
    }
    if (attending !== "yes" && attending !== "no") {
        return res.status(400).json({ error: "出欠を選択してください" });
    }

    const trimmedName = String(guest_name).trim();
    const trimmedComment = comment ? String(comment).trim() : null;
    const trimmedRole = role_grade ? String(role_grade).trim() : null;
    // 欠席の場合や不正な値の場合は同伴者0人として扱う
    const parsedCompanionCount = attending === "yes" ? parseInt(companion_count, 10) : 0;
    const companionCount = Number.isInteger(parsedCompanionCount) && parsedCompanionCount > 0
        ? Math.min(parsedCompanionCount, 20)
        : 0;

    // 同じ招待状に「同じ名前＋同じ役職・学年」の回答が既にある場合は、新規追加ではなく上書きする
    // （出席→欠席に変更したい場合などに重複行を作らないため。role_gradeも一致条件に含めることで、
    //   同姓同名の別人がいてもrole_gradeが異なれば別回答として扱える）
    const existingReply = statements.getReplyByNameAndRole.get(invitation.id, trimmedName, trimmedRole);

    // 既存の回答者が気持ちを変えて回答し直すのは締め切り後も許可するが、新規の回答は締め切り後に受け付けない
    if (!existingReply && getClosedState(invitation).closed) {
        return res.status(400).json({ error: "この招待状の回答受付は終了しています" });
    }

    if (existingReply) {
        statements.updateReply.run(attending, trimmedComment, companionCount, existingReply.id);
    } else {
        statements.insertReply.run(
            crypto.randomUUID(),
            invitation.id,
            trimmedName,
            attending,
            trimmedComment,
            trimmedRole,
            companionCount,
        );
    }

    res.json({ ok: true });
});

// 日程調整の投票を保存する（response_type = 'schedule' の招待状用）
app.post("/invitations/:id/schedule-votes", (req, res) => {
    const invitation = statements.getById.get(req.params.id);
    if (!invitation) {
        return res.status(404).json({ error: "この招待状は見つかりません" });
    }

    const { guest_name, selected_option_ids, comment, role_grade } = req.body || {};

    if (!guest_name || !String(guest_name).trim()) {
        return res.status(400).json({ error: "お名前を入力してください" });
    }
    if (!Array.isArray(selected_option_ids) || selected_option_ids.length === 0) {
        return res.status(400).json({ error: "候補日を1つ以上選択してください" });
    }

    const validOptionIds = new Set(statements.getScheduleOptions.all(invitation.id).map((o) => o.id));
    const cleanedSelection = selected_option_ids.filter((optionId) => validOptionIds.has(optionId));
    if (cleanedSelection.length === 0) {
        return res.status(400).json({ error: "候補日を1つ以上選択してください" });
    }

    const trimmedName = String(guest_name).trim();
    const trimmedComment = comment ? String(comment).trim() : null;
    const trimmedRole = role_grade ? String(role_grade).trim() : null;
    const selectionJson = JSON.stringify(cleanedSelection);

    const existingVote = statements.getScheduleVoteByNameAndRole.get(invitation.id, trimmedName, trimmedRole);

    if (!existingVote && getClosedState(invitation).closed) {
        return res.status(400).json({ error: "この招待状の回答受付は終了しています" });
    }

    if (existingVote) {
        statements.updateScheduleVote.run(selectionJson, trimmedComment, existingVote.id);
    } else {
        statements.insertScheduleVote.run(
            crypto.randomUUID(),
            invitation.id,
            trimmedName,
            trimmedRole,
            selectionJson,
            trimmedComment,
        );
    }

    res.json({ ok: true });
});

// 出欠の集計・一覧。manage_token が一致した場合のみ返す（招待状の作成者専用）
app.get("/invitations/:id/replies", (req, res) => {
    const invitation = statements.getById.get(req.params.id);
    if (!invitation) {
        return res.status(404).json({ error: "この招待状は見つかりません" });
    }
    if (!req.query.token || req.query.token !== invitation.manage_token) {
        return res.status(403).json({ error: "アクセスできません" });
    }

    const replies = statements.getRepliesByInvitationId.all(invitation.id);
    const counts = { yes: 0, no: 0, totalAttendees: 0 };
    replies.forEach((reply) => {
        if (reply.attending === "yes") {
            counts.yes += 1;
            counts.totalAttendees += 1 + (reply.companion_count || 0);
        } else if (reply.attending === "no") {
            counts.no += 1;
        }
    });

    const closedState = getClosedState(invitation);

    res.json({
        title: invitation.title,
        template_id: invitation.template_id || "standard",
        response_type: invitation.response_type || "rsvp",
        response_deadline: invitation.response_deadline,
        capacity: invitation.capacity,
        closed: closedState.closed,
        closed_reason: closedState.reason,
        counts,
        replies,
    });
});

// 日程調整の集計・一覧。manage_token が一致した場合のみ返す（招待状の作成者専用）
app.get("/invitations/:id/schedule-votes", (req, res) => {
    const invitation = statements.getById.get(req.params.id);
    if (!invitation) {
        return res.status(404).json({ error: "この招待状は見つかりません" });
    }
    if (!req.query.token || req.query.token !== invitation.manage_token) {
        return res.status(403).json({ error: "アクセスできません" });
    }

    const options = statements.getScheduleOptions.all(invitation.id);
    const votes = statements.getScheduleVotesByInvitationId.all(invitation.id).map((vote) => ({
        ...vote,
        selected_option_ids: JSON.parse(vote.selected_option_ids),
    }));

    const counts = {};
    options.forEach((option) => { counts[option.id] = 0; });
    votes.forEach((vote) => {
        vote.selected_option_ids.forEach((optionId) => {
            if (counts[optionId] !== undefined) counts[optionId] += 1;
        });
    });

    const closedState = getClosedState(invitation);

    res.json({
        title: invitation.title,
        template_id: invitation.template_id || "standard",
        response_deadline: invitation.response_deadline,
        closed: closedState.closed,
        closed_reason: closedState.reason,
        options,
        counts,
        votes,
    });
});

app.listen(PORT, () => {
    console.log(`デジタル招待状メーカー: http://localhost:${PORT}`);
});
