# Contributing to AI Writing Assistant for Thunderbird

Thank you for your interest in contributing! We aim to keep things simple and welcome any help to make this extension better.

## Project Layout

```
manifest.json        Add-on manifest (permissions, scripts, icons)
config/models.json   Providers and models - edit this to add either
modules/config.js    Loads and validates the model configuration
modules/settings.js  Settings defaults, storage and migration
modules/api.js       Request/response handling per provider API shape
background.js        Compose-button handler
options.html/.js/.css  Settings page
```

To add a provider, add an entry to `config/models.json` and, if it lives on a
new domain, add that host to `permissions` in `manifest.json`. Code changes are
only needed for a genuinely new request format (see `api` in `modules/api.js`).

To try your changes, load the folder in Thunderbird via
_Tools > Developer Tools > Debug Add-ons > Load Temporary Add-on_ and pick
`manifest.json`.

## Ways to Contribute

### Reporting Bugs

If you find a bug, please open an issue and include:

- What happened
- What you expected to happen
- Steps to reproduce
- Your Thunderbird version and OS
- Screenshots (if relevant)

### Submitting Changes

1. Fork the repository
2. Create a branch for your changes
3. Test your changes in Thunderbird
4. Submit a pull request with a clear description of your changes

### Feature Requests

Have an idea? Open an issue to discuss it! Include:

- The problem you're trying to solve
- Your proposed solution
- Why you think it would be useful

## Questions?

Feel free to open an issue for any questions you might have.

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
