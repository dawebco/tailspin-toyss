import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createCanvas, joinSession } from '@github/copilot-sdk/extension';

const execFileAsync = promisify(execFile);
const servers = new Map();
let session;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function truncate(value, length = 220) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    return normalized.length > length ? `${normalized.slice(0, length - 1)}…` : normalized;
}

function scoreIssue(issue) {
    const labels = issue.labels.map((label) => label.name.toLowerCase());
    let score = 0;
    if (labels.some((label) => /critical|blocker|security|urgent/.test(label))) score += 12;
    if (labels.some((label) => /bug|regression|broken/.test(label))) score += 8;
    if (labels.some((label) => /help wanted|good first issue/.test(label))) score += 1;
    score += Math.min(issue.comments, 6);
    const updatedAt = Date.parse(issue.updatedAt);
    if (!Number.isNaN(updatedAt)) {
        score += Math.max(0, 5 - Math.floor((Date.now() - updatedAt) / 86_400_000));
    }
    return score;
}

function priorityReason(issue, rank) {
    const labels = issue.labels.map((label) => label.name.toLowerCase());
    const reasons = [];
    if (labels.some((label) => /critical|blocker|security|urgent/.test(label))) {
        reasons.push('it carries a high-severity label');
    } else if (labels.some((label) => /bug|regression|broken/.test(label))) {
        reasons.push('it reports a bug or regression');
    }
    if (issue.comments > 0) reasons.push(`${issue.comments} comment${issue.comments === 1 ? '' : 's'} indicate active discussion`);
    const updatedAt = Date.parse(issue.updatedAt);
    if (!Number.isNaN(updatedAt) && Date.now() - updatedAt < 7 * 86_400_000) {
        reasons.push('it was updated recently');
    }
    if (reasons.length === 0) reasons.push('it is among the highest-scoring open issues by recency and activity');
    return `Ranked #${rank} because ${reasons.join(' and ')}.`;
}

async function loadIssues() {
    const { stdout } = await execFileAsync('gh', [
        'issue',
        'list',
        '--state',
        'open',
        '--limit',
        '50',
        '--json',
        'number,title,body,labels,comments,createdAt,updatedAt,url',
    ]);
    const issues = JSON.parse(stdout);
    return issues
        .map((issue) => ({ ...issue, score: scoreIssue(issue) }))
        .sort((left, right) => right.score - left.score || Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function renderCard(issue, reason = '') {
    const labels = issue.labels
        .map((label) => `<span class="label">${escapeHtml(label.name)}</span>`)
        .join('');
    const description = truncate(issue.body || 'No description provided.');
    return `<article class="card">
        <div class="card-header">
            <span class="number">#${escapeHtml(issue.number)}</span>
            <h3>${escapeHtml(issue.title)}</h3>
        </div>
        <p class="description">${escapeHtml(description)}</p>
        <div class="labels">${labels || '<span class="muted">No labels</span>'}</div>
        ${reason ? `<p class="reason"><strong>Why it is here:</strong> ${escapeHtml(reason)}</p>` : ''}
        <div class="card-footer">
            <a href="${escapeHtml(issue.url)}" target="_blank" rel="noreferrer">View issue</a>
            <button data-issue-number="${escapeHtml(issue.number)}">Add to current context</button>
        </div>
    </article>`;
}

function renderHtml(instanceId, issues, error) {
    const topIssues = issues.slice(0, 3);
    const remainingIssues = issues.slice(3);
    const topMarkup = topIssues
        .map((issue, index) => renderCard(issue, priorityReason(issue, index + 1)))
        .join('');
    const remainingMarkup = remainingIssues.map((issue) => renderCard(issue)).join('');
    const errorMarkup = error
        ? `<div class="error" role="alert">${escapeHtml(error)}</div>`
        : '';

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Issue triage board</title>
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px; background: var(--background-color-default, #0d1117); color: var(--text-color-default, #f0f6fc); font: 14px/1.5 var(--font-sans, system-ui, sans-serif); }
main { max-width: 980px; margin: 0 auto; }
h1 { margin: 0 0 6px; font-size: 24px; }
h2 { margin: 30px 0 12px; font-size: 17px; }
.intro, .muted { color: var(--text-color-muted, #8b949e); }
.board { display: grid; gap: 12px; }
.card { border: 1px solid var(--border-color-default, #30363d); border-radius: 10px; padding: 16px; background: var(--background-color-muted, #161b22); }
.card-header { display: flex; gap: 10px; align-items: baseline; }
.card h3 { margin: 0; font-size: 16px; }
.number { color: var(--true-color-blue, #58a6ff); font-family: var(--font-mono, monospace); }
.description { color: var(--text-color-muted, #8b949e); margin: 10px 0; }
.labels { display: flex; flex-wrap: wrap; gap: 6px; }
.label { border: 1px solid var(--border-color-default, #30363d); border-radius: 999px; padding: 2px 8px; color: var(--text-color-muted, #8b949e); font-size: 12px; }
.reason { border-left: 3px solid var(--true-color-orange, #d29922); padding-left: 10px; margin: 12px 0; }
.card-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 14px; }
a { color: var(--true-color-blue, #58a6ff); }
button { border: 0; border-radius: 6px; padding: 8px 12px; background: var(--true-color-blue, #238636); color: var(--color-white, #fff); cursor: pointer; font: inherit; }
button:hover { filter: brightness(1.15); }
button:focus-visible { outline: 2px solid var(--color-focus-outline, #58a6ff); outline-offset: 2px; }
button[disabled] { cursor: wait; opacity: .65; }
.empty, .error { border-radius: 8px; padding: 14px; background: var(--background-color-muted, #161b22); }
.error { color: var(--true-color-red, #ff7b72); }
</style>
</head>
<body>
<main>
    <h1>Issue triage board</h1>
    <p class="intro">The three issues most likely to need attention are at the top. Select any issue to add its details to this session.</p>
    ${errorMarkup}
    <h2>Needs attention now</h2>
    <section class="board" aria-label="Highest priority issues">
        ${topMarkup || '<div class="empty">No open issues found.</div>'}
    </section>
    ${remainingIssues.length ? `<h2>All other open issues</h2><section class="board" aria-label="Other open issues">${remainingMarkup}</section>` : ''}
</main>
<script>
document.querySelectorAll('button[data-issue-number]').forEach((button) => {
    button.addEventListener('click', async () => {
        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = 'Adding…';
        try {
            const response = await fetch('/add-to-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issueNumber: Number(button.dataset.issueNumber) }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not add issue');
            button.textContent = 'Added to context';
        } catch (error) {
            button.disabled = false;
            button.textContent = originalText;
            window.alert(error.message);
        }
    });
});
</script>
</body>
</html>`;
}

async function startServer(instanceId) {
    let issues = [];
    let error = '';
    try {
        issues = await loadIssues();
    } catch (loadError) {
        error = `Unable to load open issues: ${loadError.message}`;
    }

    const server = createServer(async (req, res) => {
        if (req.method === 'POST' && req.url === '/add-to-context') {
            let body = '';
            req.setEncoding('utf8');
            for await (const chunk of req) body += chunk;
            try {
                const { issueNumber } = JSON.parse(body);
                const issue = issues.find((candidate) => candidate.number === issueNumber);
                if (!issue) throw new Error('Issue is no longer available on this board.');
                await session.send({
                    prompt: `Add issue #${issue.number} to the current working context and be ready to work on it.\n\nTitle: ${issue.title}\nURL: ${issue.url}\nDescription:\n${issue.body || 'No description provided.'}`,
                });
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true }));
            } catch (actionError) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: actionError.message }));
            }
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderHtml(instanceId, issues, error));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
}

session = await joinSession({
    canvases: [
        createCanvas({
            id: 'issue-triage-board',
            displayName: 'Issue triage board',
            description: 'A Kanban-style board that ranks open GitHub issues and adds selected issues to the current session context.',
            actions: [
                {
                    name: 'refresh',
                    description: 'Refresh the issue triage board by reopening its current panel.',
                    handler: async () => ({ refreshed: true }),
                },
            ],
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer(ctx.instanceId);
                    servers.set(ctx.instanceId, entry);
                }
                return { title: 'Issue triage board', url: entry.url };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});
