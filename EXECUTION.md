# Run the Candidate Screening CRM

This guide is for running the project on your computer for the first time.

## 1. Install Node.js

The project needs **Node.js 20.9 or newer**. To check whether it is installed, open a terminal and run:

```bash
node --version
npm --version
```

If `node` is not found, install the current Node.js LTS release from [nodejs.org](https://nodejs.org/), then close and reopen your terminal.

## 2. Open the project folder

In a terminal, go to the folder containing this project:

```bash
cd path/to/screening_crm-main
```

Replace `path/to/screening_crm-main` with the actual location of the folder on your computer. In VS Code, you can also open the project folder and choose **Terminal → New Terminal**.

## 3. Create your local settings

Copy the example settings file to a new file named `.env`:

```bash
cp .env.example .env
```

Open `.env` in a text editor. At minimum, set a private recruiter email and password, and replace the example `WEBHOOK_TOKEN` and `SESSION_SECRET` with long, unique random values. Do not share or commit `.env`.

To connect to MagickVoice and place real screening calls, add your MagickVoice API key to:

```text
MAGICKVOICE_API_KEY=your_api_key
```

Without that key, you can still start and explore the local CRM, but MagickVoice connection tests and real calls will not work. The MagickVoice settings in `.env.example` point to the staging environment; use the values for your own MagickVoice workspace if they differ.

## 4. Install project dependencies

Run this once from the project folder:

```bash
npm install
```

## 5. Start the app

Run:

```bash
npm run dev
```

The development command uses this project's `.env` settings, even if your terminal has old values for the same variables. Restart the server after changing `.env`.

When the terminal says the server is ready, open these pages in your browser:

- Candidate application page: <http://localhost:3000>
- Recruiter sign-in: <http://localhost:3000/recruiter/login>

Sign in using the `RECRUITER_EMAIL` and `RECRUITER_PASSWORD` values from your `.env` file.

Keep the terminal open while using the app. To stop the server, focus the terminal and press **Ctrl+C**.

## 6. Where your data goes

The app stores its local database and uploaded resumes in the `data` folder by default. Keep this folder if you want to preserve local applications and resumes.

## Optional commands

Run the automated core tests:

```bash
npm test
```

Create and run a production build:

```bash
npm run build
npm start
```

`npm start` serves the production build on <http://localhost:3000>. Run `npm run build` again after changing the app before starting it.

## Troubleshooting

- **`node` or `npm` is not found:** Install Node.js 20.9 or newer, then reopen the terminal.
- **Port 3000 is already in use:** Stop the other app using that port, or follow the port shown in the startup message if Next.js selects another one.
- **Recruiter sign-in fails:** Check that the email and password in `.env` match the values you are entering, then restart the app.
- **MagickVoice connection or calls fail:** Check that the API key and workspace settings in `.env` are correct. Restart the app after editing `.env`.
- **MagickVoice cannot send results to your local app:** Webhooks need a publicly reachable HTTPS address. For local development, use the dashboard's sync option or configure a secure tunnel and set `PUBLIC_BASE_URL` to its HTTPS address.
