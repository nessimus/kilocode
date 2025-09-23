export interface BrainstormSurfaceSummary {
	id: string
	title: string
	description?: string
	createdAt: string
	updatedAt: string
	owner?: string
	tags?: string[]
	emoji?: string
}

export type BrainstormSurfaceUpdate = Partial<Omit<BrainstormSurfaceSummary, "id">>
