# AI Writing Assistant for Thunderbird

A Thunderbird extension that helps improve your email writing using various AI models. This extension can enhance your email's writing style, tone, and formatting while maintaining the original message.

## Features

### Multiple AI Models Support

- **OpenAI Models**
  - GPT-4 Turbo
  - GPT-4 Turbo Mini
  - GPT-3.5 Turbo
- **Groq Models**
  - Llama 3.3 70B Versatile
  - Llama 3.2 3B Preview
- **Google Models**
  - Gemini 2.0 Flash

### Customizable Settings

- **Temperature Control**: Adjust the creativity level (0-2)
  - Lower values (0-1): More focused and deterministic responses
  - Higher values (1-2): More creative and diverse responses
- **Max Tokens**: Control the maximum length of AI responses (1-4000)
- **Custom Prompts**: Set your own prompt for email improvement
- **Model Selection**: Choose your preferred AI model

### User-Friendly Interface

- Simple one-click improvement
- Visual feedback during processing
- Error handling with helpful messages
- Easy access to settings

## Installation

1. Download the extension
2. Open Thunderbird
3. Go to Tools > Add-ons
4. Click the gear icon and select "Install Add-on From File"
5. Select the downloaded extension file

## First-Time Setup

1. When you first install the extension, it will automatically open the settings page
2. Enter your API key for your chosen AI model
3. Configure your preferred settings:
   - Select your AI model
   - Set temperature (0-2)
   - Set max tokens (1-4000)
   - Customize the improvement prompt

## Usage

1. Compose a new email in Thunderbird
2. Click the "Improve Writing Style" button in the compose window
3. Wait for the AI to process your email
4. The improved version will replace your original text
5. Both HTML and plain text versions will be updated

## Settings

Access settings at any time by:

1. Right-clicking the extension icon
2. Selecting "Extension Settings"
3. Or when prompted after a missing API key error

### Available Settings

- **API Key**: Your chosen AI model's API key
- **Model**: Select from available AI models
- **Temperature**: Control response creativity (0-2)
- **Max Tokens**: Set maximum response length (1-4000)
- **Improvement Prompt**: Customize how the AI improves your email

## Error Handling

The extension provides clear feedback when:

- API key is missing or invalid
- Network errors occur
- Processing fails
- Settings need to be configured

## Requirements

- Thunderbird 78.0 or later
- Valid API key for your chosen AI model
- Internet connection for AI processing

## Privacy

- Your email content is only sent to the AI service when you click the improve button
- No data is stored locally except for your settings
- API keys are stored securely in your browser's local storage

## Support

If you encounter any issues:

1. Check your API key is correctly set
2. Verify your internet connection
3. Ensure you're using a supported Thunderbird version
4. Check the error message for specific guidance

## License

[Your chosen license]
