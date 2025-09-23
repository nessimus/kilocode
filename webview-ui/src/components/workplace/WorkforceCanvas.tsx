import dagre from "dagre"
import React, { memo, useMemo, useCallback, useState, useRef, useEffect } from "react"
import ReactFlow, {
	Background,
	Controls,
	MiniMap,
	useNodesState,
	useEdgesState,
	Connection,
	Node,
	Edge,
	Position,
	MarkerType,
	ReactFlowInstance,
} from "reactflow"
import { Handle, type NodeProps } from "reactflow"
import {
	VSCodeButton,
	VSCodeDropdown,
	VSCodeOption,
	VSCodeTextArea,
	VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react"
import "reactflow/dist/style.css"

import type { WorkplaceCompany, WorkplaceDepartment, WorkplaceEmployee, WorkplaceTeam } from "@roo/golden/workplace"

interface WorkforceCanvasProps {
	company?: WorkplaceCompany
	onCreateDepartment: (name: string, description?: string) => void
	onCreateTeam: (name: string, description?: string, departmentId?: string) => void
	onCreateEmployee: (name: string, role: string) => void
	onAssignTeamToDepartment: (teamId: string, departmentId?: string) => void
	onAssignEmployeeToTeam: (teamId: string, employeeId: string) => void
	onRemoveEmployeeFromTeam: (teamId: string, employeeId: string) => void
	onFeedback?: (message: string) => void
	isFullscreen?: boolean
	onInspectEmployee?: (employeeId: string) => void
	onUpdateDepartment?: (departmentId: string, updates: { name: string; description?: string }) => void
	onUpdateTeam?: (teamId: string, updates: { name: string; description?: string }) => void
	onUpdateEmployee?: (employeeId: string, updates: { name: string; role: string; teamId?: string | null }) => void
	onArchiveDepartment?: (departmentId: string) => void
	onArchiveTeam?: (teamId: string) => void
	onArchiveEmployee?: (employeeId: string) => void
}

interface WorkforceNodeData {
	label: string
	type: "department" | "team" | "employee"
	subtitle?: string
	layoutWidth?: number
	layoutHeight?: number
	synthetic?: boolean
}

const WorkforceNode = memo((props: NodeProps<WorkforceNodeData>) => {
	const { data, sourcePosition, targetPosition, selected, isConnectable } = props
	const subtitle = data.subtitle?.trim()
	const classes = [
		"workforce-node",
		`workforce-node--${data.type}`,
		data.synthetic ? "workforce-node--synthetic" : undefined,
		selected ? "is-selected" : undefined,
	]
		.filter(Boolean)
		.join(" ")
	const style: React.CSSProperties | undefined = (() => {
		const styles: React.CSSProperties = {}
		if (data.layoutWidth) {
			styles.width = data.layoutWidth
		}
		if (data.layoutHeight) {
			styles.minHeight = data.layoutHeight
		}
		return Object.keys(styles).length > 0 ? styles : undefined
	})()

	return (
		<div className={classes} style={style}>
			{typeof targetPosition !== "undefined" && (
				<Handle
					type="target"
					position={targetPosition}
					isConnectable={isConnectable}
					className="workforce-node__handle"
				/>
			)}
			<div className="workforce-node__content">
				<span className="workforce-node__label">{data.label}</span>
				{subtitle && <span className="workforce-node__subtitle">{subtitle}</span>}
			</div>
			{typeof sourcePosition !== "undefined" && (
				<Handle
					type="source"
					position={sourcePosition}
					isConnectable={isConnectable}
					className="workforce-node__handle"
				/>
			)}
		</div>
	)
})

const workforceNodeTypes = {
	workforce: WorkforceNode,
}

const getNodeDimensions = (type: WorkforceNodeData["type"]) => {
	switch (type) {
		case "department":
			return { width: 260, height: 96 }
		case "team":
			return { width: 220, height: 88 }
		default:
			return { width: 200, height: 80 }
	}
}

const compareByLocale = <T,>(items: readonly T[], accessor: (item: T) => string) =>
	[...items].sort((a, b) => accessor(a).localeCompare(accessor(b), undefined, { sensitivity: "base" }))

const getDepartmentNodeId = (id: string) => `department-${id}`
const getTeamNodeId = (id: string) => `team-${id}`
const getEmployeeNodeId = (id: string) => `employee-${id}`

const applyHierarchicalLayout = (
	nodes: Node<WorkforceNodeData>[],
	edges: Edge[],
): { nodes: Node<WorkforceNodeData>[]; edges: Edge[] } => {
	const graph = new dagre.graphlib.Graph()
	graph.setDefaultEdgeLabel(() => ({}))
	graph.setGraph({
		rankdir: "TB",
		ranker: "tight-tree",
		nodesep: 72,
		ranksep: 180,
		marginx: 48,
		marginy: 48,
	})

	nodes.forEach((node) => {
		const { width, height } = getNodeDimensions(node.data.type)
		graph.setNode(node.id, { width, height })
	})

	edges.forEach((edge) => {
		graph.setEdge(edge.source, edge.target)
	})

	dagre.layout(graph)

	const laidOutNodes = nodes.map((node) => {
		const dagreNode = graph.node(node.id)
		if (!dagreNode) {
			return node
		}
		const { width, height } = getNodeDimensions(node.data.type)
		return {
			...node,
			position: {
				x: dagreNode.x - width / 2,
				y: dagreNode.y - height / 2,
			},
			data: {
				...node.data,
				layoutWidth: width,
				layoutHeight: height,
			},
		}
	})

	return { nodes: laidOutNodes, edges }
}

const buildWorkforceGraph = (company?: WorkplaceCompany): { nodes: Node<WorkforceNodeData>[]; edges: Edge[] } => {
	if (!company) {
		return { nodes: [], edges: [] }
	}

	const nodes: Node<WorkforceNodeData>[] = []
	const edges: Edge[] = []
	const seenNodeIds = new Set<string>()
	const seenEdgeKeys = new Set<string>()

	const isActiveDepartment = (department: WorkplaceDepartment) => !department.deletedAt
	const isActiveTeam = (team: WorkplaceTeam) => !team.deletedAt
	const isActiveEmployee = (employee: WorkplaceEmployee) => !employee.deletedAt

	const pushNode = (node: Node<WorkforceNodeData>) => {
		if (seenNodeIds.has(node.id)) {
			return
		}
		seenNodeIds.add(node.id)
		nodes.push(node)
	}

	const pushEdge = (edge: Edge) => {
		const key = `${edge.source}->${edge.target}`
		if (seenEdgeKeys.has(key)) {
			return
		}
		seenEdgeKeys.add(key)
		edges.push(edge)
	}

	const employeePrimaryTeam = new Map<string, string>()
	company.teams.filter(isActiveTeam).forEach((team) => {
		;(team.employeeIds ?? []).forEach((employeeId) => {
			if (employeePrimaryTeam.has(employeeId)) {
				return
			}
			const employee = company.employees.find((entry) => entry.id === employeeId)
			if (employee && isActiveEmployee(employee)) {
				employeePrimaryTeam.set(employeeId, team.id)
			}
		})
	})

	const employeeComparator = (a: WorkplaceEmployee, b: WorkplaceEmployee) => {
		if (!!a.isExecutiveManager !== !!b.isExecutiveManager) {
			return a.isExecutiveManager ? -1 : 1
		}
		const roleCompare = a.role.localeCompare(b.role, undefined, { sensitivity: "base" })
		if (roleCompare !== 0) {
			return roleCompare
		}
		return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
	}

	const activeDepartments = company.departments.filter(isActiveDepartment)
	const activeTeams = company.teams.filter(isActiveTeam)
	const activeEmployees = company.employees.filter(isActiveEmployee)

	const departmentsSorted = compareByLocale(activeDepartments, (department) => department.name ?? "")
	const teamsSorted = compareByLocale(activeTeams, (team) => team.name ?? "")
	const employeesById = new Map(activeEmployees.map((employee) => [employee.id, employee]))

	const employeesByTeamId = new Map<string, WorkplaceEmployee[]>()
	teamsSorted.forEach((team) => {
		const employees = (team.employeeIds ?? [])
			.map((employeeId) => employeesById.get(employeeId))
			.filter((employee): employee is WorkplaceEmployee => Boolean(employee))
			.filter((employee) => employeePrimaryTeam.get(employee.id) === team.id)
			.sort(employeeComparator)
		employeesByTeamId.set(team.id, employees)
	})

	const teamToDepartment = new Map<string, WorkplaceDepartment>()
	activeDepartments.forEach((department) => {
		;(department.teamIds ?? []).forEach((teamId) => {
			const team = teamsSorted.find((entry) => entry.id === teamId)
			if (team) {
				teamToDepartment.set(team.id, department)
			}
		})
	})

	const departmentEdgeStyle = {
		stroke: "color-mix(in srgb, rgba(255, 215, 0, 0.6) 50%, rgba(86, 130, 255, 0.6) 50%)",
		strokeWidth: 2,
	}

	const teamEmployeeEdgeStyle = {
		stroke: "color-mix(in srgb, rgba(86, 130, 255, 0.55) 60%, rgba(152, 255, 215, 0.55) 40%)",
		strokeWidth: 1.6,
	}

	const independentTeams: WorkplaceTeam[] = []

	departmentsSorted.forEach((department) => {
		pushNode({
			id: getDepartmentNodeId(department.id),
			type: "workforce",
			position: { x: 0, y: 0 },
			data: {
				label: department.name || "Untitled department",
				type: "department",
			},
			sourcePosition: Position.Bottom,
			targetPosition: Position.Top,
		})
	})

	teamsSorted.forEach((team) => {
		const teamNodeId = getTeamNodeId(team.id)
		pushNode({
			id: teamNodeId,
			type: "workforce",
			position: { x: 0, y: 0 },
			data: {
				label: team.name || "Untitled team",
				type: "team",
			},
			sourcePosition: Position.Bottom,
			targetPosition: Position.Top,
		})

		const department = teamToDepartment.get(team.id)
		if (department) {
			const departmentNodeId = getDepartmentNodeId(department.id)
			pushEdge({
				id: `edge-${departmentNodeId}-${teamNodeId}`,
				source: departmentNodeId,
				target: teamNodeId,
				animated: true,
				style: departmentEdgeStyle,
				markerEnd: {
					type: MarkerType.ArrowClosed,
					color: "color-mix(in srgb, rgba(255, 215, 0, 0.75) 50%, rgba(86, 130, 255, 0.75) 50%)",
				},
			})
		} else {
			independentTeams.push(team)
		}

		const teamEmployees = employeesByTeamId.get(team.id) ?? []
		teamEmployees.forEach((employee) => {
			const employeeNodeId = getEmployeeNodeId(employee.id)
			pushNode({
				id: employeeNodeId,
				type: "workforce",
				position: { x: 0, y: 0 },
				data: {
					label: employee.name,
					type: "employee",
					subtitle: employee.role ?? "",
				},
				sourcePosition: Position.Bottom,
				targetPosition: Position.Top,
			})
			pushEdge({
				id: `edge-${teamNodeId}-${employeeNodeId}`,
				source: teamNodeId,
				target: employeeNodeId,
				type: "smoothstep",
				animated: false,
				style: teamEmployeeEdgeStyle,
				markerEnd: {
					type: MarkerType.ArrowClosed,
					color: "color-mix(in srgb, rgba(152, 255, 215, 0.75) 70%, rgba(86, 130, 255, 0.55) 30%)",
				},
			})
		})
	})

	if (independentTeams.length > 0) {
		const syntheticDepartmentId = getDepartmentNodeId(`synthetic-independent-${company.id}`)
		pushNode({
			id: syntheticDepartmentId,
			type: "workforce",
			position: { x: 0, y: 0 },
			data: {
				label: "Independent teams",
				type: "department",
				synthetic: true,
			},
			sourcePosition: Position.Bottom,
			targetPosition: Position.Top,
		})

		compareByLocale(independentTeams, (team) => team.name ?? "").forEach((team) => {
			const teamNodeId = getTeamNodeId(team.id)
			pushEdge({
				id: `edge-${syntheticDepartmentId}-${teamNodeId}`,
				source: syntheticDepartmentId,
				target: teamNodeId,
				animated: true,
				style: departmentEdgeStyle,
				markerEnd: {
					type: MarkerType.ArrowClosed,
					color: "color-mix(in srgb, rgba(255, 215, 0, 0.75) 50%, rgba(86, 130, 255, 0.75) 50%)",
				},
			})
		})
	}

	const unassignedEmployees = activeEmployees
		.filter((employee) => !employeePrimaryTeam.has(employee.id))
		.sort(employeeComparator)

	if (unassignedEmployees.length > 0) {
		const syntheticTeamId = getTeamNodeId(`synthetic-unassigned-${company.id}`)
		pushNode({
			id: syntheticTeamId,
			type: "workforce",
			position: { x: 0, y: 0 },
			data: {
				label: "Unassigned teammates",
				type: "team",
				synthetic: true,
			},
			sourcePosition: Position.Bottom,
			targetPosition: Position.Top,
		})

		unassignedEmployees.forEach((employee) => {
			const employeeNodeId = getEmployeeNodeId(employee.id)
			pushNode({
				id: employeeNodeId,
				type: "workforce",
				position: { x: 0, y: 0 },
				data: {
					label: employee.name,
					type: "employee",
					subtitle: employee.role ?? "",
					synthetic: true,
				},
				sourcePosition: Position.Bottom,
				targetPosition: Position.Top,
			})
			pushEdge({
				id: `edge-${syntheticTeamId}-${employeeNodeId}`,
				source: syntheticTeamId,
				target: employeeNodeId,
				type: "smoothstep",
				animated: false,
				style: teamEmployeeEdgeStyle,
				markerEnd: {
					type: MarkerType.ArrowClosed,
					color: "color-mix(in srgb, rgba(152, 255, 215, 0.75) 70%, rgba(86, 130, 255, 0.55) 30%)",
				},
			})
		})
	}

	return applyHierarchicalLayout(nodes, edges)
}

const getNodeType = (id: string) => {
	if (id.startsWith("department-")) return "department"
	if (id.startsWith("team-")) return "team"
	if (id.startsWith("employee-")) return "employee"
	return undefined
}

const defaultFormState = {
	mode: "create" as "create" | "existing",
	departmentName: "",
	departmentDescription: "",
	teamName: "",
	teamDescription: "",
	teamDepartmentId: "",
	existingTeamId: "",
	employeeName: "",
	employeeRole: "",
	existingEmployeeId: "",
	employeeTeamId: "",
	editingDepartmentId: "",
	editingTeamId: "",
	editingEmployeeId: "",
}

export const WorkforceCanvas: React.FC<WorkforceCanvasProps> = ({
	company,
	onCreateDepartment,
	onCreateTeam,
	onCreateEmployee,
	onAssignTeamToDepartment,
	onAssignEmployeeToTeam,
	onRemoveEmployeeFromTeam,
	onFeedback,
	isFullscreen = false,
	onInspectEmployee,
	onUpdateDepartment,
	onUpdateTeam,
	onUpdateEmployee,
	onArchiveDepartment,
	onArchiveTeam,
	onArchiveEmployee,
}) => {
	const containerRef = useRef<HTMLDivElement | null>(null)
	const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null)
	const { nodes: baseNodes, edges: baseEdges } = useMemo(() => buildWorkforceGraph(company), [company])
	const [nodes, setNodes, onNodesChange] = useNodesState<WorkforceNodeData>(baseNodes)
	const [edges, setEdges, onEdgesChange] = useEdgesState(baseEdges)
	const [menuState, setMenuState] = useState<{ visible: boolean; x: number; y: number }>({
		visible: false,
		x: 0,
		y: 0,
	})
	const [activeForm, setActiveForm] = useState<null | "department" | "team" | "employee">(null)
	const [formState, setFormState] = useState(defaultFormState)
	const [formError, setFormError] = useState<string | null>(null)

	useEffect(() => {
		setNodes(baseNodes)
		setEdges(baseEdges)
		if (baseNodes.length === 0) {
			return
		}
		requestAnimationFrame(() => {
			reactFlowInstanceRef.current?.fitView({ padding: 0.2 })
		})
	}, [baseNodes, baseEdges, setNodes, setEdges])

	const closeMenu = useCallback(() => {
		setMenuState({ visible: false, x: 0, y: 0 })
		setActiveForm(null)
		setFormState(defaultFormState)
		setFormError(null)
	}, [])

	const handleAutoLayout = useCallback(() => {
		closeMenu()
		const { nodes: layoutNodes, edges: layoutEdges } = buildWorkforceGraph(company)
		setNodes(layoutNodes)
		setEdges(layoutEdges)
		if (layoutNodes.length === 0) {
			return
		}
		requestAnimationFrame(() => {
			reactFlowInstanceRef.current?.fitView({ padding: 0.2 })
		})
	}, [closeMenu, company, setEdges, setNodes])

	const handleContextMenu = useCallback((event: React.MouseEvent) => {
		event.preventDefault()
		if (!containerRef.current) {
			return
		}
		const bounds = containerRef.current.getBoundingClientRect()
		setMenuState({
			visible: true,
			x: event.clientX - bounds.left,
			y: event.clientY - bounds.top,
		})
		setActiveForm(null)
		setFormState(defaultFormState)
		setFormError(null)
	}, [])

	const handleNodeDoubleClick = useCallback(
		(event: React.MouseEvent, node: Node<WorkforceNodeData>) => {
			event.preventDefault()
			event.stopPropagation()
			if (!containerRef.current || !company || node.data.synthetic) {
				return
			}
			const bounds = containerRef.current.getBoundingClientRect()
			const x = event.clientX - bounds.left
			const y = event.clientY - bounds.top
			const nodeType = node.data.type
			setFormError(null)

			if (nodeType === "employee") {
				const employeeId = node.id.replace("employee-", "")
				const employee = company.employees.find((entry) => entry.id === employeeId && !entry.deletedAt)
				if (!employee) {
					return
				}
				const owningTeam = company.teams
					.filter((team) => !team.deletedAt)
					.find((team) => (team.employeeIds ?? []).includes(employeeId))
				setMenuState({ visible: true, x, y })
				setActiveForm("employee")
				setFormState({
					...defaultFormState,
					mode: "create",
					employeeName: employee.name,
					employeeRole: employee.role ?? "",
					editingEmployeeId: employeeId,
					employeeTeamId: owningTeam?.id ?? "",
				})
				onInspectEmployee?.(employeeId)
				return
			}

			if (nodeType === "team") {
				const teamId = node.id.replace("team-", "")
				const team = company.teams.find((entry) => entry.id === teamId && !entry.deletedAt)
				if (!team) {
					return
				}
				const parentDepartment = company.departments
					.filter((department) => !department.deletedAt)
					.find((department) => (department.teamIds ?? []).includes(teamId))
				setMenuState({ visible: true, x, y })
				setActiveForm("team")
				setFormState({
					...defaultFormState,
					mode: "create",
					teamName: team.name,
					teamDescription: team.description ?? "",
					teamDepartmentId: parentDepartment?.id ?? "",
					editingTeamId: teamId,
				})
				return
			}

			if (nodeType === "department") {
				const departmentId = node.id.replace("department-", "")
				const department = company.departments.find((entry) => entry.id === departmentId && !entry.deletedAt)
				if (!department) {
					return
				}
				setMenuState({ visible: true, x, y })
				setActiveForm("department")
				setFormState({
					...defaultFormState,
					departmentName: department.name,
					departmentDescription: department.description ?? "",
					editingDepartmentId: department.id,
				})
			}
		},
		[company, onInspectEmployee, setActiveForm, setFormState, setMenuState],
	)

	const handleConnect = useCallback(
		(params: Connection) => {
			if (!params.source || !params.target) {
				return
			}
			const sourceType = getNodeType(params.source)
			const targetType = getNodeType(params.target)

			if (sourceType === "department" && targetType === "team") {
				const departmentId = params.source.replace("department-", "")
				const teamId = params.target.replace("team-", "")
				onAssignTeamToDepartment(teamId, departmentId)
				return
			}

			if (sourceType === "team" && targetType === "department") {
				const teamId = params.source.replace("team-", "")
				const departmentId = params.target.replace("department-", "")
				onAssignTeamToDepartment(teamId, departmentId)
				return
			}

			if (sourceType === "team" && targetType === "employee") {
				const teamId = params.source.replace("team-", "")
				const employeeId = params.target.replace("employee-", "")
				onAssignEmployeeToTeam(teamId, employeeId)
				return
			}

			if (sourceType === "employee" && targetType === "team") {
				const employeeId = params.source.replace("employee-", "")
				const teamId = params.target.replace("team-", "")
				onAssignEmployeeToTeam(teamId, employeeId)
				return
			}
		},
		[onAssignEmployeeToTeam, onAssignTeamToDepartment],
	)

	const handleEdgeDelete = useCallback(
		(edgesToRemove: Edge[]) => {
			edgesToRemove.forEach((edge) => {
				const sourceType = getNodeType(edge.source)
				const targetType = getNodeType(edge.target)

				if (sourceType === "department" && targetType === "team") {
					const teamId = edge.target.replace("team-", "")
					onAssignTeamToDepartment(teamId, undefined)
					return
				}

				if (sourceType === "team" && targetType === "employee") {
					const teamId = edge.source.replace("team-", "")
					const employeeId = edge.target.replace("employee-", "")
					onRemoveEmployeeFromTeam(teamId, employeeId)
				}
			})
		},
		[onAssignTeamToDepartment, onRemoveEmployeeFromTeam],
	)

	const handleNodesDelete = useCallback(
		(nodesToRemove: Node<WorkforceNodeData>[]) => {
			closeMenu()
			nodesToRemove.forEach((node) => {
				if (node.data.synthetic) {
					return
				}
				if (node.data.type === "department") {
					const departmentId = node.id.replace("department-", "")
					onArchiveDepartment?.(departmentId)
					onFeedback?.("Department archived.")
					return
				}
				if (node.data.type === "team") {
					const teamId = node.id.replace("team-", "")
					onArchiveTeam?.(teamId)
					onFeedback?.("Team archived.")
					return
				}
				if (node.data.type === "employee") {
					const employeeId = node.id.replace("employee-", "")
					onArchiveEmployee?.(employeeId)
					onFeedback?.("Employee archived.")
				}
			})
		},
		[closeMenu, onArchiveDepartment, onArchiveEmployee, onArchiveTeam, onFeedback],
	)

	const submitDepartment = useCallback(() => {
		if (!company) {
			setFormError("Select a company first.")
			return
		}
		const name = formState.departmentName.trim()
		const description = formState.departmentDescription.trim() || undefined
		if (!name) {
			setFormError("Department name is required.")
			return
		}
		if (formState.editingDepartmentId) {
			onUpdateDepartment?.(formState.editingDepartmentId, { name, description })
			onFeedback?.("Department updated.")
			closeMenu()
			return
		}
		onCreateDepartment(name, description)
		onFeedback?.("Department created.")
		closeMenu()
	}, [
		closeMenu,
		company,
		formState.departmentDescription,
		formState.departmentName,
		formState.editingDepartmentId,
		onCreateDepartment,
		onFeedback,
		onUpdateDepartment,
	])

	const submitTeam = useCallback(() => {
		if (!company) {
			setFormError("Select a company first.")
			return
		}
		const name = formState.teamName.trim()
		const description = formState.teamDescription.trim() || undefined
		const editingTeamId = formState.editingTeamId
		if (editingTeamId) {
			if (!name) {
				setFormError("Team name is required.")
				return
			}
			onUpdateTeam?.(editingTeamId, { name, description })
			const currentDepartment = company.departments
				.filter((department) => !department.deletedAt)
				.find((department) => (department.teamIds ?? []).includes(editingTeamId))
			const desiredDepartmentId = formState.teamDepartmentId || undefined
			if ((currentDepartment?.id ?? undefined) !== desiredDepartmentId) {
				onAssignTeamToDepartment(editingTeamId, desiredDepartmentId)
			}
			onFeedback?.("Team updated.")
			closeMenu()
			return
		}
		if (formState.mode === "create") {
			if (!name) {
				setFormError("Team name is required.")
				return
			}
			onCreateTeam(name, description, formState.teamDepartmentId || undefined)
			onFeedback?.("Team created.")
			closeMenu()
			return
		}

		if (!formState.existingTeamId) {
			setFormError("Select an existing team.")
			return
		}
		onAssignTeamToDepartment(formState.existingTeamId, formState.teamDepartmentId || undefined)
		onFeedback?.("Team placement updated.")
		closeMenu()
	}, [closeMenu, company, formState, onAssignTeamToDepartment, onCreateTeam, onFeedback, onUpdateTeam])

	const submitEmployee = useCallback(() => {
		if (!company) {
			setFormError("Select a company first.")
			return
		}
		const name = formState.employeeName.trim()
		const role = formState.employeeRole.trim()
		const editingEmployeeId = formState.editingEmployeeId
		if (editingEmployeeId) {
			if (!name || !role) {
				setFormError("Name and role are required.")
				return
			}
			onUpdateEmployee?.(editingEmployeeId, {
				name,
				role,
				teamId: formState.employeeTeamId ? formState.employeeTeamId : null,
			})
			const currentTeam = company.teams
				.filter((team) => !team.deletedAt)
				.find((team) => (team.employeeIds ?? []).includes(editingEmployeeId))
			const desiredTeamId = formState.employeeTeamId || undefined
			if ((currentTeam?.id ?? undefined) !== desiredTeamId) {
				if (currentTeam && currentTeam.id !== desiredTeamId) {
					onRemoveEmployeeFromTeam(currentTeam.id, editingEmployeeId)
				}
				if (desiredTeamId) {
					onAssignEmployeeToTeam(desiredTeamId, editingEmployeeId)
				}
			}
			onFeedback?.("Employee updated.")
			closeMenu()
			return
		}
		if (formState.mode === "create") {
			if (!name || !role) {
				setFormError("Name and role are required.")
				return
			}
			onCreateEmployee(name, role)
			onFeedback?.("Employee created.")
			closeMenu()
			return
		}

		if (!formState.existingEmployeeId || !formState.employeeTeamId) {
			setFormError("Choose an employee and a team.")
			return
		}
		onAssignEmployeeToTeam(formState.employeeTeamId, formState.existingEmployeeId)
		onFeedback?.("Employee added to team.")
		closeMenu()
	}, [
		closeMenu,
		company,
		formState,
		onAssignEmployeeToTeam,
		onCreateEmployee,
		onFeedback,
		onRemoveEmployeeFromTeam,
		onUpdateEmployee,
	])

	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				closeMenu()
			}
		}
		window.addEventListener("keydown", handleEscape)
		return () => window.removeEventListener("keydown", handleEscape)
	}, [closeMenu])

	const unusedTeams = useMemo(() => {
		if (!company) return []
		return company.teams.filter((team) => !team.deletedAt)
	}, [company])

	const existingEmployees = useMemo(
		() => company?.employees.filter((employee) => !employee.deletedAt) ?? [],
		[company?.employees],
	)
	const departmentOptions = useMemo(
		() => company?.departments.filter((department) => !department.deletedAt) ?? [],
		[company?.departments],
	)

	return (
		<div className={`workforce-canvas ${isFullscreen ? "workforce-canvas--fullscreen" : ""}`} ref={containerRef}>
			{company && baseNodes.length > 0 && (
				<button
					type="button"
					className="workforce-canvas__autolayout"
					onClick={handleAutoLayout}
					title="Realign nodes automatically">
					Auto layout
				</button>
			)}
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={workforceNodeTypes}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={handleConnect}
				onEdgesDelete={handleEdgeDelete}
				onPaneContextMenu={handleContextMenu}
				onPaneClick={closeMenu}
				onNodeDoubleClick={handleNodeDoubleClick}
				onNodesDelete={handleNodesDelete}
				onInit={(instance) => {
					reactFlowInstanceRef.current = instance
				}}
				fitView
				fitViewOptions={{ padding: 0.2 }}>
				<MiniMap pannable zoomable className="workforce-canvas__minimap" />
				<Controls position="bottom-right" showInteractive={false} />
				<Background gap={24} color="color-mix(in srgb, rgba(255, 255, 255, 0.06) 70%, rgba(0, 0, 0, 0.2))" />
			</ReactFlow>

			{menuState.visible && !activeForm && (
				<div className="workforce-canvas__menu" style={{ left: menuState.x, top: menuState.y }} role="menu">
					<button type="button" onClick={() => setActiveForm("department")}>
						New department…
					</button>
					<button type="button" onClick={() => setActiveForm("team")}>
						New team…
					</button>
					<button type="button" onClick={() => setActiveForm("employee")}>
						New employee…
					</button>
				</div>
			)}

			{menuState.visible && activeForm && (
				<div className="workforce-canvas__form" style={{ left: menuState.x, top: menuState.y }} role="dialog">
					<div className="workforce-canvas__form-header">
						<strong>
							{activeForm === "department" && "Department"}
							{activeForm === "team" && "Team"}
							{activeForm === "employee" && "Employee"}
						</strong>
						<button type="button" onClick={closeMenu} className="workforce-canvas__form-close">
							<span className="codicon codicon-close" aria-hidden="true" />
							<span className="sr-only">Close</span>
						</button>
					</div>

					{activeForm !== "department" && !formState.editingTeamId && !formState.editingEmployeeId && (
						<div className="workforce-canvas__mode-toggle" role="radiogroup" aria-label="Mode">
							<button
								type="button"
								className={formState.mode === "create" ? "is-active" : ""}
								onClick={() => {
									setFormState((prev) => ({ ...prev, mode: "create" }))
									setFormError(null)
								}}>
								Create new
							</button>
							<button
								type="button"
								className={formState.mode === "existing" ? "is-active" : ""}
								onClick={() => {
									setFormState((prev) => ({ ...prev, mode: "existing" }))
									setFormError(null)
								}}>
								Use existing
							</button>
						</div>
					)}

					{activeForm === "department" && (
						<form
							onSubmit={(event) => {
								event.preventDefault()
								submitDepartment()
							}}
							className="workforce-canvas__form-body">
							<VSCodeTextField
								value={formState.departmentName}
								onInput={(event: any) =>
									setFormState((prev) => ({ ...prev, departmentName: event.target.value ?? "" }))
								}
								placeholder="Department name"
								required
							/>
							<VSCodeTextArea
								rows={2}
								value={formState.departmentDescription}
								onInput={(event: any) =>
									setFormState((prev) => ({
										...prev,
										departmentDescription: event.target.value ?? "",
									}))
								}
								placeholder="Notes (optional)"
							/>
							{formError && <p className="workforce-canvas__form-error">{formError}</p>}
							<div className="workforce-canvas__form-actions">
								<VSCodeButton appearance="secondary" type="submit">
									{formState.editingDepartmentId ? "Update department" : "Create department"}
								</VSCodeButton>
							</div>
						</form>
					)}

					{activeForm === "team" && (
						<form
							onSubmit={(event) => {
								event.preventDefault()
								submitTeam()
							}}
							className="workforce-canvas__form-body">
							{formState.mode === "create" ? (
								<>
									<VSCodeTextField
										value={formState.teamName}
										onInput={(event: any) =>
											setFormState((prev) => ({ ...prev, teamName: event.target.value ?? "" }))
										}
										placeholder="Team name"
										required
									/>
									<VSCodeTextArea
										rows={2}
										value={formState.teamDescription}
										onInput={(event: any) =>
											setFormState((prev) => ({
												...prev,
												teamDescription: event.target.value ?? "",
											}))
										}
										placeholder="Description (optional)"
									/>
								</>
							) : (
								<VSCodeDropdown
									value={formState.existingTeamId}
									onChange={(event: any) =>
										setFormState((prev) => ({ ...prev, existingTeamId: event.target.value ?? "" }))
									}
									className="workforce-canvas__form-select">
									<VSCodeOption value="">Select team</VSCodeOption>
									{unusedTeams.map((team) => (
										<VSCodeOption key={team.id} value={team.id}>
											{team.name}
										</VSCodeOption>
									))}
								</VSCodeDropdown>
							)}

							<VSCodeDropdown
								value={formState.teamDepartmentId}
								onChange={(event: any) =>
									setFormState((prev) => ({ ...prev, teamDepartmentId: event.target.value ?? "" }))
								}
								className="workforce-canvas__form-select">
								<VSCodeOption value="">No department</VSCodeOption>
								{departmentOptions.map((department) => (
									<VSCodeOption key={department.id} value={department.id}>
										{department.name}
									</VSCodeOption>
								))}
							</VSCodeDropdown>

							{formError && <p className="workforce-canvas__form-error">{formError}</p>}
							<div className="workforce-canvas__form-actions">
								<VSCodeButton appearance="secondary" type="submit">
									{formState.editingTeamId
										? "Update team"
										: formState.mode === "create"
											? "Create team"
											: "Update placement"}
								</VSCodeButton>
							</div>
						</form>
					)}

					{activeForm === "employee" && (
						<form
							onSubmit={(event) => {
								event.preventDefault()
								submitEmployee()
							}}
							className="workforce-canvas__form-body">
							{formState.mode === "create" ? (
								<>
									<VSCodeTextField
										value={formState.employeeName}
										onInput={(event: any) =>
											setFormState((prev) => ({
												...prev,
												employeeName: event.target.value ?? "",
											}))
										}
										placeholder="Employee name"
										required
									/>
									<VSCodeTextField
										value={formState.employeeRole}
										onInput={(event: any) =>
											setFormState((prev) => ({
												...prev,
												employeeRole: event.target.value ?? "",
											}))
										}
										placeholder="Role"
										required
									/>
									{formState.editingEmployeeId && (
										<VSCodeDropdown
											value={formState.employeeTeamId}
											onChange={(event: any) =>
												setFormState((prev) => ({
													...prev,
													employeeTeamId: event.target.value ?? "",
												}))
											}
											className="workforce-canvas__form-select">
											<VSCodeOption value="">No team</VSCodeOption>
											{company?.teams
												.filter((team) => !team.deletedAt)
												.map((team) => (
													<VSCodeOption key={team.id} value={team.id}>
														{team.name}
													</VSCodeOption>
												))}
										</VSCodeDropdown>
									)}
								</>
							) : (
								<>
									<VSCodeDropdown
										value={formState.existingEmployeeId}
										onChange={(event: any) =>
											setFormState((prev) => ({
												...prev,
												existingEmployeeId: event.target.value ?? "",
											}))
										}
										className="workforce-canvas__form-select">
										<VSCodeOption value="">Select employee</VSCodeOption>
										{existingEmployees.map((employee) => (
											<VSCodeOption key={employee.id} value={employee.id}>
												{employee.name}
											</VSCodeOption>
										))}
									</VSCodeDropdown>
									<VSCodeDropdown
										value={formState.employeeTeamId}
										onChange={(event: any) =>
											setFormState((prev) => ({
												...prev,
												employeeTeamId: event.target.value ?? "",
											}))
										}
										className="workforce-canvas__form-select">
										<VSCodeOption value="">Select team</VSCodeOption>
										{company?.teams.map((team) => (
											<VSCodeOption key={team.id} value={team.id}>
												{team.name}
											</VSCodeOption>
										))}
									</VSCodeDropdown>
								</>
							)}

							{formError && <p className="workforce-canvas__form-error">{formError}</p>}
							<div className="workforce-canvas__form-actions">
								<VSCodeButton appearance="secondary" type="submit">
									{formState.editingEmployeeId
										? "Update employee"
										: formState.mode === "create"
											? "Create employee"
											: "Assign to team"}
								</VSCodeButton>
							</div>
						</form>
					)}
				</div>
			)}
		</div>
	)
}

export default WorkforceCanvas
