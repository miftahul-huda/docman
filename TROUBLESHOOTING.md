# Google Drive Upload Troubleshooting

## Issue: 500 Error on File Upload

The most common cause is that your access token doesn't have the Drive API scope.

## Solution: Re-authenticate

Since you just enabled the Google Drive API, you need to get a new access token:

1. **Logout** from the application (click the Logout button)
2. **Clear your browser cookies** for localhost (or use an incognito window)
3. **Login again** - this will request a new access token with the Drive scope
4. **Try uploading** again

## Why this is needed:

When you first logged in, the Google Drive API wasn't enabled, so your access token doesn't include the `drive.file` scope. By logging out and logging in again, you'll get a fresh token with all the required permissions.

## Alternative: Check OAuth Consent Screen

Make sure in your Google Cloud Console:
1. Go to **APIs & Services** → **OAuth consent screen**
2. Scroll down to **Scopes**
3. Ensure `https://www.googleapis.com/auth/drive.file` is listed
4. If not, click **Add or Remove Scopes** and add it

Then logout and login again to get a new token.
