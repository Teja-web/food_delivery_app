import { google } from "googleapis";

/**
 * Gmail API OAuth 2.0 Email Sender
 * Sends emails using Gmail API instead of SMTP
 * Used for team invitations only.
 */

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Creates an OAuth2 client for Gmail API
 */
function createOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return oauth2Client;
}

/**
 * Creates a raw email message in RFC 2822 format
 */
function createEmailMessage(options: EmailOptions): string {
  const from = options.from || process.env.GMAIL_USER || "";
  const messageParts = [
    `From: ${from}`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    options.html,
  ];

  return messageParts.join("\n");
}

/**
 * Sends an email using Gmail API with OAuth 2.0
 */
async function sendEmailWithGmailAPI(options: EmailOptions): Promise<void> {
  const oauth2Client = createOAuth2Client();
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const emailMessage = createEmailMessage(options);

  const encodedMessage = Buffer.from(emailMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
    },
  });

  console.log(`Email sent successfully to ${options.to}`);
}

/**
 * Wrapper function that mimics nodemailer's sendMail interface
 */
export function createGmailAPITransporter() {
  return {
    sendMail: async (mailOptions: {
      from: string;
      to: string;
      subject: string;
      html: string;
    }) => {
      await sendEmailWithGmailAPI({
        to: mailOptions.to,
        subject: mailOptions.subject,
        html: mailOptions.html,
        from: mailOptions.from,
      });
    },
  };
}
