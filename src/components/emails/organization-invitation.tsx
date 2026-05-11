/**
 * Organization Invitation Email Template
 * Uses React Email components for consistent styling
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
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
  link,
  hr,
  footer,
} from "./styles";

interface OrganizationInvitationEmailProps {
  inviterName: string;
  organizationName: string;
  inviteLink: string;
  role: string;
}

export function OrganizationInvitationEmail({
  inviterName,
  organizationName,
  inviteLink,
  role,
}: OrganizationInvitationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {inviterName} invited you to join {organizationName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>
            You&apos;ve been invited to join {organizationName}
          </Heading>

          <Text style={paragraph}>
            <strong>{inviterName}</strong> has invited you to join{" "}
            <strong>{organizationName}</strong> as a <strong>{role}</strong>.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={inviteLink}>
              Accept Invitation
            </Button>
          </Section>

          <Text style={paragraph}>
            Or copy and paste this URL into your browser:
          </Text>
          <Link href={inviteLink} style={link}>
            {inviteLink}
          </Link>

          <Hr style={hr} />

          <Text style={footer}>
            This invitation will expire in 7 days. If you didn&apos;t expect this
            invitation, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}


