import type { ReactNode } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnalyticsConsent } from "@/app/_components/analytics-consent";
import { SiteSchema } from "@/app/_components/site-schema";
import "@/app/globals.css";

export function RootShell({ children, lang }: { readonly children: ReactNode; readonly lang: "en" | "id" }) {
  return (
    <html lang={lang}>
      <body>
        <TooltipProvider>
          <SiteSchema />
          {children}
          <AnalyticsConsent />
        </TooltipProvider>
      </body>
    </html>
  );
}
