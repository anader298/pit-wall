// Identity-safe email verification. The question is not "does this address
// deliver" but "is this address the person we mean". A wrong match means
// pitching a stranger, which costs more than the campaign earns.
//
//   linkedin_match     the address is tied to the person's own profile: verified
//   domain_full_name   company domain plus full name, from a named source: probable
//   company_level      only the company matched, not the person: quarantined
//   pattern_guess      built from first.last@ or similar: never sent to
//                      without a person confirming it
//   none               no address
import type { Contact, IdentityEvidence } from "../types.ts";

export function confidenceFor(evidence: IdentityEvidence): Contact["email_confidence"] {
  switch (evidence) {
    case "linkedin_match": return "verified";
    case "domain_full_name": return "probable";
    case "company_level": return "quarantined";
    case "pattern_guess": return "unverified";
    default: return "none";
  }
}

export function isSendable(c: Pick<Contact, "email" | "email_confidence">): boolean {
  return !!c.email && (c.email_confidence === "verified" || c.email_confidence === "probable");
}

// A record can be upgraded only by stronger evidence; a person cannot type
// "verified" over a company-level match.
export function applyEvidence(c: Contact, evidence: IdentityEvidence): Contact {
  const order: IdentityEvidence[] = ["none", "pattern_guess", "company_level", "domain_full_name", "linkedin_match"];
  if (order.indexOf(evidence) <= order.indexOf(c.email_evidence)) return c;
  return { ...c, email_evidence: evidence, email_confidence: confidenceFor(evidence) };
}
