import type { Metadata } from "next";
import AlpexaMobile from "@/components/alpexa/AlpexaMobile";

export const metadata: Metadata = {
  title: "Alpexa Sports — Mobile Redesign",
  description: "Alpexa Sports mobile home screen restyled with the BetBoard design system",
};

export default function AlpexaPage() {
  return (
    <div className="mx-auto h-dvh max-w-[430px]">
      <AlpexaMobile />
    </div>
  );
}
