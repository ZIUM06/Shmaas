# GitHub Actions Account Cleanup

This project uses `.github/workflows/cleanup-expired-accounts.yml` to remove accounts whose deletion deadline or expiry has passed.

## Add the Firebase secret

1. Open the Firebase Console for project `shmaas-3a0c6`.
2. Open **Project settings** and go to **Service accounts**.
3. Click **Generate new private key** and download the JSON file.
4. Open the GitHub repository for this project.
5. Go to **Settings -> Secrets and variables -> Actions**.
6. Create a repository secret named `FIREBASE_SERVICE_ACCOUNT_JSON`.
7. Open the downloaded JSON file, copy all of its contents, and paste them into the secret.
8. Delete the downloaded JSON file from your computer after saving the GitHub secret.

Never commit the service-account JSON file to the repository or place it in website JavaScript.

## Test it

Open the repository's **Actions** tab, choose **Clean up expired accounts**, click **Run workflow**, and confirm that the job succeeds.

The workflow also runs every 15 minutes. GitHub may delay scheduled jobs, so deletion can happen a little after the exact deadline.
