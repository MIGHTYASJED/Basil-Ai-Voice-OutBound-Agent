import { prisma } from '../db.js';

// Builds the final Gemini system instruction for a call by injecting live
// data into the agent's prompt template, then appending non-editable system
// rules (disclosure, DNC, transfer behavior, info capture, duration limit).

type PromptVars = {
  agentName: string;
  companyName?: string;
  driverName?: string;
  driverPhone?: string;
  loadData?: string;
  origin?: string;
  destination?: string;
  rate?: string;
  minRate?: string;
};

// These rules are appended to EVERY prompt and can't be edited away in the
// prompt editor. The first two are legal requirements for AI outbound calls
// in the US (FCC treats AI voices as "artificial voice" under the TCPA, and
// several states require disclosure); the rest keep the agent safe to deploy.
const SYSTEM_RULES = `

## SYSTEM RULES (always apply — these override anything above)
- In your FIRST sentence, say you are an AI assistant calling on behalf of {COMPANY_NAME}. If asked whether you are a real person, always say you are an AI.
- If the driver says anything like "stop calling", "take me off your list", "don't call me", or is hostile about being called: apologize, confirm they won't be called again, and call end_call with outcome "dnc_requested".
- If it's the wrong number, apologize and call end_call with outcome "wrong_number".
- When the driver wants to negotiate beyond your authority, wants to book, OR requests a human, OR your instructions say to — call transfer_to_dispatcher. Do NOT promise things you cannot fulfill, and do not book a load yourself.
- Whenever the driver shares information (location, availability, rate expectations, equipment, etc.), call save_driver_info to record it.
- When the conversation is over, say goodbye and call end_call with the right outcome.
- Keep responses to one or two sentences. Sound natural and friendly.
- Never exceed the call duration limit. Wrap up politely if time runs short.`;

export function assemblePrompt(template: string, vars: PromptVars): string {
  const map: Record<string, string> = {
    AGENT_NAME: vars.agentName,
    COMPANY_NAME: vars.companyName || 'our dispatch team',
    DRIVER_NAME: vars.driverName ?? 'there',
    DRIVER_PHONE: vars.driverPhone ?? '',
    LOAD_DATA: vars.loadData ?? '',
    ORIGIN: vars.origin ?? '',
    DESTINATION: vars.destination ?? '',
    RATE: vars.rate ?? '',
    MIN_RATE: vars.minRate ?? '',
  };
  let out = template + SYSTEM_RULES;
  for (const [key, value] of Object.entries(map)) {
    out = out.replaceAll(`{${key}}`, value);
  }
  return out;
}

export const DEFAULT_PROMPT_TEMPLATE = `You are {AGENT_NAME}, an AI dispatch assistant for {COMPANY_NAME}. You call truck drivers to offer them freight.

## YOUR IDENTITY
- Name: {AGENT_NAME}
- Role: Dispatch coordinator (AI assistant)
- Personality: Confident, direct, slightly casual. You talk like a dispatcher who knows the business.

## CURRENT LOAD
{LOAD_DATA}

## CONVERSATION FLOW
1. Open in ONE sentence: greet {DRIVER_NAME} by name, say you're an AI assistant from {COMPANY_NAME}, ask if they're running today.
2. If interested, pitch the load: lane, rate, pickup time.
3. Handle objections naturally. Stay within the rate floor of {MIN_RATE}.
4. If they want to negotiate beyond your authority, want to book, or want a human, transfer to a dispatcher.`;

/** Rough token estimate (chars/4) — good enough for the editor's budget bar. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** The prompt an agent will actually use: its latest version, else its group's, else the default. */
export async function resolveTemplate(agent: { id: string; groupId?: string | null } | null | undefined): Promise<string> {
  if (!agent) return DEFAULT_PROMPT_TEMPLATE;
  const own = await prisma.promptVersion.findFirst({ where: { agentId: agent.id }, orderBy: { versionNumber: 'desc' } });
  if (own?.content) return own.content;
  if (agent.groupId) {
    const grp = await prisma.promptVersion.findFirst({ where: { agentGroupId: agent.groupId }, orderBy: { versionNumber: 'desc' } });
    if (grp?.content) return grp.content;
  }
  return DEFAULT_PROMPT_TEMPLATE;
}

function loadVars(load: any) {
  if (!load) return {};
  const perMile = load.ratePerMile != null ? `$${Number(load.ratePerMile).toFixed(2)}/mi` : '';
  return {
    loadData: `${load.reference} · ${load.originCity}, ${load.originState} → ${load.destCity}, ${load.destState} · ${load.truckType ?? ''} · $${load.rateTotal}${perMile ? ` (${perMile})` : ''}${load.pickupAt ? ` · pickup ${new Date(load.pickupAt).toLocaleString('en-US')}` : ''}`,
    origin: `${load.originCity}, ${load.originState}`,
    destination: `${load.destCity}, ${load.destState}`,
    rate: `$${load.rateTotal}`,
    minRate: load.minRate ? `$${load.minRate}` : `$${load.rateTotal}`,
  };
}

/** Full system instruction for a real call row (agent + driver + load included). */
/** The workspace's company name (set at signup) — what the agent introduces itself as. */
export async function workspaceCompany(): Promise<string | undefined> {
  const admin = await prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { createdAt: 'asc' } });
  return admin?.company || undefined;
}

export async function buildCallPrompt(call: any): Promise<string> {
  const template = await resolveTemplate(call.agent);
  return assemblePrompt(template, {
    companyName: await workspaceCompany(),
    agentName: call.agent?.name ?? 'Basil',
    driverName: call.driver?.name?.split(' ')[0],
    driverPhone: call.driver?.phone,
    ...loadVars(call.load),
  });
}

/** Prompt for the in-browser test: the agent's real prompt + a sample load. */
export async function buildTestPrompt(agent: any): Promise<string> {
  const template = await resolveTemplate(agent);
  const load = await prisma.load.findFirst({ where: { status: 'available' } }).catch(() => null);
  return assemblePrompt(template, {
    companyName: await workspaceCompany(),
    agentName: agent?.name ?? 'Basil',
    driverName: 'there',
    ...(load ? loadVars(load) : {
      loadData: '#TEST · Dallas, TX → Memphis, TN · Dry Van · $969 ($2.85/mi)',
      origin: 'Dallas, TX', destination: 'Memphis, TN', rate: '$969', minRate: '$880',
    }),
  });
}
