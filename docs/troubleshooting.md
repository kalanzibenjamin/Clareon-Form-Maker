# Troubleshooting

## The menu does not appear

Reload the spreadsheet after saving the script. Confirm that the script is attached to the spreadsheet and that `onOpen` is present.

## Authorization fails

Run the initialization or main function from Apps Script and approve the requested Google permissions. Use the Apps Script execution log for the exact error.

## Required columns are missing

Check that headers are in the first row and match the selected script's expected names, including capitalization and spacing.

## A template cannot be found

Verify the template ID and confirm that the Google account running the script can access the form.

## AI features fail in a legacy version

Confirm that the API key is configured in the script's settings and that the associated API account has access and available quota. Never commit the key to this repository.
