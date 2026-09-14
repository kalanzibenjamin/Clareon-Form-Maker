# Setup

## Requirements

- A Google Sheet
- Google Drive access
- A Google Form template if template-based generation is required

## Install a Script

1. Open the target Google Sheet.
2. Select **Extensions > Apps Script**.
3. Copy one version into the Apps Script editor:
   - `v1/smart-study-v1.gs` for simple form generation
   - `legacy/smart-study-v2.1.gs` for the enhanced system
   - `legacy/smart-study-v3.gs` for the advanced legacy system
4. Save the project and run the initialization function when required.
5. Accept the requested Google permissions.
6. Reload the spreadsheet and open the **Form Generator** menu.

Do not combine v1, v2.1, and v3 in the same Apps Script project. They are separate versions and may define overlapping global functions or constants.

## Template IDs

If a script uses a Google Form template, copy the ID from the form URL and replace the relevant default template constant. Keep API keys and other secrets out of the repository.
