import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Dilliznt",
  description: "Terms and conditions for using the Dilliznt talent intelligence platform.",
};

export default function TermsPage() {
  return (
    <div className="bg-slate-950 text-slate-300">
      <div className="max-w-3xl mx-auto px-6 lg:px-10 py-24">
        <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-500 mb-12">
          Last updated: April 14, 2026
        </p>

        <div className="space-y-10 text-[15px] leading-relaxed">
          <Section title="1. Agreement to Terms">
            <p>
              By accessing or using Dilliznt (&quot;the Platform&quot;), operated by
              Dilliznt (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), you agree to
              be bound by these Terms of Service. If you are using the Platform on behalf
              of an organization, you represent that you have authority to bind that
              organization to these terms.
            </p>
          </Section>

          <Section title="2. Description of Service">
            <p>
              Dilliznt is an AI-native talent intelligence platform that provides recruiting
              operations tools including candidate management, AI-powered screening and
              scoring, video interviews, assessments, offer generation, talent pools,
              engagement campaigns, and related recruiting workflows.
            </p>
          </Section>

          <Section title="3. Accounts">
            <p className="font-medium text-white mb-2">Registration</p>
            <p>
              You must provide accurate and complete information when creating an account.
              You are responsible for maintaining the security of your account credentials
              and for all activities that occur under your account.
            </p>

            <p className="font-medium text-white mt-4 mb-2">Organization Accounts</p>
            <p>
              Organizations create workspaces to manage their recruiting operations.
              The organization administrator is responsible for managing team members,
              permissions, and ensuring compliance with applicable employment and data
              protection laws.
            </p>

            <p className="font-medium text-white mt-4 mb-2">Candidate Accounts</p>
            <p>
              Candidates may create accounts to complete their profiles and explore
              opportunities. Candidate accounts are subject to these same terms.
            </p>
          </Section>

          <Section title="4. Acceptable Use">
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Use the Platform for any unlawful purpose or in violation of applicable employment laws</li>
              <li>Upload malicious code, viruses, or harmful content</li>
              <li>Attempt to access other organizations&apos; data or accounts</li>
              <li>Reverse engineer, decompile, or disassemble the Platform</li>
              <li>Use the Platform to discriminate against candidates on any legally protected basis</li>
              <li>Resell, sublicense, or redistribute access to the Platform without our consent</li>
              <li>Use automated tools to scrape, crawl, or extract data from the Platform</li>
              <li>Interfere with or disrupt the integrity or performance of the Platform</li>
            </ul>
          </Section>

          <Section title="5. Your Data">
            <p className="font-medium text-white mb-2">Ownership</p>
            <p>
              You retain all rights to the data you upload or create on the Platform,
              including candidate information, job descriptions, interview notes,
              assessments, and related content. We do not claim ownership of your data.
            </p>

            <p className="font-medium text-white mt-4 mb-2">License to Operate</p>
            <p>
              You grant us a limited license to process your data solely for the purpose
              of providing and improving the Platform&apos;s services. This includes
              processing data through AI agents for candidate analysis, scoring, matching,
              and other recruiting workflows you configure.
            </p>

            <p className="font-medium text-white mt-4 mb-2">AI Processing</p>
            <p>
              You acknowledge that the Platform uses artificial intelligence to process
              recruiting data. AI outputs (scores, recommendations, analyses) are provided
              as decision-support tools and should not be used as the sole basis for
              employment decisions. You are responsible for reviewing AI outputs and making
              final hiring decisions.
            </p>

            <p className="font-medium text-white mt-4 mb-2">No Training on Your Data</p>
            <p>
              We do not use your organization&apos;s data to train our AI models or any
              third-party models. Data sent to AI providers is processed per-request and
              not retained by those providers for training purposes.
            </p>
          </Section>

          <Section title="6. Third-Party Integrations">
            <p>
              The Platform allows you to connect third-party services including Google
              Calendar, Gmail, and Microsoft Outlook. When you connect these services:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>
                You authorize us to access the specific data described in our{" "}
                <a href="/privacy" className="text-amber-400 hover:text-amber-300 underline underline-offset-2">
                  Privacy Policy
                </a>{" "}
                (Section 5).
              </li>
              <li>
                You can disconnect any integration at any time from your account settings.
              </li>
              <li>
                Third-party services are governed by their own terms and privacy policies.
                We are not responsible for the practices of third-party providers.
              </li>
              <li>
                OAuth access and refresh tokens are encrypted at rest (AES-256-GCM) and
                deleted immediately upon disconnection.
              </li>
            </ul>
          </Section>

          <Section title="7. Video Interviews &amp; Recording">
            <p>
              The Platform includes video interview functionality with optional recording
              and transcription. When using these features:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>
                You are responsible for informing all interview participants that the
                session may be recorded and transcribed, and obtaining any required consent
                under applicable laws.
              </li>
              <li>
                Recorded interviews and transcripts are stored within your organization&apos;s
                workspace and are subject to your data retention policies.
              </li>
              <li>
                Screen monitoring features (proctoring) must be disclosed to candidates
                prior to the interview.
              </li>
            </ul>
          </Section>

          <Section title="8. Intellectual Property">
            <p>
              The Platform, including its design, code, AI models, documentation, and
              branding, is owned by Dilliznt and protected by intellectual property laws.
              These terms do not grant you any rights to our intellectual property except
              the limited right to use the Platform as described herein.
            </p>
          </Section>

          <Section title="9. Disclaimers">
            <p>
              The Platform is provided &quot;as is&quot; and &quot;as available&quot;
              without warranties of any kind, whether express or implied. We do not
              warrant that:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>The Platform will be uninterrupted, error-free, or secure</li>
              <li>AI-generated outputs will be accurate, complete, or free from bias</li>
              <li>The Platform will meet your specific requirements</li>
              <li>Third-party integrations will function without interruption</li>
            </ul>
            <p className="mt-3">
              You are solely responsible for your hiring decisions. AI outputs are
              decision-support tools, not substitutes for human judgment.
            </p>
          </Section>

          <Section title="10. Limitation of Liability">
            <p>
              To the maximum extent permitted by law, Dilliznt shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages, or any
              loss of profits or revenues, whether incurred directly or indirectly, or
              any loss of data, use, goodwill, or other intangible losses resulting from
              your use of the Platform.
            </p>
          </Section>

          <Section title="11. Indemnification">
            <p>
              You agree to indemnify and hold harmless Dilliznt from any claims, damages,
              losses, or expenses (including legal fees) arising from your use of the
              Platform, your violation of these terms, or your violation of any
              applicable law including employment and data protection regulations.
            </p>
          </Section>

          <Section title="12. Termination">
            <p>
              Either party may terminate the agreement at any time. Upon termination,
              your right to use the Platform ceases immediately. We will retain your data
              for 30 days to allow for export, after which it will be deleted or
              anonymized unless retention is required by law.
            </p>
          </Section>

          <Section title="13. Changes to Terms">
            <p>
              We may update these terms from time to time. We will notify you of material
              changes by posting the updated terms on this page and updating the
              &quot;Last updated&quot; date. Continued use of the Platform after changes
              constitutes acceptance of the revised terms.
            </p>
          </Section>

          <Section title="14. Governing Law">
            <p>
              These terms are governed by the laws of the jurisdiction in which Dilliznt
              is incorporated, without regard to conflict of law principles.
            </p>
          </Section>

          <Section title="15. Contact Us">
            <p>
              If you have questions about these Terms of Service, contact us at:
            </p>
            <p className="mt-2 text-white">
              legal@dilliznt.com
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
