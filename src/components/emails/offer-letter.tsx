/**
 * Offer Letter Email Template
 * Sent to candidates when an offer is extended.
 */

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import { main, container, heading, paragraph, hr, footer } from "./styles";

interface OfferLetterEmailProps {
  candidateName: string;
  roleTitle: string;
  compBase?: string | null;
}

export function OfferLetterEmail({
  candidateName,
  roleTitle,
  compBase,
}: OfferLetterEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Offer Letter: {roleTitle}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Offer Letter</Heading>

          <Text style={paragraph}>Hi {candidateName},</Text>

          <Text style={paragraph}>
            We are pleased to extend an offer for the position of{" "}
            <strong>{roleTitle}</strong>.
          </Text>

          {compBase && (
            <Text style={paragraph}>
              Base compensation: <strong>{compBase}</strong>
            </Text>
          )}

          <Text style={paragraph}>
            Please review the details and let us know if you have any questions
            or would like to discuss the terms.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            Best regards,
            <br />
            The Hiring Team
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
