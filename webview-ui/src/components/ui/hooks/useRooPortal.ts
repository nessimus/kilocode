import { useEffect, useState } from "react"

export const useRooPortal = (id: string) => {
	const getElement = () => (typeof document === "undefined" ? undefined : document.getElementById(id) ?? document.body ?? undefined)
	const [container, setContainer] = useState<HTMLElement | undefined>(() => getElement())

	useEffect(() => {
		if (typeof document === "undefined") {
			return
		}

		const existing = document.getElementById(id)
		if (existing) {
			setContainer(existing)
			return
		}

		setContainer(document.body ?? undefined)

		const observer = new MutationObserver(() => {
			const next = document.getElementById(id)
			if (next) {
				setContainer(next)
				observer.disconnect()
			}
		})

		observer.observe(document.body, { childList: true, subtree: true })

		return () => observer.disconnect()
	}, [id])

	return container ?? (typeof document !== "undefined" ? document.body : undefined)
}
