document.addEventListener("DOMContentLoaded", async () => {
  // Initially load saved settings
  const result = await browser.storage.local.get([
    "promptImprove",
    "promptHtml2Text",
    "selectedModel",
    "apiKey",
    "temperature",
    "maxTokens",
    "useConversationHistory",
  ]); 
  if (result.selectedModel) {
    document.getElementById("model").value = result.selectedModel;
  }
  if (result.apiKey) {
    document.getElementById("apiKey").value = result.apiKey;
  }
  if (result.promptImprove) {
    document.getElementById("promptImprove").value = result.promptImprove;
  } else {
    document.getElementById("promptImprove").value =`You will receive an email in HTML or plain text format, along with a context history. Your task is to revise the email draft only. Use the context solely for informational guidance - do NOT include it in your output.
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
  }
  if (result.promptHtml2Text) {
    document.getElementById("promptHtml2Text").value = result.promptHtml2Text;
  } else {
    document.getElementById("promptHtml2Text").value = `Du erhältst eine E-Mail im HTML-Format. Deine Aufgabe ist es, den HTML-Code in einen lesbaren Text umzuwandeln.`;
  }
  if (result.temperature !== undefined) {
    document.getElementById("temperature").value = result.temperature;
    document.getElementById("temperatureValue").textContent =
      result.temperature.toFixed(2);
  }
  if (result.maxTokens !== undefined) {
    document.getElementById("maxTokens").value = result.maxTokens;
  }
  if (result.customApiEndpoint !== undefined) {
    document.getElementById("customApiEndpoint").value = result.customApiEndpoint;
  } else {
    document.getElementById("customApiEndpoint").value = "http://localhost:11434/api/chat";
  }
  if (result.customModel !== undefined) {
    document.getElementById("customModel").value = result.customModel;
  }
  if (result.useConversationHistory !== undefined) {
    document.getElementById("useConversationHistory").checked = result.useConversationHistory;
  } else {
    document.getElementById("useConversationHistory").checked = true;
  }
  
  // Handle conditional display of inputs
  const modelSelect = document.getElementById("model");
  modelSelect.addEventListener("change", () => {
    const isCustom = modelSelect.value === "custom:";
    document.getElementById("customApiEndpointGroup").style.display = isCustom ? "block" : "none";
    document.getElementById("customModelGroup").style.display = isCustom ? "block" : "none";
  });

  // Handle temperature slider changes
  document.getElementById("temperature").addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("temperatureValue").textContent = value.toFixed(2);
  });

  // Handle save button click
  document.getElementById("save").addEventListener("click", async () => {
    const model = document.getElementById("model").value;
    const apiKey = document.getElementById("apiKey").value.trim();
    const promptImprove = document.getElementById("promptImprove").value.trim();
    const promptHtml2Text = document.getElementById("promptHtml2Text").value.trim();
    const customApiEndpoint = document.getElementById("customApiEndpoint").value;
    const customModel = document.getElementById("customModel").value;
    const temperature = parseFloat(
      document.getElementById("temperature").value
    );
    const maxTokens = parseInt(document.getElementById("maxTokens").value);
    const useConversationHistory = document.getElementById("useConversationHistory").checked;

    if (model === "custom:") {
      if (!customModel) {
        showStatus("Please enter a custom model", "error");
        return;
      }
      if (!customApiEndpoint) {
        showStatus("Please enter a custom API endpoint", "error");
        return;
      }
    }
    if (!apiKey && model !== "custom:") {
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
        customApiEndpoint: customApiEndpoint,
        customModel: customModel,
        temperature: temperature,
        maxTokens: maxTokens,
        useConversationHistory: useConversationHistory,
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
