import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Predict the Flood, Protect the City — SIH26085",
  description:
    "Urban Flood Nowcasting System — drainage and rainfall coupling. Smart India Hackathon 2026 prototype by Code Sutra.",
};

export const viewport: Viewport = {
  themeColor: "#14202c",
};

/* apply the saved theme before first paint (no light/dark flash) */
const themeScript = `try{var s=JSON.parse(localStorage.getItem("sih26085-console")||"{}");if(s.state&&s.state.theme==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plex.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
