import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import {
  ensureAppUserFromGoogle,
  getAppUserIdentityByEmail,
} from "@/lib/server/user-identity";

// What this file does:
// This is the front gate for authentication: "Who just knocked on the door,
// and can we trust the passport they handed us?"
//
// Why this matters:
// Authentication is not the same thing as app-level identity or authorization.
// Google proves a person controls an email address. This file then hands that
// fact to the app's own identity layer so the rest of the product can reason
// about roles, staff access, welcome completion, and marketing preferences.
//
// Best practice (the "textbook" version):
// A mature identity system often separates:
// - auth providers
// - canonical human identity
// - session projection
// - authorization policy
// - consent and communication preferences
// into clearly distinct tables and services.
//
// What we are doing instead (and why):
// We are letting NextAuth and one app identity layer carry most of the weight
// because the repo is still small enough for that trade to be sane. It keeps
// the moving parts few while still preserving the important conceptual seam:
// provider auth is not the same thing as local user identity.
//
// Tradeoff:
// We gain speed, readability, and fewer places for auth bugs to hide.
// We sacrifice some future flexibility and some elegance a larger system would
// want on day one.
//
// Question for Future Charlie:
// If this file already "works," why not just keep putting identity concerns
// here forever?
//
// Answer:
// Because "works" and "wants to scale without emotional damage" are different
// species. The sign-in edge should stay mostly about trust establishment, not
// become a ceremonial dumping ground for every rule in the kingdom.
//
// First assumption that breaks:
// "A verified Google email is the only way a human will ever show up here."
//
// Future Chuck note:
// If magic-link login gets added later, it should sit beside Google as another
// provider-shaped path into the same app identity resolution. Different door.
// Same archive.
//
// Footnote:
// The bouncer checks the passport here. The suspicious archivist in
// user-identity.ts decides which drawer in the Great Filing Cabinet of Humans
// this person belongs in. These are different jobs, and many systems become
// haunted when they pretend otherwise.
type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

// What this does:
// NextAuth handles the protocol wrangling. We teach it the local rules:
// which provider is allowed, how to mint a session token, and how to enrich
// that token with app-specific identity.
//
// Right now, this is a simple auth shell around one provider and one session
// projection strategy.
//
// In a more mature system, this would likely become a configuration layer for
// several human auth methods plus perhaps separate machine authentication
// pathways entirely outside browser sessions.
//
// We are NOT doing that yet because:
// the product has one real human auth path today, and pretending otherwise
// would add plumbing without buying real safety yet.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // Current repo truth:
    // Google is the only human login path right now. That means "signed in"
    // and "has a verified Google email" are currently the same event.
    //
    // Beware:
    // This does not grant any special team power by itself. Google says
    // "yes, this is probably this person." Roles say "and here is what they
    // may touch once inside the building."
    //
    // Future complexity wearing a fake mustache:
    // "I am just one more provider option, very harmless, please ignore the
    // identity-linking consequences behind this novelty beard."
    //
    // What it looks like now:
    // One provider, one verified email path, one main sign-in story.
    //
    // What it turns into later:
    // Multiple human auth methods pointing at the same canonical User, plus
    // explicit rules for linking identities without creating duplicate people.
    //
    // Signal to evolve it:
    // The moment a real human needs non-Google sign-in or the same person can
    // arrive through more than one auth door, this comment stops being theory
    // and becomes tomorrow's work.
    //
    // If ignored:
    // The codebase starts quietly treating "provider account" and "person" as
    // synonyms, which is how duplicate humans breed in the dark.
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
  ],
  // Source of truth:
  // AUTH_SECRET is the preferred name in this repo. NEXTAUTH_SECRET remains
  // as a compatibility fallback because old ghosts do not leave immediately.
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: {
    // Why JWT:
    // We keep session state in a signed token rather than a session table.
    // That keeps the auth plumbing small, but it means the jwt callback below
    // becomes the place where app identity is stitched onto the passport.
    //
    // Best practice (the "textbook" version):
    // Larger systems often use a database-backed session store, explicit
    // rotation policies, and slimmer session payloads.
    //
    // What we are doing instead (and why):
    // A JWT session is enough here because the app does not yet need heavy
    // multi-device session control, session revocation tooling, or a separate
    // session audit surface.
    //
    // Tradeoff:
    // We gain simplicity and fewer moving parts.
    // We sacrifice some fine-grained server-side session control.
    //
    // Signal to evolve it:
    // If session invalidation, admin revocation, or machine-readable audit
    // requirements become serious, a simple signed scroll becomes a little too
    // magical for polite society.
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ account, profile }) {
      // What this does:
      // This is the "do we even let you finish walking through the door?"
      // checkpoint. Only Google is allowed, and only if Google says the email
      // is verified.
      //
      // Interview lens:
      // A good sign-in callback is not where you do everything. It is where
      // you fail fast on untrusted input, then hand off to a narrower identity
      // layer that knows your own data model.
      //
      // Best practice (the "textbook" version):
      // Keep provider callbacks thin. Validate the incoming trust claim, then
      // delegate provisioning and policy to a dedicated identity service.
      //
      // What we are doing instead (and why):
      // Still thin, but not hyper-abstracted. The callback calls directly into
      // one local identity helper because the repo is small enough that another
      // wrapper layer would mostly be decorative masonry.
      //
      // Tradeoff:
      // We gain directness. We sacrifice some future swappability.
      //
      // Smell test:
      // If this callback ever starts reading like a medieval tax code, someone
      // has mistaken the city gate for the entire city.
      //
      // Future complexity wearing a fake mustache:
      // "Surely we can slip newsletter signup, account linking, role policy,
      // and onboarding side effects in here too. It is already a callback.
      // Who would notice?" Everyone. Everyone would notice.
      if (account?.provider !== "google") {
        return false;
      }

      const googleProfile = profile as GoogleProfile | undefined;
      const email = googleProfile?.email;
      const emailVerified = Boolean(googleProfile?.email_verified);

      if (!email || !emailVerified) {
        return false;
      }

      // Why this call exists:
      // Provider identity is not enough for the app. We still need a canonical
      // User record, role bootstrap, and normalized primary email inside our
      // own ledger. This function makes sure the Google visitor is attached to
      // a real app user before the session is blessed.
      //
      // Failure lens:
      // If this step disappeared, sign-in could succeed while the rest of the
      // app still had no canonical user to authorize, personalize, or track.
      // That is how you get a perfectly authenticated ghost.
      await ensureAppUserFromGoogle({
        email,
        name: googleProfile?.name ?? null,
        image: googleProfile?.picture ?? null,
      });

      return true;
    },

    async jwt({ token, account, profile }) {
      // What this does:
      // Think of the JWT callback as the customs desk where we stamp the
      // passport with local facts the rest of the app cares about.
      //
      // On first sign-in:
      // We may have fresh Google profile data, so we re-run the identity sync.
      //
      // On later requests:
      // We usually only have the token email, so we resolve the canonical app
      // identity from our own database instead of trusting stale assumptions.
      //
      // Best practice (the "textbook" version):
      // Mature systems often centralize token enrichment into explicit
      // projection code, sometimes with caches, versioning, or event-driven
      // refresh paths.
      //
      // What we are doing instead (and why):
      // A direct callback-based projection. One file. One place to see what
      // goes into the session payload. Fast to reason about right now.
      //
      // Tradeoff:
      // We gain visibility and speed.
      // We sacrifice some separation if identity growth gets serious.
      //
      // What it looks like now:
      // A JWT is a convenient blessed scroll carrying a handful of app facts.
      //
      // What it turns into later:
      // The token enrichment path becomes the place where multiple auth methods
      // converge on one canonical app identity.
      //
      // Signal to evolve it:
      // If token fields start multiplying into a tiny civilization, or if
      // auth-method-specific branching begins to dominate this callback, the
      // enrichment logic likely needs a dedicated mapper/service.
      const googleProfile = profile as GoogleProfile | undefined;

      const email =
        (typeof token.email === "string" && token.email) ||
        googleProfile?.email ||
        null;

      // If we do not know which email this session belongs to, there is no
      // safe way to enrich the token with app identity. No email, no archive.
      if (!email) {
        return token;
      }

      const identity =
        account?.provider === "google" || profile
          ? await ensureAppUserFromGoogle({
              email,
              name: googleProfile?.name ?? null,
              image: googleProfile?.picture ?? null,
            })
          : await getAppUserIdentityByEmail(email);

      // If you poke this with a stick:
      // Returning the token unchanged here means "authentication may exist,
      // but app identity enrichment did not happen." That is safer than
      // inventing fields and pretending we know who this is.
      //
      // Question for Future Charlie:
      // Why not throw hard if identity lookup fails?
      //
      // Answer:
      // Because failure modes at auth boundaries need care. An unchanged token
      // is often a safer intermediate state than exploding mid-session in a
      // way that makes diagnosis harder. The real lesson is to monitor why
      // identity lookup could fail at all.
      if (!identity) {
        return token;
      }

      // Source of truth:
      // After this point, downstream app code should prefer the app-specific
      // fields we place on the token rather than reinterpreting Google profile
      // payloads on every request.
      token.email = identity.primaryEmail;
      token.appUserId = identity.id;
      token.primaryEmail = identity.primaryEmail;
      token.roles = identity.roles;
      token.isStaff = identity.isStaff;
      token.newsletterOptIn = identity.newsletterOptIn;
      token.announcementsOptIn = identity.announcementsOptIn;
      token.welcomeCompletedAt = identity.welcomeCompletedAt
        ? identity.welcomeCompletedAt.toISOString()
        : null;

      return token;
    },

    async session({ session, token }) {
      // What this does:
      // This is the last translation step. NextAuth gives us a generic session
      // shape; we reshape it into the app-facing user object the rest of the
      // code actually consumes.
      //
      // Why this matters:
      // Keeping the session enriched here means pages and server actions can
      // ask simple questions like "what roles does this user have?" without
      // each file rebuilding identity logic by hand like a doomed wizard
      // repeatedly summoning the same paperwork elemental.
      //
      // Best practice (the "textbook" version):
      // Keep session payloads minimal and derive more sensitive or volatile
      // information closer to use.
      //
      // What we are doing instead (and why):
      // We project a practical bundle of app user fields into the session so
      // server components and actions can stay straightforward. For this stage
      // of the app, clarity beats austere minimalism.
      //
      // Tradeoff:
      // We gain simpler downstream code.
      // We risk turning session.user into a traveling trunk if we are not
      // disciplined about what belongs here.
      //
      // Future complexity wearing a fake mustache:
      // "I am just one more convenience field on session.user." This is how
      // you accidentally turn the session shape into a backpack full of anvils.
      const baseUser = session.user ?? {
        name: null,
        email: "",
        image: null,
      };

      // Authentication says "this session belongs to someone."
      // Authorization and app behavior need the richer answer:
      // who, under which canonical email, with which roles and onboarding
      // state, and whether they may enter the weird room downstairs.
      session.user = {
        ...baseUser,
        emailVerified: null,
        email:
          typeof token.email === "string"
            ? token.email
            : typeof baseUser.email === "string"
              ? baseUser.email
              : "",
        id: typeof token.appUserId === "string" ? token.appUserId : "",
        primaryEmail:
          typeof token.primaryEmail === "string"
            ? token.primaryEmail
            : typeof token.email === "string"
              ? token.email
              : "",
        roles: Array.isArray(token.roles) ? token.roles : [],
        isStaff: Boolean(token.isStaff),
        newsletterOptIn: Boolean(token.newsletterOptIn),
        announcementsOptIn: Boolean(token.announcementsOptIn),
        welcomeCompletedAt:
          typeof token.welcomeCompletedAt === "string"
            ? token.welcomeCompletedAt
            : null,
      };

      return session;
    },
  },
});
