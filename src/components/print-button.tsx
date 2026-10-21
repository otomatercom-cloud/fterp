"use client";
export function PrintButton() {
  return (
    <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
      <button onClick={() => history.length > 1 ? history.back() : window.close()} className="text-sm text-neutral-600 hover:underline">← Back</button>
      <button onClick={() => window.print()} className="h-10 rounded-md bg-[#7b1e2b] px-4 text-sm font-medium text-white">Print / Save as PDF</button>
    </div>
  );
}
