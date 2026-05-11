"use client";

import { useState, useTransition } from "react";
import { Calendar, Check, Database, ExternalLink, Key, Loader2, Mail, Unplug, Users, Shield, Settings2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  disconnectCalendarAction,
  disconnectEmailAction,
  disconnectATSAction,
  disconnectHRISAction,
  saveIntegrationCredentialsAction,
} from "@/actions/integrations";
import { Button } from "@/components/ui/button";

// -- Types ----------------------------------------------------------------

interface CalendarConnection {
  id: string;
  calendarEmail: string | null;
  provider: string;
}

interface EmailConnection {
  id: string;
  email: string | null;
  provider: string;
}

interface OrgConnection {
  id: string;
  provider: string;
  accountEmail: string | null;
  accountName: string | null;
  source: "connection" | "credentials";
}

type CredentialStatus = {
  configured: boolean;
  source: "org" | "platform" | "none";
};

interface Props {
  calendarConnection: CalendarConnection | null;
  emailConnection: EmailConnection | null;
  atsConnection: OrgConnection | null;
  hrisConnection: OrgConnection | null;
  credentialStatuses: Record<string, CredentialStatus>;
}

// -- Provider definitions -------------------------------------------------

type AuthType = "oauth" | "api_key";

interface ProviderDef {
  id: string;
  name: string;
  description: string;
  authType: AuthType;
  iconBg: string;
  iconColor: string;
  capabilities: string[];
  configFields?: ConfigField[];
}

interface ConfigField {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
  required?: boolean;
}

const CALENDAR_PROVIDERS: ProviderDef[] = [
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "View team availability and create calendar events with Google Meet links.",
    authType: "oauth",
    iconBg: "bg-blue-50 border-blue-100",
    iconColor: "text-blue-600",
    capabilities: [
      "View your calendar availability when scheduling interviews",
      "Auto-create calendar events with Google Meet links",
    ],
    configFields: [
      { key: "clientId", label: "Client ID", type: "text", placeholder: "Google OAuth Client ID" },
      { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "Google OAuth Client Secret" },
    ],
  },
  {
    id: "outlook-calendar",
    name: "Outlook Calendar",
    description: "View team availability and create calendar events with Teams meeting links.",
    authType: "oauth",
    iconBg: "bg-indigo-50 border-indigo-100",
    iconColor: "text-indigo-600",
    capabilities: [
      "View your calendar availability when scheduling interviews",
      "Auto-create calendar events with Microsoft Teams links",
    ],
    configFields: [
      { key: "clientId", label: "Client ID", type: "text", placeholder: "Microsoft OAuth Client ID" },
      { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "Microsoft OAuth Client Secret" },
    ],
  },
];

const EMAIL_PROVIDERS: ProviderDef[] = [
  {
    id: "google-email",
    name: "Google Email (Gmail)",
    description: "Send invitation emails and notifications from your Gmail account.",
    authType: "oauth",
    iconBg: "bg-red-50 border-red-100",
    iconColor: "text-red-600",
    capabilities: [
      "Send team invitation emails from your account",
      "Send candidate notifications and updates",
    ],
    configFields: [
      { key: "clientId", label: "Client ID", type: "text", placeholder: "Google OAuth Client ID" },
      { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "Google OAuth Client Secret" },
    ],
  },
  {
    id: "outlook-email",
    name: "Outlook Email",
    description: "Send invitation emails and notifications from your Outlook account.",
    authType: "oauth",
    iconBg: "bg-indigo-50 border-indigo-100",
    iconColor: "text-indigo-600",
    capabilities: [
      "Send team invitation emails from your account",
      "Send candidate notifications and updates",
    ],
    configFields: [
      { key: "clientId", label: "Client ID", type: "text", placeholder: "Microsoft OAuth Client ID" },
      { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "Microsoft OAuth Client Secret" },
    ],
  },
];

const ATS_PROVIDERS: ProviderDef[] = [
  {
    id: "greenhouse",
    name: "Greenhouse",
    description: "Import candidates, jobs, and applications from Greenhouse.",
    authType: "api_key",
    iconBg: "bg-green-50 border-green-100",
    iconColor: "text-green-600",
    capabilities: [
      "Sync candidates, jobs, and applications",
      "Push new candidates to Greenhouse",
      "Receive real-time webhook updates",
    ],
    configFields: [
      { key: "apiKey", label: "API Key", type: "password", placeholder: "Greenhouse Harvest API key", required: true },
    ],
  },
  {
    id: "lever",
    name: "Lever",
    description: "Sync opportunities, postings, and applications from Lever.",
    authType: "oauth",
    iconBg: "bg-teal-50 border-teal-100",
    iconColor: "text-teal-600",
    capabilities: [
      "Sync opportunities, postings, and applications",
      "Push new candidates to Lever",
      "Receive real-time webhook updates",
    ],
    configFields: [
      { key: "clientId", label: "Client ID", type: "text", placeholder: "Lever OAuth Client ID", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "Lever OAuth Client Secret", required: true },
    ],
  },
  {
    id: "ashby",
    name: "Ashby",
    description: "Import candidates and jobs from Ashby with incremental sync.",
    authType: "api_key",
    iconBg: "bg-violet-50 border-violet-100",
    iconColor: "text-violet-600",
    capabilities: [
      "Sync candidates and jobs incrementally",
      "Push new candidates to Ashby",
      "Receive real-time webhook updates",
    ],
    configFields: [
      { key: "apiKey", label: "API Key", type: "password", placeholder: "Ashby API key", required: true },
    ],
  },
  {
    id: "workable",
    name: "Workable",
    description: "Sync candidates and jobs from Workable.",
    authType: "oauth",
    iconBg: "bg-sky-50 border-sky-100",
    iconColor: "text-sky-600",
    capabilities: [
      "Sync candidates and jobs",
      "Push new candidates to job postings",
    ],
    configFields: [
      { key: "clientId", label: "Client ID", type: "text", placeholder: "Workable OAuth Client ID", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "Workable OAuth Client Secret", required: true },
    ],
  },
];

const HRIS_PROVIDERS: ProviderDef[] = [
  {
    id: "bamboohr",
    name: "BambooHR",
    description: "Sync employee directory for interviewer management and org structure.",
    authType: "api_key",
    iconBg: "bg-lime-50 border-lime-100",
    iconColor: "text-lime-600",
    capabilities: [
      "Sync employee directory",
      "Map interviewers and hiring managers",
      "Import department structure",
    ],
    configFields: [
      { key: "apiKey", label: "API Key", type: "password", placeholder: "BambooHR API key", required: true },
      { key: "subdomain", label: "Subdomain", type: "text", placeholder: "your-company (from your-company.bamboohr.com)", required: true },
    ],
  },
  {
    id: "workday",
    name: "Workday",
    description: "Sync employees, departments, and locations from Workday.",
    authType: "oauth",
    iconBg: "bg-orange-50 border-orange-100",
    iconColor: "text-orange-600",
    capabilities: [
      "Sync employees, organizations, and locations",
      "Map interviewers and hiring managers",
    ],
    configFields: [
      { key: "clientId", label: "Client ID", type: "text", placeholder: "Workday Client ID", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "Workday Client Secret", required: true },
      { key: "tenant", label: "Tenant ID", type: "text", placeholder: "your-tenant-id", required: true },
    ],
  },
  {
    id: "gusto",
    name: "Gusto",
    description: "Sync employee directory and locations from Gusto.",
    authType: "oauth",
    iconBg: "bg-rose-50 border-rose-100",
    iconColor: "text-rose-600",
    capabilities: [
      "Sync employees and locations",
      "Create and update employee records",
    ],
    configFields: [
      { key: "clientId", label: "Client ID", type: "text", placeholder: "Gusto Client ID", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "Gusto Client Secret", required: true },
    ],
  },
];

// -- Category connect URL builders ----------------------------------------

function getConnectUrl(category: string, providerId: string): string {
  return `/api/${category}/connect?provider=${providerId}`;
}

function getCategoryForProvider(providerId: string): string {
  if (ATS_PROVIDERS.some((p) => p.id === providerId)) return "ats";
  if (HRIS_PROVIDERS.some((p) => p.id === providerId)) return "hris";
  if (CALENDAR_PROVIDERS.some((p) => p.id === providerId)) return "calendar";
  return "email";
}

// -- Main component -------------------------------------------------------

export function IntegrationsClient({
  calendarConnection,
  emailConnection,
  atsConnection,
  hrisConnection,
  credentialStatuses,
}: Props) {
  const searchParams = useSearchParams();
  const justConnected = searchParams.get("connected") === "true"
    || searchParams.get("email_connected") === "true"
    || searchParams.get("ats_connected") === "true"
    || searchParams.get("hris_connected") === "true";
  const error = searchParams.get("error");

  const [disconnectingCalendar, startDisconnectCalendar] = useTransition();
  const [disconnectingEmail, startDisconnectEmail] = useTransition();
  const [disconnectingATS, startDisconnectATS] = useTransition();
  const [disconnectingHRIS, startDisconnectHRIS] = useTransition();
  const [calendarDisconnected, setCalendarDisconnected] = useState(false);
  const [emailDisconnected, setEmailDisconnected] = useState(false);
  const [atsDisconnected, setATSDisconnected] = useState(false);
  const [hrisDisconnected, setHRISDisconnected] = useState(false);

  const activeCalendar = calendarDisconnected ? null : calendarConnection?.provider ?? null;
  const activeEmail = emailDisconnected ? null : emailConnection?.provider ?? null;
  const activeATS = atsDisconnected ? null : atsConnection?.provider ?? null;
  const activeHRIS = hrisDisconnected ? null : hrisConnection?.provider ?? null;

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
          Integrations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect external services to enhance scheduling, collaboration, and data sync.
        </p>
      </div>

      {justConnected && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <Check className="h-4 w-4" />
          Integration connected successfully.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error === "missing_params" ? "Missing connection parameters."
            : error === "credentials_not_configured" ? "Please configure credentials before connecting."
            : error === "auth_failed" ? "Failed to connect. Please try again."
            : error}
        </div>
      )}

      {/* Calendar */}
      <IntegrationSection
        title="Calendar"
        icon={<Calendar className="h-4 w-4" />}
        providers={CALENDAR_PROVIDERS}
        activeProvider={activeCalendar}
        connectedLabel={calendarConnection?.calendarEmail ?? ""}
        credentialStatuses={credentialStatuses}
        connectCategory="calendar"
        onDisconnect={() => startDisconnectCalendar(async () => { await disconnectCalendarAction(); setCalendarDisconnected(true); })}
        disconnecting={disconnectingCalendar}
      />

      {/* Email */}
      <IntegrationSection
        title="Email"
        icon={<Mail className="h-4 w-4" />}
        providers={EMAIL_PROVIDERS}
        activeProvider={activeEmail}
        connectedLabel={emailConnection?.email ?? ""}
        credentialStatuses={credentialStatuses}
        connectCategory="email"
        onDisconnect={() => startDisconnectEmail(async () => { await disconnectEmailAction(); setEmailDisconnected(true); })}
        disconnecting={disconnectingEmail}
      />

      {/* ATS */}
      <IntegrationSection
        title="Applicant Tracking System"
        icon={<Database className="h-4 w-4" />}
        providers={ATS_PROVIDERS}
        activeProvider={activeATS}
        connectedLabel={atsConnection?.accountName ?? ""}
        credentialStatuses={credentialStatuses}
        connectCategory="ats"
        onDisconnect={() => startDisconnectATS(async () => { await disconnectATSAction(); setATSDisconnected(true); })}
        disconnecting={disconnectingATS}
      />

      {/* HRIS */}
      <IntegrationSection
        title="HR Information System"
        icon={<Users className="h-4 w-4" />}
        providers={HRIS_PROVIDERS}
        activeProvider={activeHRIS}
        connectedLabel={hrisConnection?.accountName ?? ""}
        credentialStatuses={credentialStatuses}
        connectCategory="hris"
        onDisconnect={() => startDisconnectHRIS(async () => { await disconnectHRISAction(); setHRISDisconnected(true); })}
        disconnecting={disconnectingHRIS}
      />
    </div>
  );
}

// -- Section component ----------------------------------------------------

function IntegrationSection({
  title,
  icon,
  providers,
  activeProvider,
  connectedLabel,
  credentialStatuses,
  connectCategory,
  onDisconnect,
  disconnecting,
}: {
  title: string;
  icon: React.ReactNode;
  providers: ProviderDef[];
  activeProvider: string | null;
  connectedLabel: string;
  credentialStatuses: Record<string, CredentialStatus>;
  connectCategory: string;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">{icon} {title}</h2>
      <div className="grid grid-cols-2 gap-4 items-start">
        {providers.map((provider) => {
          const isConnected = activeProvider === provider.id;
          const isOtherConnected = activeProvider != null && activeProvider !== provider.id;
          const credStatus = credentialStatuses[provider.id] ?? { configured: false, source: "none" };

          return (
            <ProviderCard
              key={provider.id}
              provider={provider}
              isConnected={isConnected}
              isOtherConnected={isOtherConnected}
              connectedLabel={connectedLabel}
              credentialStatus={credStatus}
              connectCategory={connectCategory}
              onDisconnect={onDisconnect}
              disconnecting={disconnecting}
            />
          );
        })}
      </div>
    </div>
  );
}

// -- Provider card --------------------------------------------------------

function ProviderCard({
  provider,
  isConnected,
  isOtherConnected,
  connectedLabel,
  credentialStatus,
  connectCategory,
  onDisconnect,
  disconnecting,
}: {
  provider: ProviderDef;
  isConnected: boolean;
  isOtherConnected: boolean;
  connectedLabel: string;
  credentialStatus: CredentialStatus;
  connectCategory: string;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const [showConfig, setShowConfig] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, startSaving] = useTransition();

  const hasPlatformDefault = credentialStatus.source === "platform";
  const isConfigured = credentialStatus.configured;
  const canConnect = isConfigured && !isOtherConnected;
  const isAPIKey = provider.authType === "api_key";

  const handleSaveCredentials = () => {
    const category = connectCategory as "ats" | "hris" | "calendar" | "email";
    const hasApiKey = formValues.apiKey;

    startSaving(async () => {
      const data: Record<string, unknown> = {};

      if (hasApiKey) {
        data.apiKey = formValues.apiKey;
        // Extra config fields (subdomain, tenant, etc.)
        const configFields: Record<string, string> = {};
        for (const field of provider.configFields ?? []) {
          if (field.key !== "apiKey" && field.key !== "clientId" && field.key !== "clientSecret" && formValues[field.key]) {
            configFields[field.key] = formValues[field.key];
          }
        }
        if (Object.keys(configFields).length > 0) data.config = configFields;
      } else {
        data.clientId = formValues.clientId;
        data.clientSecret = formValues.clientSecret;
        // Extra config fields
        const configFields: Record<string, string> = {};
        for (const field of provider.configFields ?? []) {
          if (field.key !== "clientId" && field.key !== "clientSecret" && formValues[field.key]) {
            configFields[field.key] = formValues[field.key];
          }
        }
        if (Object.keys(configFields).length > 0) data.config = configFields;
      }

      await saveIntegrationCredentialsAction(provider.id, category, data as any);

      if (isAPIKey) {
        // API key providers are "connected" immediately after saving credentials
        window.location.href = `/recruit/settings/integrations?${category}_connected=true`;
      } else {
        setShowConfig(false);
        window.location.reload();
      }
    });
  };

  // Status badge
  const statusBadge = isConnected ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-[10px] font-medium text-green-700">
      <Check className="h-2.5 w-2.5" /> Connected
    </span>
  ) : isConfigured && hasPlatformDefault ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
      <Shield className="h-2.5 w-2.5" /> Platform default
    </span>
  ) : isConfigured ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-medium text-blue-700">
      <Settings2 className="h-2.5 w-2.5" /> Configured
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-700">
      <Key className="h-2.5 w-2.5" /> Setup required
    </span>
  );

  const iconMap: Record<string, React.ReactNode> = {
    calendar: <Calendar className={`h-5 w-5 ${provider.iconColor}`} />,
    email: <Mail className={`h-5 w-5 ${provider.iconColor}`} />,
    ats: <Database className={`h-5 w-5 ${provider.iconColor}`} />,
    hris: <Users className={`h-5 w-5 ${provider.iconColor}`} />,
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${provider.iconBg}`}>
            {iconMap[connectCategory]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">{provider.name}</p>
              {statusBadge}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isConnected ? `Connected — ${connectedLabel}` : provider.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <Button
              variant="soft"
              onClick={onDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium hover:text-red-600 hover:border-red-200 transition-colors"
            >
              {disconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />}
              Disconnect
            </Button>
          ) : isOtherConnected ? (
            <span className="rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground opacity-50">
              Connect
            </span>
          ) : (
            <>
              {/* Configure button (always available for non-platform-default providers, or as override) */}
              {(!hasPlatformDefault || credentialStatus.source === "org") && (
                <Button
                  variant="soft"
                  onClick={() => setShowConfig(!showConfig)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  <Settings2 className="h-3 w-3" />
                  {isConfigured ? "Reconfigure" : "Configure"}
                </Button>
              )}

              {/* Connect button for OAuth providers (only when configured, exclude platform defaults which have their own section) */}
              {!isAPIKey && canConnect && !(hasPlatformDefault && credentialStatus.source === "platform") && (
                <Button asChild>
                  <a
                    href={getConnectUrl(connectCategory, provider.id)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Connect
                  </a>
                </Button>
              )}

              {/* For platform-default providers not yet overridden, show Connect directly */}
              {!isAPIKey && hasPlatformDefault && credentialStatus.source === "platform" && (
                <>
                  <Button asChild>
                    <a
                      href={getConnectUrl(connectCategory, provider.id)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Connect
                    </a>
                  </Button>
                  <Button
                    variant="soft"
                    onClick={() => setShowConfig(!showConfig)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground"
                  >
                    <Settings2 className="h-3 w-3" />
                    Override
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Configuration form */}
      {showConfig && !isConnected && (
        <div className="border-t border-border px-5 py-4">
          <div className="space-y-3">
            {(provider.configFields ?? []).map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-foreground mb-1">
                  {field.label}
                  {field.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <input
                  type={field.type}
                  value={formValues[field.key] ?? ""}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button
              onClick={handleSaveCredentials}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-xs font-semibold"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save credentials"}
            </Button>
            <Button
              variant="soft"
              onClick={() => setShowConfig(false)}
              className="rounded-lg px-4 py-2 text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Capabilities when connected */}
      {isConnected && (
        <div className="border-t border-border px-5 py-3">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-1">
            Capabilities
          </p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {provider.capabilities.map((cap) => (
              <li key={cap} className="flex items-center gap-2">
                <Check className="h-3 w-3 text-green-500" />
                {cap}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
