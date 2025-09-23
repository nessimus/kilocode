import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { fetchSurfaceRecord } from "@/lib/surfaces"
import SurfaceWorkspace from "@/components/surfaces/surface-workspace"

interface SurfacePageProps {
	params: { id: string }
}

export async function generateMetadata({ params }: SurfacePageProps): Promise<Metadata> {
	const { id } = params
	const surface = await fetchSurfaceRecord(id)

	if (!surface) {
		return {
			title: "Brainstorm Hub",
		}
	}

	return {
		title: `${surface.meta.title ?? "Endless Surface"} · Roo Code`,
		description: surface.meta.description ?? "Endless Surface workspace",
	}
}

export default async function SurfacePage({ params }: SurfacePageProps) {
	const { id } = params
	const surface = await fetchSurfaceRecord(id)

	if (!surface) {
		redirect("/brainstorm")
	}

	return <SurfaceWorkspace surface={surface} />
}
