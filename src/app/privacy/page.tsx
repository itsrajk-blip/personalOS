import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · PersonalOS" };

/** Public privacy policy. Google requires one before the sign-in app can be published. */
export default function PrivacyPage() {
  return (
    <main className="page" style={{ paddingBottom: 48 }}>
      <div className="stack" style={{ gap: 14, maxWidth: "62ch" }}>
        <div className="eyebrow">Privacy policy · updated 10 October 2026</div>
        <h1>PersonalOS privacy</h1>
        <p>
          PersonalOS is a private app used by one household. It isn&apos;t offered to the public, and only email addresses on its
          allow list can sign in.
        </p>
        <h2>What it stores</h2>
        <p>
          Notes, photos and follow-ups you add, and short extracts from Gmail messages it finds relevant (sender, subject, date,
          up to 4,000 characters of text, and a link back to the message). It doesn&apos;t keep full copies of your mailbox.
        </p>
        <h2>Gmail access</h2>
        <p>
          With your permission, the app reads Gmail using the read-only scope (gmail.readonly). It can&apos;t send, change or delete
          email. The access token is stored encrypted. You can disconnect in Settings or at myaccount.google.com/permissions at any
          time. Use of information received from Google APIs follows the Google API Services User Data Policy, including its
          Limited Use requirements.
        </p>
        <h2>Who processes it</h2>
        <p>
          Data is stored with Supabase (database and photo storage) and the app runs on Vercel. Text and photos are sent to
          Anthropic&apos;s API to file them and to answer questions. Data isn&apos;t sold, shared for advertising, or used to train
          AI models.
        </p>
        <h2>Deleting your data</h2>
        <p>Settings lets you export everything or delete all captured data. Disconnecting Gmail stops all further access.</p>
      </div>
    </main>
  );
}
