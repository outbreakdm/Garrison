"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A short screen recording for the landing page: muted and looping, loaded only once it's
 * near the screen and playing only while it's in view, so a page of them costs nothing until
 * someone scrolls there. Anyone can pause it. Less motion asked for: it stays on its poster
 * (the end of the recording) until Play is pressed.
 */
export function DemoClip({
  src,
  poster,
  width,
  height,
  label,
  description,
}: {
  src: string;
  poster: string;
  width: number;
  height: number;
  /** What the recording shows, in a few words: the video's name. */
  label: string;
  /** What happens in it, step by step, for people who can't see it. */
  description: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  // Paused by the person (or never started, for less motion): scrolling doesn't restart it.
  const held = useRef(false);
  const inView = useRef(false);
  const descId = `${src.replace(/\W+/g, "-")}-about`;

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = true;
    held.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const load = () => {
      if (!v.getAttribute("src")) v.setAttribute("src", src);
    };
    if (typeof IntersectionObserver === "undefined") {
      load();
      return;
    }
    // Fetch a screen ahead; play while at least a third of it shows.
    const near = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          load();
          near.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    const seen = new IntersectionObserver(
      ([e]) => {
        inView.current = Boolean(e?.isIntersecting);
        if (inView.current && !held.current) {
          load();
          v.play().catch(() => {});
        } else if (!inView.current) v.pause();
      },
      { threshold: 0.35 },
    );
    near.observe(v);
    seen.observe(v);
    return () => {
      near.disconnect();
      seen.disconnect();
    };
  }, [src]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      held.current = false;
      if (!v.getAttribute("src")) v.setAttribute("src", src);
      v.play().catch(() => {});
    } else {
      held.current = true;
      v.pause();
    }
  };

  return (
    <div className={`demo-clip${playing ? " is-playing" : ""}`}>
      <video
        ref={video}
        className="demo-clip__video"
        muted
        loop
        playsInline
        preload="none"
        poster={poster}
        width={width}
        height={height}
        aria-label={label}
        aria-describedby={descId}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <p className="sr-only" id={descId}>
        {description}
      </p>
      <button
        type="button"
        className="demo-clip__toggle"
        onClick={toggle}
        aria-label={playing ? `Pause: ${label}` : `Play: ${label}`}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          {playing ? (
            <path d="M4 2.5h2.6v11H4zM9.4 2.5H12v11H9.4z" fill="currentColor" />
          ) : (
            <path d="M4.5 2.3v11.4L13.4 8z" fill="currentColor" />
          )}
        </svg>
      </button>
    </div>
  );
}
