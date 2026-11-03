// Plain-English version of docs/privacy/processing-register.md for the /privacy page. Change both together.
// `null` in `kept` means the period isn't decided yet (TODO: confirm with Kenzy); the page says "to be confirmed".

export type Activity = {
  id: string;
  title: string;
  what: string;
  why: string;
  basis: "Consent" | "Contract" | "Legal obligation" | "Legitimate interest" | string;
  shared: string;
  kept: string | null;
  control: string;
};

export const ACTIVITIES: Activity[] = [
  {
    id: "account",
    title: "Your account and login",
    what: "Email, password (stored only as a scrambled hash), name, and for organizations the organization's name, type and CAC number.",
    why: "To create and protect your account and greet you by name. Organizations also get recycling (ESG) reports.",
    basis: "Contract",
    shared: "Supabase (login and database), Render (our server), Vercel (the website)",
    kept: null, // TODO: confirm with Kenzy: how long after an account closes
    control: "Edit your details in Settings, or ask us to close your account.",
  },
  {
    id: "phone",
    title: "Phone number",
    what: "Your Nigerian mobile number.",
    why: "We text your pickup codes and reminders to it, find you when you walk in to the hub, and stop duplicate accounts.",
    basis: "Contract",
    shared: "Supabase, Render, Termii (sends the SMS)",
    kept: null, // TODO: confirm with Kenzy
    control: "Change it in Settings.",
  },
  {
    id: "address",
    title: "Address and map pin",
    what: "Street address, area, and a map pin if you add one.",
    why: "So a collector comes to the right gate, and so we can group pickups by area.",
    basis: "Contract",
    shared: "Supabase, Render. The map loads from OpenStreetMap, which sees roughly which area is on screen but not your address.",
    kept: "Your saved address until you change it. Copies on past pickups: to be confirmed.", // TODO: confirm with Kenzy
    control: "Change it, or remove the pin, from the address bar on your dashboard.",
  },
  {
    id: "age",
    title: "Date of birth and parent or guardian details",
    what: "Your date of birth. If you're 13 to 17: your parent or guardian's name, phone and email, and their answer.",
    why: "The law says we must check age and get a parent or guardian's consent for anyone under 18. We don't open accounts for children under 13. Payouts for under-18s go only to the guardian's bank account.",
    basis: "Legal obligation",
    shared: "Supabase, Render, Resend (the consent email), Termii (the consent SMS)",
    kept: "Date of birth while your account is open. Consent links stop working after 7 days or once used. The consent record: to be confirmed.", // TODO: confirm with Kenzy
    control: "A parent or guardian can say no on the link, or ask us later to withdraw consent. The account is then locked.",
  },
  {
    id: "photos",
    title: "Pickup photos",
    what: "The photo you add of your plastic, the collector's photo of the scale and load, and any photo you send with a dispute.",
    why: "To estimate your load, check the weight, and settle disagreements fairly.",
    basis: "Contract, and our legitimate interest in having evidence if a weight is disputed",
    shared: "Cloudinary (stores and resizes the photos)",
    kept: null, // TODO: confirm with Kenzy (and Cloudinary's region)
    control: "The request photo is optional. Ask us to delete photos of finished pickups.",
  },
  {
    id: "payments",
    title: "Weights and payments",
    what: "What you sold, the weights, any deductions and why, the prices, your points and withdrawals.",
    why: "To pay you the right amount, show your wallet, and keep stock and export records.",
    basis: "Contract, and our legal duty to keep financial records",
    shared: "Supabase, Render",
    kept: null, // TODO: confirm with Kenzy (financial records are often kept 6 years or more)
    control: "Dispute a weight in the app within 48 hours. Ask us for a copy of your records.",
  },
  {
    id: "bank",
    title: "Bank details and transfers",
    what: "Your bank, account number, the account name your bank returns, and Paystack's codes for the transfer.",
    why: "To check the account is real and in the right name, and to send your withdrawals.",
    basis: "Contract, and our legal duty to keep payment records",
    shared: "Paystack",
    kept: "Saved details until you change them. Records of past withdrawals: to be confirmed.", // TODO: confirm with Kenzy
    control: "Change your bank account in Settings.",
  },
  {
    id: "sms",
    title: "SMS codes",
    what: "Your phone number and the text we send: the weight, the amount and a 6-digit code. We keep only a scrambled copy of the code.",
    why: "So you can confirm the weight at your door, and to remind you before a pickup confirms itself.",
    basis: "Contract",
    shared: "Termii",
    kept: "Codes expire after 30 minutes. Termii's copy of the message: to be confirmed.", // TODO: confirm with Kenzy
    control: "You can confirm in the app instead of reading out a code.",
  },
  {
    id: "location",
    title: "Collector location",
    what: "A collector's latest position, only while they're on the way to a pickup.",
    why: "So the customer can see the collector coming.",
    basis: "Legitimate interest", // TODO: confirm with Kenzy whether collectors are employees or contractors
    shared: "Only the customer of that pickup, through Supabase",
    kept: "Only the latest point, deleted when the collector weighs the load.",
    control: "Collectors share it only while the pickup page is open after pressing Start.",
  },
  {
    id: "esg",
    title: "Reports for organizations",
    what: "Organization name, kilos by material, CO₂ saved and number of pickups.",
    why: "Monthly or yearly recycling (ESG) reports.",
    basis: "Contract",
    shared: "Render (makes the PDF)",
    kept: "Not stored. The PDF is made when you download it.",
    control: "You decide when to download one.",
  },
  {
    id: "analytics",
    title: "Analytics cookies",
    what: "Pages you visit, six steps (finishing sign-up, requesting a pickup, confirming, disputing, asking to withdraw, installing the app), your account ID, and basic device and browser details.",
    why: "To see where people get stuck and make the app easier.",
    basis: "Consent",
    shared: "PostHog (EU)",
    kept: null, // TODO: confirm with Kenzy (PostHog retention setting)
    control: "Say no in the cookie banner, or change it any time under Cookie settings.",
  },
  {
    id: "replay",
    title: "Session recordings",
    what: "A replay of how a page was used: layout, taps and scrolling. Everything you type and all text is hidden. Never on your wallet, settings, or the collector and staff pages.",
    why: "To find screens that confuse people.",
    basis: "Consent, asked separately from analytics",
    shared: "PostHog (EU)",
    kept: null, // TODO: confirm with Kenzy (PostHog recording retention)
    control: "Off unless you switch on Session recordings in Cookie settings.",
  },
  {
    id: "marketing",
    title: "Marketing emails",
    what: "Your email address and when you said yes.",
    why: "Tips, price updates and offers.",
    basis: "Consent",
    shared: "Resend (sends the email)",
    kept: null, // TODO: confirm with Kenzy
    control: "Every email has a one-click unsubscribe link. You can also switch them off in Settings.",
  },
  {
    id: "admin",
    title: "Staff records",
    what: "Which staff member resolved a dispute, approved or rejected a withdrawal, adjusted a balance (and why), set a price or wrote a post, plus our server's request logs.",
    why: "So every change to money and accounts can be traced, and so we can fix errors.",
    basis: "Legitimate interest, and our legal duty to keep financial records",
    shared: "Supabase, Render",
    kept: null, // TODO: confirm with Kenzy (Render log retention)
    control: "Ask us what is recorded about you.",
  },
];
