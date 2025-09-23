// Type declarations for third-party modules

declare module "knuth-shuffle-seeded" {
	export default function knuthShuffle<T>(array: T[], seed: any): T[]
}

declare module "*.module.css" {
	const classes: Record<string, string>
	export default classes
}

declare module "dagre" {
	namespace dagre {
		namespace graphlib {
			class Graph {
				constructor(options?: { directed?: boolean; multigraph?: boolean; compound?: boolean })
				setGraph(label: any): void
				setDefaultEdgeLabel(callback: () => any): void
				setNode(id: string, value?: any): void
				setEdge(source: string, target: string, value?: any): void
				node(id: string): any
			}
		}
		function layout(graph: graphlib.Graph): void
	}
	export default dagre
}
