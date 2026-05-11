/**
 * Offer Withdrawal Email Template
 * Sent to candidates when an offer is withdrawn.
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

interface OfferWithdrawalEmailProps {
  candidateName: string;
  roleTitle: string;
}

export function OfferWithdrawalEmail({
  candidateName,
  roleTitle,
}: OfferWithdrawalEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Offer Update: {roleTitle}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Offer Update</Heading>

          <Text style={paragraph}>Hi {candidateName},</Text>

          <Text style={paragraph}>
            We regret to inform you that the offer for the position of{" "}
            <strong>{roleTitle}</strong> has been withdrawn.
          </Text>

          <Text style={paragraph}>
            We appreciate your interest and the time you invested in the process.
            If you have any questions, please don&apos;t hesitate to reach out.
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
