import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Dilliznt",
  description: "How Dilliznt collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <div className="bg-slate-950 text-slate-300">
      <div className="max-w-3xl mx-auto px-6 lg:px-10 py-24">
        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-12">
          Last updated: April 14, 2026
        </p>

        <div className="space-y-10 text-[15px] leading-relaxed">
          <Section title="1. Introduction">
            <p>
              Dilliznt (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the Dilliznt talent
              intelligence platform at dilliznt.com. This Privacy Policy explains how we
              collect, use, disclose, and safeguard your information when you use our
              platform and services.
            </p>
          </Section>

          <Section title="2. Information We Collect">
            <p className="font-medium text-white mb-2">Account Information</p>
            <p>
              When you create an account, we collect your name, email address,
              organization name, and authentication credentials. If you sign in via a
              third-party provider (Google, LinkedIn, or GitHub), we receive your name
              and email address as authorized by that provider.
            </p>

            <p className="font-medium text-white mt-4 mb-2">Usage Data</p>
            <p>
              We automatically collect information about how you interact with our
              platform, including pages visited, features used, timestamps, and device
              and browser information.
            </p>

            <p className="font-medium text-white mt-4 mb-2">
              Recruiting &amp; Candidate Data
            </p>
            <p>
              When you use Dilliznt for recruiting operations, you may upload or input
              candidate information, resumes, job descriptions, interview notes, assessment
              responses, and related data. You control what data you provide, and you are
              responsible for ensuring you have appropriate consent or legal basis to
              process that data.
            </p>

            <p className="font-medium text-white mt-4 mb-2">
              Third-Party Integration Data
            </p>
            <p>
              When you connect third-party services (Google Calendar, Gmail, Microsoft
              Outlook), we access only the specific data required to provide scheduling
              and communication features. See Section 5 for details on each integration.
            </p>
          </Section>

          <Section title="3. How We Use Your Information">
            <ul className="list-disc pl-5 space-y-2">
              <li>Provide, operate, and maintain our platform and services</li>
              <li>
                Process data through AI agents for candidate analysis, scoring, matching,
                interview preparation, and other recruiting workflows you configure
              </li>
              <li>
                Schedule interviews by reading calendar availability and creating
                calendar events on your behalf
              </li>
              <li>Send candidate communications through connected email accounts</li>
              <li>Improve and personalize your experience</li>
              <li>Communicate with you about your account, updates, and support</li>
              <li>Detect, prevent, and address security issues and abuse</li>
              <li>Comply with legal obligations</li>
            </ul>
          </Section>

          <Section title="4. AI Processing">
            <p>
              Dilliznt uses artificial intelligence to power recruiting operations
              including candidate analysis, scoring, matching, interview preparation,
              assessment evaluation, and offer generation. AI processing is performed
              on data you provide within your organization&apos;s workspace. We do not
              use your organization&apos;s data to train our AI models. All AI agent
              actions are logged in an audit trail with inputs, outputs, and timestamps.
            </p>
          </Section>

          <Section title="5. Third-Party Integrations &amp; OAuth">
            <p className="mb-4">
              When you connect third-party services, we request only the permissions
              necessary for the features you use. Below is a complete list of data
              accessed for each integration.
            </p>

            <div className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-5 space-y-6">
              <div>
                <p className="font-medium text-white mb-2">Google Calendar</p>
                <p className="text-sm mb-2">Scopes requested:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li><code className="text-amber-400 text-xs">calendar.readonly</code> — Read your calendar free/busy availability</li>
                  <li><code className="text-amber-400 text-xs">calendar.events</code> — Create and delete interview events on your calendar</li>
                  <li><code className="text-amber-400 text-xs">userinfo.email</code> — Identify your account by email address</li>
                </ul>
                <p className="text-sm mt-2">
                  <span className="text-white">What we do:</span> Check panelist availability, create interview
                  calendar events with attendees and optional Google Meet links, and delete events when
                  interviews are cancelled.
                </p>
                <p className="text-sm mt-1">
                  <span className="text-white">What we don&apos;t do:</span> We do not read the content of your
                  existing calendar events, access contacts, or modify events we did not create.
                </p>
              </div>

              <div>
                <p className="font-medium text-white mb-2">Gmail</p>
                <p className="text-sm mb-2">Scopes requested:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li><code className="text-amber-400 text-xs">gmail.send</code> — Send emails on your behalf</li>
                  <li><code className="text-amber-400 text-xs">userinfo.email</code> — Identify your account by email address</li>
                </ul>
                <p className="text-sm mt-2">
                  <span className="text-white">What we do:</span> Send candidate communications (outreach,
                  scheduling confirmations, follow-ups) from your email address when you initiate them.
                </p>
                <p className="text-sm mt-1">
                  <span className="text-white">What we don&apos;t do:</span> We do not read your inbox, access
                  existing emails, scan message content, or send emails without your explicit action.
                </p>
              </div>

              <div>
                <p className="font-medium text-white mb-2">Microsoft Outlook Calendar</p>
                <p className="text-sm mb-2">Scopes requested:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li><code className="text-amber-400 text-xs">Calendars.ReadWrite</code> — Read availability and create/delete events</li>
                  <li><code className="text-amber-400 text-xs">email</code>, <code className="text-amber-400 text-xs">openid</code> — Identify your account</li>
                  <li><code className="text-amber-400 text-xs">offline_access</code> — Maintain connection without repeated sign-in</li>
                </ul>
                <p className="text-sm mt-2">
                  <span className="text-white">What we do:</span> Check panelist availability, create interview
                  calendar events with attendees and optional Teams meeting links, and delete events when
                  interviews are cancelled.
                </p>
                <p className="text-sm mt-1">
                  <span className="text-white">What we don&apos;t do:</span> We do not read the content of your
                  existing calendar events, access mail, contacts, or files.
                </p>
              </div>
            </div>

            <p className="mt-4">
              You can disconnect any integration at any time from your account settings.
              When disconnected, we delete the stored access and refresh tokens immediately.
            </p>
          </Section>

          <Section title="6. Google API Services — Limited Use Disclosure">
            <p>
              Dilliznt&apos;s use and transfer of information received from Google APIs
              adheres to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300 underline underline-offset-2"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. Specifically:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>
                We only use Google user data to provide and improve the calendar scheduling
                and email features you explicitly connect and use.
              </li>
              <li>
                We do not use Google user data for advertising, market research, or to
                build user profiles unrelated to the recruiting features you use.
              </li>
              <li>
                We do not sell Google user data to third parties.
              </li>
              <li>
                We do not use Google user data to train AI or machine learning models.
              </li>
              <li>
                Human access to Google user data is limited to what is necessary for
                security, legal compliance, or at your explicit request.
              </li>
            </ul>
          </Section>

          <Section title="7. Data Sharing &amp; Disclosure">
            <p>We do not sell your personal information. We may share data with:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>
                <span className="text-white">AI model providers</span> (e.g., OpenAI,
                Anthropic) to process recruiting workflows. Data is sent per-request and
                not retained by providers for training.
              </li>
              <li>
                <span className="text-white">Infrastructure providers</span> (hosting,
                database, video) who process data on our behalf under data processing
                agreements.
              </li>
              <li>
                <span className="text-white">Third-party integrations</span> you
                explicitly connect (e.g., Google Calendar, Gmail, Outlook).
              </li>
              <li>
                <span className="text-white">Legal authorities</span> when required
                by law or to protect our rights.
              </li>
            </ul>
          </Section>

          <Section title="8. Data Security">
            <p>We implement the following security measures:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>
                <span className="text-white">OAuth token encryption:</span> All
                third-party access and refresh tokens are encrypted at rest using
                AES-256-GCM with unique initialization vectors.
              </li>
              <li>
                <span className="text-white">Multi-tenant isolation:</span> All data
                is scoped to your organization. Queries are filtered at the application
                layer to prevent cross-organization data access.
              </li>
              <li>
                <span className="text-white">Authentication:</span> SSO via Google,
                GitHub, and LinkedIn with JWT-based session management.
              </li>
              <li>
                <span className="text-white">Audit logging:</span> All AI agent
                executions are logged with inputs, outputs, timestamps, and status.
              </li>
              <li>
                <span className="text-white">Encrypted transport:</span> All data in
                transit is protected via TLS 1.2+.
              </li>
            </ul>
          </Section>

          <Section title="9. Data Retention">
            <p>
              We retain your data for as long as your account is active or as needed to
              provide services. When you delete your account, we will delete or
              anonymize your data within 30 days, except where retention is required by
              law. OAuth tokens are deleted immediately when you disconnect an
              integration.
            </p>
          </Section>

          <Section title="10. Your Rights">
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Access, correct, or delete your personal data</li>
              <li>Export your data in a portable format</li>
              <li>Object to or restrict certain processing</li>
              <li>Withdraw consent where processing is based on consent</li>
              <li>Disconnect third-party integrations and have tokens deleted immediately</li>
            </ul>
            <p className="mt-2">
              To exercise these rights, contact us at privacy@dilliznt.com.
            </p>
          </Section>

          <Section title="11. Cookies">
            <p>
              We use essential cookies for authentication and session management. We do
              not use third-party advertising or tracking cookies.
            </p>
          </Section>

          <Section title="12. Children&apos;s Privacy">
            <p>
              Dilliznt is not directed to individuals under the age of 16. We do not
              knowingly collect personal information from children. If you believe we
              have collected data from a child, contact us and we will delete it promptly.
            </p>
          </Section>

          <Section title="13. International Data Transfers">
            <p>
              Your data may be processed in countries other than your own. We ensure
              appropriate safeguards are in place for any cross-border data transfers
              in compliance with applicable data protection laws.
            </p>
          </Section>

          <Section title="14. Changes to This Policy">
            <p>
              We may update this policy from time to time. We will notify you of
              material changes by posting the updated policy on this page and updating
              the &quot;Last updated&quot; date. Continued use of the platform after
              changes constitutes acceptance of the revised policy.
            </p>
          </Section>

          <Section title="15. Contact Us">
            <p>
              If you have questions about this Privacy Policy or our data practices,
              contact us at:
            </p>
            <p className="mt-2 text-white">
              privacy@dilliznt.com
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-3">{title}</h2>
      {children}
    </section>
  );
}
