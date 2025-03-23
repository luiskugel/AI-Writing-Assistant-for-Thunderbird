document.addEventListener("DOMContentLoaded", async () => {
  // Load saved settings
  const result = await browser.storage.local.get([
    "promptImprove",
    "promptHtml2Text",
    "selectedModel",
    "apiKey",
    "temperature",
    "maxTokens",
  ]);
  if (result.apiKey) {
    document.getElementById("apiKey").value = result.apiKey;
  }
  if (result.promptImprove) {
    document.getElementById("promptImprove").value = result.promptImprove;
  } else {
    document.getElementById("promptImprove").value =`Du erhältst eine E-Mail im HTML- oder Textformat. Deine Aufgabe: Überarbeite ausschließlich den Draft-Teil und formuliere daraus eine vollständige E-Mail im HTML-Format in der Sprache die auch im Draft verwendet wird.
Vorgehensweise:
1. Strukturiere den Inhalt logisch und leserfreundlich.
2. Formuliere die E-Mail klar, prägnant und übersichtlich. Halte dich dabei an folgende Regeln:
  - Keine unnötigen Adjektive
  - Klare, kurze und präzise Sprache
  - Alle Stichpunkte müssen vollständig und inhaltlich korrekt enthalten sein
  - Der Text muss leicht überfliegbar und schnell erfassbar sein.
3. Gib ausschließlich den plain HTML-Code ohne codeblock formatierung zurück, der den Draft-Teil ersetzt.
Wichtig: 
  - Der Kontext-/Verlaufsteil dient nur zur Orientierung, er soll nicht verändert oder ausgegeben werden.
  - Der HTML-Code einer ggf vorhandenen Signatur darf nicht verändert werden.
  `;
  }
  if (result.promptHtml2Text) {
    document.getElementById("promptHtml2Text").value = result.promptHtml2Text;
  } else {
    document.getElementById("promptHtml2Text").value = `Du erhältst eine E-Mail im HTML-Format. Deine Aufgabe ist es, den HTML-Code in einen lesbaren Text umzuwandeln.
    `;
  }
  if (result.selectedModel) {
    document.getElementById("model").value = result.selectedModel;
  }
  if (result.temperature !== undefined) {
    document.getElementById("temperature").value = result.temperature;
    document.getElementById("temperatureValue").textContent =
      result.temperature.toFixed(2);
  }
  if (result.maxTokens !== undefined) {
    document.getElementById("maxTokens").value = result.maxTokens;
  }

  // Handle temperature slider changes
  document.getElementById("temperature").addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("temperatureValue").textContent = value.toFixed(2);
  });

  // Handle save button click
  document.getElementById("save").addEventListener("click", async () => {
    const apiKey = document.getElementById("apiKey").value.trim();
    const promptImprove = document.getElementById("promptImprove").value.trim();
    const promptHtml2Text = document.getElementById("promptHtml2Text").value.trim();
    const model = document.getElementById("model").value;
    const temperature = parseFloat(
      document.getElementById("temperature").value
    );
    const maxTokens = parseInt(document.getElementById("maxTokens").value);

    if (!apiKey) {
      showStatus("Please enter an API key", "error");
      return;
    }
    if (!promptImprove || !promptHtml2Text) {
      showStatus("Please enter all prompts", "error");
      return;
    }
    if (!model) {
      showStatus("Please select a model", "error");
      return;
    }
    if (maxTokens < 1 || maxTokens > 4000) {
      showStatus("Max tokens must be between 1 and 4000", "error");
      return;
    }
    if (temperature < 0 || temperature > 2) {
      showStatus("Temperature must be between 0 and 2", "error");
      return;
    }
    try {
      // Save settings
      await browser.storage.local.set({
        apiKey: apiKey,
        promptImprove: promptImprove,
        promptHtml2Text: promptHtml2Text,
        selectedModel: model,
        temperature: temperature,
        maxTokens: maxTokens,
      });
      showStatus("Settings saved successfully!", "success");
    } catch (error) {
      showStatus("Error saving settings: " + error.message, "error");
    }
  });
});

function showStatus(message, type) {
  const statusDiv = document.getElementById("status");
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = "block";

  // Hide status after 3 seconds
  setTimeout(() => {
    statusDiv.style.display = "none";
  }, 3000);
}
