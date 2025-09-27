declare module "tsne-js" {
	type TsneMetric = "euclidean" | string

	export interface TSNEConfig {
		dim?: number
		perplexity?: number
		earlyExaggeration?: number
		learningRate?: number
		nIter?: number
		metric?: TsneMetric
		barneshut?: boolean
	}

	export interface TSNEInitOptions {
		data: number[][]
		type?: "dense" | "sparse" | string
	}

	export class TSNE {
		constructor(config?: TSNEConfig)
		init(options: TSNEInitOptions): void
		run(iterations?: number): [number, number]
		getOutput(): number[][]
		getOutputScaled(): number[][]
	}
}
