// Generates realistic dispatch conversations for simulation mode (no Gemini
// key needed). Produces a transcript, extracted driver info, an AI summary,
// and an outcome — mirroring exactly what the real Gemini Live session yields
// via transcription + function calls. The orchestrator consumes the same
// shape whether it came from here or from a live Gemini session.

export type TranscriptTurn = { speaker: 'BASIL' | 'DRIVER'; text: string; t: number };

export type SimulatedConversation = {
  transcript: TranscriptTurn[];
  driverInfo: string[];
  aiSummary: string;
  sentiment: string;
  outcome: 'booked' | 'callback' | 'not_interested' | 'transferred';
  transfer?: { reason: string; summary: string };
};

type Ctx = {
  agentName: string;
  companyName?: string;
  driverName: string;
  driverFirst: string;
  loadRef: string;
  origin: string;
  dest: string;
  rate: string;
  perMile: string;
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function simulateConversation(ctx: Ctx): SimulatedConversation {
  const t = (n: number) => n;
  const turns: TranscriptTurn[] = [];
  turns.push({ speaker: 'BASIL', text: `Hey ${ctx.driverFirst}, this is ${ctx.agentName}, an AI assistant calling for ${ctx.companyName ?? 'our dispatch team'}. Got a solid load heading out of ${ctx.origin} — you running today?`, t: t(2) });

  const roll = Math.random();

  if (roll < 0.30) {
    // not interested
    turns.push({ speaker: 'DRIVER', text: pick(["Nah, I'm booked up this week.", "Not running that lane, sorry.", "I'm parked til Monday."]), t: t(7) });
    turns.push({ speaker: 'BASIL', text: `No problem at all. Want me to keep you in mind for ${ctx.dest} lanes next week?`, t: t(11) });
    turns.push({ speaker: 'DRIVER', text: pick(["Yeah sure.", "That's fine."]), t: t(14) });
    return {
      transcript: turns,
      driverInfo: ['Not available this week', `Open to ${ctx.dest} lanes later`],
      aiSummary: `Driver not running this week. Asked to be kept in mind for ${ctx.dest} lanes.`,
      sentiment: 'Neutral',
      outcome: 'not_interested',
    };
  }

  if (roll < 0.52) {
    // callback
    turns.push({ speaker: 'DRIVER', text: "What's the rate?", t: t(7) });
    turns.push({ speaker: 'BASIL', text: `${ctx.rate}, that's ${ctx.perMile} a mile, ${ctx.origin} to ${ctx.dest}. Pickup tomorrow morning. That work?`, t: t(11) });
    turns.push({ speaker: 'DRIVER', text: pick(["Let me check my schedule and call you back.", "I gotta talk to my partner first.", "Can you hit me back this evening?"]), t: t(16) });
    turns.push({ speaker: 'BASIL', text: "Absolutely, I'll follow up this evening. Have a safe one.", t: t(19) });
    return {
      transcript: turns,
      driverInfo: [`Interested in ${ctx.loadRef}`, 'Needs to confirm schedule', 'Callback this evening'],
      aiSummary: `Driver interested in ${ctx.loadRef} but needs to confirm availability. Callback scheduled this evening.`,
      sentiment: 'Positive',
      outcome: 'callback',
    };
  }

  // interested → negotiation → transfer to dispatcher (AI cannot book itself)
  turns.push({ speaker: 'DRIVER', text: "What're you paying?", t: t(7) });
  turns.push({ speaker: 'BASIL', text: `${ctx.rate} — ${ctx.perMile} a mile, ${ctx.origin} to ${ctx.dest}, pickup tomorrow 6 AM.`, t: t(11) });
  turns.push({ speaker: 'DRIVER', text: pick(["Rate's a little light. Can you do better?", "I need a human to confirm that rate before I commit.", "What's the detention policy on this one?"]), t: t(16) });
  turns.push({ speaker: 'BASIL', text: `Let me get one of our dispatchers on the line to take care of that for you. One moment, ${ctx.driverFirst}.`, t: t(20) });

  const reason = pick(['rate_negotiation', 'human_requested', 'complex_question']);
  const summary =
    reason === 'rate_negotiation'
      ? `Driver wants a better rate on ${ctx.loadRef}. Interested but negotiating.`
      : reason === 'human_requested'
      ? `Driver wants human confirmation on the rate before committing to ${ctx.loadRef}.`
      : `Driver has a detention/policy question on ${ctx.loadRef} outside AI scope.`;

  return {
    transcript: turns,
    driverInfo: [`Interested in ${ctx.loadRef}`, 'Available tomorrow 6 AM', reason === 'rate_negotiation' ? 'Negotiating rate' : 'Wants human confirmation'],
    aiSummary: summary,
    sentiment: 'Neutral-Positive',
    outcome: 'transferred',
    transfer: { reason, summary },
  };
}
