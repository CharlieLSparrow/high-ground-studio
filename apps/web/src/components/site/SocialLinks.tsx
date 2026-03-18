import { Facebook, Heart, Instagram } from "lucide-react";

type SocialLinkProps = {
  href: string;
  label: string;
  children: React.ReactNode;
};

function SocialLink({ href, label, children }: SocialLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex items-center justify-center text-[var(--text-light)] opacity-85 transition-all duration-200 hover:-translate-y-0.5 hover:text-[var(--accent)] hover:opacity-100 hover:drop-shadow-[0_0_10px_rgba(255,122,24,0.6)]"
    >
      {children}
    </a>
  );
}

export default function SocialLinks() {
  return (
    <div className="flex items-center gap-5">
      <SocialLink
        href="https://www.facebook.com/HighGroundOdyssey"
        label="Facebook"
      >
        <Facebook size={20} />
      </SocialLink>

      <SocialLink
        href="https://www.instagram.com/highgroundodyssey/"
        label="Instagram"
      >
        <Instagram size={20} />
      </SocialLink>

      <SocialLink
        href="https://www.patreon.com/c/HighGroundOdyssey"
        label="Patreon"
      >
        <Heart size={20} />
      </SocialLink>
    </div>
  );
}