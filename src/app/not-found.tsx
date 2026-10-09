import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <div className="font-mono text-sm text-mint">404</div>
      <h1 className="mt-2 text-2xl font-semibold text-fg">Nothing hashes to this address</h1>
      <p className="mt-2 text-sm text-muted">The page or coin you&apos;re looking for doesn&apos;t exist here.</p>
      <ButtonLink href="/" className="mt-6">
        Back to coins
      </ButtonLink>
    </div>
  );
}
