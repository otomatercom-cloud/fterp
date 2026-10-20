const digits = (v: string) => v.replace(/\D/g, "");

/** Call / WhatsApp / email shortcuts. Only well-formed values become links. */
export function ContactLinks({ phone, whatsapp, email, text = "" }: { phone?: string; whatsapp?: string; email?: string; text?: string }) {
  const cls = "rounded-full border border-line px-3 py-1 text-xs hover:bg-tint";
  const wa = digits(whatsapp || phone || "");
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {phone && digits(phone).length >= 7 && <a href={`tel:+${digits(phone)}`} className={cls}>📞 Call</a>}
      {wa.length >= 8 && <a href={`https://wa.me/${wa}${text ? `?text=${encodeURIComponent(text)}` : ""}`} target="_blank" rel="noreferrer" className={cls}>💬 WhatsApp</a>}
      {email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && <a href={`mailto:${email}`} className={cls}>✉ Email</a>}
    </span>
  );
}
