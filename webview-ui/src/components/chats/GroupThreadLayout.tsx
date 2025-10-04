import React from "react"
import clsx from "clsx"

interface GroupThreadLayoutProps {
	className?: string
	header?: React.ReactNode
	topStack?: React.ReactNode
	roster?: React.ReactNode
	transcript?: React.ReactNode
	composer?: React.ReactNode
}

const GroupThreadLayout: React.FC<GroupThreadLayoutProps> = ({
	className,
	header,
	topStack,
	roster,
	transcript,
	composer,
}) => {
	return (
		<div className={clsx("flex h-full flex-col gap-3", className)}>
			{header}
			{topStack}
			<div className="grid h-full grow gap-3 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
				<div className="flex min-h-0 flex-col gap-3 overflow-hidden">{roster}</div>
				<div className="flex min-h-0 flex-col gap-3 overflow-hidden">
					{transcript}
					{composer}
				</div>
			</div>
		</div>
	)
}

export default GroupThreadLayout
