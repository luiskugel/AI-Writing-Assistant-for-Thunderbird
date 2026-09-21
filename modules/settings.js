/**
 * Settings storage: defaults, reads, writes and migration of pre-0.3 layouts.
 */
var AIWA = AIWA || {};

AIWA.settings = (function () {
  const DEFAULT_PROMPT_IMPROVE = `You will receive an email in HTML or plain text format, along with a context history. Your task is to revise the email draft only. Use the context solely for informational guidance - do NOT include it in your output.
Rules:
1. Structure: Clear, logical, and easy to read.
2. Language:
   - Use the same language as in the draft.
   - Write clearly, politely, and concisely. Avoid unnecessary adjectives.
3. Content: All bullet points from the draft must be included fully and accurately.
4. Text formatting: Return only standard, well-formatted email text.
5. Format: Return only HTML - no metadata, no subject line, no additional explanations.
6. HTML structure: Keep <html>, <body>, etc., exactly as in the draft. Leave open tags open if they are open in the draft.
7. Signature (if present): Do not modify.

Only the section between <!-- BEGIN DRAFT --> and <!-- END DRAFT --> should be revised. The section between <!-- BEGIN CONTEXT --> and <!-- END CONTEXT --> is for reference only.`;

  const DEFAULT_PROMPT_HTML2TEXT = `You will receive an email in HTML format. Convert the HTML into readable plain text. Return only the plain text, nothing else.`;

  const DEFAULTS = {
    selectedModel: "",
    apiKeys: {},
    endpoints: {},
    promptImprove: DEFAULT_PROMPT_IMPROVE,
    promptHtml2Text: DEFAULT_PROMPT_HTML2TEXT,
    temperature: 1,
    maxTokens: 2000,
    useConversationHistory: true,
  };

  const KEYS = Object.keys(DEFAULTS);
  const LEGACY_KEYS = ["apiKey", "customApiEndpoint", "customModel"];

  /**
   * Moves settings written by versions <= 0.2 into the current layout:
   * a single `apiKey` becomes a per-provider map, and the `custom:` pseudo
   * provider becomes a real provider id. Runs at most once per install.
   */
  async function migrate() {
    const stored = await browser.storage.local.get([...KEYS, ...LEGACY_KEYS]);
    if (!stored.apiKey && !stored.customModel && !stored.customApiEndpoint) {
      return;
    }

    const updates = {};
    let selectedModel = stored.selectedModel || "";
    const legacy = AIWA.config.parseModelRef(selectedModel);

    if (legacy.providerId === "custom") {
      // 0.2 shipped a single "custom:" entry that was wired to Ollama's
      // native API, with the model and endpoint kept in separate fields.
      const endpoint = stored.customApiEndpoint || "";
      const providerId = endpoint.includes("/api/") ? "ollama" : "custom";
      selectedModel = AIWA.config.formatModelRef(
        providerId,
        stored.customModel || ""
      );
      updates.selectedModel = selectedModel;
      if (endpoint) {
        updates.endpoints = { ...(stored.endpoints || {}), [providerId]: endpoint };
      }
    }

    if (stored.apiKey) {
      const providerId = AIWA.config.parseModelRef(selectedModel).providerId;
      if (providerId && providerId !== "custom" && providerId !== "ollama") {
        updates.apiKeys = {
          ...(stored.apiKeys || {}),
          [providerId]: stored.apiKey,
        };
      }
    }

    await browser.storage.local.set(updates);
    await browser.storage.local.remove(LEGACY_KEYS);
  }

  /** Reads all settings, filling in defaults for anything never saved. */
  async function load() {
    await migrate();
    const stored = await browser.storage.local.get(KEYS);
    const settings = { ...DEFAULTS };
    for (const key of KEYS) {
      if (stored[key] !== undefined && stored[key] !== null) {
        settings[key] = stored[key];
      }
    }
    return settings;
  }

  async function save(settings) {
    const payload = {};
    for (const key of KEYS) {
      if (settings[key] !== undefined) {
        payload[key] = settings[key];
      }
    }
    await browser.storage.local.set(payload);
  }

  return {
    DEFAULTS,
    DEFAULT_PROMPT_IMPROVE,
    DEFAULT_PROMPT_HTML2TEXT,
    migrate,
    load,
    save,
  };
})();
