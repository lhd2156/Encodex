"use client";

import { useEffect, useRef, useState } from "react";

const slides = [
  {
    title: (
      <>
        Create a <strong>strong, unique</strong> password
      </>
    ),
    description:
      "Use a password you don't use anywhere else to keep your account secure.",
    link: "Read more about creating a strong password",
  },
  {
    title: (
      <>
        Store your <strong>password</strong> and{" "}
        <strong>recovery key</strong> separately
      </>
    ),
    description: "",
    link: "Read more about zero-knowledge encryption",
  },
];

const AUTO_SLIDE_MS = 5000;

export default function AuthRegisterInfo() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const next = () => {
    setDirection("next");
    setIndex((i) => (i === slides.length - 1 ? 0 : i + 1));
  };

  const prev = () => {
    setDirection("prev");
    setIndex((i) => (i === 0 ? slides.length - 1 : i - 1));
  };

  const startAutoSlide = () => {
    stopAutoSlide();
    intervalRef.current = setInterval(next, AUTO_SLIDE_MS);
  };

  const stopAutoSlide = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    startAutoSlide();
    return stopAutoSlide;
  }, []);

  const slide = slides[index];

  return (
    <div
      className="flex h-full w-full items-center justify-center px-16 overflow-hidden"
      onMouseEnter={stopAutoSlide}
      onMouseLeave={startAutoSlide}
    >
      <div className="relative w-[352px] text-center">
        {/* Illustration placeholder - matching AuthInfo size exactly */}
        <div className="mx-auto mb-10 h-32 w-32 rounded-xl bg-neutral-700 opacity-80" />

        {/* SLIDE */}
        <div
          key={index}
          className={`
            transition-all
            duration-500
            ease-out
            ${
              direction === "next"
                ? "opacity-100 translate-x-0"
                : "opacity-100 translate-x-0"
            }
          `}
          style={{
            transform:
              direction === "next"
                ? "translateX(0)"
                : "translateX(0)",
          }}
        >
          <h2 className="text-xl font-semibold mb-4 text-white">
            {slide.title}
          </h2>

          {slide.description && (
            <p className="text-sm text-neutral-400 mb-4">
              {slide.description}
            </p>
          )}

          <span className="text-sm text-neutral-400 cursor-pointer underline hover:text-neutral-300 transition-colors">
            {slide.link}
          </span>
        </div>

        {/* LEFT ARROW */}
        <button
          onClick={prev}
          className="
            absolute left-[-64px] top-1/2 -translate-y-1/2
            h-12 w-12
            rounded-full
            flex items-center justify-center
            text-2xl
            text-neutral-400
            hover:text-white
            hover:bg-neutral-700
            transition
          "
        >
          ‹
        </button>

        {/* RIGHT ARROW */}
        <button
          onClick={next}
          className="
            absolute right-[-64px] top-1/2 -translate-y-1/2
            h-12 w-12
            rounded-full
            flex items-center justify-center
            text-2xl
            text-neutral-400
            hover:text-white
            hover:bg-neutral-700
            transition
          "
        >
          ›
        </button>
      </div>
    </div>
  );
}