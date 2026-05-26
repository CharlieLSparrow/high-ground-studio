import Link from "next/link";
import { Feather } from "lucide-react";

export default function NotFound() {
  return (
    <main className="not-found-shell">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">
          <Feather size={22} />
        </span>
        <span>QuipLore</span>
      </div>
      <h1>This quote trail is not in the archive yet.</h1>
      <p>
        The first build only includes a small seed set while the source model
        gets its footing.
      </p>
      <Link className="button primary" href="/">
        Return to QuipStream
      </Link>
    </main>
  );
}
