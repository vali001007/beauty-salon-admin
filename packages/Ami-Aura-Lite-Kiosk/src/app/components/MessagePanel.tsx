import React, { ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import type { Message } from "../types";

export function BusinessMessageCard({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="mx-auto mb-6 w-full max-w-[900px] rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
      {children}
    </div>
  );
}

export function MessagePanel({
  messages,
  children,
}: {
  messages: Message[];
  children?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMessage = messages[messages.length - 1];

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || messages.length <= 1) return;

    const scrollToLatest = () => {
      const latestMessage = container.querySelector('[data-message-items]')?.lastElementChild as HTMLElement | null;
      if (!latestMessage) return;
      const bottomTop = Math.max(0, container.scrollHeight - container.clientHeight);
      container.scrollTop = bottomTop;
      container.scrollTo({ top: bottomTop, behavior: "auto" });
    };
    const frameId = window.requestAnimationFrame(scrollToLatest);
    const timeoutId = window.setTimeout(scrollToLatest, 120);
    const lateTimeoutId = window.setTimeout(scrollToLatest, 450);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
      window.clearTimeout(lateTimeoutId);
    };
  }, [messages.length, lastMessage?.id, lastMessage?.title, lastMessage?.type]);

  useEffect(() => {
    const container = containerRef.current;
    const messageItems = container?.querySelector("[data-message-items]");
    if (!container || !messageItems || messages.length <= 1 || typeof MutationObserver === "undefined") return undefined;

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(() => {
        container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      });
    });
    observer.observe(messageItems, { childList: true });
    return () => observer.disconnect();
  }, [messages.length]);

  return (
    <main
      ref={containerRef}
      data-message-scroll-container
      className="flex-1 overflow-y-auto bg-[#F7F5F2] px-4 pb-32 pt-6 sm:px-6"
      style={{ overflowAnchor: "none" }}
    >
      <div data-message-list className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
        {children}
      </div>
    </main>
  );
}
