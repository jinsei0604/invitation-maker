require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");

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
const SEAL_COLORS = ["blue", "red", "green", "gold"];

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

const statements = {
    insert: db.prepare(`
        INSERT INTO invitations (id, title, event_datetime, location, message, seal_color)
        VALUES (?, ?, ?, ?, ?, ?)
    `),
    getById: db.prepare(`SELECT * FROM invitations WHERE id = ?`),
};

// --- App setup ---
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.redirect("/create.html");
});

// フォーム内容を保存し、招待状の共有URLを発行する（完全無料なので決済は挟まない）
app.post("/invitations", (req, res) => {
    const { title, event_datetime, location, message, seal_color } = req.body || {};

    if (!title || !String(title).trim()) {
        return res.status(400).json({ error: "タイトルを入力してください" });
    }
    if (!message || !String(message).trim()) {
        return res.status(400).json({ error: "メッセージ本文を入力してください" });
    }

    const sealColor = SEAL_COLORS.includes(seal_color) ? seal_color : "blue";
    const id = crypto.randomUUID();

    statements.insert.run(
        id,
        String(title).trim(),
        event_datetime ? String(event_datetime) : null,
        location ? String(location).trim() : null,
        String(message).trim(),
        sealColor,
    );

    res.json({ id, shareUrl: `${BASE_URL}/invite.html?id=${id}` });
});

// 招待状閲覧ページ用。閲覧回数の制限はない。
app.get("/invitations/:id", (req, res) => {
    const invitation = statements.getById.get(req.params.id);
    if (!invitation) {
        return res.status(404).json({ error: "この招待状は見つかりません" });
    }

    res.json({
        title: invitation.title,
        event_datetime: invitation.event_datetime,
        location: invitation.location,
        message: invitation.message,
        seal_color: invitation.seal_color,
    });
});

app.listen(PORT, () => {
    console.log(`デジタル招待状メーカー: http://localhost:${PORT}`);
});
