import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

// Next.js requires this file: it wraps every page in our app with the shared
// <html>/<body> tags, the same way a plain website's single template wraps
// every page's content. Importing globals.css here is what actually turns
// on Tailwind's styling for the whole app — without this import, every
// className="..." string in our components is just inert text with no
// matching CSS behind it, which is why the chat page looked completely
// unstyled before this file existed. TooltipProvider is required by
// assistant-ui's Thread component, which uses tooltips on its action buttons.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
