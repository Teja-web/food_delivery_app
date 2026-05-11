/**
 * Candidate Message Email Template
 * Used for freeform outreach messages sent to candidates.
 */

import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import { main, container, paragraph } from "./styles";

interface CandidateMessageEmailProps {
  subject: string;
  message: string;
}

export function CandidateMessageEmail({
  subject,
  message,
}: CandidateMessageEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          {message.split("\n").map((line, i) => (
            <Text key={i} style={paragraph}>
              {line || "\u00A0"}
            </Text>
          ))}
        </Container>
      </Body>
    </Html>
  );
}
