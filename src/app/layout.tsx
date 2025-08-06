import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "BlazePost Test",
    description: "BlazePost Test",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <head>
                <Script src="https://cdn.jsdelivr.net/npm/@mediapipe/pose" strategy="beforeInteractive" />
                <Script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core" strategy="beforeInteractive" />
                <Script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter" strategy="beforeInteractive" />
                <Script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl" strategy="beforeInteractive" />
                <Script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection" strategy="beforeInteractive" />
                <Script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/body-segmentation" strategy="beforeInteractive" />
            </head>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                {children}
            </body>
        </html>
    );
}
