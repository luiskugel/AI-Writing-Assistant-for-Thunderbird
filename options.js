document.addEventListener("DOMContentLoaded", async () => {
  // Load saved settings
  const result = await browser.storage.local.get([
    "apiKey",
    "improvementPrompt",
    "selectedModel",
    "temperature",
    "maxTokens",
  ]);
  if (result.apiKey) {
    document.getElementById("apiKey").value = result.apiKey;
  }
  if (result.improvementPrompt) {
    document.getElementById("prompt").value = result.improvementPrompt;
  } else {
    document.getElementById("prompt").value =
      "The user will give you an email in html format. Please improve the writing style but keep the meaning of the email the same. Please also improve the formatting of the email and only respond with the improved html code.";
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
    const prompt = document.getElementById("prompt").value.trim();
    const model = document.getElementById("model").value;
    const temperature = parseFloat(
      document.getElementById("temperature").value
    );
    const maxTokens = parseInt(document.getElementById("maxTokens").value);

    if (!apiKey) {
      showStatus("Please enter an API key", "error");
      return;
    }
    if (!prompt) {
      showStatus("Please enter a prompt", "error");
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
        improvementPrompt: prompt,
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
