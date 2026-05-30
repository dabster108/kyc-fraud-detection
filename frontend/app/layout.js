import { Lato } from "next/font/google";
import "./globals.css";

const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  variable: "--font-lato",
});

export const metadata = {
  title: "eKS - eSewa KYC Shield",
  description:
    "Nepali ID verification with OCR, forgery detection, liveness, face match, and explainable risk scoring.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={lato.variable}
    >
      <body
        className={`${lato.className} min-h-screen text-[#0F172A] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
