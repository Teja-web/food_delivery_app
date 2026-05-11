/**
 * Password Reset Email Template
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

interface PasswordResetEmailProps {
  resetLink: string;
  userName?: string;
}

export function PasswordResetEmail({
  resetLink,
  userName,
}: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your Dilliznt password</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Reset your password</Heading>

          <Text style={paragraph}>
            {userName ? `Hi ${userName},` : "Hi,"}
          </Text>

          <Text style={paragraph}>
            We received a request to reset your password. Click the button below
            to create a new password.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={resetLink}>
              Reset Password
            </Button>
          </Section>

          <Text style={paragraph}>
            Or copy and paste this URL into your browser:
          </Text>
          <Link href={resetLink} style={link}>
            {resetLink}
          </Link>

          <Hr style={hr} />

          <Text style={footer}>
            This link will expire in 1 hour. If you didn&apos;t request a password
            reset, you can safely ignore this email. Your password will remain
            unchanged.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}


