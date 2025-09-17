import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { CaretDownIcon, CaretUpIcon, CounterClockwiseClockIcon } from "@radix-ui/react-icons"
import { useTranslation } from "react-i18next"
import { Brain } from "lucide-react"

import MarkdownBlock from "../common/MarkdownBlock"
import { useMount } from "react-use"

interface ReasoningBlockProps {
	content: string
	elapsed?: number
	isCollapsed?: boolean
	onToggleCollapse?: () => void
}

export const ReasoningBlock = ({ content, elapsed, isCollapsed = false, onToggleCollapse }: ReasoningBlockProps) => {
	const contentRef = useRef<HTMLDivElement>(null)
	const elapsedRef = useRef<number>(0)
	const { t } = useTranslation("chat")
	const [thought, setThought] = useState<string>()
	const [prevThought, setPrevThought] = useState<string>(t("chat:reasoning.thinking"))
	const [isTransitioning, setIsTransitioning] = useState<boolean>(false)
	const cursorRef = useRef<number>(0)
	const queueRef = useRef<string[]>([])

	useEffect(() => {
		if (contentRef.current && !isCollapsed) {
			contentRef.current.scrollTop = contentRef.current.scrollHeight
		}
	}, [content, isCollapsed])

	useEffect(() => {
		if (elapsed) {
			elapsedRef.current = elapsed
		}
	}, [elapsed])

	// Process the transition queue.
	const processNextTransition = useCallback(() => {
		const nextThought = queueRef.current.pop()
		queueRef.current = []

		if (nextThought) {
			setIsTransitioning(true)
		}

		setTimeout(() => {
			if (nextThought) {
				setPrevThought(nextThought)
				setIsTransitioning(false)
			}

			setTimeout(() => processNextTransition(), 500)
		}, 200)
	}, [])

	useMount(() => {
		processNextTransition()
	})

	useEffect(() => {
		if (content.length - cursorRef.current > 160) {
			setThought("... " + content.slice(cursorRef.current))
			cursorRef.current = content.length
		}
	}, [content])

	useEffect(() => {
		if (thought && thought !== prevThought) {
			queueRef.current.push(thought)
		}
	}, [thought, prevThought])

	const handleHeaderClick = useCallback(() => {
		onToggleCollapse?.()
	}, [onToggleCollapse])

	const handleHeaderKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLDivElement>) => {
			if (!onToggleCollapse) {
				return
			}

			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault()
				onToggleCollapse()
			}
		},
		[onToggleCollapse],
	)

	const titleTransitionClass = isTransitioning ? "kilo-reasoning-block__title--transitioning" : ""

	return (
		<div className="kilo-reasoning-block">
			<div
				className="kilo-reasoning-block__header"
				onClick={handleHeaderClick}
				onKeyDown={handleHeaderKeyDown}
				role={onToggleCollapse ? "button" : undefined}
				tabIndex={onToggleCollapse ? 0 : undefined}
				aria-expanded={!isCollapsed}
				data-collapsed={isCollapsed}>
				<span className="kilo-reasoning-block__brain-icon" aria-hidden="true">
					<Brain />
				</span>
				<div className={`kilo-reasoning-block__title truncate flex-1 ${titleTransitionClass}`}>
					{prevThought}
				</div>
				<div className="kilo-reasoning-block__meta">
					{elapsedRef.current > 1000 && (
						<>
							<CounterClockwiseClockIcon className="kilo-reasoning-block__meta-icon" />
							<div className="kilo-reasoning-block__elapsed">
								{t("reasoning.seconds", { count: Math.round(elapsedRef.current / 1000) })}
							</div>
						</>
					)}
					<span className="kilo-reasoning-block__chevron">
						{isCollapsed ? <CaretDownIcon /> : <CaretUpIcon />}
					</span>
				</div>
			</div>
			{!isCollapsed && (
				<div ref={contentRef} className="kilo-reasoning-block__body">
					<MarkdownBlock markdown={content} />
				</div>
			)}
		</div>
	)
}
