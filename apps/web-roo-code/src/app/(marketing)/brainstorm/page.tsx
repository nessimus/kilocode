import type { Metadata } from "next"

import { SEO } from "@/lib/seo"

export const metadata: Metadata = {
	title: "Brainstorm Hub",
	description: "Explore Endless Surface canvases for collaborative problem solving in Roo Code Cloud.",
	openGraph: {
		title: "Brainstorm Hub",
		description: "Explore Endless Surface canvases for collaborative problem solving in Roo Code Cloud.",
		url: `${SEO.url}/brainstorm`,
		siteName: SEO.name,
	},
}

export default function BrainstormHubPage() {
	return (
		<section className="bg-gradient-to-b from-background to-muted/30">
			<div className="container mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
				<h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Brainstorm Hub</h1>
				<p className="mt-4 max-w-2xl text-lg text-muted-foreground">
					Brainstorm Hub centralizes your Endless Surface canvases. Capture strategy, connect ideas, and share
					living diagrams with your team. Sign in to Roo Code Cloud to open a surface or return to your
					agenda.
				</p>
			</div>
		</section>
	)
}
