// Draft writers. In the live system a language model writes the first draft
// of the prose from the contact, the company and the verified research. It
// never decides who is contacted, when, from which account, or whether the
// draft may leave: the sequencer, the scorecard and a person do that.
//
// This repo ships a template writer so the whole loop runs offline. Every
// draft it produces goes through the same scorecard as a model-written one.
import type { Company, Contact } from "../types.ts";

export interface DraftWriter {
  write(args: { contact: Contact; company: Company | null; variant: string; touch: number }):
    { subject: string; body: string };
}

const OPENERS: Record<string, (c: Contact, co: Company | null) => string> = {
  A: (_c, co) => `${co?.name ?? "Your team"} is building a US audience this year. A race weekend puts the people you want in one room for three days.`,
  B: (_c, co) => `I saw ${co?.name ?? "your company"} is expanding in the US. Our paddock is full of owners and executives who run their own companies.`,
  C: (c) => `Your role as ${c.title ?? "a commercial lead"} came up when we mapped which companies have a reason to be at the track this season.`,
  D: (_c, co) => `We run a race program and introduce partners to the businesses already in our paddock. ${co?.name ?? "Your company"} fits that room.`,
  E: (_c, co) => `A short partnership idea for ${co?.name ?? "your team"}: introductions to family businesses in the paddock, not a logo on a car.`,
};

const ASKS: Record<string, string> = {
  A: "Would you be open to an intro to the team running this?",
  B: "Open to an intro to the team?",
  C: "Would an introduction to the team be useful?",
  D: "Worth 15 minutes next week to see if it fits?",
  E: "Is this worth an intro to the team?",
};

export class TemplateWriter implements DraftWriter {
  write({ contact, company, variant }: { contact: Contact; company: Company | null; variant: string; touch: number }) {
    const first = contact.full_name.split(/\s+/)[0];
    const opener = (OPENERS[variant] ?? OPENERS.A)(contact, company);
    const middle = "We introduce partners to the owners already in our paddock and host your customers at the track.";
    const subject = company ? `${company.name} and the paddock` : "A partnership idea";
    const body = `${first} —\n\n${opener} ${middle}\n\n${ASKS[variant] ?? ASKS.A}`;
    return { subject, body };
  }
}
