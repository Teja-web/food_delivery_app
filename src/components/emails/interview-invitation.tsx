/**
 * Interview Invitation Email Template
 * Sent to candidates when an interview is proposed with time slot options.
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import {
  main,
  container,
  heading,
  paragraph,
  buttonContainer,
  button,
  hr,
  footer,
} from "./styles";

interface InterviewInvitationEmailProps {
  candidateName: string;
  roleTitle: string;
  stageName: string | null;
  proposedSlots: { startAt: string; endAt: string }[];
  confirmUrl: string;
}

function formatSlot(slot: { startAt: string; endAt: string }): string {
  const start = new Date(slot.startAt);
  const end = new Date(slot.endAt);
  const dateStr = start.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const startTime = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateStr} from ${startTime} to ${endTime}`;
}

const slotItem = {
  color: "#525f7f",
  fontSize: "16px",
  lineHeight: "1.6",
  marginBottom: "8px",
};

export function InterviewInvitationEmail({
  candidateName,
  roleTitle,
  stageName,
  proposedSlots,
  confirmUrl,
}: InterviewInvitationEmailProps) {
  const interviewLabel = stageName
    ? `a ${stageName} interview`
    : "an interview";

  return (
    <Html>
      <Head />
      <Preview>
        Interview invitation for {roleTitle}
        {stageName ? ` - ${stageName}` : ""}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Interview Invitation</Heading>

          <Text style={paragraph}>Hi {candidateName},</Text>

          <Text style={paragraph}>
            We&apos;re excited to invite you to {interviewLabel} for the{" "}
            <strong>{roleTitle}</strong> position.
          </Text>

          <Text style={paragraph}>
            Please select one of the following time slots that works best for
            you:
          </Text>

          {proposedSlots.map((slot, i) => (
            <Text key={i} style={slotItem}>
              &bull; {formatSlot(slot)}
            </Text>
          ))}

          <Section style={buttonContainer}>
            <Button style={button} href={confirmUrl}>
              Confirm Your Interview
            </Button>
          </Section>

          <Text style={paragraph}>
            If you have any questions or need to reschedule, please reply to this
            email.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            This is an automated message from our recruiting system.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
