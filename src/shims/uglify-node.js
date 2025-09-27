module.exports = {
	minify(source) {
		if (typeof source === "string") {
			return { code: source }
		}
		if (source && typeof source.code === "string") {
			return { code: source.code }
		}
		return { code: "" }
	},
}
