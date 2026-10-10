"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";

/** Coin art from IPFS, with a ticker-free placeholder while loading or if the gateway fails. */
export function CoinImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // Server-rendered images can finish loading before React attaches onLoad, which then never fires.
  useEffect(() => {
    const el = img.current;
    if (el?.complete) (el.naturalWidth > 0 ? setLoaded : setFailed)(true);
  }, [src]);
  return (
    <div className={cx("relative overflow-hidden bg-panel-3", className)}>
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={img}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cx("size-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
        />
      )}
      {(failed || !loaded) && <div className="lattice absolute inset-0 opacity-60" />}
    </div>
  );
}
