import React from "react";
import { MessageCircle } from "lucide-react";

const PHONE = "918910871321";  // international format, no + or dashes for wa.me

export function whatsappLink(prefilledMessage = "Hi, I need help with Seller Margin.") {
  return `https://wa.me/${PHONE}?text=${encodeURIComponent(prefilledMessage)}`;
}

/** Floating WhatsApp "Need help?" pill — bottom-right corner. Use once per page. */
export default function WhatsAppFab({ message, label = "Need help?" }) {
  return (
    <a
      href={whatsappLink(message)}
      target="_blank"
      rel="noreferrer noopener"
      data-testid="whatsapp-fab"
      className="fixed bottom-6 right-6 z-40 group flex items-center gap-2 bg-[#25D366] text-white pl-3 pr-4 py-3 shadow-lg hover:brightness-110 transition-all"
      style={{ borderRadius: "999px" }}
      aria-label="Chat with support on WhatsApp"
    >
      <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
        <MessageCircle size={16} strokeWidth={2} fill="white" className="text-[#25D366]"/>
      </span>
      <span className="text-sm font-medium tracking-tight max-w-0 group-hover:max-w-[140px] overflow-hidden whitespace-nowrap transition-all duration-300">
        {label}
      </span>
    </a>
  );
}
