import { createHash } from "node:crypto"

export interface EmbeddingOptions {
	dimension?: number
}

const DEFAULT_DIMENSION = 256

export function generateDeterministicEmbedding(text: string, options: EmbeddingOptions = {}): number[] {
	const dimension = options.dimension ?? DEFAULT_DIMENSION
	if (!text || text.trim().length === 0) {
		return Array.from({ length: dimension }, () => 0)
	}

	const clean = text.normalize("NFKD").toLowerCase().trim()
	const vector = new Array<number>(dimension)

	let seed = createHash("sha256").update(clean).digest()
	for (let i = 0; i < dimension; i += 1) {
		if (i !== 0 && i % seed.length === 0) {
			seed = createHash("sha256").update(seed).update(String(i)).digest()
		}

		const byte = seed[i % seed.length]
		const value = byte / 255 // 0..1
		vector[i] = value * 2 - 1 // scale to -1..1
	}

	return normalize(vector)
}

export function cosineSimilarity(a: number[], b: number[]): number {
	if (!a.length || !b.length || a.length !== b.length) {
		return 0
	}

	let dot = 0
	let magA = 0
	let magB = 0

	for (let i = 0; i < a.length; i += 1) {
		const ai = a[i]
		const bi = b[i]
		dot += ai * bi
		magA += ai * ai
		magB += bi * bi
	}

	if (magA === 0 || magB === 0) {
		return 0
	}

	return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

function normalize(vector: number[]): number[] {
	let lengthSquared = 0
	for (const value of vector) {
		lengthSquared += value * value
	}

	if (lengthSquared === 0) {
		return vector
	}

	const length = Math.sqrt(lengthSquared)
	return vector.map((value) => value / length)
}
