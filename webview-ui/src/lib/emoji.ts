import groupsJson from "unicode-emoji-json/data-by-group.json" assert { type: "json" }

type RawEmoji = {
	emoji: string
	name: string
	slug?: string
	skin_tone_support?: boolean
	unicode_version?: string
	emoji_version?: string
}

type RawGroup = {
	name: string
	slug: string
	emojis: RawEmoji[]
}

export interface EmojiEntry {
	emoji: string
	name: string
	slug: string
	group: string
	groupSlug: string
	skinToneSupport: boolean
	unicodeVersion?: string
	emojiVersion?: string
	keywords: string[]
	searchValue: string
}

export interface EmojiGroup {
	name: string
	slug: string
	emojis: EmojiEntry[]
}

const toKeywordTokens = (value: string | undefined): string[] => {
	if (!value) {
		return []
	}

	return value
		.toLowerCase()
		.replace(/[:_\s]+/g, " ")
		.split(/\s+/)
		.filter(Boolean)
}

const processedGroups: EmojiGroup[] = (groupsJson as RawGroup[]).map((group) => {
	const emojis: EmojiEntry[] = group.emojis.map((entry) => {
		const slug = (entry.slug || entry.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
		const keywords = new Set<string>()
		keywords.add(entry.emoji)
		keywords.add(entry.emoji.replace(/\uFE0F/g, ""))
		keywords.add(entry.name.toLowerCase())
		toKeywordTokens(entry.name).forEach((token) => keywords.add(token))
		keywords.add(slug)
		toKeywordTokens(slug).forEach((token) => keywords.add(token))
		keywords.add(`:${slug}:`)
		keywords.add(group.name.toLowerCase())
		keywords.add(group.slug.toLowerCase())

		return {
			emoji: entry.emoji,
			name: entry.name,
			slug,
			group: group.name,
			groupSlug: group.slug,
			skinToneSupport: Boolean(entry.skin_tone_support),
			unicodeVersion: entry.unicode_version,
			emojiVersion: entry.emoji_version,
			keywords: Array.from(keywords).filter(Boolean),
			searchValue: `${entry.name.toLowerCase()} ${slug}`.trim(),
		}
	})

	return {
		name: group.name,
		slug: group.slug,
		emojis,
	}
})

export const emojiGroups: EmojiGroup[] = processedGroups

export const emojiList: EmojiEntry[] = processedGroups.flatMap((group) => group.emojis)

export const emojiMap: Record<string, EmojiEntry> = emojiList.reduce<Record<string, EmojiEntry>>((acc, entry) => {
	acc[entry.emoji] = entry
	return acc
}, {})
