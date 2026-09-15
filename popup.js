/* ===================================================
   AI Writing Assistant — Review Popup Logic
   =================================================== */

// ---- State ----
let originalDraft = "";
let improvedDraft = "";
let conversationHistory = "";
let currentTabId = null;
let isPlainText = false;

// ---- DOM refs ----
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const reviewState = document.getElementById("reviewState");
const errorMessage = document.getElementById("errorMessage");
const diffOutput = document.getElementById("diffOutput");
const finalOutput = document.getElementById("finalOutput");

// ---- Bootstrap ----
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initToggles();
  initActions();
  startImprovement();
});

// ===================================================
//  Tabs
// ===================================================
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(tabId + "Panel").classList.add("active");
    });
  });
}

// ===================================================
//  Final-tab toggle (improved / original)
// ===================================================
function initToggles() {
  const btnImproved = document.getElementById("toggleImproved");
  const btnOriginal = document.getElementById("toggleOriginal");

  btnImproved.addEventListener("click", () => {
    btnImproved.classList.add("active");
    btnOriginal.classList.remove("active");
    renderFinal(improvedDraft);
  });

  btnOriginal.addEventListener("click", () => {
    btnOriginal.classList.add("active");
    btnImproved.classList.remove("active");
    renderFinal(originalDraft);
  });
}

// ===================================================
//  Action buttons
// ===================================================
function initActions() {
  document.getElementById("insertBtn").addEventListener("click", handleInsert);
  document
    .getElementById("tryAgainBtn")
    .addEventListener("click", handleTryAgain);
  document
    .getElementById("errorRetryBtn")
    .addEventListener("click", handleTryAgain);
  document
    .getElementById("errorSettingsBtn")
    .addEventListener("click", () => {
      browser.runtime.openOptionsPage();
      window.close();
    });
}

async function handleInsert() {
  if (!improvedDraft || currentTabId === null) return;

  try {
    const composeWindow = await browser.compose.getComposeDetails(
      currentTabId
    );

    if (isPlainText) {
      // Ask background to convert HTML → plaintext
      const plainText = await browser.runtime.sendMessage({
        action: "html2text",
        html: improvedDraft,
        tabId: currentTabId,
      });
      const body = plainText + "\n\n" + conversationHistory;
      await browser.compose.setComposeDetails(currentTabId, {
        ...composeWindow,
        plainTextBody: body,
      });
    } else {
      const body = improvedDraft + "<br><br>" + conversationHistory;
      await browser.compose.setComposeDetails(currentTabId, {
        ...composeWindow,
        body: body,
      });
    }

    window.close();
  } catch (err) {
    console.error("Insert failed:", err);
    showError("Failed to insert text: " + err.message);
  }
}

function handleTryAgain() {
  showLoading();
  startImprovement();
}

// ===================================================
//  UI state helpers
// ===================================================
function showLoading() {
  loadingState.style.display = "flex";
  errorState.style.display = "none";
  reviewState.style.display = "none";
}

function showError(msg) {
  loadingState.style.display = "none";
  errorState.style.display = "flex";
  reviewState.style.display = "none";
  errorMessage.textContent = msg;
}

function showReview() {
  loadingState.style.display = "none";
  errorState.style.display = "none";
  reviewState.style.display = "flex";
}

// ===================================================
//  Core: kick off the AI improvement
// ===================================================
async function startImprovement() {
  try {
    // Get the active compose tab
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tabs.length) throw new Error("No active compose tab found.");
    currentTabId = tabs[0].id;

    const composeWindow = await browser.compose.getComposeDetails(
      currentTabId
    );
    isPlainText = composeWindow.isPlainText;

    // Split draft from conversation history
    const [draft, history] = splitHtmlByTag(
      composeWindow.body,
      '<div class="moz-cite-prefix">'
    );
    if (!draft.trim()) throw new Error("Draft is empty. Write something first.");

    originalDraft = draft;
    conversationHistory = history;

    // Ask the background script to run the AI
    const result = await browser.runtime.sendMessage({
      action: "improve",
      draft: draft,
      history: history,
      tabId: currentTabId,
    });

    if (result.error) throw new Error(result.error);

    improvedDraft = result.improved;

    // Render both views
    renderDiff(originalDraft, improvedDraft);
    renderFinal(improvedDraft);

    // Reset toggle
    document.getElementById("toggleImproved").classList.add("active");
    document.getElementById("toggleOriginal").classList.remove("active");

    showReview();
  } catch (err) {
    console.error("Improvement failed:", err);

    let msg = err.message || "Something went wrong.";
    if (msg.includes("API key")) {
      msg = "API key not found. Please configure your API key in settings.";
    } else if (msg.includes("Cross-Origin")) {
      msg =
        'Ollama requires OLLAMA_ORIGINS to include "moz-extension://*". See Ollama FAQ.';
    }
    showError(msg);
  }
}

// ===================================================
//  Rendering
// ===================================================
function renderDiff(oldHtml, newHtml) {
  const oldText = stripHtml(oldHtml);
  const newText = stripHtml(newHtml);

  const diffs = diffWords(oldText, newText);

  // Build legend
  let html =
    '<div class="diff-legend">' +
    '<span class="diff-legend-item"><span class="diff-legend-swatch del"></span> Removed</span>' +
    '<span class="diff-legend-item"><span class="diff-legend-swatch add"></span> Added</span>' +
    "</div>";

  html += '<div class="diff-container-inner">';
  for (const d of diffs) {
    const escaped = escapeHtml(d.value);
    if (d.type === "delete") {
      html += `<span class="diff-del">${escaped}</span>`;
    } else if (d.type === "insert") {
      html += `<span class="diff-add">${escaped}</span>`;
    } else {
      html += escaped;
    }
  }
  html += "</div>";

  diffOutput.innerHTML = html;
}

function renderFinal(htmlContent) {
  const text = stripHtml(htmlContent);
  finalOutput.textContent = text;
}

// ===================================================
//  Diff Algorithm (word-level LCS diff)
// ===================================================
function diffWords(oldStr, newStr) {
  const oldWords = tokenize(oldStr);
  const newWords = tokenize(newStr);

  // Build LCS table
  const m = oldWords.length;
  const n = newWords.length;

  // Optimized: use two rows instead of full matrix
  let prev = new Array(n + 1).fill(0);
  let curr = new Array(n + 1).fill(0);

  // We need the full table for backtracking, so build it
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = new Array(n + 1).fill(0);
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const result = [];
  let i = m,
    j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      result.unshift({ type: "equal", value: oldWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "insert", value: newWords[j - 1] });
      j--;
    } else {
      result.unshift({ type: "delete", value: oldWords[i - 1] });
      i--;
    }
  }

  // Merge consecutive tokens of the same type
  return mergeTokens(result);
}

function tokenize(str) {
  // Split into words and whitespace, keeping whitespace as separate tokens
  return str.match(/\S+|\s+/g) || [];
}

function mergeTokens(tokens) {
  if (!tokens.length) return tokens;

  const merged = [{ ...tokens[0] }];
  for (let i = 1; i < tokens.length; i++) {
    const last = merged[merged.length - 1];
    if (tokens[i].type === last.type) {
      last.value += tokens[i].value;
    } else {
      merged.push({ ...tokens[i] });
    }
  }
  return merged;
}

// ===================================================
//  Utilities
// ===================================================
function splitHtmlByTag(htmlString, tagName) {
  const index = htmlString.indexOf(tagName);
  if (index === -1) return [htmlString, ""];
  return [htmlString.slice(0, index), htmlString.slice(index)];
}

function stripHtml(html) {
  // Convert <br> and block tags to newlines, then strip remaining tags
  let text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|h[1-6]|li|tr|blockquote)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  // Decode HTML entities
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  text = textarea.value;
  // Collapse excessive newlines
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}
